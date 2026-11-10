import assert from 'node:assert';
import { SlidingWindowStreamGrafter } from '../src/lib/proxy/stream-grafter.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- [TEST SUITE] Phase 0 Free CLI Upgrade Verification ---');

// Test 1: SlidingWindowStreamGrafter unit tests
console.log('\n[1] Testing SlidingWindowStreamGrafter...');
{
    const grafter = new SlidingWindowStreamGrafter();
    const tokenMap: Record<string, string> = {
        '__SE_AWS_8A4F9C__': 'AKIAIOSFODNN7EXAMPLE',
        '__SE_KMS_112233__': 'arn:aws:kms:us-east-1:123456789012:key/test'
    };
    const restoreFn = (t: string) => {
        let res = t;
        for (const [k, v] of Object.entries(tokenMap)) {
            res = res.replaceAll(k, v);
        }
        return res;
    };

    // Subtest 1.1: Plain text without tokens
    const chunk1 = 'const port = 8080;\n';
    const out1 = grafter.processChunk(chunk1, restoreFn);
    assert.strictEqual(out1, chunk1, 'Plain text should pass through with zero latency');

    // Subtest 1.2: Complete token in single chunk
    const chunk2 = 'const key = "__SE_AWS_8A4F9C__";\n';
    const out2 = grafter.processChunk(chunk2, restoreFn);
    assert.strictEqual(out2, 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'Complete token should restore immediately');

    // Subtest 1.3: Token split across 2 chunks
    const chunk3a = 'const kms = "__SE_KMS_';
    const out3a = grafter.processChunk(chunk3a, restoreFn);
    assert.strictEqual(out3a, 'const kms = "', 'Partial token prefix should be latched in buffer');

    const chunk3b = '112233__"; // done\n';
    const out3b = grafter.processChunk(chunk3b, restoreFn);
    assert.strictEqual(out3b, 'arn:aws:kms:us-east-1:123456789012:key/test"; // done\n', 'Split token should complete and restore on next chunk');

    // Subtest 1.4: Prefix '_' split
    const chunk4a = 'value: _';
    const out4a = grafter.processChunk(chunk4a, restoreFn);
    assert.strictEqual(out4a, 'value: ', 'Trailing underscore prefix should be held');

    const chunk4b = '_SE_AWS_8A4F9C__ is used';
    const out4b = grafter.processChunk(chunk4b, restoreFn);
    assert.strictEqual(out4b, 'AKIAIOSFODNN7EXAMPLE is used', 'Completed after prefix should restore');

    // Subtest 1.5: Flush on [DONE] with unclosed token
    const chunk5 = 'key is: __SE_AWS_unclosed';
    const out5 = grafter.processChunk(chunk5, restoreFn);
    assert.strictEqual(out5, 'key is: ', 'Prefix before unclosed token flushed');
    const flushed = grafter.flush(restoreFn);
    assert.strictEqual(flushed, '__SE_AWS_unclosed', 'Flushed remainder should match unclosed token');

    console.log('✓ SlidingWindowStreamGrafter passed all stream scenarios!');
}

