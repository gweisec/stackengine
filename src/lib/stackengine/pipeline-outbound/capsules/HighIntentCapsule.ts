/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { CleanScalar } from '../../types';
import { DetectorCapsule, ClassifiedSecret, SharedConfig, isSafeShapeOrDecoy } from './core';

export const HighIntentCapsule: DetectorCapsule = {
    id: 'HIGH_INTENT',
    priority: 300,
    trigger: (keyCtx: string) => {
        // Custom user intent key match takes precedence across hierarchical dot paths and exact words
        const isCustomMatch = SharedConfig.customIntentKeys.some(k => {
            const target = k.toLowerCase().trim();
            return keyCtx === target ||
                keyCtx.endsWith('.' + target) ||
                keyCtx.includes('.' + target) ||
                keyCtx.includes(target);
        });
        if (isCustomMatch) return true;

        // Metadata pointer circuit breaker: suppress benign reference pointers (e.g. secret-name, secretRef)
        const isMetaPointer = /(?:[_-]?(?:name|ref|namespace|path|id|url|endpoint|type|desc(?:ription)?|class|vendor|backend|algorithm)|Ref)$/i.test(keyCtx);
        if (isMetaPointer) return false;

        const builtIn = /pass(?:word|wd|phrase)?|secret|token|api_?key|auth|pgpass|cert_?hashes|requirepass/i.test(keyCtx);
        return builtIn;
    },
    verify: (cleanVal: string, rawVal: string, scalar: CleanScalar): ClassifiedSecret[] | null => {
        const keyCtx = (scalar.keyContext || '').toLowerCase();

        // High-precedence bypass: fields explicitly targeted for redaction via custom configuration
        const isCustomMatch = SharedConfig.customIntentKeys.some(k => {
            const target = k.toLowerCase().trim();
            return keyCtx === target ||
                keyCtx.endsWith('.' + target) ||
                keyCtx.includes('.' + target) ||
                keyCtx.includes(target);
        });
        if (isCustomMatch && cleanVal.length > 0) {
            const isTemplate = cleanVal.startsWith('$') || cleanVal.includes('${') || cleanVal.includes('{{');
            if (!isTemplate) {
                return [{
                    start: scalar.start,
                    end: scalar.end,
                    value: cleanVal,
                    nodeType: scalar.nodeType,
                    semanticType: 'CUSTOM_MASKED_FIELD'
                }];
            }
        }

        // Baseline intent validation heuristic
        const isBenignShape = /^arn:aws/i.test(cleanVal) || /^(?:https?:\/\/|\/hostedzone)/i.test(cleanVal) || /^[a-z0-9]{6}\.[a-z0-9]{16}$/.test(cleanVal) || /^(?:file:)?(?:\.\.|\~|\.)\//.test(cleanVal);
        const isShapeSafe = isSafeShapeOrDecoy(cleanVal);
        const isKebabSecret = isShapeSafe && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(cleanVal) && cleanVal.length > 20 && (keyCtx.includes('jwt') || cleanVal.includes('jwt'));

        if (!isBenignShape && (!isShapeSafe || isKebabSecret)) {
            const isCodeRef = /^(?:var|local|each|module|data|self|os|process|env|global)\.[a-zA-Z0-9_.-]+$/i.test(cleanVal) || cleanVal.includes('(') || cleanVal.includes('[');
            const isPlaceholder = cleanVal.startsWith('$') || cleanVal.includes('${') || cleanVal.includes('{{') || /^<.*>$/.test(cleanVal) || /^[A-Z0-9_]{3,}$/.test(cleanVal);
            const isSimpleWord = /^[a-zA-Z-]{1,16}$/.test(cleanVal);
            const isSnakePlaceholder = /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(cleanVal) || cleanVal.toLowerCase().includes('placeholder') || cleanVal.toLowerCase().includes('dummy');
            const isSyntaxBleed = cleanVal.includes('&') && cleanVal.includes('=');

            if (cleanVal.length >= 6 && cleanVal.length <= 128 && !isCodeRef && !isPlaceholder && !isSimpleWord && !isSnakePlaceholder && !isSyntaxBleed) {
                let semType = 'DB_AUTH_CREDENTIAL';
                if (cleanVal.includes('sha256:') || cleanVal.match(/^[0-9a-fA-F]{64}$/)) semType = 'HIGH_ENTROPY_SECRET';
                else if (/^[a-zA-Z0-9_\-.:]+$/.test(cleanVal) && (cleanVal.length > 20 || keyCtx.includes('token') || keyCtx.includes('key'))) semType = 'API_KEY';

                return [{
                    start: scalar.start,
                    end: scalar.end,
                    value: cleanVal,
                    nodeType: scalar.nodeType,
                    semanticType: semType
                }];
            }
        }
        return null;
    }
};