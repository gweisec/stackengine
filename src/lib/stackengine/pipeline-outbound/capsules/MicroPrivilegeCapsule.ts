/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { CleanScalar } from '../../types';
import { DetectorCapsule, ClassifiedSecret, calculateEntropy } from './core';

export const MicroPrivilegeCapsule: DetectorCapsule = {
    id: 'MICRO_PRIVILEGED',
    priority: 500,
    trigger: () => true, 
    verify: (cleanVal: string, rawVal: string, scalar: CleanScalar): ClassifiedSecret[] | null => {
        const results: ClassifiedSecret[] = [];

        // 1. URI / DSN connection string credential dissection
        const protocolIdx = rawVal.indexOf('://');
        if (protocolIdx > -1) {
            const pathIdx = rawVal.indexOf('/', protocolIdx + 3);
            const authority = rawVal.substring(protocolIdx + 3, pathIdx > -1 ? pathIdx : rawVal.length);
            const lastAtIdx = authority.lastIndexOf('@');
            if (lastAtIdx > -1) {
                const auth = authority.substring(0, lastAtIdx);
                const colonIdx = auth.indexOf(':');
                if (colonIdx > -1) {
                    const pass = auth.substring(colonIdx + 1);
                    if (!pass.startsWith('$') && !pass.includes('${')) {
                        results.push({
                            start: scalar.start + protocolIdx + 3 + colonIdx + 1,
                            end: scalar.start + protocolIdx + 3 + colonIdx + 1 + pass.length,
                            value: pass,
                            nodeType: scalar.nodeType,
                            semanticType: 'DB_AUTH_CREDENTIAL'
                        });
                    }
                }
            }
        }

        // Long private key candidate fallback (40-64 characters)
        const longSecretRegex = /(?<![a-zA-Z0-9/+_.-])(?![a-fA-F0-9]+$)[a-zA-Z0-9/+=]{40,64}(?![a-zA-Z0-9/+=])/g;
        let longSecM;
        while ((longSecM = longSecretRegex.exec(rawVal)) !== null) {
            const candidate = longSecM[0];
            if (!candidate.includes(' ') && !candidate.startsWith('eyJ') && calculateEntropy(candidate) > 3.5) {
                results.push({
                    start: scalar.start + longSecM.index,
                    end: scalar.start + longSecM.index + candidate.length,
                    value: candidate,
                    nodeType: scalar.nodeType,
                    semanticType: 'AWS_SECRET_ACCESS_KEY'
                });
            }
        }

        // 2. HTTP Basic Auth header token extraction
        const basicRegex = /Basic\s+([a-zA-Z0-9+/=]{20,})/g;
        let basicM;
        while ((basicM = basicRegex.exec(rawVal)) !== null) {
            results.push({
                start: scalar.start + basicM.index,
                end: scalar.start + basicM.index + basicM[0].length,
                value: basicM[0],
                nodeType: scalar.nodeType,
                semanticType: 'BASIC_AUTH_HEADER'
            });
        }

        // 3. Database password hash detection (MD5 / SHA-512)
        const md5Regex = /md5[0-9a-f]{32}/g;
        let md5M;
        while ((md5M = md5Regex.exec(rawVal)) !== null) {
            results.push({
                start: scalar.start + md5M.index,
                end: scalar.start + md5M.index + md5M[0].length,
                value: md5M[0],
                nodeType: scalar.nodeType,
                semanticType: 'DB_HASHED_PASSWORD'
            });
        }
        const sha512Regex = /\$6\$rounds=\d+\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./_]+/g;
        let sha512M;
        while ((sha512M = sha512Regex.exec(rawVal)) !== null) {
            results.push({
                start: scalar.start + sha512M.index,
                end: scalar.start + sha512M.index + sha512M[0].length,
                value: sha512M[0],
                nodeType: scalar.nodeType,
                semanticType: 'SHA512_CRYPT_HASH'
            });
        }

        // 4. URL-encoded credential sequence extraction
        const urlEncRegex = /(?:%[0-9A-Fa-f]{2}){3,}/g;
        let urlEncM;
        while ((urlEncM = urlEncRegex.exec(rawVal)) !== null) {
            results.push({
                start: scalar.start + urlEncM.index,
                end: scalar.start + urlEncM.index + urlEncM[0].length,
                value: urlEncM[0],
                nodeType: scalar.nodeType,
                semanticType: 'URL_ENCODED_SECRET'
            });
        }

        return results.length > 0 ? results : null;
    }
};
