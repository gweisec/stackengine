#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { HybridRedactor } from './lib/stackengine/index.js';
import { Tier3Oracle } from './lib/stackengine/pipeline-outbound/tier3-oracle.js';
import { TransparentProxyServer } from './lib/proxy/server.js';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];
const VERSION = '1.0.6';

const c = {
    bold: (s: string | number) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string | number) => `\x1b[90m${s}\x1b[0m`,
    cyan: (s: string | number) => `\x1b[36m${s}\x1b[0m`,
    green: (s: string | number) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string | number) => `\x1b[33m${s}\x1b[0m`,
    red: (s: string | number) => `\x1b[31m${s}\x1b[0m`,
    blue: (s: string | number) => `\x1b[34m${s}\x1b[0m`,
};

const glyph = {
    success: c.green('✓'),
    warning: c.yellow('⚠'),
    bullet: c.dim('·'),
    header: '\x1b[1;34m◆\x1b[0m',
    action: c.cyan('▶'),
    error: c.red('×'),
    treeBranch: c.dim('├─'),
    treeLast: c.dim('└─'),
    barCyan: c.cyan('│'),
    barDim: c.dim('│')
};

const ui = {
    header(title: string): void {
        console.log(`\n${glyph.header} ${c.bold(title)}\n`);
    },
    success(message: string): void {
        console.log(`${glyph.success} ${message}`);
    },
    warn(message: string): void {
        console.log(`${glyph.warning}  ${message}`);
    },
    action(message: string): void {
        console.log(`${glyph.action} ${message}`);
    },
    info(message: string): void {
        console.log(`${glyph.bullet} ${message}`);
    },
    error(message: string): void {
        console.error(`${glyph.error} ${message}`);
    },
    kv(key: string, value: string | number, pad = 16): string {
        return `  ${c.dim(key.padEnd(pad, ' '))} : ${value}`;
    },
    logKv(key: string, value: string | number, pad = 16): void {
        console.log(this.kv(key, value, pad));
    },
    quote(text: string, color: 'cyan' | 'dim' = 'cyan'): string {
        const bar = color === 'cyan' ? glyph.barCyan : glyph.barDim;
        return text
            .trim()
            .split('\n')
            .map(line => `  ${bar} ${line}`)
            .join('\n');
    },
    treeSecret(type: string, masked: string, isLast: boolean, pad = 20, token?: string): void {
        const branch = isLast ? glyph.treeLast : glyph.treeBranch;
        const arrowPart = token ? ` ${c.dim('→')} ${c.cyan(token)}` : '';
        console.log(`  ${branch} ${c.dim(type.padEnd(pad, ' '))} : ${c.yellow(masked.padEnd(8, ' '))}${arrowPart}`);
    },
    treeSecretRed(type: string, masked: string, isLast: boolean, pad = 20, token?: string): void {
        const branch = isLast ? glyph.treeLast : glyph.treeBranch;
        const arrowPart = token ? ` ${c.dim('→')} ${c.cyan(token)}` : '';
        console.log(`  ${branch} ${c.dim(type.padEnd(pad, ' '))} : ${c.red(masked.padEnd(8, ' '))}${arrowPart}`);
    }
};

const HELP_TEXT = `
    \x1b[38;5;51m██╗    \x1b[0m  \x1b[90m███████╗████████╗ █████╗  ██████╗██╗  ██╗\x1b[0m    \x1b[38;5;51m███████╗\x1b[0m
    \x1b[38;5;45m╚██╗   \x1b[0m  \x1b[90m██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝\x1b[0m    \x1b[38;5;45m██╔════╝\x1b[0m
    \x1b[38;5;39m ╚██╗  \x1b[0m  \x1b[90m███████╗   ██║   ███████║██║     █████╔╝ \x1b[0m    \x1b[38;5;39m█████╗  \x1b[0m
    \x1b[38;5;33m ██╔╝  \x1b[0m  \x1b[90m╚════██║   ██║   ██╔══██║██║     ██╔═██╗ \x1b[0m    \x1b[38;5;33m██╔══╝  \x1b[0m
    \x1b[38;5;27m██╔╝   \x1b[0m  \x1b[90m███████║   ██║   ██║  ██║╚██████╗██║  ██╗\x1b[0m    \x1b[38;5;27m███████╗\x1b[0m
    \x1b[38;5;21m╚═╝    \x1b[0m  \x1b[90m╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝\x1b[0m    \x1b[38;5;21m╚══════╝\x1b[0m

  \x1b[1mStackEngine CLI (v${VERSION})\x1b[0m \x1b[90m— Zero-Trust Remediation Engine for Cloud-Native Ops. BSL 1.1 Licensed.\x1b[0m

  \x1b[1mUSAGE\x1b[0m
    stackengine <command> [input-file] [options]

  \x1b[1mCOMMANDS\x1b[0m
    init       Initialize .stackengine workspace, config templates, and gitignore
    redact     Strip high-entropy credentials from configurations via local tokenization
    restore    Re-inject credentials into modified payload and purge local token map
    scan       Scan target file for credentials without modifying (exits 1 if found)
    fix        Autonomous local debugging: synthesize patch diff for review (Team license required)
    copy       Read from clipboard, redact, and write redacted code + prompt back to clipboard
    paste      Read redacted LLM response from clipboard, restore secrets to clipboard/file
    init-hook  Install Git pre-commit hook to block commits containing detected credentials
    clear      Manually delete active vault lockfile without restoring
    proxy      Start local HTTP proxy server for LLM requests (-d to run as daemon)
    stop       Stop background proxy daemon
    upgrade    Display upgrade instructions across Homebrew, npm, Docker, and binary

  \x1b[1mOPTIONS\x1b[0m
    -o, --out <file>      Destination path for output
    -i, --in-place        Directly overwrite input file with result
    -m, --map <file>      Explicit vault lockfile path (default: ./.stackengine/vault.lock)
    -v, --version         Display version number
    -h, --help            Display this manual

  \x1b[1mPROMPT DIRECTIVE\x1b[0m \x1b[90m(Append to LLM query):\x1b[0m
    \x1b[36m│\x1b[0m CRITICAL RULE: You MUST output the exact tokens (e.g. __SE_...__) completely unchanged.
    \x1b[36m│\x1b[0m Do not truncate, omit, or modify them.

  \x1b[1mWORKFLOWS\x1b[0m
    \x1b[1mClipboard Workflow\x1b[0m \x1b[90m(Web AI Chat / Zero File Overhead)\x1b[0m
      1. Copy sensitive code to clipboard (Cmd/Ctrl+C)
      2. stackengine copy                      \x1b[90m# Redacts code & injects prompt directive\x1b[0m
      3. Paste into AI chat, then copy AI response
      4. stackengine paste [-o fixed.yaml]     \x1b[90m# Restores secrets to clipboard or file\x1b[0m

    \x1b[1mFile Pipeline Workflow\x1b[0m \x1b[90m(CI/CD & CLI Auditing)\x1b[0m
      1. stackengine redact prod.yaml -o clean.yaml
      2. Submit clean.yaml to LLM (with prompt directive above)
      3. Save LLM solution to fixed_clean.yaml
      4. stackengine restore fixed_clean.yaml -o prod.yaml
`;

