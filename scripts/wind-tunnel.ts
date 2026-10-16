/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// scripts/wind-tunnel.ts
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { redact, restore } from '../src/lib/stackengine/index';

// Path resolution (zero import.meta dependency, dual CJS/ESM compatibility)
const PROJECT_ROOT = process.cwd();
const TEST_DIR = path.resolve(PROJECT_ROOT, 'scripts', 'test');
const ANSWERS_FILE = path.resolve(PROJECT_ROOT, 'scripts', 'answers.json');
const LOG_FILE = path.resolve(PROJECT_ROOT, 'scripts', 'wind-tunnel.log');
const LOG_BAK_FILE = path.resolve(PROJECT_ROOT, 'scripts', 'wind-tunnel.log.bak');

interface GroundTruthItem {
    name: string;
    count: number;
    secrets: string[];
}

type GroundTruthDB = Record<string, GroundTruthItem>;

// Normalizes CRLF line breaks and boundary whitespace
function normalize(str: string): string {
    return (str || '').replace(/\r\n/g, '\n').trim();
}

// Discriminator: Detects PEM-encoded private key envelopes
function isPemKey(str: string): boolean {
    return str.includes('BEGIN') && str.includes('PRIVATE KEY');
}

// Extracts normalized Base64 prefix (first 32 chars) from PEM blocks,
// neutralizing formatting artifacts, escaped newlines, indentation, and truncation.
function normalizePem(pem: string): string {
    // Unescape literal newlines to prevent character contamination in Base64 payload
    const unescaped = pem.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\\M/g, '\nM');
    // Extract base Base64/Hex payload bounded by BEGIN/END headers
    const cleanChars = unescaped
        .replace(/-----BEGIN[A-Z0-9_\- ]+-----/g, '')
        .replace(/-----END[A-Z0-9_\- ]+-----/g, '')
        .replace(/[^a-zA-Z0-9+/=]/g, '');

    return cleanChars.slice(0, 32);
}


// Extracts credential payload from authority component in standard URI formats
function extractPasswordFromUri(uri: string): string | null {
    const protocolIdx = uri.indexOf('://');
    if (protocolIdx === -1) return null;
    const pathIdx = uri.indexOf('/', protocolIdx + 3);
    const authority = uri.substring(protocolIdx + 3, pathIdx > -1 ? pathIdx : uri.length);
    const lastAtIdx = authority.lastIndexOf('@');
    if (lastAtIdx === -1) return null;
    const auth = authority.substring(0, lastAtIdx);
    const colonIdx = auth.indexOf(':');
    return colonIdx > -1 ? auth.substring(colonIdx + 1) : null;
}

/**
 * Evaluates semantic equivalence between actual redacted value and expected secret,
 * resolving discrepancies caused by URI embedding or PEM envelope formatting.
 */
function isSecretEquivalent(actual: string, expected: string): boolean {
    const normAct = normalize(actual);
    const normExp = normalize(expected);

    // 1. Exact string match
    if (normAct === normExp) return true;

    // 2. PEM key equivalence: Verifies match if both values represent private key payloads
    if (isPemKey(normAct) && isPemKey(normExp)) {
        // Strict PEM payload prefix comparison
        if (normalizePem(normAct) === normalizePem(normExp)) {
            return true;
        }
        // Fallback matching: Accommodates truncated or concatenated PEM block ground-truth data
        const actClean = normAct.replace(/[^a-zA-Z0-9+/=]/g, '');
        const expClean = normExp.replace(/[^a-zA-Z0-9+/=]/g, '');
        if (actClean.slice(0, 16) === expClean.slice(0, 16) || expClean.includes(actClean.slice(0, 16))) {
            return true;
        }
    }
    // 3. URI authority credential dissection equivalence (full URI vs extracted credential)
    const expPass = extractPasswordFromUri(normExp);
    if (expPass && normAct === expPass) {
        return true;
    }
    const actPass = extractPasswordFromUri(normAct);
    if (actPass && normExp === actPass) {
        return true;
    }

    return false;
}

class WindTunnelLogger {
    private logPath: string;
    private memoryBuffer: string[] = []; // In-memory log buffer to batch disk writes until completion

    constructor(logPath: string) {
        this.logPath = logPath;
    }

    public log(msg: string, echoConsole: boolean = true) {
        this.memoryBuffer.push(msg);
        if (echoConsole) {
            console.log(msg);
        }
    }

    public flush() {
        // Synchronously writes buffered logs to disk on test completion
        fs.writeFileSync(this.logPath, this.memoryBuffer.join('\n') + '\n', { encoding: 'utf8' });
    }

    public close() {
        this.flush();
    }
}

