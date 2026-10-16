/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/state/state-manager.ts
import { AirlockState, ShadowToken } from '../types';

export abstract class StateManager {
    protected state: AirlockState;

    constructor(sessionId: string = crypto.randomUUID()) {
        this.state = {
            sessionId,
            createdAt: Date.now(),
            tokens: {}
        };
    }

    public registerToken(token: ShadowToken): void {
        this.state.tokens[token.tokenId] = token;
    }

    public getToken(tokenId: string): ShadowToken | undefined {
        return this.state.tokens[tokenId];
    }

    public getState(): AirlockState {
        return this.state;
    }

    // Concrete persistence and lifecycle destruction implemented by subclasses
    public abstract commit(): Promise<void> | void;
    public abstract destroy(): Promise<void> | void;
}
