/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/state/memory-store.ts
import { StateManager } from './state-manager';

export class MemoryStore extends StateManager {
    constructor(sessionId?: string) {
        super(sessionId);
    }

    public commit(): void {
        // In-memory state persistence: state persists across current runtime process without disk I/O
    }

    public destroy(): void {
        // Purge in-memory references to accelerate garbage collection
        this.state.tokens = {};
        this.state.sessionId = 'DESTROYED';
    }
}
