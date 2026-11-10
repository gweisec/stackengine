/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

/**
 * SlidingWindowStreamGrafter
 * 
 * Provides deterministic, low-latency client-side token restoration
 * over chunked Server-Sent Events (SSE) streams.
 * 
 * Solves the token-splitting dilemma without buffering the full response:
 * holds at most 32 bytes in a sliding prefix latch when potential shadow
 * tokens (__SE_...) are split across SSE delta frames.
 */
export class SlidingWindowStreamGrafter {
    private buffer: string = '';
    // Deterministic shadow tokens format: __SE_<TYPE>_<HASH6>__ (bounded to 32 chars)
    private readonly MAX_TOKEN_LEN = 32;

    /**
     * Ingest an SSE delta chunk, safely detokenize completed tokens,
     * and emit safe text with zero perceptible latency.
     */
    public processChunk(delta: string, restoreFn: (text: string) => string): string {
        this.buffer += delta;

        // 1. Attempt to restore any fully-formed __SE_...__ tokens in buffer
        if (this.buffer.includes('__SE_')) {
            this.buffer = restoreFn(this.buffer);
        }

        // 2. Check if an incomplete token is pending within the tail (length < MAX_TOKEN_LEN)
        const lastTokenStart = this.buffer.lastIndexOf('__SE_');
        if (lastTokenStart !== -1 && (this.buffer.length - lastTokenStart) < this.MAX_TOKEN_LEN) {
            const safeToFlush = this.buffer.slice(0, lastTokenStart);
            this.buffer = this.buffer.slice(lastTokenStart);
            return safeToFlush;
        }

        // 3. Check if the tail is an emerging prefix of "__SE_" (e.g. "_", "__", "__S", "__SE")
        const maxPrefixLen = Math.min(4, this.buffer.length);
        for (let len = maxPrefixLen; len >= 1; len--) {
            const tail = this.buffer.slice(-len);
            if ('__SE_'.startsWith(tail)) {
                const safeToFlush = this.buffer.slice(0, -len);
                this.buffer = tail;
                return safeToFlush;
            }
        }

        // 4. No pending or partial tokens detected: safe to flush immediately
        const out = this.buffer;
        this.buffer = '';
        return out;
    }

    /**
     * Flush all remaining buffered bytes on SSE stream termination ([DONE]).
     */
    public flush(restoreFn: (text: string) => string): string {
        const finalOut = restoreFn(this.buffer);
        this.buffer = '';
        return finalOut;
    }
}

