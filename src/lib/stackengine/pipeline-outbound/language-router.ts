/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// src/lib/stackengine/pipeline-outbound/language-router.ts

export type SupportedLanguage = 'yaml' | 'json' | 'hcl' | 'bash' | 'generic';

export class LanguageRouter {
    /**
     * Header Sniffer:
     * Restricts syntax inspection to the initial 10 lines of the input text.
     * Prevents embedded multi-line scripts inside YAML ConfigMaps from hijacking language classification.
     */
    public static sniff(rawText: string, explicitLang?: string): SupportedLanguage {
        // Explicit caller override takes precedence
        if (explicitLang && ['yaml', 'json', 'hcl', 'bash'].includes(explicitLang.toLowerCase())) {
            return explicitLang.toLowerCase() as SupportedLanguage;
        }

        const trimmed = rawText.trim();
        if (!trimmed) return 'yaml';

        // JSON structural framing: must begin and terminate with object or array delimiters
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            return 'json';
        }

        // Shebang signature: classify strictly as shell script
        if (trimmed.startsWith('#!/bin/') || trimmed.startsWith('#!/usr/bin/env')) {
            return 'bash';
        }

        // Header boundary isolation: evaluate first 10 lines to exclude nested sub-document noise
        const topLines = trimmed.split('\n').slice(0, 10).join('\n');

        // Kubernetes manifest and YAML document indicators
        if (/(?:^|\n)\s*(?:apiVersion:|kind:|metadata:|---)/.test(topLines)) {
            return 'yaml';
        }

        // HashiCorp HCL / Terraform block indicators
        if (/(?:^|\n)\s*(?:resource|provider|variable|terraform|locals)\s+"/.test(topLines)) {
            return 'hcl';
        }

        // Default syntax fallback
        return 'yaml';
    }
}