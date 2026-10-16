/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-inbound/re-entry.ts
import { AirlockState } from '../types';

export class InboundGrafter {
    /**
     * Inbound token restorer: Restores shadow tokens to raw plaintext secrets,
     * maintaining syntactic invariance against LLM hallucination and delimiter mutation.
     * 
     * @param llmPayload Response text returned by the LLM
     * @param stateOrMap In-memory state snapshot or flat token map
     */
    public static restore(llmPayload: string, stateOrMap: AirlockState | Record<string, string>): string {
        let restoredCode = llmPayload;

        // Matches deterministic shadow tokens (6-character short hash format: __SE_<TYPE>_<HASH6>__)
        const tokenRegex = /__SE_[A-Z_]+_[0-9A-F]{6}__/g;

        const isAirlockState = (s: any): s is AirlockState => Boolean(s && typeof s === 'object' && s.tokens);

        restoredCode = restoredCode.replace(tokenRegex, (match, offset, wholeString) => {
            let originalValue: string | undefined;
            let sourceQuote: string | undefined;

            if (isAirlockState(stateOrMap)) {
                const shadowToken = stateOrMap.tokens[match];
                if (!shadowToken) {
                    // Preserves unmapped tokens (unrecognized tokens not present in in-memory state)
                    return match;
                }
                originalValue = shadowToken.originalValue;
                sourceQuote = shadowToken.sourceQuote;
            } else {
                originalValue = stateOrMap[match];
                if (originalValue === undefined) {
                    return match;
                }
            }

            let secret = originalValue;

            // Delimiter boundary inspection for syntax-aware restoration
            const charBefore = wholeString[offset - 1];
            const charAfter = wholeString[offset + match.length];
            const currentQuote = (charBefore === '"' && charAfter === '"') ? '"' : (charBefore === "'" && charAfter === "'") ? "'" : '';

            // Invariance guard: Bypasses re-escaping if original quote delimiter context is preserved,
            // preserving delimiter alignment with the source input.
            if (sourceQuote !== undefined && currentQuote === sourceQuote) {
                return originalValue;
            }

            // Adaptive escaping: Re-escapes secret when the LLM mutates or wraps the enclosing quote context
            if (currentQuote === '"') {
                secret = secret.replace(/"/g, '\\"');
            } else if (currentQuote === "'") {
                secret = secret.replace(/'/g, "''");
            }

            return secret;
        });

        return restoredCode;
    }
}