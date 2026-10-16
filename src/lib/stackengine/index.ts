/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/index.ts
import { RedactionResult, CleanScalar, AirlockState } from './types.js';
import { StateManager } from './state/state-manager.js';
import { MemoryStore } from './state/memory-store.js';
import { Tier0Sentinel } from './pipeline-outbound/tier0-sentinel.js';
import { PreflightSweeper } from './pipeline-outbound/preflight-sweeper.js';
import { IntervalHarmonizer } from './pipeline-outbound/interval-harmonizer.js';
import { LightweightExtractor } from './pipeline-outbound/extractors/lightweight-ts.js';
import { TreeSitterWasmExtractor } from './pipeline-outbound/extractors/tree-sitter-wasm.js';
import { LanguageRouter } from './pipeline-outbound/language-router.js';
import { GenericScriptExtractor } from './pipeline-outbound/extractors/generic-script.js';
import { Tier3Oracle } from './pipeline-outbound/tier3-oracle.js';
import { InboundGrafter } from './pipeline-inbound/re-entry.js';
import { ShadowCaster } from './pipeline-outbound/shadow-caster.js';

export interface RedactOptions {
    stateManager?: StateManager;
    wasmBaseDir?: string;
    lang?: string;
}

/**
 * Scalar fusion (spatial union):
 * Combines primary AST scalars with secondary regex-based lexical recovery.
 * Compensates for AST edge gaps while preserving parser structural fidelity.
 */
function fuseScalars(primary: CleanScalar[], secondary: CleanScalar[]): CleanScalar[] {
    const fused = [...primary];
    for (const sec of secondary) {
        const isCovered = primary.some(pri => Math.max(pri.start, sec.start) < Math.min(pri.end, sec.end));
        if (!isCovered) {
            fused.push(sec);
        }
    }
    return fused.sort((a, b) => a.start - b.start);
}


export async function redact(
    rawText: string,
    options: RedactOptions = {}
): Promise<RedactionResult> {
    const startTime = Date.now();
    
    const state: StateManager = (options.stateManager || new MemoryStore()) as unknown as StateManager;

    // =========================================================
    // Stage 1: Tier 0 Fast-Reject Sentinel
    // Flat single-regex pre-filter to bypass benign plaintext
    // =========================================================
    if (!Tier0Sentinel.check(rawText)) {
        return {
            safePayload: rawText,
            state: state.getState(),
            stats: { totalFound: 0, processTimeMs: Date.now() - startTime }
        };
    }

    // =========================================================
    // Stage 2: Dual-Track Parallel Extraction
    // =========================================================

    // Channel A: Preflight byte-level sweep establishing exclusionary boundaries
    const macroSecrets = PreflightSweeper.sweep(rawText);

    // Channel B: AST and scalar extraction guarded by exclusionary bounds
    const effectiveLang = LanguageRouter.sniff(rawText, options.lang);
    let cleanScalars: CleanScalar[] = [];

    if (effectiveLang === 'bash' || !TreeSitterWasmExtractor.isLanguageSupported(effectiveLang)) {
        // Script mode: generic script extractor directly bound by preflight exclusions
        cleanScalars = GenericScriptExtractor.extract(rawText, macroSecrets);
    } else {
        // Structured configuration mode (YAML/JSON/HCL)
        let astScalars: CleanScalar[] = [];
        try {
            astScalars = await TreeSitterWasmExtractor.extract(
                rawText,
                effectiveLang,
                options.wasmBaseDir
            );
        } catch (err) {
            console.warn('[StackEngine] WASM AST error, falling back to secondary regex extractor:', err);
        }

        // Secondary fallback extraction
        const secondaryScalars = LightweightExtractor.extract(rawText);

        // Spatial union of AST and secondary scalars
        cleanScalars = fuseScalars(astScalars, secondaryScalars);

        // Filter out scalars encapsulated within macro preflight exclusion zones
        cleanScalars = cleanScalars.filter(s => {
            return !macroSecrets.some(macro => Math.max(macro.start, s.start) < Math.min(macro.end, s.end));
        });
    }

    // Micro-channel evaluation: Oracle evaluates pristine scalars free of fragmented macro blocks
    const microSecrets = Tier3Oracle.judge(cleanScalars);

    // =========================================================
    // Stage 3: IntervalHarmonizer (Conflict Resolution & Interval Disambiguation)
    // Macro boundaries maintain absolute precedence over intersecting micro fragments
    // =========================================================
    const harmonizedSecrets = IntervalHarmonizer.harmonize(macroSecrets, microSecrets);

    if (harmonizedSecrets.length === 0) {
        return {
            safePayload: rawText,
            state: state.getState(),
            stats: { totalFound: 0, processTimeMs: Date.now() - startTime }
        };
    }

    // =========================================================
    // Stage 4: Interval Ordering (Descending Start Offset)
    // Order by descending start offset to preserve upstream character slice offsets
    // =========================================================
    harmonizedSecrets.sort((a, b) => b.start - a.start);

    // Boundary overlap guard: eliminate adjacent intersecting coordinates
    const nonOverlappingSecrets: typeof harmonizedSecrets = [];
    let lastAcceptedStart = Infinity;

    for (const s of harmonizedSecrets) {
        if (s.end <= lastAcceptedStart) {
            nonOverlappingSecrets.push(s);
            lastAcceptedStart = s.start;
        }
    }

    // =========================================================
    // Stage 5: ShadowCaster Token Generation & Redaction
    // =========================================================
    const { safePayload } = ShadowCaster.cast(rawText, nonOverlappingSecrets, state);

    return {
        safePayload,
        state: state.getState(),
        stats: { totalFound: nonOverlappingSecrets.length, processTimeMs: Date.now() - startTime }
    };
}

export function restore(llmPayload: string, state: AirlockState): string {
    return InboundGrafter.restore(llmPayload, state);
}



/**
 * Facade adapter:
 * Bridges dual-track redaction pipeline with CLI invocation contracts,
 * converting hierarchical state tokens to flat tokenMap.
 */
export class HybridRedactor {
    public async redact(content: string, lang?: string, wasmDir?: string) {
        const result = await redact(content, { lang, wasmBaseDir: wasmDir });
        const tokenMap: Record<string, string> = {};

        // Flatten hierarchical token dictionary to { [tokenId]: originalValue } for lockfile store
        if (result.state && result.state.tokens) {
            for (const [tokenId, token] of Object.entries(result.state.tokens)) {
                tokenMap[tokenId] = (token as any).originalValue;
            }
        }

        return {
            sanitized: result.safePayload,
            tokenMap,
            stats: result.stats,
            state: result.state
        };
    }

    public restore(content: string, tokenMap: Record<string, string>): string {
        return InboundGrafter.restore(content, tokenMap);
    }
}