// Test 2: stackengine policy export --format csv (Strict UNIX stream isolation)
console.log('\n[2] Testing stackengine policy export --format csv stream isolation...');
{
    // Subtest 2.1: Default mode exports 10-column SOC2 compliance audit log preview
    const { spawnSync } = await import('node:child_process');
    const res = spawnSync('node', ['./dist/cli.js', 'policy', 'export', '--format', 'csv'], {
        encoding: 'utf-8'
    });
    const stdout = res.stdout;
    const stderr = res.stderr;
    const lines = stdout.trim().split('\n');

    assert.ok(lines.length >= 2, `CSV should contain header + at least 1 preview record, got ${lines.length} lines`);
    assert.ok(lines[0].startsWith('"Timestamp (UTC)","Event","Target"'), 'Line 1 of stdout MUST be the SOC2 audit log CSV header');
    assert.ok(lines[0].includes('Actor (Git Identity)'), 'Header must contain Actor column');
    assert.ok(lines[0].includes('Tamper-Proof Prev Hash'), 'Header must contain Tamper-Proof Prev Hash column');
    assert.ok(stdout.includes('[TEAM_LICENSE_REQUIRED]'), 'Data row must lock compliance columns with [TEAM_LICENSE_REQUIRED]');
    assert.ok(!stdout.includes('[!]'), 'Stdout MUST NOT contain any [!] warnings (must go to stderr)');
    assert.ok(!stdout.includes('https://stackengine.dev'), 'Stdout MUST NOT contain pricing links');

    assert.ok(stderr.includes('SOC2 COMPLIANCE EXPORT PREVIEW'), 'Stderr MUST display SOC2 preview banner');
    assert.ok(stderr.includes('Community Edition is capped at a 50-event rolling debug log'), 'Stderr must explain 50-event cap');
    assert.ok(stderr.includes('https://stackengine.dev/#pricing'), 'Stderr must contain trial upgrade link');
    console.log(`✓ Default policy export verified as pure CSV audit log preview (${lines.length} rows, 10 columns, [TEAM_LICENSE_REQUIRED] locked)`);

    // Subtest 2.2: --controls flag exports baseline controls rule matrix
    const resControls = spawnSync('node', ['./dist/cli.js', 'policy', 'export', '--format', 'csv', '--controls'], {
        encoding: 'utf-8'
    });
    const stdoutControls = resControls.stdout;
    const linesControls = stdoutControls.trim().split('\n');
    assert.ok(linesControls.length >= 13, `Controls CSV should contain header + 12 baseline rules, got ${linesControls.length} lines`);
    assert.ok(linesControls[0].startsWith('"Rule ID","Category"'), 'Controls CSV line 1 must be Rule ID header');
    assert.ok(stdoutControls.includes('SE-AWS-001'), 'Must contain SE-AWS-001 rule');
    assert.ok(stdoutControls.includes('SE-IAM-001'), 'Must contain SE-IAM-001 rule');
    assert.ok(!stdoutControls.includes('[!]'), 'Controls stdout must have zero [!] warnings');
    console.log(`✓ Policy export --controls verified (${linesControls.length} CSV rows, zero stdout pollution)`);

    // Subtest 2.3: Spacing & truncation check with custom rules
    const testRulesPath = path.join(process.cwd(), '.stackengine', 'rules.json');
    fs.writeFileSync(testRulesPath, JSON.stringify(['r_one', 'r_two', 'r_three', 'r_four', 'r_five']));
    try {
        const resRules = spawnSync('node', ['./dist/cli.js', 'policy', 'export', '--format', 'csv'], {
            encoding: 'utf-8',
            env: { ...process.env, STACKENGINE_LICENSE_KEY: 'test_team_license_key_12345' }
        });
        assert.ok(resRules.stderr.includes('Loaded 5 custom redaction rule(s):') && resRules.stderr.includes('r_one, r_two, r_three, ... (+2 more)') && resRules.stderr.endsWith('\n\n'), 'Loaded rules must show first 3, truncate with (+2 more), and end with empty line');
        console.log('✓ Custom rules display truncation and empty-line spacing verified');
    } finally {
        if (fs.existsSync(testRulesPath)) fs.unlinkSync(testRulesPath);
    }
}

// Test 3: stackengine fix command & preview
console.log('\n[3] Testing stackengine fix command & preview...');
{
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
        stdout = execSync('node ./dist/cli.js fix non-existent.tf 2>&1', { encoding: 'utf-8' });
    } catch (e: any) {
        exitCode = e.status;
        stdout = e.stdout || e.message;
    }
    assert.strictEqual(exitCode, 1, 'fix must exit with code 1 in Community edition');
    assert.ok(stdout.includes('Team License required for Autonomous PR Generation'), 'Must prompt for Team License');
    assert.ok(stdout.includes('SOC2 Zero-Plaintext-Egress Cryptographic Attestation'), 'Must mention SOC2 Zero-Plaintext-Egress Cryptographic Attestation');
    assert.ok(stdout.includes('Maker-Checker Status'), 'Must display Maker-Checker Status');
    console.log('✓ stackengine fix stub & SOC2 preview verified');
}

// Test 4: Stdin pipe into stackengine fix
console.log('\n[4] Testing piped input into stackengine fix...');
{
    let exitCode = 0;
    let stdout = '';
    try {
        stdout = execSync('echo \'{"checkov": "fail"}\' | node ./dist/cli.js fix 2>&1', { encoding: 'utf-8' });
    } catch (e: any) {
        exitCode = e.status;
        stdout = e.stdout || e.message;
    }
    assert.strictEqual(exitCode, 1, 'piped fix must exit 1');
    assert.ok(stdout.includes('<stdin>'), 'Must indicate target is <stdin>');
    assert.ok(stdout.includes('Team License required'), 'Must require Team License');
    console.log('✓ Piped stdin into stackengine fix verified');
}

