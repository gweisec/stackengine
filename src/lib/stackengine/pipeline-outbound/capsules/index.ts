/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

import { DetectorCapsule } from './core';
import { HighIntentCapsule } from './HighIntentCapsule';
import { MicroPrivilegeCapsule } from './MicroPrivilegeCapsule';
import { FallbackEntropyCapsule } from './FallbackEntropyCapsule';

// Detector capsule registry. Execution order is decoupled from array insertion order
// and resolved via internal capsule priority weights.
const REGISTERED_CAPSULES: DetectorCapsule[] = [
    HighIntentCapsule,        // Priority: 300 (custom and semantic intent keys)
    MicroPrivilegeCapsule,    // Priority: 500 (URI credentials and high-entropy secrets)
    FallbackEntropyCapsule    // Priority: 999 (Shannon entropy fallback heuristic)
];

// Priority-sorted capsule chain: Enforces deterministic Chain of Responsibility execution
// via ascending priority sorting.
export const ALL_CAPSULES: DetectorCapsule[] = [...REGISTERED_CAPSULES].sort(
    (a, b) => a.priority - b.priority
);
