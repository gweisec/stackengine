/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/extractors/lightweight-ts.ts
import { CleanScalar } from '../../types';

export class LightweightExtractor {
    /**
     * Fallback lexical extractor:
     * Fast-paths YAML/JSON scalar extraction following structural delimiters:
     * 1. Mapping value delimiter: ': '
     * 2. Sequence item delimiter: '- '
     * 3. Key-value assignment delimiter: '='
     */
    public static extract(rawText: string): CleanScalar[] {
        const scalars: CleanScalar[] = [];
        let i = 0;
        const len = rawText.length;

        while (i < len) {
            const c = rawText[i];

            // Comment boundary guard: advance to end of line without evaluating tokens
            if (c === '#') {
                while (i < len && rawText[i] !== '\n') i++;
                continue;
            }

            // Identify value lead delimiters across YAML, JSON, and Terraform/HCL/INI
            const isColonValue = (c === ':' && i + 1 < len && (rawText[i + 1] === ' ' || rawText[i + 1] === '\t'));
            const isDashValue = (c === '-' && i + 1 < len && (rawText[i + 1] === ' ' || rawText[i + 1] === '\t'));
            const isEqualsValue = (c === '=');

            if (isColonValue || isDashValue || isEqualsValue) {
                // Advance past delimiter and leading whitespace
                let valStart = i + 1;
                if (isColonValue || isDashValue) valStart = i + 2;
                while (valStart < len && (rawText[valStart] === ' ' || rawText[valStart] === '\t')) {
                    valStart++;
                }

                if (valStart >= len || rawText[valStart] === '\n' || rawText[valStart] === '#') {
                    i++;
                    continue;
                }

                const firstChar = rawText[valStart];

                // Branch A: Double-quoted strings
                if (firstChar === '"') {
                    const innerStart = valStart + 1;
                    let cursor = innerStart;
                    while (cursor < len) {
                        // Skip escaped characters without mutating raw character sequence
                        if (rawText[cursor] === '\\') {
                            cursor += 2;
                            continue;
                        }
                        if (rawText[cursor] === '"') break;
                        cursor++;
                    }
                    const innerEnd = cursor;
                    // Slice raw text directly to prevent character loss from eager unescaping
                    const val = rawText.slice(innerStart, innerEnd);

                    scalars.push({
                        start: innerStart,
                        end: innerEnd,
                        value: val,
                        nodeType: 'double_quoted_string'
                    });

                    i = cursor + 1; // Advance past closing quote
                    continue;
                }

                // Branch B: Single-quoted strings
                if (firstChar === "'") {
                    const innerStart = valStart + 1;
                    let cursor = innerStart;
                    let val = "";
                    while (cursor < len) {
                        if (rawText[cursor] === "'") {
                            // YAML escaped single-quote: '' maps to literal single quote
                            if (cursor + 1 < len && rawText[cursor + 1] === "'") {
                                val += "'";
                                cursor += 2;
                                continue;
                            }
                            break;
                        }
                        val += rawText[cursor];
                        cursor++;
                    }
                    const innerEnd = cursor;

                    scalars.push({
                        start: innerStart,
                        end: innerEnd,
                        value: val,
                        nodeType: 'single_quoted_string'
                    });

                    i = cursor + 1;
                    continue;
                }

                // Branch C: Plain scalars and decoupled key-value assignments
                if (firstChar !== '{' && firstChar !== '[') {
                    let cursor = valStart;
                    while (cursor < len && rawText[cursor] !== '\n' && rawText[cursor] !== '#') {
                        cursor++;
                    }
                    const rawVal = rawText.slice(valStart, cursor);
                    const trimmedVal = rawVal.trimEnd();

                    // Key-value decoupling: handle inline assignments (e.g. - KEY=value)
                    const eqIdx = trimmedVal.indexOf('=');
                    if (eqIdx > 0 && /^[A-Za-z0-9_]+$/.test(trimmedVal.slice(0, eqIdx).trim())) {
                        const rawPayload = trimmedVal.slice(eqIdx + 1);
                        const cleanPayload = rawPayload.replace(/^["']|["']$/g, '').trim();
                        if (cleanPayload && !cleanPayload.startsWith('${') && !cleanPayload.startsWith('$')) {
                            const valOffset = trimmedVal.indexOf(cleanPayload, eqIdx + 1);
                            scalars.push({
                                start: valStart + valOffset,
                                end: valStart + valOffset + cleanPayload.length,
                                value: cleanPayload,
                                nodeType: 'env_decoupled_scalar'
                            });
                        }
                        i = cursor;
                        continue;
                    }

                    // Standard unquoted scalar emission
                    if (!trimmedVal.startsWith('${') && !trimmedVal.startsWith('$') && trimmedVal !== '|' && trimmedVal !== '>-') {
                        scalars.push({
                            start: valStart,
                            end: valStart + trimmedVal.length,
                            value: trimmedVal,
                            nodeType: 'plain_scalar'
                        });
                    }

                    i = cursor;
                    continue;
                }
            }

            i++;
        }
        
        // Multiline PEM recovery sweep (compensates for parser failures on multiline blocks)
        const pemRegex = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY[\s\S]+?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;
        let pMatch;
        while ((pMatch = pemRegex.exec(rawText)) !== null) {
            scalars.push({
                start: pMatch.index,
                end: pMatch.index + pMatch[0].length,
                value: pMatch[0],
                nodeType: 'universal_pem_block'
            });
        }

        return scalars;
    }
}