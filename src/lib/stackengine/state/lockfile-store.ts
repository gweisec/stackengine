/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/state/lockfile-store.ts
import { StateManager } from './state-manager';
import { AirlockState } from '../types';

export class LockfileStore extends StateManager {
    private lockFilePath: string;

    constructor(sessionId?: string, lockDir: string = process.cwd()) {
        super(sessionId);
        this.lockFilePath = `${lockDir}/.stackengine-${this.state.sessionId}.lock`;
    }

    public commit(): void {
        try {
            // Dynamic import to prevent bundler resolution issues in browser runtimes
            const fs = require('fs');
            // Write lockfile store state to disk (enforcing 0600 file permission)
            fs.writeFileSync(this.lockFilePath, JSON.stringify(this.state, null, 2), { mode: 0o600 });
        } catch (e) {
            console.warn(`[StackEngine] FS module not found or permission denied. Fallback to RAM.`);
        }
    }

    public destroy(): void {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.lockFilePath)) {
                // Lockfile cleanup: delete active lockfile from disk
                fs.unlinkSync(this.lockFilePath);
            }
        } catch (e) {
            // ignore
        }
        this.state.tokens = {};
    }

    public static load(filePath: string): AirlockState | null {
        try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data) as AirlockState;
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}
