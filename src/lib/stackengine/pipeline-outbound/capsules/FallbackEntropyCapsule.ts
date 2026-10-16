/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { CleanScalar } from '../../types';
import { DetectorCapsule, ClassifiedSecret, isSafeShapeOrDecoy, calculateEntropy } from './core';

export const FallbackEntropyCapsule: DetectorCapsule = {
    id: 'FALLBACK_ENTROPY',
    priority: 999,
    trigger: () => true,
    verify: (cleanVal: string, rawVal: string, scalar: CleanScalar): ClassifiedSecret[] | null => {
        const results: ClassifiedSecret[] = [];

        // Structural guard layer: reject safe shapes, templates, and decoys
        if (isSafeShapeOrDecoy(cleanVal)) return null;
        if (/(?:^|[=:\/.])\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z0-9_.-]+\})/.test(cleanVal)) return null;
        if (cleanVal.endsWith(')') || cleanVal.startsWith('//$') || cleanVal.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ') || cleanVal.includes('&Environment=')) return null;
        if (/[\[\]{}]|^\.[A-Z]/.test(cleanVal)) return null;

        const cleanUrl = cleanVal.replace(/[;,]+$/, '');
        if (/^https?:\/\/(?!.*@)[a-zA-Z0-9.\-]+(?::\d{1,5})?(?:\/[^?\s]*)?$/.test(cleanUrl)) return null;
        if (rawVal.includes('(') || rawVal.endsWith(':')) return null;
        if (/^[A-Z][a-zA-Z]+$/.test(cleanVal) && cleanVal.length >= 10) return null;

        // Entropy heuristics and compartmentalized parsing
        // Extract embedded user:password segments
        const userPassMatch = cleanVal.match(/^([a-zA-Z0-9_.-]+):([^\s"':;]+)$/);
        if (userPassMatch && userPassMatch[2].length >= 6) {
            const userPart = userPassMatch[1].toLowerCase();
            const pass = userPassMatch[2];
            const hasAuthContext = /^(?:.*(?:user|admin|auth|proxy|login|client|account)|root|default)$/i.test(userPart);

            if (hasAuthContext && !userPart.startsWith('arn') && !userPart.startsWith('http') && !pass.startsWith('$') && !pass.includes('${') && !/^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/.test(pass) && !/^[A-Z0-9_]+$/.test(pass)) {
                if (/[0-9!@#$%^&*()_+=\-{}[\]:;.,?]/.test(pass)) {
                    const pIdx = rawVal.indexOf(`:${pass}`) + 1;
                    results.push({
                        start: scalar.start + pIdx,
                        end: scalar.start + pIdx + pass.length,
                        value: pass,
                        nodeType: scalar.nodeType,
                        semanticType: 'HTTP_BASIC_AUTH_CREDENTIAL'
                    });
                    return results;
                }
            }
        }

        // Complex unknown password heuristic
        // Pure-ASCII guard: prevent CJK / multi-byte characters from distorting entropy calculation
        const isPureAscii = /^[\x20-\x7E]+$/.test(cleanVal);
        const hasRealSymbol = /[!@#$%^&*()+=~{}[\]:;.,?]/.test(cleanVal);
        const hasAlphaNum = /[a-zA-Z]/.test(cleanVal) && /[0-9]/.test(cleanVal);
        if (isPureAscii && cleanVal.length >= 8 && cleanVal.length <= 64 && hasRealSymbol && hasAlphaNum && !cleanVal.includes(' ') && !cleanVal.includes('*')) {
            results.push({
                start: scalar.start,
                end: scalar.end,
                value: cleanVal,
                nodeType: scalar.nodeType,
                semanticType: 'SHORT_COMPLEX_PASSWORD'
            });
            return results;
        }

        // Non-standard hexadecimal token heuristic
        if (/^[0-9a-fA-F]{24,64}$/.test(cleanVal)) {
            results.push({
                start: scalar.start,
                end: scalar.end,
                value: cleanVal,
                nodeType: scalar.nodeType,
                semanticType: 'HIGH_ENTROPY_SECRET'
            });
            return results;
        }

        // Shannon entropy fallback heuristic
        const hasSymbols = /[!@#$%^&*()_+=\_{}[\]:;.,?]/.test(cleanVal);
        const minEntropyLength = hasSymbols ? 16 : 24;
        if (isPureAscii && cleanVal.length >= minEntropyLength && !cleanVal.includes(' ')) {
            const entropy = calculateEntropy(cleanVal);
            if (entropy >= 3.8) {
                results.push({
                    start: scalar.start,
                    end: scalar.end,
                    value: cleanVal,
                    nodeType: scalar.nodeType,
                    semanticType: 'HIGH_ENTROPY_SECRET'
                });
                return results;
            }
        }

        return null;
    }
};
