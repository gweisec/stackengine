/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/types.ts

/**
 * Extracted scalar stripped of syntactic delimiter wrappers.
 */
export interface CleanScalar {
    start: number;       // Absolute byte start offset within raw byte stream
    end: number;         // Absolute byte end offset within raw byte stream
    value: string;       // Extracted scalar value (stripped of enclosing quotes and delimiters)
    nodeType: string;    // AST node classification (e.g. 'plain_scalar', 'double_quoted_string')
    uriContext?: boolean;// Flag indicating scalar resides within a URI authority/path component
    keyContext?: string; // AST ancestor path resolution or LHS key anchor (e.g. 'db_passwords.dev')
}

/**
 * Custom redaction key configuration.
 */
export interface AirlockCustomConfig {
    customIntentKeys?: string[]; // User-defined target keys enforcing mandatory redaction regardless of entropy
}

/**
 * Ephemeral token metadata mapped to redacted plaintext secret.
 */
export interface ShadowToken {
    tokenId: string;       // Deterministic shadow token (format: __SE_<TYPE>_<HASH6>__)
    originalValue: string; // True unredacted plaintext secret for inbound restoration
    semanticType: string;  // Classified semantic intent (e.g. 'AWS_SECRET_ACCESS_KEY', 'JWT_TOKEN')
    sourceQuote?: string;  // Preserved quote delimiter context ('"' | "'" | '') for delimiter restoration
}

/**
 * In-memory state persisting token mappings for inbound restoration.
 */
export interface AirlockState {
    sessionId: string;
    createdAt: number;
    tokens: Record<string, ShadowToken>;
}

/**
 * Outbound redaction pipeline execution artifact.
 */
export interface RedactionResult {
    safePayload: string;   // Sanitized payload containing shadow tokens for outbound LLM transmission
    state: AirlockState;   // In-memory state snapshot required for inbound restoration
    stats: {
        totalFound: number;
        processTimeMs: number;
    };
}