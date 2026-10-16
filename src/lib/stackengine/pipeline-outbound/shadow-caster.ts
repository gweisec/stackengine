/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/shadow-caster.ts
import { PhysicalSecretRange } from './preflight-sweeper.js';
import { StateManager } from '../state/state-manager.js';

export interface RedactionOperation {
    start: number;
    end: number;
    tokenId: string;
}

export interface ShadowResult {
    safePayload: string;
    operations: RedactionOperation[];
}

export class ShadowCaster {
    /**
     * Deterministic hashing algorithm (FNV-1a 32-bit):
     * Maps arbitrary scalar inputs to fixed 8-character hex strings for deterministic hashing.
     */
    public static generateDeterministicHash8(content: string): string {
        let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis (2166136261)
        for (let i = 0; i < content.length; i++) {
            hash ^= content.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193); // FNV-1a 32-bit prime (16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
    }

    /**
     * Stage 5: Transforms non-overlapping secrets into deterministic replacement tokens,
     * registers tokens into in-memory state, and splices the safe payload in descending offset order.
     * 
     * @param rawText Original un-redacted payload
     * @param secrets Non-overlapping secret ranges sorted by descending start offset
     * @param state StateManager instance for token registration
     */
    public static cast(
        rawText: string,
        secrets: PhysicalSecretRange[],
        state: StateManager
    ): ShadowResult {
        let safePayload = rawText;
        const operations: RedactionOperation[] = [];
        const registeredTokenIds = new Set<string>();

        // Semantic Canonicalization:
        // Ensures deterministic token mapping (same value, same token).
        // Specific semantic types (e.g. DB_AUTH_CREDENTIAL) preempt generic fallback heuristics (e.g. HIGH_ENTROPY_SECRET).
        const genericTypes = new Set(['HIGH_ENTROPY_SECRET', 'SHORT_COMPLEX_PASSWORD']);
        const valueToBestSemanticType = new Map<string, string>();

        for (const secret of secrets) {
            const normalized = secret.value.trim().replace(/^["'`]|["'`,;\r\n]+$/g, '');
            const currentBest = valueToBestSemanticType.get(normalized);
            if (!currentBest || (genericTypes.has(currentBest) && !genericTypes.has(secret.semanticType))) {
                valueToBestSemanticType.set(normalized, secret.semanticType);
            }
        }

        const SEMANTIC_COMPRESSOR: Record<string, string> = {
            'DB_AUTH_CREDENTIAL': 'DB', 'AWS_SECRET_ACCESS_KEY': 'AWS', 'AWS_ACCESS_KEY': 'AWS',
            'API_KEY': 'API', 'JWT_TOKEN': 'JWT', 'PEM_PRIVATE_KEY': 'PEM',
            'HIGH_ENTROPY_SECRET': 'HEX', 'SHORT_COMPLEX_PASSWORD': 'PWD',
            'CUSTOM_MASKED_FIELD': 'CUSTOM', 'HTTP_BASIC_AUTH_CREDENTIAL': 'BASIC',
            'DB_HASHED_PASSWORD': 'HASH', 'SHA512_CRYPT_HASH': 'HASH'
        };

        for (const secret of secrets) {
            // Strip enclosing quotes, punctuation, and delimiters to generate canonical seed
            const normalized = secret.value.trim().replace(/^["'`]|["'`,;\r\n]+$/g, '');
            // Bind to canonical semantic type to avoid token proliferation across identical scalar values
            const canonicalType = valueToBestSemanticType.get(normalized) || secret.semanticType;
            const hash8 = this.generateDeterministicHash8(normalized);

            // Prefix alignment: use secret.semanticType to maintain 1:1 token alignment with in-memory state
            const shortType = SEMANTIC_COMPRESSOR[secret.semanticType] || secret.semanticType.substring(0, 4).toUpperCase();
            const hash6 = hash8.substring(0, 6);
            const tokenId = `__SE_${shortType}_${hash6}__`;

            // Capture surrounding quote context
            const nodeTypeStr = secret.nodeType || '';
            const quote = nodeTypeStr.includes('double') ? '"' : nodeTypeStr.includes('single') ? "'" : '';

            // Idempotent state registration: register unique token IDs once
            if (!registeredTokenIds.has(tokenId)) {
                state.registerToken({
                    tokenId,
                    originalValue: secret.value,
                    semanticType: secret.semanticType,
                    sourceQuote: quote
                });
                registeredTokenIds.add(tokenId);
            }

            operations.push({
                start: secret.start,
                end: secret.end,
                tokenId
            });

            // Reverse-order in-place string substitution
            safePayload = safePayload.slice(0, secret.start) + tokenId + safePayload.slice(secret.end);
        }

        state.commit();

        return {
            safePayload,
            operations
        };
    }
}