if (args.includes('-v') || args.includes('--version') || command === 'version') {
    console.log(`stackengine v${VERSION}`);
    process.exit(0);
}

if (!command || args.includes('-h') || args.includes('--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
}

if (command === 'upgrade' || command === 'update') {
    ui.header(`StackEngine Upgrade (v${VERSION})`);
    console.log(`  ${c.dim('Run the upgrade command matching your installation method:')}\n`);
    ui.logKv('Homebrew', c.cyan('brew update && brew upgrade stackengine'), 14);
    ui.logKv('npm', c.cyan('npm install -g stackengine@latest'), 14);
    ui.logKv('Docker', c.cyan('docker pull stackenginehq/stackengine:latest'), 14);
    ui.logKv('Standalone', c.cyan('curl -fsSL https://raw.githubusercontent.com/gweisec/stackengine/main/install.sh | sh'), 14);
    ui.logKv('GitHub', c.dim('https://github.com/gweisec/stackengine/releases'), 14);
    console.log('');
    process.exit(0);
}

// =================================================================
// Local Workspace State (.stackengine)
// Separation of concerns:
// 1. vault.lock -> Ephemeral disk vault storing token mappings (mode: 0600 on creation, deleted on restore)
// 2. audit.log  -> Local JSON audit log of redaction events (newest entries first)
// =================================================================
const AIRLOCK_DIR = path.join(process.cwd(), '.stackengine');
const VAULT_FILE = path.join(AIRLOCK_DIR, 'vault.lock');
const AUDIT_FILE = path.join(AIRLOCK_DIR, 'audit.log');

function ensureAirlockWorkspace(): void {
    if (!fs.existsSync(AIRLOCK_DIR)) {
        fs.mkdirSync(AIRLOCK_DIR, { recursive: true });
        // Workspace gitignore: prevent ephemeral vault lockfile from being tracked in version control
        fs.writeFileSync(path.join(AIRLOCK_DIR, '.gitignore'), "vault.lock\n*.tmp\n");
    }
}

function writeAuditEntry(entry: Record<string, any>): void {
    ensureAirlockWorkspace();
    const logLine = JSON.stringify(entry) + '\n';
    const existingLogs = fs.existsSync(AUDIT_FILE) ? fs.readFileSync(AUDIT_FILE, 'utf-8') : '';
    fs.writeFileSync(AUDIT_FILE, logLine + existingLogs, { encoding: 'utf-8' });
}

// =================================================================
//  Cross-Platform Clipboard Utilities
// =================================================================
function readClipboard(): string {
    // Deadlock guard: 2000ms execution timeout against blocking IPC in headless environments
    const timeoutOpt = { encoding: 'utf-8' as const, timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] as any };
    try {
        if (process.platform === 'darwin') {
            return execSync('pbpaste', timeoutOpt);
        }

        // WSL2 passthrough: delegate to host Windows clipboard subsystem
        const isWsl = process.platform === 'linux' && (Boolean(process.env.WSL_DISTRO_NAME) || fs.existsSync('/proc/sys/fs/binfmt_misc/WSL'));
        if (process.platform === 'win32' || isWsl) {
            const psCmd = isWsl ? 'powershell.exe' : 'powershell';
            const raw = execSync(`${psCmd} -NoProfile -Command "Get-Clipboard -Raw"`, timeoutOpt);
            return raw ? raw.replace(/\r\n$/, '') : '';
        }

        // Native Linux X11 / Wayland clipboard fallback
        return execSync('which wl-paste >/dev/null 2>&1 && wl-paste || xclip -selection clipboard -o', timeoutOpt);
    } catch (e) {
        console.log('');
        ui.error('Cannot access system clipboard (timeout or no GUI display found)');
        console.error(`  ${c.dim('In Linux/WSL, install \'xclip\'/\'wl-clipboard\' or use file mode: stackengine redact <file>')}\n`);
        process.exit(1);
    }
}

