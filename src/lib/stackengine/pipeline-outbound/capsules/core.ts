/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { CleanScalar } from '../../types';

export interface ClassifiedSecret extends CleanScalar {
    semanticType: string;
}

// ============================================================================
// Detector Capsule Interface & Shared Execution Context
// ============================================================================
export interface DetectorCapsule {
    id: string;
    priority: number; // Execution sequence priority: lower values resolve first in Chain of Responsibility
    trigger(keyCtx: string, cleanVal: string, rawVal: string): boolean;
    verify(cleanVal: string, rawVal: string, scalar: CleanScalar): ClassifiedSecret[] | null;
}

// Global shared configuration injected via configuration loader
export const SharedConfig = {
    customIntentKeys: [] as string[]
};

export const DECOY_ALLOWLIST = new Set([
    'true', 'false', 'null', 'undefined', 'Always', 'IfNotPresent', 'Never',
    'TCP', 'UDP', 'application/json', '<<-EOT', '<<EOF', 'EOT', 'EOF',
    'us-west-2', 'us-east-1', 'production', 'development', 'staging',
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'bearer', 'basic',
    "' OR '1'='1", "' OR '1'='1' --", " OR '1'=",
    'changeme', 'UDRzc3cwcmQhQDEyMw=='
]);

export const SHAPE_ALLOWLIST = [
    /^(?:file:)?(?:\.\.|\~|\.)\/.*$/, 
    /^(?:amzn|ami-|ubuntu\/|my-registry)[a-zA-Z0-9._\-\/]*\*[a-zA-Z0-9._\-\/]*$/, 
    /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9._\-]+(?:\.[a-zA-Z0-9._\-]+|\/[a-zA-Z0-9._\-\/]+)$/, 
    /^(?:[a-zA-Z0-9_.-]+=[a-zA-Z0-9_.\-\/]+|[a-zA-Z0-9_-]+)(?:&[a-zA-Z0-9_.-]+=[a-zA-Z0-9_.\-\/]+)+$/, 
    /^(?:[a-zA-Z0-9_.-]+:)?(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/, 
    /^(?:[a-zA-Z0-9_.-]+:)?(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:3[0-2]|[12]?\d)$/, 
    /^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?:\/(?:12[0-8]|1[01]\d|[1-9]?\d))?$/, 
    /^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, 
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
    /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.\-]+)?(?:\+[0-9A-Za-z.\-]+)?$/, 
    /^\d+(?:\.\d+)+[0-9a-zA-Z._~+-]+$/, 
    /^[a-z0-9]{6}\.[a-z0-9]{16}$/, 
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+\-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/, 
    /^(?:\*|\*\/\d+|\d+(?:[,\-\/]\d+)*)(?:\s+(?:\*|\*\/\d+|\d+(?:[,\-\/]\d+)*)){4,5}$/, 
    /^@?[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+@[a-zA-Z0-9._\-\/]+$/, 
    /^[a-zA-Z0-9._%+\-]+@(?:[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,63}|[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+)$/,
    /^\/(?:[a-zA-Z0-9._\-]+\/)+[a-zA-Z0-9._\-*]*$/, 
    /^\.\.?\/[a-zA-Z0-9._\-\/]+$/, 
    /^(?:\.?\.?\/[a-zA-Z0-9._\-\/]*|[a-zA-Z0-9._\-]+):(\/[a-zA-Z0-9._\-\/]+)(?::(?:ro|rw|z|Z|ro,Z|rw,Z))?$/, 
    /^(?:[a-z0-9._\-]+(?::\d{1,5})?\/)+[a-zA-Z0-9._\-*]+(?::[a-zA-Z0-9._\-$*]+)?(?:@sha256:[a-f0-9]{64}|@[a-zA-Z0-9._\-\/]+)?$|^[a-z0-9._\-*]+(?::[a-zA-Z0-9._\-$*]+|@sha256:[a-f0-9]{64})$/,
    /^(?:h[1-9]:[a-fA-F0-9]{64}|zh:[a-fA-F0-9]{64}|md5:[a-f0-9]{32}|sha1:[a-f0-9]{40}|sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/,
    /^[a-zA-Z0-9._-]+@(?:kubernetescrd|docker|file)$/, 
    /^[a-zA-Z0-9._%-]+%0\d+d$/, 
    /^[a-z0-9-]+(?:-[0-9.]+)?-alpine\.?$/, 
    /^arn:(?:aws|aws-cn|aws-us-gov|aws-iso|aws-iso-b):[a-z0-9\-]{2,}:[a-z0-9\-]*:(?:\d{12}|aws)?:[a-zA-Z0-9:_\/.\-*$]+$/,
    /^(?:us|eu|ap|sa|ca|me|af|il|mx|cn|us-gov|us-iso|us-isob|us-isof)-[a-z0-9-]+-\d+[a-z]?$/, 
    /^(?:module\.[a-z_][a-z0-9_\-]*\.)*(?:data\.)?[a-z][a-z0-9_]*(?:\.[a-z0-9_\-]+)+(?:\[(?:\d+|"[a-zA-Z0-9_\-]+")\])?$/, 
    /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)+$/, 
    /^[A-Z0-9_]{3,}$/,
    /^(?=.{1,64}$)[a-z0-9]+(?:_[a-z0-9]+)+$/, 
    /^[a-zA-Z0-9_.\/:-]+(?:=[a-zA-Z0-9_.\/:-]+)?(?:,[a-zA-Z0-9_.\/:-]+(?:=[a-zA-Z0-9_.\/:-]+)?)+$/,
    /^(?:\d{1,3}|\$[A-Z0-9_]+)\.(?:\d{1,3}|\$[A-Z0-9_]+)\.(?:\d{1,3}|\$[A-Z0-9_]+)\.(?:\d{1,3}|\$[A-Z0-9_]+)(?:\/\d{1,2})?$/,
    /^[A-Za-z0-9_]+[:=]$/, 
    /^[a-z0-9_-]+(?:,[a-z0-9_-]+)+$/,
    /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+){2,}$/,
    /^\/aws\/[a-zA-Z0-9_\-\.\/‘'’$]+$/,
    /^[A-Za-z0-9_]+=[A-Za-z0-9_.:-]+(?:,[A-Za-z0-9_]+=[A-Za-z0-9_.:-]+)+$/,
    /^\d+(?:\.\d+)?(?:[numkMGTPE]|Ki|Mi|Gi|Ti|Pi|Ei)?$/, 
    /^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/, 
    /^\d{1,3}(?:\.\d+)?%$/,
    /^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/,
    /^[1-5]\d{2}$/,
    /^[a-z]+\/[a-zA-Z0-9.+\-]+(?:;\s*[a-z]+=[a-zA-Z0-9\-]+)*$/, 
    /^\.[a-z0-9]{1,10}(?:\.[a-z0-9]{1,10}){0,3}$/,
    /^(?:git::|git\+)(?:https?|ssh):\/\/.+$/i,
    /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*\/\/[a-zA-Z0-9_.\-\/]+(?:\?ref=[a-zA-Z0-9_.\-]+)?$/,
    /^(?:tcp|redis|postgresql|postgres|auto):\/\/[^\s@]+$/,
    /^git@[a-zA-Z0-9_.-]+:[^\s]+$/,
    /^--[a-zA-Z0-9_-]+=[^\s"']+$/,
    /^[a-z0-9_]+(?:\.[a-z0-9_]+)+=[^\s"']+$/,
    /^(?:WantedBy|RemainAfterExit|FLANNEL_[A-Z]+)=[^\s"']+$/,
    /^[a-z0-9_.]+(?:\.[a-z0-9_.]+)*[<>]=?[a-zA-Z0-9%]+(?:,[a-z0-9_.]+[<>]=?[a-zA-Z0-9%]+)*$/,
    /^PCI-[A-Za-z0-9._-]+$/,
    /^[A-Za-z0-9_-]+=[A-Za-z0-9_-]+(?:&[A-Za-z0-9_-]+=[A-Za-z0-9_-]+)*$/,
    /^(?:\.\.\/|\~\/)[a-zA-Z0-9._\-\/]+$/,
    /^data:image\/[a-z]+;base64,[a-zA-Z0-9+/=]+$/,
    /^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/,
    /^(?:ssh|git):\/\/[^\s@]+@[^\s:]+(?::\d+)?\/[^\s]+$/,
    /^(?=.{1,63}$)[a-z0-9]+(?:[.-][a-z0-9]+)+$/,
    /^(?:us|eu|ap|sa|ca|me|af|il|mx|cn|us-gov|us-iso|us-isob|us-isof)-[a-z0-9-]+-\d+_[a-zA-Z0-9]+$/,
    /^\/subscriptions\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\/resourceGroups\/[a-zA-Z0-9._-]+\/providers\/[a-zA-Z0-9.]+\/.+$/,
    /^[a-z0-9.-]+\.k8s\.io\/v[0-9]+(?:alpha|beta)?[0-9]*$/,
    /^[a-z0-9.-]{3,253}\/[a-zA-Z0-9_.-]{1,63}$/,
    /^[a-zA-Z0-9_+.-]+:\/\/(?!.*@)[^\s"';]+$/,
    /^\*\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    /^(?:WantedBy|RemainAfterExit|Description|ExecStart|FLANNEL_[A-Z]+)=[^\s"']+$/,
    /^arn:aws[a-z0-9-]*:[a-z0-9-]*:[a-z0-9-*]*:(?:\d{12}|account|\*)?:.+$/i,
    /^(?:[A-Za-z0-9-]+:)?[A-Z][a-zA-Z0-9*]+\*$/,
    /^aws:[A-Za-z0-9_/.-]+$/,
    /^(?:oidc-provider\/)?(?:oidc\.eks|cognito-idp)\.[a-z0-9-]+\.amazonaws\.com\/.+$/,
    /^[A-Z][a-zA-Z0-9]+(?:[A-Z][a-z0-9]+)+(?:\*)?$/,
    /^(?:iamInstanceProfile|securityGroupIds)$/,
    /^(?:access-point|instance-profile)\/.+$/,
    /^data:[a-zA-Z0-9\/-]+;base64,.+$/,
    /^\/9j\/[a-zA-Z0-9+/=]+$/,
    /^(?:ALL:!|ECDHE-|DHE-)[A-Za-z0-9:!_-]+$/,
    /^HTTP\/\d\.\d$/,
    /^\/[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/,
    /^zone=[a-zA-Z0-9_-]+:\d+[kmgKMG]?$/,
    /^(?:http_)?50[0-9]$/,
    /^#[A-Z]+-\d+$/,
    /^process\.env\.[A-Za-z0-9_]+$/
];

export function isSafeShapeOrDecoy(text: string): boolean {
    if (!text) return true;
    const raw = text.trim();
    const cleaned = text.replace(/^['"]|['"]$/g, '').trim();
    if (DECOY_ALLOWLIST.has(raw) || DECOY_ALLOWLIST.has(cleaned)) return true;
    return SHAPE_ALLOWLIST.some(regex => regex.test(cleaned));
}

export function calculateEntropy(str: string): number {
    const charCount = new Map<string, number>();
    for (const char of str) charCount.set(char, (charCount.get(char) || 0) + 1);
    let entropy = 0;
    for (const count of charCount.values()) {
        const p = count / str.length;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}