// Test 5: Probe 2 - .stackengine.yaml existence check without license
console.log('\n[5] Testing .stackengine.yaml probe without license...');
{
    const testYamlPath = path.join(process.cwd(), '.stackengine.yaml');
    fs.writeFileSync(testYamlPath, 'customIntentKeys:\n  - "internal_secret_token"\n');
    try {
        const out = execSync('node ./dist/cli.js scan non_existent.txt 2>&1', {
            encoding: 'utf-8',
            env: { ...process.env, STACKENGINE_LICENSE_KEY: '' }
        }).toString();
        assert.ok(out.includes('Found team policy .stackengine.yaml'), 'Must detect .stackengine.yaml');
        assert.ok(out.includes('Set STACKENGINE_LICENSE_KEY to enforce repo-level rules'), 'Must prompt for License key');
    } catch (e: any) {
        const out = e.stdout || e.message;
        assert.ok(out.includes('Found team policy .stackengine.yaml'), 'Must detect .stackengine.yaml');
        assert.ok(out.includes('Set STACKENGINE_LICENSE_KEY to enforce repo-level rules'), 'Must prompt for License key');
    } finally {
        if (fs.existsSync(testYamlPath)) fs.unlinkSync(testYamlPath);
    }
    console.log('✓ .stackengine.yaml probe verified');
}

// Test 6: Probe 1 - Personal rules limit (Max 2 rules)
console.log('\n[6] Testing Probe 1: Max 2 rules in Community Edition...');
{
    const testRulesPath = path.join(process.cwd(), '.stackengine', 'rules.json');
    const prevRulesExist = fs.existsSync(testRulesPath);
    const prevRulesContent = prevRulesExist ? fs.readFileSync(testRulesPath, 'utf-8') : '';

    fs.writeFileSync(testRulesPath, JSON.stringify(['rule1', 'rule2', 'rule3', 'rule4']));
    try {
        let out = '';
        try {
            out = execSync('node ./dist/cli.js scan tsconfig.json 2>&1', {
                encoding: 'utf-8',
                env: { ...process.env, STACKENGINE_LICENSE_KEY: '' }
            }).toString();
        } catch (e: any) {
            out = (e.stdout || e.message).toString();
        }
        assert.ok(out.includes('Community edition loads max 2 custom rules. Ignored 2 extra custom rules.'), 'Must warn about ignored rules with proper plural');
        assert.ok(out.includes('Loaded 2 custom redaction rule(s)') && out.includes('rule1, rule2'), 'Must only load first 2 rules');
    } finally {
        if (prevRulesExist) {
            fs.writeFileSync(testRulesPath, prevRulesContent);
        } else if (fs.existsSync(testRulesPath)) {
            fs.unlinkSync(testRulesPath);
        }
    }
    console.log('✓ Personal rules 2-limit probe verified');
}

// Test 7: CLI version
console.log('\n[7] Testing CLI version flag...');
{
    const out = execSync('node ./dist/cli.js -v', { encoding: 'utf-8' });
    assert.ok(out.includes('stackengine v1.0.7'), `Expected v1.0.7, got ${out.trim()}`);
    console.log('✓ CLI version verified as 1.0.7');
}

