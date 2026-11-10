/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { HybridRedactor } from '../stackengine/index.js';
import { InboundGrafter } from '../stackengine/pipeline-inbound/re-entry.js';
import { SlidingWindowStreamGrafter } from './stream-grafter.js';

export interface ProxyOptions {
    port: number;
    upstreamUrl: string;
    wasmDir?: string;
}

function writeProxyAuditEntry(entry: Record<string, any>): void {
    try {
        const airlockDir = path.join(process.cwd(), '.stackengine');
        if (!fs.existsSync(airlockDir)) {
            fs.mkdirSync(airlockDir, { recursive: true });
        }
        const localGitignore = path.join(airlockDir, '.gitignore');
        if (!fs.existsSync(localGitignore) || fs.readFileSync(localGitignore, 'utf-8').trim() !== '*') {
            fs.writeFileSync(localGitignore, "*\n");
        }
        const MAX_FREE_LOG_LINES = 50;

        const freeLogEntry: Record<string, any> = {
            event: entry.event,
            timestamp: entry.timestamp || new Date().toISOString(),
            target_file: entry.target_file || entry.target_host || "127.0.0.1",
            tokens_count: entry.tokens_count ?? entry.actual_restored ?? 0,
            ...(entry.latency_ms !== undefined && { latency_ms: entry.latency_ms }),
            ...(entry.status !== undefined && { status: entry.status })
        };

        const auditFile = path.join(airlockDir, 'audit.jsonl');
        let existingLines: string[] = [];
        if (fs.existsSync(auditFile)) {
            existingLines = fs.readFileSync(auditFile, 'utf-8')
                .split('\n')
                .filter(line => line.trim().length > 0);
        }
        // Newest record on top (Line 1)
        existingLines.unshift(JSON.stringify(freeLogEntry));
        if (existingLines.length > MAX_FREE_LOG_LINES) {
            existingLines = existingLines.slice(0, MAX_FREE_LOG_LINES);
        }
        fs.writeFileSync(auditFile, existingLines.join('\n') + '\n', { mode: 0o600 });
    } catch { }
}

// =================================================================
// Community In-Memory Vault (FIFO Eviction Vault)
// In-memory vault bounded to 100 entries (FIFO eviction) with 10-minute sliding TTL
// =================================================================
class CommunityWorkspaceVault {
    private static cache = new Map<string, { value: string; lastActive: number }>();
    private static readonly TTL_MS = 10 * 60 * 1000; // 10-minute sliding window expiration
    private static readonly COMMUNITY_LIMIT = 100;    // Upper capacity boundary for community runtime

    public static store(tokenMap: Record<string, string>): void {
        for (const [tokenId, realSecret] of Object.entries(tokenMap)) {
            if (this.cache.size >= this.COMMUNITY_LIMIT) {
                const oldest = this.cache.keys().next().value;
                if (oldest) this.cache.delete(oldest);
            }
            this.cache.set(tokenId, { value: realSecret, lastActive: Date.now() });
        }
    }

    public static restore(text: string): { restoredText: string; count: number } {
        let count = 0;
        const now = Date.now();
        const activeTokenMap: Record<string, string> = {};

        for (const [tokenId, entry] of this.cache.entries()) {
            if (now - entry.lastActive > this.TTL_MS) {
                this.cache.delete(tokenId);
                continue;
            }
            if (text.includes(tokenId)) {
                count++;
                activeTokenMap[tokenId] = entry.value;
                entry.lastActive = now;
            }
        }
        const restoredText = count > 0 ? InboundGrafter.restore(text, activeTokenMap) : text;
        return { restoredText, count };
    }

    public static size(): number {
        return this.cache.size;
    }
}

export class TransparentProxyServer {
    private redactor = new HybridRedactor();
    private server: http.Server | null = null;
    private activeConnections = 0; // Concurrency tracker

