/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/preflight-sweeper.ts

import { PREFLIGHT_INVARIANT_RULES } from './preflight-registry';
import { SharedConfig } from './capsules/core.js';

export interface PhysicalSecretRange {
    start: number;
    end: number;
    value: string;
    semanticType: string;
    nodeType: string;
}

export class PreflightSweeper {
    public static sweep(rawText: string): PhysicalSecretRange[] {
        const ranges: PhysicalSecretRange[] = [];

        // 1. Invariant pattern detection across global registry
        for (const rule of PREFLIGHT_INVARIANT_RULES) {
            rule.regex.lastIndex = 0; // Reset execution pointer
            let match: RegExpExecArray | null;

            while ((match = rule.regex.exec(rawText)) !== null) {
                if (match[0].length === 0) break;

                ranges.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    value: match[0],
                    semanticType: rule.type,
                    nodeType: 'preflight_invariant'
                });
            }
        }

        // 2. Database/cache DSN connection URI credential extraction (handles compound passwords containing multiple '@' characters)
        const dsnRegex = /(?:postgresql|postgres|mysql|redis|mongodb|amqp|tcp):\/\/([^\s"';]+)/gi;
        let dsnMatch: RegExpExecArray | null;
        while ((dsnMatch = dsnRegex.exec(rawText)) !== null) {
            const authority = dsnMatch[1].split('/')[0];
            const lastAt = authority.lastIndexOf('@');
            if (lastAt > -1) {
                const auth = authority.substring(0, lastAt);
                const colonIdx = auth.indexOf(':');
                if (colonIdx > -1) {
                    const pass = auth.substring(colonIdx + 1);
                    if (pass.length > 0 && !pass.startsWith('$') && !pass.includes('${')) {
                        // Locate exact offset in raw source text to prevent offset drift
                        const dsnAuthorityStart = dsnMatch.index + dsnMatch[0].indexOf('://') + 3;
                        const exactPassStart = rawText.indexOf(pass, dsnAuthorityStart);
                        if (exactPassStart > -1 && exactPassStart < dsnMatch.index + dsnMatch[0].length) {
                            ranges.push({
                                start: exactPassStart,
                                end: exactPassStart + pass.length,
                                value: pass,
                                semanticType: 'DB_AUTH_CREDENTIAL',
                                nodeType: 'preflight_dsn_credential'
                            });
                        }
                    }
                }
            }
        }

        // 3. Redis CLI --requirepass flag parameter extraction (filters common placeholder decoys)
        const requirePassRegex = /--requirepass[\s=]+["']?([^\s"';\r\n]+)["']?/gi;
        let rpMatch: RegExpExecArray | null;
        while ((rpMatch = requirePassRegex.exec(rawText)) !== null) {
            const pass = rpMatch[1];
            if (pass.length >= 5 && !pass.startsWith('$') && !/^(?:changeme|dummy|test|placeholder)$/i.test(pass)) {
                const passOffset = rpMatch[0].indexOf(pass);
                ranges.push({
                    start: rpMatch.index + passOffset,
                    end: rpMatch.index + passOffset + pass.length,
                    value: pass,
                    semanticType: 'DB_AUTH_CREDENTIAL',
                    nodeType: 'preflight_redis_requirepass'
                });
            }
        }

        // Raw text sweep for PostgreSQL .pgpass records (host:port:db:user:password)
        // Bypasses AST drop on trailing multi-document comment blocks
        const pgpassRegex = /pgpass\s*[:=]\s*["']?[^\s"':]+:[0-9*]+:[^\s"':]+:[^\s"':]+:([^\s"';\r\n]+?)["']?(?:[\r\n]|$)/gi;
        let pgMatch: RegExpExecArray | null;
        while ((pgMatch = pgpassRegex.exec(rawText)) !== null) {
            const pass = pgMatch[1];
            if (pass && pass.length >= 6) {
                const passOffset = pgMatch[0].lastIndexOf(pass);
                ranges.push({
                    start: pgMatch.index + passOffset,
                    end: pgMatch.index + passOffset + pass.length,
                    value: pass,
                    semanticType: 'DB_AUTH_CREDENTIAL',
                    nodeType: 'preflight_pgpass_credential'
                });
            }
        }

        // 4. In-line key-value credential and query parameter extraction
        const inlinePwdRegex = /(?:[&;?][ \t]*|["' \t]|^)(?:[\w.-]*(?:password|passwd|pwd)|--requirepass)[ \t]*[:=][ \t]*["']?([^\s"';&,\r\n]+)["']?/gi;
        let inlineMatch: RegExpExecArray | null;
        while ((inlineMatch = inlinePwdRegex.exec(rawText)) !== null) {
            const pass = inlineMatch[1].replace(/[,;.'"\\)]+$/, '');
            const isIaCReference = /^(?:var|local|each|module|data|self|resource|process|config)\.[a-zA-Z0-9_.-]+$/i.test(pass);
            const isTemplatePlaceholder = pass.startsWith('$') || pass.includes('${') || pass.includes('{{') || /^<.*>$/.test(pass);
            const isDecoy = /^(?:true|false|null|yes|no|none|undefined|always|never|changeme|UDRzc3cwcmQhQDEyMw==)$/i.test(pass);
            const isNetworkCIDR = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/.test(pass);
            const isBareIdentifier = /^[A-Z0-9_]{3,}$/.test(pass) || /^[a-z0-9_]+$/.test(pass);

            if (pass.length >= 5 && !isIaCReference && !isTemplatePlaceholder && !isDecoy && !isNetworkCIDR && !isBareIdentifier) {
                const passOffset = inlineMatch[0].lastIndexOf(pass);
                ranges.push({
                    start: inlineMatch.index + passOffset,
                    end: inlineMatch.index + passOffset + pass.length,
                    value: pass,
                    semanticType: 'DB_AUTH_CREDENTIAL',
                    nodeType: 'preflight_inline_credential'
                });
            }
        }

        // Channel A raw text sweep for custom user intent keys (configured in stackengine.yaml)
        for (const rawKey of SharedConfig.customIntentKeys) {
            const k = rawKey.split('.').pop()?.trim(); // Support dot-notation leaf keys (annotations.owner -> owner)
            if (!k) continue;

            const customRegex = new RegExp(`(?:^|[\\s"'{,])(?:[\\w.-]*\\.)?${k}[ \\t]*[:=][ \\t]*["']?([^\\s"';,}\\]\\\\\\r\\n]+)["']?`, 'gi');
            let cMatch: RegExpExecArray | null;
            while ((cMatch = customRegex.exec(rawText)) !== null) {
                const val = cMatch[1];
                if (val && !val.startsWith('$') && !val.includes('${')) {
                    const valOffset = cMatch[0].lastIndexOf(val);
                    ranges.push({
                        start: cMatch.index + valOffset,
                        end: cMatch.index + valOffset + val.length,
                        value: val,
                        semanticType: 'CUSTOM_MASKED_FIELD',
                        nodeType: 'preflight_custom_key'
                    });
                }
            }
        }

        return ranges.sort((a, b) => a.start - b.start);
    }
}