function writeClipboard(text: string): void {
    const timeoutOpt = { input: text, timeout: 2000, stdio: ['pipe', 'ignore', 'ignore'] as any };
    try {
        if (process.platform === 'darwin') {
            execSync('pbcopy', timeoutOpt);
            return;
        }

        const isWsl = process.platform === 'linux' && (Boolean(process.env.WSL_DISTRO_NAME) || fs.existsSync('/proc/sys/fs/binfmt_misc/WSL'));
        if (process.platform === 'win32' || isWsl) {
            const clipCmd = isWsl ? 'clip.exe' : 'clip';
            execSync(clipCmd, timeoutOpt);
            return;
        }

        execSync('which wl-copy >/dev/null 2>&1 && wl-copy || xclip -selection clipboard', timeoutOpt);
    } catch (e) {
        ui.warn('Failed to write back to clipboard.');
    }
}

async function run() {

    // Ingest custom redaction rules from configuration manifests (precedence: cwd -> target file directory)
    const targetFile = args[1] && !args[1].startsWith('-') ? args[1] : '';
    const searchDirs = [process.cwd()];
    if (targetFile && fs.existsSync(targetFile)) searchDirs.push(path.dirname(path.resolve(targetFile)));

    const candidateFiles = ['.stackengine/config.yaml', '.stackengine/config.yml', '.stackengine.yaml', '.stackengine.yml', 'stackengine.yaml', 'stackengine.yml'];
    let loadedCustomKeys: string[] = [];

    for (const dir of searchDirs) {
        for (const file of candidateFiles) {
            const fullPath = path.join(dir, file);
            if (fs.existsSync(fullPath)) {
                try {
                    const rawYaml = fs.readFileSync(fullPath, 'utf-8');
                    const matches = rawYaml.match(/(?:^|\n)\s*-\s*["']?([A-Za-z0-9_.-]+)["']?/g);
                    if (matches) {
                        loadedCustomKeys = matches.map(m => m.replace(/[\r\n\s-]+/g, '').replace(/["']/g, '').trim());
                        break;
                    }
                } catch (e) { }
            }
        }
        if (loadedCustomKeys.length > 0) break;
    }

    if (loadedCustomKeys.length > 0) {
        Tier3Oracle.configure({ customIntentKeys: loadedCustomKeys });
        if (command !== 'proxy') {
            ui.info(`Loaded ${loadedCustomKeys.length} custom redaction rule(s): ${c.dim(loadedCustomKeys.join(', '))}`);
        }
    }

    // Terminate proxy daemon: locate PID files or fall back to port termination
    if (command === 'stop') {
        const portIdx = args.indexOf('-p') > -1 ? args.indexOf('-p') : args.indexOf('--port');
        const targetPort = portIdx > -1 ? parseInt(args[portIdx + 1], 10) : 8080;
        let killed = false;

        // 1. Scan local and user-home PID files
        const candidatePidFiles = [
            path.join(process.cwd(), '.stackengine', 'proxy.pid'),
            path.join(os.homedir(), '.stackengine', `proxy-${targetPort}.pid`),
            path.join(os.homedir(), '.stackengine', 'proxy.pid')
        ];

        for (const pidFile of candidatePidFiles) {
            if (fs.existsSync(pidFile)) {
                try {
                    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
                    if (!isNaN(pid) && pid > 0) {
                        try { process.kill(-pid, 'SIGTERM'); killed = true; } catch {
                            try { process.kill(pid, 'SIGTERM'); killed = true; } catch { }
                        }
                    }
                } catch { }
                try { fs.unlinkSync(pidFile); } catch { }
            }
        }

        // 2. Port-level fallback: terminate orphaned listeners bound to target port
        try {
            let pidsOnPort: string[] = [];
            if (process.platform === 'win32') {
                const out = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
                const matches = out.match(/\s+(\d+)\s*$/gm);
                if (matches) pidsOnPort = matches.map(m => m.trim());
            } else {
                const out = execSync(`lsof -ti :${targetPort} 2>/dev/null || fuser ${targetPort}/tcp 2>/dev/null`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
                pidsOnPort = out.trim().split(/\s+/).filter(Boolean);
            }

            for (const p of pidsOnPort) {
                const pidNum = parseInt(p, 10);
                if (!isNaN(pidNum) && pidNum !== process.pid) {
                    try {
                        process.kill(pidNum, 'SIGKILL');
                        killed = true;
                    } catch { }
                }
            }
        } catch { }

        console.log('');
        if (killed) {
            ui.success(`StackEngine proxy on port ${c.bold(targetPort)} terminated`);
        } else {
            ui.info(`No active gateway process found on port ${c.dim(targetPort)}`);
        }
        console.log('');
        process.exit(0);
    }

    // Launch local transparent reverse proxy
    if (command === 'proxy') {
        const portIdx = args.indexOf('-p') > -1 ? args.indexOf('-p') : args.indexOf('--port');
        const upstreamIdx = args.indexOf('-u') > -1 ? args.indexOf('-u') : args.indexOf('--upstream');
        const isDaemon = args.includes('-d') || args.includes('--daemon');
        const envPort = process.env.STACKENGINE_PORT || process.env.PORT;
        const envUpstream = process.env.STACKENGINE_UPSTREAM || process.env.UPSTREAM_URL;
        const port = portIdx > -1 ? parseInt(args[portIdx + 1], 10) : (envPort ? parseInt(envPort, 10) : 8080);
        const upstreamUrl = upstreamIdx > -1 ? args[upstreamIdx + 1] : (envUpstream || 'https://api.openai.com');

        // Detached background daemon mode
        if (isDaemon) {
            const { spawn } = await import('node:child_process');
            const airlockDir = path.join(process.cwd(), '.stackengine');
            const globalDir = path.join(os.homedir(), '.stackengine');
            if (!fs.existsSync(airlockDir)) fs.mkdirSync(airlockDir, { recursive: true });
            if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });

            const outLog = fs.openSync(path.join(airlockDir, 'proxy.log'), 'a');
            const errLog = fs.openSync(path.join(airlockDir, 'proxy.error.log'), 'a');

            const childArgs = process.argv.slice(2).filter(a => a !== '-d' && a !== '--daemon');

            const child = spawn(process.argv[0], [process.argv[1], ...childArgs], {
                detached: true,
                stdio: ['ignore', outLog, errLog]
            });

            child.unref();
            // Persist PID to both local .stackengine directory and user home to prevent working directory drift
            fs.writeFileSync(path.join(airlockDir, 'proxy.pid'), child.pid!.toString());
            fs.writeFileSync(path.join(globalDir, `proxy-${port}.pid`), child.pid!.toString());

            ui.header('StackEngine Gateway Daemonized');
            ui.logKv('Process PID', String(child.pid), 14);
            ui.logKv('Endpoint', c.cyan(`http://127.0.0.1:${port}/v1`), 14);
            ui.logKv('Logs', c.dim('.stackengine/proxy.log'), 14);
            console.log('');
            ui.action(`Run ${c.cyan('stackengine stop')} to terminate the gateway\n`);
            process.exit(0);
        }

        // Foreground execution mode
        const wasmDir = process.env.STACKENGINE_WASM_DIR;

        // Load project-local redaction rules from configuration manifests in current working directory
        const candidateFiles = ['.stackengine/config.yaml', '.stackengine/config.yml', 'stackengine.yaml', 'stackengine.yml', '.stackengine.yaml'];
        for (const file of candidateFiles) {
            const fullPath = path.join(process.cwd(), file);
            if (fs.existsSync(fullPath)) {
                try {
                    const rawYaml = fs.readFileSync(fullPath, 'utf-8');
                    const matches = rawYaml.match(/(?:^|\n)\s*-\s*["']?([A-Za-z0-9_.-]+)["']?/g);
                    if (matches) {
                        const keys = matches.map(m => m.replace(/[\r\n\s-]+/g, '').replace(/["']/g, '').trim());
                        Tier3Oracle.configure({ customIntentKeys: keys });
                        ui.info(`Loaded custom rules: ${c.dim(keys.join(', '))}`);
                    }
                } catch (e) { }
                break;
            }
        }

        const proxy = new TransparentProxyServer({ port, upstreamUrl, wasmDir });
        await proxy.start();

        ui.header(`StackEngine AI Gateway (v${VERSION})`);
        ui.logKv('Local Endpoint', c.cyan(`http://127.0.0.1:${port}/v1`), 18);
        ui.logKv('Upstream Target', c.dim(upstreamUrl), 18);
        ui.logKv('Redaction Engine', c.green('active (client-side)'), 18);
        console.log('');
        console.log(`  ${c.bold('Client Integration')}`);
        console.log(`  ${c.dim('Route your LLM client base URL to the local endpoint:')}\n`);
        ui.logKv('Cursor', 'Settings -> Models -> OpenAI Base URL', 14);
        ui.logKv('Python', c.dim(`OpenAI(base_url="http://127.0.0.1:${port}/v1")`), 14);
        ui.logKv('Bash', c.dim(`export OPENAI_BASE_URL=http://127.0.0.1:${port}/v1`), 14);
        console.log('');
        ui.success(`Gateway active. Intercepting outbound traffic ${c.dim('(Ctrl+C to exit)')}\n`);
        return;
    }

    // Fast-path: clear command deletes active vault lockfile directly from disk
    if (command === 'clear') {
        const mapFlagIdx = args.indexOf('-m') > -1 ? args.indexOf('-m') : args.indexOf('--map');
        const activeVaultPath = mapFlagIdx > -1 ? args[mapFlagIdx + 1] : VAULT_FILE;

        if (!fs.existsSync(activeVaultPath)) {
            console.log('');
            ui.info('Vault is already empty. No active tokens to clear.');
            console.log('');
            process.exit(0);
        }

        let tokenCount = 0;
        try {
            const tokenMap = JSON.parse(fs.readFileSync(activeVaultPath, 'utf-8'));
            tokenCount = Object.keys(tokenMap).length;
        } catch (e) { }

        // Delete active vault lockfile from disk
        fs.unlinkSync(activeVaultPath);

        // Append explicit vault clearing event to local audit log
        writeAuditEntry({
            event: 'CLEAR',
            timestamp: new Date().toISOString(),
            target_file: 'N/A',
            tokens_count: tokenCount,
            status: 'MANUAL_VAULT_DELETED'
        });

        ui.header('StackEngine Vault Purged');
        ui.success('Ephemeral vault lockfile deleted from disk');
        console.log('');
        ui.logKv('Vault State', c.dim('Purged'), 14);
        ui.logKv('Tokens Cleared', String(tokenCount), 14);
        ui.logKv('Audit Ledger', c.dim(AUDIT_FILE), 14);
        console.log('');
        process.exit(0);
    }

    const mapFlagIdx = args.indexOf('-m') > -1 ? args.indexOf('-m') : args.indexOf('--map');
    const outFlagIdx = args.indexOf('-o') > -1 ? args.indexOf('-o') : args.indexOf('--out');
    const activeVaultPath = mapFlagIdx > -1 ? args[mapFlagIdx + 1] : VAULT_FILE;
    const redactor = new HybridRedactor();
    const wasmDir = process.env.STACKENGINE_WASM_DIR;

    // Workspace initialization workflow
    if (command === 'init') {
        const workspaceDir = path.join(process.cwd(), '.stackengine');

        // 1. Initialize workspace directory (.stackengine) and internal gitignore rules
        if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
        fs.writeFileSync(path.join(workspaceDir, '.gitignore'), "vault.lock\n*.tmp\n");

        // 2. Generate configuration template
        let createdTemplate = false;
        const configPath = path.join(workspaceDir, 'config.yaml');
        if (!fs.existsSync(configPath)) {
            const template = `# StackEngine Configuration
# Define custom keys here to enforce strict redaction regardless of values.
# Example:
# customIntentKeys:
#   - "namespace"
#   - "internal_project_id"
#   - "corp_auth_token"
`;
            fs.writeFileSync(configPath, template);
            createdTemplate = true;
        }

        // 3. Inject ignore entries into project root .gitignore
        let securedGitignore = false;
        const projectGitignore = path.join(process.cwd(), '.gitignore');
        const gitDir = path.join(process.cwd(), '.git');
        if (fs.existsSync(gitDir) || fs.existsSync(projectGitignore)) {
            let gitignoreContent = fs.existsSync(projectGitignore) ? fs.readFileSync(projectGitignore, 'utf-8') : '';
            if (!gitignoreContent.includes('.stackengine/vault.lock')) {
                fs.appendFileSync(projectGitignore, '\n# StackEngine Local Vault\n.stackengine/vault.lock\n*.redacted\n*.restored\n');
                securedGitignore = true;
            }
        }

        ui.header('StackEngine Workspace Initialized');
        if (createdTemplate) {
            ui.success(`Created configuration template at ${c.dim('.stackengine/config.yaml')}`);
        } else {
            ui.info(`Configuration template already exists at ${c.dim('.stackengine/config.yaml')}`);
        }

        if (securedGitignore) {
            ui.success(`Secured ${c.dim('.gitignore')} against ephemeral vault leakage`);
        }

        console.log('');
        console.log(`  ${c.bold('Next steps')}`);
        ui.action(`Edit ${c.cyan('.stackengine/config.yaml')} to add team-specific redaction rules`);
        ui.action(`Run ${c.cyan('stackengine init-hook')} to install Git pre-commit secret blocking`);
        ui.action(`Run ${c.cyan('stackengine proxy --port 8080')} to launch the transparent AI gateway\n`);
        process.exit(0);
    }

    // Git pre-commit hook installation
    if (command === 'init-hook') {
        const gitHooksDir = path.join(process.cwd(), '.git', 'hooks');
        if (!fs.existsSync(gitHooksDir)) {
            console.log('');
            ui.error('No .git/hooks directory found. Ensure you are in the repository root.');
            console.log('');
            process.exit(1);
        }

        const preCommitPath = path.join(gitHooksDir, 'pre-commit');
        const hookScript = `#!/bin/sh
if command -v stackengine >/dev/null 2>&1; then
  SE_CMD="stackengine"
elif command -v se >/dev/null 2>&1; then
  SE_CMD="se"
else
  echo "\\033[33m⚠  StackEngine CLI not found. Skipping secret scan.\\033[0m"
  exit 0
fi

# Only scan supported configuration and code files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(yaml|yml|json|tf|sh|js|ts|conf|ini)$')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

echo "\\033[36m▶\\033[0m Scanning staged files for hardcoded credentials..."

$SE_CMD scan $STAGED_FILES
if [ $? -ne 0 ]; then
  echo "\\033[1;31m× Commit blocked: Hardcoded credentials detected in staged files\\033[0m"
  echo "\\033[90m  Policy: Plaintext credentials must not be committed to version control.\\033[0m"
  echo ""
  echo "  \\033[36m▶\\033[0m Autonomous local fix : \\033[36mstackengine fix <file>\\033[0m (Team license required)"
  echo "  \\033[36m▶\\033[0m Manual local redaction   : \\033[36mstackengine redact <file>\\033[0m"
  echo "  \\033[90m· Emergency gate bypass   : git commit --no-verify (audited)\\033[0m"
  echo ""
  exit 1
fi

exit 0
`;
        fs.writeFileSync(preCommitPath, hookScript, { mode: 0o755 });
        ui.header('StackEngine Pre-Commit Hook Installed');
        ui.success(`Git hook installed at ${c.dim('.git/hooks/pre-commit')}`);
        console.log(`  ${c.dim('Commits containing detected credentials will be intercepted and blocked.')}\n`);
        process.exit(0);
    }

    // Clipboard workflow: read and redact clipboard payload, persisting token map to disk vault
    if (command === 'copy') {
        const rawCode = readClipboard();
        if (!rawCode || !rawCode.trim()) {
            console.log('');
            ui.info('Clipboard is empty. Nothing to redact.');
            console.log('');
            process.exit(0);
        }

        const startTime = performance.now();
        const result = await redactor.redact(rawCode, 'yaml', wasmDir);
        const duration = Number((performance.now() - startTime).toFixed(2));
        const tokenCount = Object.keys(result.tokenMap).length;

        ensureAirlockWorkspace();
        fs.writeFileSync(activeVaultPath, JSON.stringify(result.tokenMap, null, 2), { mode: 0o600 });
        writeAuditEntry({
            event: 'CLIPBOARD_COPY', timestamp: new Date().toISOString(),
            target_file: 'Clipboard', tokens_count: tokenCount, latency_ms: duration
        });

        const promptInstruction = `CRITICAL COMPILER DIRECTIVE REGARDING TOKENS:
The user's input code has been pre-processed by our internal templating engine (Kustomize/Helm equivalent). You will see template variables formatted exactly like "__SE_...__".

1. DO NOT treat these as raw secrets or sensitive data. They are environment-injection pointers.
2. DO NOT replace them with "<FILL_IN>", "<REPLACE_ME>", or Vault references.
3. If you refactor a ConfigMap into a Secret resource (which is highly encouraged for best practices), you MUST assign these exact "__SE_...__" string literals as the values for the respective keys.
4. Any alteration, omission, or renaming of the "__SE_...__" tokens will cause a fatal syntax error in our downstream CI/CD deployment pipeline. Preserve them perfectly.`;

        const finalPayload = `\`\`\`\n${result.sanitized.trim()}\n\`\`\`\n\nPrompt: ${promptInstruction}`;
        writeClipboard(finalPayload);

        ui.header('StackEngine Clipboard Redaction');
        if (tokenCount > 0) {
            ui.action(`Tokenized ${tokenCount} credential(s) from clipboard:\n`);
            Object.entries(result.tokenMap).forEach(([tId, realSecret], index) => {
                const isLast = index === Object.keys(result.tokenMap).length - 1;
                const semTypeMatch = tId.match(/__SE_(.*?)_[A-Z0-9]+__/);
                const semType = semTypeMatch ? semTypeMatch[1] : 'SECRET';
                const masked = realSecret.length > 8 ? `${realSecret.slice(0, 1)}******${realSecret.slice(-1)}` : '****';
                ui.treeSecret(semType, masked, isLast, 22, tId);
            });
            console.log('');
        } else {
            ui.info('0 credentials detected in clipboard payload\n');
        }

        ui.logKv('Vault State', c.dim(`${activeVaultPath} (0600)`), 14);
        ui.logKv('Latency', c.dim(`${duration}ms`), 14);
        console.log('');
        ui.success('Redacted payload and prompt directive written to clipboard');
        console.log(`  ${c.dim('Ready to paste (Cmd/Ctrl+V) directly into ChatGPT, Claude, or Cursor web chat.')}\n`);
        ui.warn('Always verify that redacted code is leak-free before submitting to LLM\n');
        process.exit(0);
    }

    if (command === 'paste') {
        if (!fs.existsSync(activeVaultPath)) {
            console.log('');
            ui.error(`Vault lockfile not found: ${c.dim(activeVaultPath)}`);
            console.error(`  ${c.dim('Run \'stackengine copy\' or \'stackengine redact\' first.')}\n`);
            process.exit(1);
        }

        const llmResponse = readClipboard();
        if (!llmResponse || !llmResponse.trim()) {
            console.log('');
            ui.info('Clipboard is empty. Nothing to restore.');
            console.log('');
            process.exit(0);
        }

        let tokenMap: Record<string, string> = {};
        try { tokenMap = JSON.parse(fs.readFileSync(activeVaultPath, 'utf-8')); } catch (e) { }

        const tokenCount = Object.keys(tokenMap).length;
        if (tokenCount === 0) {
            console.log('');
            ui.info('Active vault is empty. Purged ephemeral lockfile.');
            console.log('');
            fs.unlinkSync(activeVaultPath);
            process.exit(0);
        }

        const actualRestoredCount = Object.keys(tokenMap).filter(t => llmResponse.includes(t)).length;
        const restoredText = redactor.restore(llmResponse, tokenMap);

        const outTarget = outFlagIdx > -1 ? args[outFlagIdx + 1] : 'Clipboard';
        if (outTarget !== 'Clipboard') {
            fs.writeFileSync(outTarget, restoredText);
        } else {
            writeClipboard(restoredText);
        }

        fs.unlinkSync(activeVaultPath);
        writeAuditEntry({
            event: 'CLIPBOARD_PASTE', timestamp: new Date().toISOString(),
            target_file: outTarget, expected_tokens: tokenCount, actual_restored: actualRestoredCount,
            status: 'SUCCESS_VAULT_DELETED'
        });

        ui.header('StackEngine Clipboard Restoration');
        if (actualRestoredCount === tokenCount) {
            ui.success(`Restored all ${actualRestoredCount} credential(s) inbound`);
        } else {
            ui.warn(`Restored ${actualRestoredCount}/${tokenCount} credential(s) ${c.dim('(LLM omitted some tokens)')}`);
        }
        console.log('');

        ui.logKv('Destination', outTarget === 'Clipboard' ? 'System Clipboard' : c.dim(outTarget), 14);
        ui.logKv('Vault State', c.dim('Purged from disk'), 14);
        console.log('');

        if (outTarget === 'Clipboard') {
            ui.success(`Restored code copied to clipboard ${c.dim('(paste back into IDE)')}\n`);
        } else {
            ui.success(`Restored code written to ${c.dim(outTarget)}\n`);
        }
        process.exit(0);
    }

    // Read-only static scanner (supports single or multi-file batch scanning)
    if (command === 'scan') {
        const targetFiles = args.slice(1).filter(a => !a.startsWith('-'));
        if (targetFiles.length === 0) {
            console.log('');
            ui.error(`Input file not found: ${c.yellow('none specified')}`);
            console.error(`  ${c.dim('Usage: stackengine scan <file ...> [options]')}\n`);
            process.exit(1);
        }

        let totalViolations = 0;

        for (const file of targetFiles) {
            if (!fs.existsSync(file)) {
                console.log('');
                ui.error(`Input file not found: ${c.yellow(file)}\n`);
                totalViolations++;
                continue;
            }

            const fileContent = fs.readFileSync(file, 'utf-8');
            const fileExt = path.extname(file).replace('.', '');
            const startTime = performance.now();
            const result = await redactor.redact(fileContent, fileExt === 'yml' ? 'yaml' : fileExt, wasmDir);
            const duration = Number((performance.now() - startTime).toFixed(2));
            const tokenCount = Object.keys(result.tokenMap).length;

            if (tokenCount > 0) {
                totalViolations++;
                console.log('');
                ui.error(`${c.bold('Credentials detected:')} ${tokenCount} exposed in ${c.yellow(file)}\n`);
                Object.entries(result.tokenMap).forEach(([tId, realSecret], index) => {
                    const isLast = index === Object.keys(result.tokenMap).length - 1;
                    const semTypeMatch = tId.match(/__SE_(.*?)_[A-Z0-9]+__/);
                    const semType = semTypeMatch ? semTypeMatch[1] : 'SECRET';
                    const masked = realSecret.length > 8 ? `${realSecret.slice(0, 1)}******${realSecret.slice(-1)}` : '****';
                    ui.treeSecretRed(semType, masked, isLast, 22, tId);
                });
                console.log('');
            } else {
                console.log('');
                ui.success(`Clean scan: ${file} ${c.dim(`(${duration}ms)`)}\n`);
            }
        }

        if (totalViolations > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }

    // Require target file existence for file-based pipelines (redact / restore)
    const inputFile = args[1];
    if (!inputFile || !fs.existsSync(inputFile)) {
        console.log('');
        ui.error(`Input file not found: ${c.yellow(inputFile || 'none specified')}`);
        console.error(`  ${c.dim(`Usage: stackengine ${command || 'redact'} <file> [options]`)}\n`);
        process.exit(1);
    }

    const inPlace = args.includes('-i') || args.includes('--in-place');
    const content = fs.readFileSync(inputFile, 'utf-8');
    const ext = path.extname(inputFile).replace('.', '');

    if (command === 'fix') {
        const target = inputFile || 'target.yaml';
        ui.header('Autonomous Remediation Engine (Team license required)');
        ui.error('Deterministic patch synthesis requires a Team license');
        ui.info('Community Edition is strictly limited to local client-side redaction and restoration\n');
        console.log(`  ${c.bold('Available paths:')}`);
        ui.logKv('Manual', `Run ${c.cyan(`stackengine redact ${target}`)} for local client-side sanitization`, 14);
        ui.logKv('Automated', `Provision an offline team license key at ${c.cyan('https://stackengine.dev/pro')}`, 14);
        console.log('');
        process.exit(1);
    }

    if (command === 'redact') {
        const defaultOut = `${inputFile}.redacted`;
        const outputFile = inPlace ? inputFile : (outFlagIdx > -1 ? args[outFlagIdx + 1] : defaultOut);

        const startTime = performance.now();
        const result = await redactor.redact(content, ext === 'yml' ? 'yaml' : ext, wasmDir);
        const endTime = performance.now();
        const duration = Number((endTime - startTime).toFixed(2));

        const tokenCount = Object.keys(result.tokenMap).length;

        ensureAirlockWorkspace();

        // Persist token map into disk vault lockfile (mode: 0600 on creation on POSIX systems)
        fs.writeFileSync(activeVaultPath, JSON.stringify(result.tokenMap, null, 2), { mode: 0o600 });

        // Append redaction event to local audit log (.stackengine/audit.log)
        writeAuditEntry({
            event: 'REDACT',
            timestamp: new Date().toISOString(),
            target_file: path.basename(inputFile),
            tokens_count: tokenCount,
            latency_ms: duration
        });

        // Ensure ephemeral vault path is excluded in project-level .gitignore
        const projectGitignore = path.join(process.cwd(), '.gitignore');
        if (fs.existsSync(projectGitignore)) {
            const gitignoreContent = fs.readFileSync(projectGitignore, 'utf-8');
            if (!gitignoreContent.includes('.stackengine/vault.lock')) {
                fs.appendFileSync(projectGitignore, '\n# StackEngine Local Vault\n.stackengine/vault.lock\n*.redacted\n*.restored\n');
            }
        }

        fs.writeFileSync(outputFile, result.sanitized);

        ui.header('StackEngine File Redaction');
        if (tokenCount > 0) {
            ui.action(`Tokenized ${tokenCount} credential(s) from ${path.basename(inputFile)}:\n`);
            Object.entries(result.tokenMap).forEach(([tId, realSecret], index) => {
                const isLast = index === Object.keys(result.tokenMap).length - 1;
                const semTypeMatch = tId.match(/__SE_(.*?)_[A-Z0-9]+__/);
                const semType = semTypeMatch ? semTypeMatch[1] : 'SECRET';
                const masked = realSecret.length > 8 ? `${realSecret.slice(0, 1)}******${realSecret.slice(-1)}` : '****';
                ui.treeSecret(semType, masked, isLast, 22, tId);
            });
            console.log('');
        } else {
            ui.info(`0 credentials detected in ${path.basename(inputFile)}\n`);
        }

        ui.logKv('Artifact', c.dim(outputFile), 16);
        ui.logKv('Vault Lockfile', c.dim(`${activeVaultPath} (0600)`), 16);
        ui.logKv('Latency', c.dim(`${duration}ms`), 16);
        console.log('');
        ui.success(`Redacted payload written to ${c.dim(outputFile)}`);
        ui.warn(`Always verify that redacted code is leak-free before submitting to LLM\n`);

        const promptInstruction = `CRITICAL RULE: You MUST output the exact tokens (e.g. __SE_...__) completely unchanged. Do not truncate, omit, or modify them.`;
        ui.action(`${c.bold('Prompt directive')} ${c.dim('(append to your LLM query):')}\n`);
        console.log(ui.quote(promptInstruction, 'cyan'));
        console.log('');

    } else if (command === 'restore') {
        if (!fs.existsSync(activeVaultPath)) {
            console.log('');
            ui.error(`Vault lockfile not found: ${c.dim(activeVaultPath)}`);
            console.error(`  ${c.dim('Run \'stackengine redact\' first to generate ephemeral tokens.')}\n`);
            process.exit(1);
        }

        let tokenMap: Record<string, string> = {};
        try {
            tokenMap = JSON.parse(fs.readFileSync(activeVaultPath, 'utf-8'));
        } catch (e) {
            console.log('');
            ui.error('Corrupted vault lockfile on disk');
            console.log('');
            process.exit(1);
        }

        const tokenCount = Object.keys(tokenMap).length;
        if (tokenCount === 0) {
            console.log('');
            ui.error('Vault is empty or already purged');
            console.log('');
            process.exit(1);
        }

        const defaultRestoreOut = inputFile.endsWith('.redacted')
            ? inputFile.replace(/\.redacted$/, '.restored')
            : `${inputFile}.restored`;

        const outputFile = inPlace ? inputFile : (outFlagIdx > -1 ? args[outFlagIdx + 1] : defaultRestoreOut);

        const restored = redactor.restore(content, tokenMap);
        fs.writeFileSync(outputFile, restored);

        // Vault cleanup: delete lockfile after restoration
        fs.unlinkSync(activeVaultPath);

        // Record inbound secret restoration event in local audit log
        writeAuditEntry({
            event: 'RESTORE',
            timestamp: new Date().toISOString(),
            target_file: path.basename(inputFile),
            tokens_count: tokenCount,
            status: 'SUCCESS_VAULT_DELETED'
        });

        ui.header('StackEngine Restoration Complete');
        ui.success(`Restored ${tokenCount} credential(s) into ${c.dim(outputFile)}\n`);
        ui.logKv('Destination', c.dim(outputFile), 14);
        ui.logKv('Vault State', c.dim('Purged from disk'), 14);
        ui.logKv('Audit Ledger', c.dim(AUDIT_FILE), 14);
        console.log('');
    } else {
        console.log('');
        ui.error(`Unknown command: ${c.yellow(command)}`);
        console.error(`  ${c.dim('Run \'stackengine --help\' to inspect available commands.')}\n`);
        process.exit(1);
    }
}

run().catch(err => {
    console.log('');
    ui.error(`Runtime crash: ${err.message}\n`);
    process.exit(1);
});