    constructor(private options: ProxyOptions) { }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', (e: any) => {
                if (e.code === 'EADDRINUSE') {
                    console.error(`\n\x1b[31m×\x1b[0m Port ${this.options.port} is already in use.`);
                    console.error(`  \x1b[90mIs the proxy already running in the background? Run 'stackengine stop' first.\x1b[0m\n`);
                    process.exit(1);
                }
                reject(e);
            });

            this.server.listen(this.options.port, '127.0.0.1', () => {
                resolve();
            });
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // CORS preflight and access control headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const upstream = new URL(this.options.upstreamUrl);
        const targetPath = req.url || '/';
        const isChatPath = targetPath.includes('/chat/completions') || targetPath.includes('/completions');

        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            this.activeConnections++;
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            let forwardBody = rawBody;
            let tokenMap: Record<string, string> = {};
            let isOriginalStream = false;
            let originalStreamOptions: any = undefined;

            // Context window load detection: flag large single-threaded workloads
            const payloadKb = Math.round(Buffer.byteLength(rawBody) / 1024);
            if (payloadKb >= 35) {
                console.log(`\x1b[33m⚠\x1b[0m  Large payload detected (${payloadKb} KB). Processing on local runtime.`);
            }

            // High concurrency saturation warning
            if (this.activeConnections > 2) {
                console.log(`\x1b[33m⚠\x1b[0m  High concurrent request volume (${this.activeConnections} active requests).`);
            }

            if (isChatPath && req.method === 'POST' && rawBody) {
                try {
                    const parsed = JSON.parse(rawBody);
                    isOriginalStream = parsed.stream === true;

                    // Real-time SSE streaming: preserve parsed.stream to enable zero-latency client-side streaming.
                    // Outbound shadow tokens are detokenized real-time via 32-byte SlidingWindowStreamGrafter.

                    if (Array.isArray(parsed.messages)) {
                        let totalRedacted = 0;

                        // Execute outbound payload redaction
                        for (const msg of parsed.messages) {
                            if (typeof msg.content === 'string' && msg.content.trim() && msg.role !== 'system') {
                                const redactResult = await this.redactor.redact(msg.content, 'generic', this.options.wasmDir);
                                msg.content = redactResult.sanitized;
                                Object.assign(tokenMap, redactResult.tokenMap);
                            }
                        }

                        // Derive unique redacted entity count from deduplicated vault dictionary
                        totalRedacted = Object.keys(tokenMap).length;

                        if (totalRedacted > 0) {

                            // Compiler directive injection: constrain model from refactoring or omitting synthetic tokens
                            const systemInstruction = `
CRITICAL COMPILER DIRECTIVE REGARDING TOKENS:
The user's input code has been pre-processed by our internal templating engine (Kustomize/Helm equivalent). You will see template variables formatted exactly like "__SE_...__" or "__SE_...__".

1. DO NOT treat these as raw secrets or sensitive data. They are environment-injection pointers.
2. DO NOT replace them with "<FILL_IN>", "<REPLACE_ME>", or Vault references.
3. If you refactor a ConfigMap into a Secret resource (which is highly encouraged for best practices), you MUST assign these exact "__SE_...__" string literals as the values for the respective keys.
4. Any alteration, omission, or renaming of the "__SE_...__" tokens will cause a fatal syntax error in our downstream CI/CD deployment pipeline. Preserve them perfectly.
                        `;

                            if (parsed.messages[0]?.role === 'system') {
                                parsed.messages[0].content += '\n\n' + systemInstruction;
                            } else {
                                parsed.messages.unshift({ role: 'system', content: systemInstruction });
                            }

                            // Commit token map to session vault for cross-request resolution
                            CommunityWorkspaceVault.store(tokenMap);

                            console.log(`\x1b[36m▶\x1b[0m Tokenized ${totalRedacted} credential(s) -> \x1b[90m${upstream.host}\x1b[0m`);

                            // Capacity threshold warning
                            if (CommunityWorkspaceVault.size() >= 80) {
                                console.log(`\x1b[33m⚠\x1b[0m  In-memory vault near capacity (${CommunityWorkspaceVault.size()}/100 tokens). Oldest entries will be evicted.`);
                            }

                            const entries = Object.entries(tokenMap);
                            entries.forEach(([tId, realSecret], index) => {
                                const isLast = index === entries.length - 1;
                                const prefix = isLast ? '└─' : '├─';
                                const semTypeMatch = tId.match(/__SE_(.*?)_[A-Z0-9]+__/);
                                const semType = semTypeMatch ? semTypeMatch[1] : 'SECRET';
                                const masked = realSecret.length > 8 ? `${realSecret.slice(0, 1)}******${realSecret.slice(-1)}` : '****';
                                console.log(`  \x1b[90m${prefix}\x1b[0m \x1b[90m${semType.padEnd(20, ' ')}\x1b[0m : \x1b[33m${masked.padEnd(8, ' ')}\x1b[0m \x1b[90m→\x1b[0m \x1b[36m${tId}\x1b[0m`);
                            });

                            // Record outbound redaction event in local audit log
                            writeProxyAuditEntry({
                                event: 'PROXY_REDACT_OUTBOUND',
                                timestamp: new Date().toISOString(),
                                tokens_count: totalRedacted,
                                target_host: upstream.host,
                                status: 'TOKENS_INJECTED_TO_UPSTREAM'
                            });
                        }
                        forwardBody = JSON.stringify(parsed);
                    }
                } catch (e) {
                    // Passthrough unparseable non-JSON payloads
                }
            }

            const headers = { ...req.headers };
            delete headers.host;
            // Strip compression headers: enforce uncompressed responses for inbound token restoration
            delete headers['accept-encoding'];
            headers['content-length'] = Buffer.byteLength(forwardBody).toString();

            // Transport protocol dispatch: select http or https module based on upstream URI scheme
            const clientModule = upstream.protocol === 'http:' ? http : https;
            const defaultPort = upstream.protocol === 'http:' ? 80 : 443;

            const proxyReq = clientModule.request({
                protocol: upstream.protocol,
                hostname: upstream.hostname,
                port: upstream.port || defaultPort,
                method: req.method,
                path: targetPath,
                headers: headers
            }, (proxyRes) => {
                const statusCode = proxyRes.statusCode || 200;
                const isSuccessStatus = Boolean(statusCode >= 200 && statusCode < 300);

                // --- Real-Time SSE Streaming Branch (Sliding-Window Latch) ---
                if (isOriginalStream && isSuccessStatus) {
                    res.writeHead(statusCode, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*'
                    });

                    const grafterContent = new SlidingWindowStreamGrafter();
                    const grafterReasoning = new SlidingWindowStreamGrafter();
                    let streamRestoredCount = 0;
                    const restoreWrapper = (text: string): string => {
                        const r = CommunityWorkspaceVault.restore(text);
                        if (r.count > 0) streamRestoredCount += r.count;
                        return r.restoredText;
                    };

                    let sseBuffer = '';

                    proxyRes.on('data', (chunk: Buffer) => {
                        sseBuffer += chunk.toString('utf-8');
                        const lines = sseBuffer.split('\n');
                        sseBuffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            if (trimmed === 'data: [DONE]') {
                                const flushC = grafterContent.flush(restoreWrapper);
                                const flushR = grafterReasoning.flush(restoreWrapper);
                                if (flushC || flushR) {
                                    const flushedChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: 'chat.completion.chunk',
                                        created: Math.floor(Date.now() / 1000),
                                        model: 'stackengine-gateway',
                                        choices: [{
                                            delta: {
                                                ...(flushR ? { reasoning_content: flushR } : {}),
                                                ...(flushC ? { content: flushC } : {})
                                            },
                                            index: 0,
                                            finish_reason: null
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(flushedChunk)}\n\n`);
                                }
                                res.write(`data: [DONE]\n\n`);
                                continue;
                            }

                            if (trimmed.startsWith('data: ')) {
                                const jsonStr = trimmed.slice(6);
                                try {
                                    const parsedChunk = JSON.parse(jsonStr);
                                    const delta = parsedChunk.choices?.[0]?.delta;
                                    let modified = false;

                                    if (delta?.content) {
                                        delta.content = grafterContent.processChunk(delta.content, restoreWrapper);
                                        modified = true;
                                    }

                                    if (delta?.reasoning_content) {
                                        delta.reasoning_content = grafterReasoning.processChunk(delta.reasoning_content, restoreWrapper);
                                        modified = true;
                                    }

                                    if (delta?.content !== '' || delta?.reasoning_content !== '' || !modified) {
                                        res.write(`data: ${JSON.stringify(parsedChunk)}\n\n`);
                                    }
                                } catch {
                                    res.write(`${line}\n\n`);
                                }
                            } else {
                                res.write(`${line}\n\n`);
                            }
                        }
                    });

                    proxyRes.on('end', () => {
                        const flushC = grafterContent.flush(restoreWrapper);
                        const flushR = grafterReasoning.flush(restoreWrapper);
                        if (flushC || flushR) {
                            const flushedChunk = {
                                id: `chatcmpl-${Date.now()}`,
                                object: 'chat.completion.chunk',
                                created: Math.floor(Date.now() / 1000),
                                model: 'stackengine-gateway',
                                choices: [{
                                    delta: {
                                        ...(flushR ? { reasoning_content: flushR } : {}),
                                        ...(flushC ? { content: flushC } : {})
                                    },
                                    index: 0,
                                    finish_reason: null
                                }]
                            };
                            res.write(`data: ${JSON.stringify(flushedChunk)}\n\n`);
                        }
                        res.end();

                        if (Object.keys(tokenMap).length > 0) {
                            console.log(`\x1b[32m✓\x1b[0m Upstream HTTP ${statusCode} OK (Streaming SSE)`);
                            console.log(`  \x1b[90m·\x1b[0m Sliding-window real-time token restoration: ${streamRestoredCount}/${Object.keys(tokenMap).length}`);
                            console.log(`  \x1b[32m✓\x1b[0m Zero-latency stream delivered to client\n`);
                        }

                        writeProxyAuditEntry({
                            event: 'PROXY_RESTORE_INBOUND_STREAM',
                            timestamp: new Date().toISOString(),
                            expected_tokens: Object.keys(tokenMap).length,
                            actual_restored: streamRestoredCount,
                            status: 'STREAM_RESTORE_SUCCESS'
                        });
                    });

                    return;
                }

                // --- Non-Streaming Response Fallback Buffer ---
                const resChunks: Buffer[] = [];
                proxyRes.on('data', chunk => resChunks.push(chunk));

                proxyRes.on('end', () => {
                    const rawResponse = Buffer.concat(resChunks).toString('utf-8');
                    let jsonResp: any = null;
                    let assembledContent = '';
                    let assembledReasoning = '';

                    try {
                        jsonResp = JSON.parse(rawResponse);
                        assembledContent = jsonResp.choices?.[0]?.message?.content || '';
                        assembledReasoning = jsonResp.choices?.[0]?.message?.reasoning_content || '';
                    } catch (e) {
                        res.writeHead(statusCode, proxyRes.headers);
                        res.write(rawResponse);
                        res.end();
                        return;
                    }

                    // Inbound restoration: restore real secrets from in-memory vault into assembled payload
                    const restoreResult = CommunityWorkspaceVault.restore(assembledContent);
                    const restoredContent = restoreResult.restoredText;
                    const restoredReasoning = CommunityWorkspaceVault.restore(assembledReasoning).restoredText;
                    const actualRestoredCount = restoreResult.count;

                    // Proxy logging: output only on upstream failure or when active token translation occurs
                    if (!isSuccessStatus) {
                        console.error(`\x1b[31m×\x1b[0m Upstream HTTP ${statusCode} ${proxyRes.statusMessage || 'Error'}`);
                        if (Object.keys(tokenMap).length > 0) {
                            console.error(`  \x1b[90mToken restore aborted. Forwarding error to client.\x1b[0m\n`);
                        }
                    } else if (Object.keys(tokenMap).length > 0) {
                        console.log(`\x1b[32m✓\x1b[0m Upstream HTTP ${statusCode} OK`);
                        console.log(`  \x1b[90m·\x1b[0m Reverse mapping ${actualRestoredCount}/${Object.keys(tokenMap).length} tokens from local memory buffer`);
                        if (actualRestoredCount < Object.keys(tokenMap).length) {
                            console.log(`  \x1b[33m⚠\x1b[0m  Notice: ${Object.keys(tokenMap).length - actualRestoredCount} token(s) eliminated upstream by model`);
                        }
                        console.log(`  \x1b[32m✓\x1b[0m Payload restored and delivered to client\n`);
                    }

                    // Persist audit record into local audit log
                    let auditStatus = 'PARTIAL_OR_OMITTED_BY_AI';
                    if (!isSuccessStatus) auditStatus = `UPSTREAM_API_ERROR_${statusCode}`;
                    else if (actualRestoredCount === Object.keys(tokenMap).length) auditStatus = 'ALL_TOKENS_RESTORED';

                    writeProxyAuditEntry({
                        event: 'PROXY_RESTORE_INBOUND',
                        timestamp: new Date().toISOString(),
                        expected_tokens: Object.keys(tokenMap).length,
                        actual_restored: actualRestoredCount,
                        status: auditStatus
                    });

                    if (jsonResp && jsonResp.choices?.[0]?.message) {
                        jsonResp.choices[0].message.content = restoredContent;
                        if (restoredReasoning) jsonResp.choices[0].message.reasoning_content = restoredReasoning;
                    }
                    const finalPayload = jsonResp ? JSON.stringify(jsonResp) : rawResponse;
                    const finalHeaders = { ...proxyRes.headers };
                    delete finalHeaders['content-encoding'];
                    // HTTP framing guard: strip transfer-encoding when explicitly declaring content-length
                    delete finalHeaders['transfer-encoding'];
                    finalHeaders['content-length'] = Buffer.byteLength(finalPayload).toString();
                    res.writeHead(statusCode, finalHeaders);
                    res.write(finalPayload);
                    res.end();
                });
            });
            this.activeConnections = Math.max(0, this.activeConnections - 1);
            proxyReq.on('error', (err) => {
                console.error(`\x1b[31m×\x1b[0m Failed to reach upstream:`, err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: `StackEngine proxy error: ${err.message}` } }));
            });

            proxyReq.write(forwardBody);
            proxyReq.end();
        });
    }
}
