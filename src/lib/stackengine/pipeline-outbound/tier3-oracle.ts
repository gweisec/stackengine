/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { CleanScalar } from '../types';
import { ClassifiedSecret, SharedConfig } from './capsules/core';
import { ALL_CAPSULES } from './capsules';

// ============================================================================
/**
 * Tier3Oracle: Classification oracle evaluating detector capsule chain.
 */
export class Tier3Oracle {
    /**
     * Injects custom redaction keys directly into SharedConfig,
     * ensuring immediate propagation across all active detector capsules.
     */
    public static configure(config: { customIntentKeys?: string[] }) {
        if (config.customIntentKeys) {
            SharedConfig.customIntentKeys = config.customIntentKeys;
        }
    }

    /**
     * Read-only accessor for the active custom intent key registry.
     */
    public static get customIntentKeys(): string[] {
        return SharedConfig.customIntentKeys;
    }

    public static judge(scalars: CleanScalar[]): ClassifiedSecret[] {
        const secrets: ClassifiedSecret[] = [];

        for (const scalar of scalars) {
            const val = scalar.value;
            const cleanVal = val.replace(/^["']|["',;]+$/g, '').trim();
            const keyCtx = (scalar.keyContext || '').toLowerCase();

            // Evaluates registered detector capsules in ascending priority order.
            // Short-circuits on first verified match to prevent downstream over-redaction.
            for (const capsule of ALL_CAPSULES) {
                if (capsule.trigger(keyCtx, cleanVal, val)) {
                    const results = capsule.verify(cleanVal, val, scalar);
                    if (results && results.length > 0) {
                        secrets.push(...results);
                        break;
                    }
                }
            }
        }

        return secrets;
    }
}