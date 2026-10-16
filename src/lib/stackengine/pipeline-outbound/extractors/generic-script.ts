/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/extractors/generic-script.ts
import { CleanScalar } from '../../types';
import { PhysicalSecretRange } from '../preflight-sweeper';

export class GenericScriptExtractor {
    /**
     * Scalar extractor for Bash, Shell, Dockerfile, and generic unstructured scripts.
     * Incorporates preflight exclusion boundaries to prevent fragmentation of macro credentials.
     */
    public static extract(rawText: string, exclusionRanges: PhysicalSecretRange[] = []): CleanScalar[] {
        const scalars: CleanScalar[] = [];

        // Spatial collision guard: suppress scalars intersecting with preflight exclusion boundaries
        const isInExclusionZone = (start: number, end: number): boolean => {
            return exclusionRanges.some(macro => {
                const overlapStart = Math.max(macro.start, start);
                const overlapEnd = Math.min(macro.end, end);
                return overlapStart < overlapEnd;
            });
        };

        let lineOffset = 0;
        const lines = rawText.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                // Double-quoted scalar extraction: O(N) where N is line length; uses flat non-nested quantifiers to prevent catastrophic backtracking
                const dquoteRegex = /"((?:[^"\\]|\\.)*)"/g;
                let dqMatch: RegExpExecArray | null;
                while ((dqMatch = dquoteRegex.exec(line)) !== null) {
                    const start = lineOffset + dqMatch.index + 1;
                    const end = start + dqMatch[1].length;
                    if (!isInExclusionZone(start, end)) {
                        const preText = line.substring(0, dqMatch.index).trim();
                        const keyMatch = preText.match(/(?:(?:export\s+)?([A-Za-z0-9_.-]+)|["']([A-Za-z0-9_.-]+)["'])\s*[:=]\s*$/);
                        const keyContext = keyMatch ? (keyMatch[1] || keyMatch[2]) : undefined;

                        scalars.push({
                            start,
                            end,
                            value: dqMatch[1],
                            nodeType: 'script_double_quoted',
                            keyContext
                        });
                    }
                }

                // Single-quoted scalar extraction: O(N) where N is line length; uses flat non-nested quantifiers
                const squoteRegex = /'((?:[^'\\]|\\.)*)'/g;
                let sqMatch: RegExpExecArray | null;
                while ((sqMatch = squoteRegex.exec(line)) !== null) {
                    const start = lineOffset + sqMatch.index + 1;
                    const end = start + sqMatch[1].length;
                    if (!isInExclusionZone(start, end)) {
                        const preText = line.substring(0, sqMatch.index).trim();
                        const keyMatch = preText.match(/(?:(?:export\s+)?([A-Za-z0-9_.-]+)|["']([A-Za-z0-9_.-]+)["'])\s*[:=]\s*$/);
                        const keyContext = keyMatch ? (keyMatch[1] || keyMatch[2]) : undefined;

                        scalars.push({
                            start,
                            end,
                            value: sqMatch[1],
                            nodeType: 'script_single_quoted',
                            keyContext
                        });
                    }
                }

                // Pipeline credential extraction: isolate embedded user:password segments
                const userPassPipeRegex = /[a-zA-Z0-9_.-]+:([^\s"';#|)\\:]{6,})/g;
                let upMatch;
                while ((upMatch = userPassPipeRegex.exec(line)) !== null) {
                    const pass = upMatch[1];

                    // Guard 1: reject truncated URLs or URI protocols
                    if (pass.startsWith('//') || /^(?:https?|ftp|ssh|wss?):/i.test(upMatch[0])) {
                        continue;
                    }

                    // Guard 2: reject network port and routing paths (e.g. host:5432/db)
                    if (/^\d{1,5}(?:\/|$)/.test(pass)) {
                        continue;
                    }

                    // Guard 3: reject digest checksums, fingerprints, and network interfaces (e.g. sha256:hash, eth0:ip)
                    const prefix = upMatch[0].substring(0, upMatch[0].indexOf(':'));
                    if (/^(?:h\d|zh|sha\d*|md5|crc\d*|eth\d+|net\d+|v\d+)$/i.test(prefix)) {
                        continue;
                    }

                    const passOffset = upMatch[0].lastIndexOf(pass);
                    const start = lineOffset + upMatch.index + passOffset;
                    const end = start + pass.length;

                    if (/[0-9!@#$%^&*()_+=\-{}[\]:;.,?]/.test(pass)) {
                        if (!isInExclusionZone(start, end)) {
                            scalars.push({
                                start,
                                end,
                                value: pass,
                                nodeType: 'script_pipeline_password'
                            });
                        }
                    }
                }

                // Bare key-value assignment extraction (VAR=value)
                const assignRegex = /(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*([^\s"';#]+)/g;
                let assignMatch: RegExpExecArray | null;
                while ((assignMatch = assignRegex.exec(line)) !== null) {
                    const keyName = assignMatch[1];
                    const valStr = assignMatch[2];
                    if (!valStr.startsWith('$')) {
                        const valIdx = assignMatch[0].lastIndexOf(valStr);
                        const start = lineOffset + assignMatch.index + valIdx;
                        const end = start + valStr.length;
                        if (!isInExclusionZone(start, end)) {
                            scalars.push({
                                start,
                                end,
                                value: valStr,
                                nodeType: 'script_bare_assignment',
                                keyContext: keyName
                            });
                        }
                    }
                }

                // CLI flag parameter extraction (--password, -p, --token)
                const flagRegex = /(--password|--token|--secret|--api-key|--requirepass|-p)\s+["']?([^\s"';]+)["']?/gi;
                let flagMatch: RegExpExecArray | null;
                while ((flagMatch = flagRegex.exec(line)) !== null) {
                    const flagName = flagMatch[1];
                    const valStr = flagMatch[2];
                    if (!valStr.startsWith('$')) {
                        const valIdx = flagMatch[0].lastIndexOf(valStr);
                        const start = lineOffset + flagMatch.index + valIdx;
                        const end = start + valStr.length;
                        if (!isInExclusionZone(start, end)) {
                            scalars.push({
                                start,
                                end,
                                value: valStr,
                                nodeType: 'script_flag_value',
                                keyContext: flagName
                            });
                        }
                    }
                }

                // In-line comment credential extraction (# pass: xxx)
                const commentSecretRegex = /(?:#|--|\/\/)\s*[\w.-]*(password|pwd|secret|token|key|requirepass)\s*[:= ]\s*([^\s,;"'{}[\]()]+)/gi;
                let csMatch: RegExpExecArray | null;
                while ((csMatch = commentSecretRegex.exec(line)) !== null) {
                    const commentKey = csMatch[1];
                    const secretVal = csMatch[2];
                    const valIdx = csMatch[0].lastIndexOf(secretVal);
                    const start = lineOffset + csMatch.index + valIdx;
                    const end = start + secretVal.length;
                    if (!isInExclusionZone(start, end)) {
                        scalars.push({
                            start,
                            end,
                            value: secretVal,
                            nodeType: 'script_comment_secret',
                            keyContext: commentKey
                        });
                    }
                }
            }
            lineOffset += line.length + 1;
        }

        // Deduplicate overlapping scalar coordinates
        const uniqueScalars: CleanScalar[] = [];
        const seen = new Set<string>();

        for (const s of scalars) {
            const key = `${s.start}:${s.end}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueScalars.push(s);
            }
        }

        return uniqueScalars;
    }
}