async function runStackEngineWindTunnel() {
    console.log('🌪️  ========================================================');
    console.log('🌪️  STACKENGINE: AUTOMATED REGRESSION WIND TUNNEL (v4)');
    console.log('🌪️  ========================================================\n');

    // 1. Log file rotation
    if (fs.existsSync(LOG_FILE)) {
        if (fs.existsSync(LOG_BAK_FILE)) {
            fs.unlinkSync(LOG_BAK_FILE);
        }
        fs.renameSync(LOG_FILE, LOG_BAK_FILE);
        console.log(`📦 Archived historical log -> wind-tunnel.log.bak`);
    }

    const logger = new WindTunnelLogger(LOG_FILE);
    logger.log(`[STACKENGINE WIND TUNNEL] Session Started at ${new Date().toISOString()}`, false);
    logger.log(`------------------------------------------------------------\n`, false);

    // 2. Loads ground-truth answer database
    if (!fs.existsSync(ANSWERS_FILE)) {
        logger.log(`❌ [CRITICAL] Ground-truth database not found: ${ANSWERS_FILE}`);
        logger.close();
        process.exit(1);
    }

    let answersDB: GroundTruthDB = {};
    try {
        answersDB = JSON.parse(fs.readFileSync(ANSWERS_FILE, 'utf8'));
    } catch (e) {
        logger.log(`❌ [CRITICAL] Failed to parse answers.json: ${e}`);
        logger.close();
        process.exit(1);
    }

    // 3. Resolves target dataset (CLI file arguments or comprehensive suite)
    const cliArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
    const isVerbose = process.argv.includes('--verbose');

    let targetFilenames: string[] = [];
    if (cliArgs.length > 0) {
        targetFilenames = cliArgs.map(arg => path.basename(arg));
    } else {
        targetFilenames = Object.keys(answersDB);
    }

    const totalTargets = targetFilenames.length;
    console.log(`Scanning wind-tunnel test suite: ${totalTargets} target file(s) scheduled for evaluation...\n`);

    // 4. Performance and accuracy test metrics
    let passedFiles = 0;
    let failedFiles = 0;
    let totalRedactedTokens = 0;
    let totalExpectedTokens = 0;
    let totalProcessTimeMs = 0;

    const failureDetails: Array<{
        file: string;
        reasons: string[];
        overRedacted: string[];
        underRedacted: string[];
        restoreError: boolean;
    }> = [];

    // 5. Executes regression test matrix
    for (let i = 0; i < totalTargets; i++) {
        const filename = targetFilenames[i];
        const filePath = path.resolve(TEST_DIR, filename);

        if (!fs.existsSync(filePath)) {
            logger.log(`⚠️  [SKIP] Target file not found: ${filename} (in test/)`);
            continue;
        }

        const truth = answersDB[filename];
        if (!truth) {
            logger.log(`⚠️  [SKIP] Ground-truth answers not found in answers.json: ${filename}`);
            continue;
        }

        const rawCode = fs.readFileSync(filePath, 'utf8');

        // Decomposes concatenated AKIA:SECRET pairs to preserve 1:1 atomicity
        const rawExpected = truth.secrets.map(normalize);
        const expectedSecrets: string[] = [];
        for (const exp of rawExpected) {
            const compMatch = exp.match(/^(AKIA[0-9A-Z]{16,}):\s*([a-zA-Z0-9/+=]{40})$/);
            if (compMatch) {
                expectedSecrets.push(compMatch[1]);
                expectedSecrets.push(compMatch[2]);
            } else {
                expectedSecrets.push(exp);
            }
        }
        totalExpectedTokens += expectedSecrets.length;

        // Executes outbound redaction pipeline
        const t0 = performance.now();
        const result = await redact(rawCode);
        const t1 = performance.now();

        const duration = t1 - t0;
        totalProcessTimeMs += duration;

        // Extracts plaintext secret values from vault state
        const actualTokens = Object.values(result.state.tokens);
        const actualSecrets = actualTokens.map(t => normalize(t.originalValue));
        totalRedactedTokens += actualSecrets.length;

        // Greedy 1-to-1 secret matching
        const matchedExpectedIndices = new Set<number>();
        const matchedActualIndices = new Set<number>();

        for (let a = 0; a < actualSecrets.length; a++) {
            for (let e = 0; e < expectedSecrets.length; e++) {
                if (!matchedExpectedIndices.has(e) && !matchedActualIndices.has(a)) {
                    if (isSecretEquivalent(actualSecrets[a], expectedSecrets[e])) {
                        matchedActualIndices.add(a);
                        matchedExpectedIndices.add(e);
                        break;
                    }
                }
            }
        }

        // Under-redaction: Expected secrets missing from actual captures (leaks)
        const underRedacted = expectedSecrets.filter((_, idx) => !matchedExpectedIndices.has(idx));
        // Over-redaction: Captured values not present in expected set (false positives)
        const overRedacted = actualSecrets.filter((_, idx) => !matchedActualIndices.has(idx));
        // Token count parity validation
        const countMismatch = underRedacted.length > 0 || overRedacted.length > 0;

        // Byte-level lossless inbound restoration verification
        const restored = restore(result.safePayload, result.state);
        const restoreError = restored !== rawCode;

        const isSuccess = !restoreError && underRedacted.length === 0 && overRedacted.length === 0 && !countMismatch;

        // Appends test log entry
        logger.log(`[FILE] ${filename}`, false);
        logger.log(`       Speed: ${duration.toFixed(2)} ms | Expected: ${expectedSecrets.length} | Actual: ${actualSecrets.length}`, false);

        if (isSuccess) {
            passedFiles++;
            if (isVerbose) {
                console.log(`✅ [${i + 1}/${totalTargets}] ${filename} (100% matched, ${duration.toFixed(1)}ms)`);
            } else {
                process.stdout.write(`.`);
            }
            logger.log(`       Status: PASSED\n`, false);
        } else {
            failedFiles++;
            const reasons: string[] = [];
            if (underRedacted.length > 0) reasons.push(`Leaks (under-redacted): ${underRedacted.length}`);
            if (overRedacted.length > 0) reasons.push(`False Positives (over-redacted): ${overRedacted.length}`);
            if (countMismatch) reasons.push(`Token count mismatch (expected ${expectedSecrets.length}, actual ${actualSecrets.length})`);
            if (restoreError) reasons.push(`Lossless inbound byte restoration mismatch`);

            failureDetails.push({
                file: filename,
                reasons,
                overRedacted,
                underRedacted,
                restoreError
            });

            logger.log(`       Status: FAILED (${reasons.join('; ')})`, false);
            if (underRedacted.length > 0) {
                logger.log(`       -> Under-redacted secrets: ${JSON.stringify(underRedacted)}`, false);
            }
            if (overRedacted.length > 0) {
                logger.log(`       -> Over-redacted artifacts: ${JSON.stringify(overRedacted)}`, false);
            }
            logger.log('', false);

            if (!isVerbose) {
                process.stdout.write(`F`);
            } else {
                console.log(`\n❌ [${i + 1}/${totalTargets}] ${filename} -> ${reasons.join(', ')}`);
            }
        }
    }

    if (!isVerbose) {
        console.log('\n');
    }

    // 6. Generates regression wind-tunnel audit report
    const avgLatencyMs = totalTargets > 0 ? (totalProcessTimeMs / totalTargets).toFixed(2) : '0';
    const accuracyRate = totalTargets > 0 ? ((passedFiles / totalTargets) * 100).toFixed(2) : '0';

    const summaryReport = `
============================================================
STACKENGINE WIND TUNNEL TEST REPORT
============================================================
   🎯 Total Targets        : ${totalTargets} file(s)
   Total Duration          : ${totalProcessTimeMs.toFixed(2)} ms (avg ${avgLatencyMs} ms/file)
   🔑 Expected Secrets     : ${totalExpectedTokens}
   Redacted Tokens         : ${totalRedactedTokens}
   ✅ PASSED                : ${passedFiles} (${accuracyRate}%)
   ❌ FAILED                : ${failedFiles}
============================================================
`;
    logger.log(summaryReport);

    // Prints diagnostics for the top 5 failure cases to stdout
    if (failedFiles > 0) {
        console.log(`🚨 Target Diagnosis Summary (top 5 failure cases):`);
        failureDetails.slice(0, 5).forEach((f, idx) => {
            console.log(`\n[${idx + 1}] Target: ${f.file}`);
            f.reasons.forEach(r => console.log(`    ❌ ${r}`));
            if (f.underRedacted.length > 0) {
                console.log(`    👉 Under-redacted plaintext secrets:`);
                f.underRedacted.forEach(s => console.log(`       └─ "${s.length > 60 ? s.slice(0, 57) + '...' : s}"`));
            }
            if (f.overRedacted.length > 0) {
                console.log(`    👉 Over-redacted false positive artifacts:`);
                f.overRedacted.forEach(s => console.log(`       └─ "${s.length > 60 ? s.slice(0, 57) + '...' : s}"`));
            }
        });

        console.log(`\n📄 Complete test log persisted to:`);
        console.log(`   👉 ${LOG_FILE}`);
        console.log(`   👉 (Archived backup: ${LOG_BAK_FILE})`);
    } else {
        console.log(`All targets passed: token count parity, secret matches, and exact byte restoration verified.`);
    }

    logger.close();

    // Non-zero exit code on regression failure to block CI/CD pipeline
    if (failedFiles > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runStackEngineWindTunnel().catch(err => {
    console.error('💥 Wind tunnel execution failed:', err);
    process.exit(1);
});