// Test 8: Consolidated warning when both team policy & personal rules > 2 exist
console.log('\n[8] Testing consolidated warning (team policy + personal limit)...');
{
    const testYamlPath = path.join(process.cwd(), '.stackengine.yaml');
    const testRulesPath = path.join(process.cwd(), '.stackengine', 'rules.json');
    const prevRulesExist = fs.existsSync(testRulesPath);
    const prevRulesContent = prevRulesExist ? fs.readFileSync(testRulesPath, 'utf-8') : '';

    fs.writeFileSync(testYamlPath, 'customIntentKeys:\n  - "team_key"\n');
    fs.writeFileSync(testRulesPath, JSON.stringify(['r1', 'r2', 'r3']));

    try {
        let out = '';
        try {
            out = execSync('node ./dist/cli.js scan tsconfig.json 2>&1', {
                encoding: 'utf-8',
                env: { ...process.env, STACKENGINE_LICENSE_KEY: '' }
            }).toString();
        } catch (e: any) {
            out = (e.stdout || e.message).toString();
        }
        assert.ok(out.includes('Community Edition Limit: Ignored .stackengine.yaml team policy & 1 extra custom rule (max 2 loaded).'), 'Must display consolidated warning');
        // Count pricing URLs: should only appear once
        const matches = out.match(/https:\/\/stackengine\.dev\/#pricing/g);
        assert.strictEqual(matches ? matches.length : 0, 1, 'Pricing URL must appear exactly once, no double ads');
        console.log('✓ Consolidated single-banner governance warning verified');
    } finally {
        if (fs.existsSync(testYamlPath)) fs.unlinkSync(testYamlPath);
        if (prevRulesExist) {
            fs.writeFileSync(testRulesPath, prevRulesContent);
        } else if (fs.existsSync(testRulesPath)) {
            fs.unlinkSync(testRulesPath);
        }
    }
}

// Test 9: Quiet pre-commit scan (--hook flag with clean files)
console.log('\n[9] Testing quiet pre-commit scan with --hook...');
{
    const out = execSync('node ./dist/cli.js scan --hook tsconfig.json', {
        encoding: 'utf-8',
        env: { ...process.env, STACKENGINE_LICENSE_KEY: '' }
    }).toString().trim();
    assert.ok(out.includes('✓') && out.includes('StackEngine pre-commit scan passed in'), 'Must contain clean scan pass indicator');
    assert.ok(!out.includes('[!]'), 'Must NOT contain any [!] warnings on clean commit');
    assert.ok(!out.includes('⚠'), 'Must NOT contain any ⚠ committer banners on clean commit');
    assert.ok(!out.includes('https://stackengine.dev'), 'Must NOT contain any pricing links on clean commit');
    console.log(`✓ Quiet pre-commit scan verified: "${out}"`);
}

// Test 10: stackengine fix Available Paths
console.log('\n[10] Testing stackengine fix available paths...');
{
    let stdout = '';
    try {
        stdout = execSync('node ./dist/cli.js fix test.yaml 2>&1', { encoding: 'utf-8' });
    } catch (e: any) {
        stdout = (e.stdout || e.message).toString();
    }
    assert.ok(stdout.includes('Free Clipboard Loop'), 'Must include Free Clipboard Loop');
    assert.ok(stdout.includes('Free Local IDE Proxy'), 'Must include Free Local IDE Proxy');
    assert.ok(stdout.includes('14-Day Team Trial'), 'Must include 14-Day Team Trial');
    assert.ok(!stdout.includes('stackengine redact test.yaml.redacted'), 'Must NOT have circular redact recommendation');
    console.log('✓ stackengine fix available paths verified');
}

// Test 11: Rolling 50-Event Cap on audit.jsonl (newest first, anti-jq white-label exploit mitigation)
console.log('\n[11] Testing Rolling 50-Event Cap & newest-first ordering on audit.jsonl...');
{
    const auditJsonlPath = path.join(process.cwd(), '.stackengine', 'audit.jsonl');
    const tmpInput = path.join(process.cwd(), '.stackengine', 'tmp_test_cap.yaml');
    const tmpOut = path.join(process.cwd(), '.stackengine', 'tmp_test_cap.out.yaml');

    fs.writeFileSync(tmpInput, 'api_key: "AKIAIOSFODNN7EXAMPLE"\n');

    try {
        // Run 65 redaction operations in sequence
        for (let i = 0; i < 65; i++) {
            execSync(`node ./dist/cli.js redact ${tmpInput} -o ${tmpOut}`, {
                encoding: 'utf-8',
                env: { ...process.env, STACKENGINE_LICENSE_KEY: '' },
                stdio: ['ignore', 'ignore', 'ignore']
            });
        }

        // Verify audit.jsonl
        assert.ok(fs.existsSync(auditJsonlPath), '.stackengine/audit.jsonl must exist');
        const jsonlLines = fs.readFileSync(auditJsonlPath, 'utf-8').trim().split('\n').filter(Boolean);
        assert.strictEqual(jsonlLines.length, 50, `audit.jsonl must be strictly capped at 50 events, got ${jsonlLines.length}`);

        // Verify newest record is on top (Line 1 timestamp >= Line 50 timestamp)
        const firstEntry = JSON.parse(jsonlLines[0]);
        const lastEntry = JSON.parse(jsonlLines[49]);
        assert.ok(new Date(firstEntry.timestamp).getTime() >= new Date(lastEntry.timestamp).getTime(), 'Newest record must be on Line 1 (top of file)');

        // Verify absence of enterprise compliance fields in free records
        for (const line of jsonlLines) {
            const parsed = JSON.parse(line);
            assert.strictEqual(parsed.actor, undefined, 'Free records MUST NOT contain actor');
            assert.strictEqual(parsed.rules_fired, undefined, 'Free records MUST NOT contain rules_fired');
            assert.strictEqual(parsed.payload_sha256, undefined, 'Free records MUST NOT contain payload_sha256');
            assert.strictEqual(parsed.prev_hash, undefined, 'Free records MUST NOT contain prev_hash');
        }

        console.log(`✓ Rolling 50-event cap verified (strictly 50 lines, newest first, 0 enterprise fields leaked)`);
    } finally {
        if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
}

console.log('\nALL PHASE 0 VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀');
