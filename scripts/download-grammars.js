/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// scripts/download-grammars.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORCE_SYNC = process.argv.includes('--force');
const publicWasmDir = path.join(__dirname, '../public/wasm');
const grammarDir = path.join(publicWasmDir, 'grammars');

// Validate WebAssembly binary magic bytes: 0x00 0x61 0x73 0x6D (\0asm)
function isValidWasmBinary(buffer) {
    return (
        buffer &&
        buffer.length >= 4 &&
        buffer[0] === 0x00 &&
        buffer[1] === 0x61 &&
        buffer[2] === 0x73 &&
        buffer[3] === 0x6d
    );
}

// Multi-mirror grammar manifest with fallback sources
const GRAMMAR_MANIFEST = {
    'yaml.wasm': [
        'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-yaml.wasm',
        'https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-yaml.wasm'
    ],
    'json.wasm': [
        'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-json.wasm',
        'https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-json.wasm'
    ],
    'hcl.wasm': [
        'https://cdn.jsdelivr.net/npm/@lumis-sh/wasm-hcl@0.26.3/tree-sitter-hcl.wasm',
        'https://unpkg.com/@lumis-sh/wasm-hcl@0.26.3/tree-sitter-hcl.wasm'
    ]
};

// Extract tree-sitter core runtime from local node_modules
function extractCoreRuntime() {
    const candidates = [
        path.join(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm'),
        path.join(__dirname, '../node_modules/web-tree-sitter/web-tree-sitter.wasm')
    ];

    for (const src of candidates) {
        if (fs.existsSync(src)) {
            const buf = fs.readFileSync(src);
            // Dual-alias target files to reconcile Emscripten modular loader naming divergence
            fs.writeFileSync(path.join(publicWasmDir, 'tree-sitter.wasm'), buf);
            fs.writeFileSync(path.join(publicWasmDir, 'web-tree-sitter.wasm'), buf);
            console.log(`⚡ [CORE_WASM] Dual-aliased -> tree-sitter.wasm & web-tree-sitter.wasm`);
            return;
        }
    }
    console.error('[CRITICAL] Missing web-tree-sitter in node_modules!');
    process.exit(1);
}

// Resilient grammar fetcher with mirror failover
async function fetchGrammar(name, urls) {
    const targetPath = path.join(grammarDir, name);

    // Incremental cache guard: reuse valid binary unless forced
    if (!FORCE_SYNC && fs.existsSync(targetPath)) {
        const existing = fs.readFileSync(targetPath);
        if (isValidWasmBinary(existing)) {
            console.log(` [CACHED] ${name} is valid, skipping.`);
            return;
        }
    }

    let lastError = null;

    for (const url of urls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Guard: reject non-WASM payloads (e.g. HTML 404/502 CDN error pages)
            if (!isValidWasmBinary(buffer)) {
                throw new Error('Payload signature mismatch (Not a valid WASM binary)');
            }

            fs.writeFileSync(targetPath, buffer);
            console.log(` [SYNCED] ${name} <- ${new URL(url).hostname} (${(buffer.length / 1024).toFixed(1)} KB)`);
            return;
        } catch (err) {
            lastError = err;
            console.warn(` [RETRY] ${name} failed via ${url}: ${err.message}. Trying next mirror...`);
        }
    }

    throw new Error(`Failed to retrieve ${name} across all mirrors. Last error: ${lastError?.message}`);
}

async function orchestrateSync() {
    console.log(' [INIT] Synchronizing High-Performance WebAssembly Grammars...\n');
    const t0 = performance.now();

    fs.mkdirSync(grammarDir, { recursive: true });

    extractCoreRuntime();

    console.log('\n [CONCURRENT] Fetching grammar artifacts in parallel...');
    const tasks = Object.entries(GRAMMAR_MANIFEST).map(([name, urls]) => fetchGrammar(name, urls));

    try {
        await Promise.all(tasks);
        const t1 = performance.now();
        console.log(`\n [READY] All WASM assets primed in ${(t1 - t0).toFixed(2)} ms.`);
        console.log(` Storage: ${publicWasmDir}`);
        process.exit(0);
    } catch (criticalErr) {
        console.error(`\n💥 [PIPELINE ABORT] ${criticalErr.message}`);
        process.exit(1); // Fail-fast: prevent corrupt runtime state propagation
    }
}

orchestrateSync();