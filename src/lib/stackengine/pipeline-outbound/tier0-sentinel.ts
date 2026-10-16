/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/tier0-sentinel.ts

export class Tier0Sentinel {
    /**
     * High-entropy fingerprint and sensitive prefix pre-filter:
     * Fast-paths rejection of benign payloads via short-circuit regex matching.
     * Evaluates cloud keys, JWT headers, private key headers, and credential keywords.
     */
    private static SUSPICIOUS_PATTERN = new RegExp([
        'gh[ \t]*[pousr]_[A-Za-z0-9_]{16,}',
        'A[SK]IA[A-Z0-9]{16}',
        'sk[_-][a-zA-Z0-9_-]{14,}',
        'xox[baprs]-[0-9a-zA-Z-]{10,}',
        'SG\\.[a-zA-Z0-9_.-]{22}',
        '(?:s\\.|hvs\\.)[a-zA-Z0-9_-]{20,}',
        'hooks\\.slack\\.com\\/services\\/[A-Za-z0-9_\\/]+',
        'BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY',
        'eyJ[a-zA-Z0-9_-]{5,}\\.eyJ[a-zA-Z0-9_-]{5,}',
        ':\\/\\/[^:\\s\'"]*:[^@\\s\'"]+',
        '(?:password|passwd|secret|api_key|token|auth|credential|db_pass|conn_str|private_key|key_data|pgp_key|sensitive|ExternalId|N9!nx)',
        'md5[0-9a-f]{32}',
        '\\$6\\$rounds=[0-9]+\\$',
        'P@\\$\\$w0rd',
        'AQIC[A-Za-z0-9+/=._-]{10,}',
        ':_authToken=',
        '\\.dockerconfigjson',
        'client-key-data',
        'supersecret'
    ].join('|'), 'i');

    /**
     * Evaluates whether raw payload contains candidate secret signatures.
     * Returns false to bypass downstream pipeline stages when no indicators match.
     */
    public static check(rawText: string): boolean {
        return this.SUSPICIOUS_PATTERN.test(rawText);
    }
}
