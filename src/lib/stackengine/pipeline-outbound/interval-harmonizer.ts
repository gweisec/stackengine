/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/interval-harmonizer.ts
import { PhysicalSecretRange } from './preflight-sweeper';
import { ClassifiedSecret } from './capsules/core.js';

export class IntervalHarmonizer {
    /**
     * Interval Harmonizer:
     * Enforces priority across detection pipelines:
     * 1. Macro envelopes (PEM/PGP blocks) take priority over intersecting micro fragments.
     * 2. Micro credentials (passwords, tokens) maintain precedence over overlapping macro atomic indicators (FQDNs, IDs).
     *
     * @param macroSecrets Preflight ranges emitted by Channel A preflight sweep.
     * @param microSecrets AST-refined scalars classified by Channel B oracle.
     * @returns Canonical, non-overlapping redaction ranges sorted by start offset.
     */
    public static harmonize(
        macroSecrets: PhysicalSecretRange[],
        microSecrets: ClassifiedSecret[]
    ): PhysicalSecretRange[] {
        const unified: PhysicalSecretRange[] = [];

        // Partition macro detections into container envelopes (PEM/PGP) and atomic indicators (FQDN/AccountID)
        const envelopes = macroSecrets.filter(m => m.semanticType === 'PEM_PRIVATE_KEY' || m.semanticType === 'PGP_KEY_BLOCK');
        const atomicMacros = macroSecrets.filter(m => m.semanticType !== 'PEM_PRIVATE_KEY' && m.semanticType !== 'PGP_KEY_BLOCK');

        // Preload macro envelopes to establish container precedence
        unified.push(...envelopes);

        // Filter micro credentials: drop fragmented scalars encapsulated within macro envelopes
        for (const micro of microSecrets) {
            const isInsideEnvelope = envelopes.some(env => {
                const overlapStart = Math.max(env.start, micro.start);
                const overlapEnd = Math.min(env.end, micro.end);
                return overlapStart < overlapEnd;
            });

            if (!isInsideEnvelope) {
                unified.push({
                    start: micro.start,
                    end: micro.end,
                    value: micro.value,
                    semanticType: micro.semanticType,
                    nodeType: micro.nodeType
                });
            }
        }

        // Reconcile atomic macro indicators: yield to core classified credentials on coordinate collision
        for (const macro of atomicMacros) {
            const collidesWithCredential = unified.some(u => {
                const overlapStart = Math.max(u.start, macro.start);
                const overlapEnd = Math.min(u.end, macro.end);
                return overlapStart < overlapEnd;
            });

            if (!collidesWithCredential) {
                unified.push(macro);
            }
        }

        // Deduplication guard: eliminate duplicate interval coordinates
        const seenOffsets = new Set<string>();
        const deduplicated = unified.filter(item => {
            const key = `${item.start}:${item.end}`;
            if (seenOffsets.has(key)) return false;
            seenOffsets.add(key);
            return true;
        });

        // Sort monotonically by start offset
        return deduplicated.sort((a, b) => a.start - b.start);
    }
}
