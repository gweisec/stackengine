/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/extractors/tree-sitter-wasm.ts
import path from 'node:path';
import fs from 'node:fs';
import Parser from 'web-tree-sitter';
import { CleanScalar } from '../../types';
import { GenericScriptExtractor } from './generic-script';
import { WASM_CORE, WASM_YAML, WASM_JSON, WASM_HCL } from '../../../../generated/embedded-wasm.js';

interface ASTNode {
    id: number;
    type: string;
    text: string;
    startIndex: number;
    endIndex: number;
    childCount: number;
    child(index: number): ASTNode | null;
    parent: ASTNode | null;
    children: ASTNode[];
}

export class TreeSitterWasmExtractor {
    private static parserInstance: any = null;
    private static languages: Map<string, any> = new Map();
    private static initPromise: Promise<void> | null = null;

    /**
     * Checks whether a precompiled Tree-sitter WASM grammar is supported for the target language.
     */
    public static isLanguageSupported(lang: string): boolean {
        return ['yaml', 'yml', 'json'].includes(lang.toLowerCase());
    }

    public static async init(wasmBaseDir?: string): Promise<void> {
        if (this.parserInstance) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // Fast-path: In-Memory Embedded WASM (zero filesystem dependencies)
            if (!wasmBaseDir && typeof WASM_CORE !== 'undefined' && WASM_CORE.length > 0) {
                try {
                    await (Parser as any).init({
                        wasmBinary: WASM_CORE
                    });
                    this.parserInstance = new (Parser as any)();
                    const LanguageLoader = (Parser as any).Language;

                    if (typeof WASM_YAML !== 'undefined' && WASM_YAML.length > 0) {
                        const yamlLang = await LanguageLoader.load(WASM_YAML);
                        this.languages.set('yaml', yamlLang);
                        this.languages.set('yml', yamlLang);
                    }
                    if (typeof WASM_JSON !== 'undefined' && WASM_JSON.length > 0) {
                        const jsonLang = await LanguageLoader.load(WASM_JSON);
                        this.languages.set('json', jsonLang);
                    }
                    if (typeof WASM_HCL !== 'undefined' && WASM_HCL.length > 0) {
                        const hclLang = await LanguageLoader.load(WASM_HCL);
                        this.languages.set('hcl', hclLang);
                        this.languages.set('tf', hclLang);
                    }
                    return;
                } catch (embeddedErr) {
                    console.warn('[StackEngine] In-memory WASM init notice, falling back to disk resolution:', embeddedErr);
                }
            }

            // Fallback: Disk-based resolution (custom grammar dir / external public/wasm / symlink-safe path)
            let baseDir = wasmBaseDir || process.env.STACKENGINE_WASM_DIR;
            if (!baseDir) {
                try {
                    const realExecDir = path.dirname(fs.realpathSync(process.execPath));
                    const candidate = path.join(realExecDir, 'public/wasm');
                    if (fs.existsSync(candidate)) baseDir = candidate;
                } catch (_) {}
            }
            if (!baseDir) {
                const candidate = path.join(process.cwd(), 'public/wasm');
                if (fs.existsSync(candidate)) baseDir = candidate;
            }
            if (!baseDir) {
                baseDir = path.join(process.cwd(), 'public/wasm');
            }

            const mainWasm = path.join(baseDir, 'tree-sitter.wasm');
            await (Parser as any).init({
                locateFile: (scriptName: string) => {
                    if (scriptName === 'tree-sitter.wasm') return mainWasm;
                    return path.join(baseDir!, scriptName);
                }
            });

            this.parserInstance = new (Parser as any)();
            const LanguageLoader = (Parser as any).Language;

            const yamlWasm = path.join(baseDir, 'grammars/yaml.wasm');
            if (fs.existsSync(yamlWasm)) {
                const lang = await LanguageLoader.load(yamlWasm);
                this.languages.set('yaml', lang);
                this.languages.set('yml', lang);
            }

            const jsonWasm = path.join(baseDir, 'grammars/json.wasm');
            if (fs.existsSync(jsonWasm)) {
                const lang = await LanguageLoader.load(jsonWasm);
                this.languages.set('json', lang);
            }

            const hclWasm = path.join(baseDir, 'grammars/hcl.wasm');
            if (fs.existsSync(hclWasm)) {
                const lang = await LanguageLoader.load(hclWasm);
                this.languages.set('hcl', lang);
                this.languages.set('tf', lang);
            }
        })();

        return this.initPromise;
    }


    public static async extract(
        rawText: string,
        lang: string = 'yaml',
        wasmBaseDir?: string
    ): Promise<CleanScalar[]> {
        await this.init(wasmBaseDir);
        if (!this.parserInstance) throw new Error('Tree-sitter parser failed to initialize.');

        const language = this.languages.get(lang.toLowerCase()) || this.languages.get('yaml');
        if (!language) throw new Error(`WASM Grammar not loaded for language: ${lang}`);

        this.parserInstance.setLanguage(language);
        const tree = this.parserInstance.parse(rawText);
        const scalars: CleanScalar[] = [];

        // AST Ancestor path resolution: traverses parent mapping keys with recursion depth guard (max: 10)
        function resolveKeyPath(startNode: ASTNode): string | undefined {
            try {
                const keys: string[] = [];
                let curr: ASTNode | null = startNode;
                let depth = 0;

                while (curr && curr.parent && depth < 10) {
                    depth++;
                    const parentNode: ASTNode = curr.parent;
                    const pType = parentNode.type;

                    if (pType === 'block_mapping_pair' || pType === 'flow_pair' || pType === 'pair' || pType === 'attribute' || pType === 'object_elem') {
                        const firstChild = parentNode.children?.[0] || parentNode.child?.(0);
                        if (firstChild && firstChild.id !== curr.id) {
                            let keyText = firstChild.text ? firstChild.text.replace(/^["']|["']$/g, '').trim() : '';

                            if (keyText === 'value' && parentNode.parent) {
                                const rawBlock = parentNode.parent.text || '';
                                const nameM = rawBlock.match(/(?:^|\n)[ \t]*(?:-\s*)?name\s*:\s*["']?([A-Za-z0-9_.-]+)["']?/);
                                if (nameM) {
                                    keyText = nameM[1];
                                }
                            }

                            if (keyText && !keys.includes(keyText)) {
                                keys.unshift(keyText);
                            }
                        }
                    }
                    curr = parentNode;
                }
                return keys.length > 0 ? keys.join('.') : undefined;
            } catch {
                return undefined;
            }
        }

        function traverse(node: ASTNode) {
            // Comment extraction: support quoted credentials and delimited connection secrets (e.g. .pgpass)
            if (node.type === 'comment') {
                const text = node.text;
                const commentKeyM = text.match(/(?:#|--|\/\/)\s*[\w.-]*(?:password|pwd|secret|token|pgpass)\s*[:=]\s*["']?([^\s"';#\r\n]+)/i);
                if (commentKeyM) {
                    let secretVal = commentKeyM[1];
                    if (secretVal.includes(':')) {
                        secretVal = secretVal.substring(secretVal.lastIndexOf(':') + 1);
                    }
                    secretVal = secretVal.replace(/["']+$/, '');
                    const valOffset = text.lastIndexOf(secretVal);
                    if (valOffset > -1 && secretVal.length >= 5) {
                        scalars.push({
                            start: node.startIndex + valOffset,
                            end: node.startIndex + valOffset + secretVal.length,
                            value: secretVal,
                            nodeType: 'comment_sniped_password',
                            keyContext: 'password'
                        });
                        return;
                    }
                }
                if (commentKeyM) {
                    let secretVal = commentKeyM[1];
                    if (secretVal.includes(':')) {
                        secretVal = secretVal.substring(secretVal.lastIndexOf(':') + 1);
                    }
                    const valOffset = text.lastIndexOf(secretVal);
                    if (valOffset > -1 && secretVal.length >= 5) {
                        scalars.push({
                            start: node.startIndex + valOffset,
                            end: node.startIndex + valOffset + secretVal.length,
                            value: secretVal,
                            nodeType: 'comment_sniped_password',
                            keyContext: 'password'
                        });
                        return;
                    }
                }

                // High-entropy credential preflight filter
                if (/(?:AKIA|sk_|ghp_|eyJ|-----BEGIN|[a-zA-Z0-9/+=]{40})/i.test(text)) {
                    // Detect AWS Access Key ID
                    const akiaM = text.match(/\bAKIA[0-9A-Z]{16,}\b/);
                    if (akiaM) {
                        const start = node.startIndex + akiaM.index!;
                        scalars.push({ start, end: start + akiaM[0].length, value: akiaM[0], nodeType: 'comment_sniped_akia' });
                    }
                    // Detect 40-character AWS Secret Key (guarded by alphanumeric boundary checks)
                    const secM = text.match(/(?<![a-zA-Z0-9/])[a-zA-Z0-9/+=]{40}(?![a-zA-Z0-9/+=])/);
                    if (secM) {
                        const start = node.startIndex + secM.index!;
                        scalars.push({ start, end: start + 40, value: secM[0], nodeType: 'comment_sniped_sec' });
                    }
                    // Extract quoted credential substrings inside comments
                    const dqM = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
                    if (dqM && dqM[1].length >= 8) {
                        const start = node.startIndex + dqM.index! + 1;
                        scalars.push({ start, end: start + dqM[1].length, value: dqM[1], nodeType: 'comment_sniped_dquote' });
                    }
                }
                return;
            }

            // =================================================================
            // AST Malformed Node Resiliency (ERROR Node Fallback)
            // When parsers encounter malformed structures (e.g. invalid mixed mappings),
            // isolate raw byte slice and delegate to generic script extractor.
            // =================================================================
            if (node.type === 'ERROR') {
                const errorSlice = rawText.slice(node.startIndex, node.endIndex);
                const salvagedScalars = GenericScriptExtractor.extract(errorSlice);
                for (const s of salvagedScalars) {
                    scalars.push({
                        start: node.startIndex + s.start,
                        end: node.startIndex + s.end,
                        value: s.value,
                        nodeType: `error_salvaged_${s.nodeType}`
                    });
                }

                // Secondary recovery for multiline PEM certificates within malformed blocks
                const pemBlockRegex = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY[\s\S]+?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;
                let pemMatch;
                while ((pemMatch = pemBlockRegex.exec(errorSlice)) !== null) {
                    scalars.push({
                        start: node.startIndex + pemMatch.index,
                        end: node.startIndex + pemMatch.index + pemMatch[0].length,
                        value: pemMatch[0],
                        nodeType: 'error_salvaged_pem_block'
                    });
                }
                return; // Terminate recursion on malformed branch to prevent corrupt traversal
            }

            // Key immunity: ignore mapping keys
            if (node.parent?.type === 'block_mapping_pair' || node.parent?.type === 'flow_pair') {
                if (node.parent.children[0]?.id === node.id) return;
            }

            // Double-quoted scalar with ancestor key context
            if (node.type === 'double_quote_scalar') {
                const start = node.startIndex + 1;
                const end = node.endIndex - 1;
                if (end > start) {
                    scalars.push({
                        start,
                        end,
                        value: rawText.slice(start, end),
                        nodeType: 'double_quoted_string',
                        keyContext: resolveKeyPath(node)
                    });
                }
                return;
            }

            // Single-quoted scalar with ancestor key context
            if (node.type === 'single_quote_scalar') {
                const start = node.startIndex + 1;
                const end = node.endIndex - 1;
                if (end > start) {
                    scalars.push({
                        start,
                        end,
                        value: rawText.slice(start, end),
                        nodeType: 'single_quoted_string',
                        keyContext: resolveKeyPath(node)
                    });
                }
                return;
            }

            // Plain scalar with ancestor key context
            if (node.type === 'string_scalar' || node.type === 'plain_scalar') {
                const text = node.text;

                // Key-value decoupling: handle inline assignments (e.g. - KEY=value)
                const eqIdx = text.indexOf('=');
                if (eqIdx > 0 && /^[A-Za-z0-9_]+$/.test(text.slice(0, eqIdx).trim())) {
                    const rawVal = text.slice(eqIdx + 1);
                    const cleanVal = rawVal.replace(/^["']|["']$/g, '').trim();
                    const envKey = text.slice(0, eqIdx).trim();
                    if (cleanVal && !cleanVal.startsWith('${') && !cleanVal.startsWith('$')) {
                        const valOffset = text.indexOf(cleanVal, eqIdx + 1);
                        scalars.push({
                            start: node.startIndex + valOffset,
                            end: node.startIndex + valOffset + cleanVal.length,
                            value: cleanVal,
                            nodeType: 'env_decoupled_scalar',
                            keyContext: envKey
                        });
                    }
                    return;
                }

                const val = text.trim();
                if (val && !val.startsWith('${') && !val.startsWith('$')) {
                    scalars.push({
                        start: node.startIndex,
                        end: node.endIndex,
                        value: node.text,
                        nodeType: 'plain_scalar',
                        keyContext: resolveKeyPath(node)
                    });
                }
                return;
            }

            

            // Block scalar processing (literal '|-' and folded '>+' styles)
            if (node.type === 'block_scalar') {
                const firstNl = rawText.indexOf('\n', node.startIndex);
                const contentStart = firstNl > -1 ? firstNl + 1 : node.startIndex;
                const contentEnd = node.endIndex;
                const blockContent = rawText.slice(contentStart, contentEnd);

                // Standalone PEM private key certificate detection
                const trimmedBlock = blockContent.trim();
                if (trimmedBlock.startsWith('-----BEGIN') && !trimmedBlock.includes('\nexport ') && !trimmedBlock.includes('\necho ')) {
                    scalars.push({ start: contentStart, end: contentEnd, value: blockContent, nodeType: 'block_scalar' });
                    return;
                }

                let lineOffset = contentStart;
                const lines = blockContent.split('\n');

                // Block scalar structural scope tracker (identifies variable/resource blocks in HCL/Terraform)
                let activeBlockKey = '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        let matchedAny = false;

                        // Match block declaration headers (e.g. variable "db_passwords" {)
                        const blockMatch = trimmed.match(/(?:variable|resource|data|locals?)?\s*["']?([A-Za-z0-9_.-]*(?:password|secret|token|credential|auth)[A-Za-z0-9_.-]*)["']?\s*\{/i);
                        if (blockMatch) {
                            activeBlockKey = blockMatch[1];
                        } else if (trimmed === '}') {
                            activeBlockKey = '';
                        }

                        // Quoted string extraction with ancestor context (resilient against CRLF newline offset drift)
                        const quoteRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
                        let qm;
                        while ((qm = quoteRegex.exec(line)) !== null) {
                            matchedAny = true;
                            const strVal = qm[1] ?? qm[2] ?? '';
                            // Locate substring directly in raw byte stream to prevent CRLF offset skew
                            const exactStart = rawText.indexOf(strVal, lineOffset);
                            const start = exactStart > -1 ? exactStart : (lineOffset + qm.index + 1);

                            // Detect inline attribute key context
                            const preLine = line.substring(0, qm.index).trim();
                            const lineKeyM = preLine.match(/(?:([A-Za-z0-9_.-]+)|["']([A-Za-z0-9_.-]+)["'])\s*[:=]\s*$/);
                            const lineKey = lineKeyM ? (lineKeyM[1] || lineKeyM[2]) : undefined;
                            const fullKeyContext = [activeBlockKey, lineKey].filter(Boolean).join('.');

                            scalars.push({
                                start,
                                end: start + strVal.length,
                                value: strVal,
                                nodeType: 'sub_doc_quoted',
                                keyContext: fullKeyContext || undefined
                            });
                        }

                        // Extract URI connection strings (strip trailing semicolons and commas)
                        const uriRegex = /[a-zA-Z0-9_+.-]+:\/\/[^\s"'<>;,]+/g;
                        let um;
                        while ((um = uriRegex.exec(line)) !== null) {
                            matchedAny = true;
                            const cleanUri = um[0].replace(/[;,]+$/, '');
                            const start = lineOffset + um.index;
                            scalars.push({ start, end: start + cleanUri.length, value: cleanUri, nodeType: 'sub_doc_uri' });
                        }

                        // Generic key-value assignment extraction (export, set $, comments, whitespace and colon assignments)
                        const assignRegex = /(?:#|--|\/\/)?\s*(?:export\s+|set\s+\$)?[A-Za-z0-9_.-]+\s*[:= ]\s*([^\s,;"'{}[\]()]+)/gi;
                        let am;
                        while ((am = assignRegex.exec(line)) !== null) {
                            const valStr = am[1];
                            // Guard: suppress ARNs (aws:), URLs (//), and environment references ($)
                            if (!valStr.startsWith('aws:') && !valStr.startsWith('//') && !valStr.startsWith('$') && !valStr.includes(':::')) {
                                matchedAny = true;
                                const valIdx = am[0].lastIndexOf(valStr);
                                const start = lineOffset + am.index + valIdx;
                                scalars.push({ start, end: start + valStr.length, value: valStr, nodeType: 'sub_doc_assign' });
                            }
                        }

                        // Fallback heuristic: isolate raw unquoted multiline credentials
                        if (!matchedAny && !trimmed.startsWith('#') && !trimmed.startsWith('--')) {
                            const cleanVal = trimmed.replace(/^["']|["',;]+$/g, '');
                            if (cleanVal.length > 0 && !cleanVal.startsWith('aws:') && !cleanVal.includes(':::')) {
                                const localStart = line.indexOf(cleanVal);
                                const absStart = lineOffset + localStart;
                                scalars.push({ start: absStart, end: absStart + cleanVal.length, value: cleanVal, nodeType: 'sub_doc_fallback' });
                            }
                        }
                    }
                    lineOffset += line.length + 1;
                }
                return;
            }

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) traverse(child);
            }
        }

        traverse(tree.rootNode);
        const uniqueScalars: CleanScalar[] = [];
        const seenCoords = new Set<string>();

        for (const s of scalars) {
            const coordKey = `${s.start}:${s.end}`;
            if (!seenCoords.has(coordKey)) {
                seenCoords.add(coordKey);
                uniqueScalars.push(s);
            }
        }

        return uniqueScalars;
        
    }
}