/**
 * @license
 * Copyright 2026 The StackEngine Authors <contact@stackengine.dev>
 * SPDX-License-Identifier: BUSL-1.1
 *
 * Licensed under the Business Source License 1.1 (BSL 1.1).
 * See LICENSE file in the project root for details.
 */

// Channel A: Invariant preflight pattern registry
// Restricts membership to deterministic, high-entropy credentials with immutable syntactic prefixes.
// General context-dependent assignments (e.g. password=xxx) are strictly prohibited.

export interface PreflightRule {
    type: string;    // Shadow token semantic classification (Semantic Type)
    regex: RegExp;   // V8 regex strictly guarded by word boundaries (\b) or lookaround assertions
}

export const PREFLIGHT_INVARIANT_RULES: PreflightRule[] = [
        // 1. Cryptographic self-contained envelopes (PEM / PGP certificates)
        {
            type: 'PEM_PRIVATE_KEY',
            regex: /-----BEGIN[ A-Z0-9_-]+-----(?:\\?\r?\n|\\\\n|[\s\S])*?-----END[ A-Z0-9_-]+-----/g
        },

        // 2. Cloud provider privileged infrastructure credentials
        {
            // Lower bound adjusted to {14,} to capture 18-character mock test identities (e.g. AKIAEXAMPLE7777777)
            type: 'AWS_ACCESS_KEY',
            regex: /\b(AKIA|ASIA)[0-9A-Z]{14,}\b|\b(QUtJQ|QVNJQ)[0-9A-Za-z+/=]{20,}\b|\bAQoDYXdz[a-zA-Z0-9/+=]{16,}\b/g
        },
        {
            // Contextually bound AWS secret access keys ({30,96} length envelope covering mock and base64 forms)
            type: 'AWS_SECRET_ACCESS_KEY',
            regex: /(?<=\b(?:AKIA|ASIA)[0-9A-Z]{14,}:)[a-zA-Z0-9/+=]{20,64}(?![a-zA-Z0-9/+=])|(?<=\b(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key|AWS_SECRET_KEY|aws_secret_key|SECRET_ACCESS_KEY|secret_access_key)\s*[:=]\s*["']?)[a-zA-Z0-9/+=]{30,96}(?![a-zA-Z0-9/+=])|(?<![a-zA-Z0-9/+_.-])(?=[a-zA-Z0-9/+=]*EXAMPLEKEY)[a-zA-Z0-9/+=]{20,64}(?![a-zA-Z0-9/+=])|(?<=(?:#|\/\/|--)\s*)(?![a-fA-F0-9]{40}(?![a-zA-Z0-9/+=]))(?=[a-zA-Z0-9/+=]*[a-z])(?=[a-zA-Z0-9/+=]*[A-Z])[a-zA-Z0-9/+=]{40}(?![a-zA-Z0-9/+=])/g
        },
        {
            type: 'ALIYUN_ACCESS_KEY',
            regex: /\bLTAI[A-Za-z0-9]{16,30}\b/g
        },
        {
            type: 'TENCENT_SECRET_ID',
            regex: /\bAKID[A-Za-z0-9]{32,}\b/g
        },
        {
            type: 'GCP_API_KEY',
            regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g
        },

        // 3. AI / LLM provider authentication tokens (OpenAI, Anthropic, HuggingFace)
        {
            type: 'OPENAI_API_KEY',
            regex: /\bsk-(?:proj-|admin-|[a-zA-Z0-9]{20}T3BlbkFJ)[a-zA-Z0-9_\-]{20,}\b|\bsk-[a-zA-Z0-9]{48}\b/g
        },
        {
            type: 'ANTHROPIC_API_KEY',
            regex: /\bsk-ant-api03-[a-zA-Z0-9_\-]{80,}\b/g
        },
        {
            type: 'HUGGINGFACE_TOKEN',
            regex: /\bhf_[a-zA-Z0-9]{34,}\b/g
        },

        // 4. Source control, CI/CD, and package registry tokens (GitHub, GitLab, NPM, PyPI, Docker)
        {
            type: 'GITHUB_PAT',
            regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b|\bgithub_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}\b/g
        },
        {
            type: 'GITLAB_PAT',
            regex: /\bglpat-[a-zA-Z0-9_\-]{20,}\b/g
        },
        {
            type: 'NPM_TOKEN',
            regex: /\bnpm_[a-zA-Z0-9]{36}\b/g
        },
        {
            type: 'PYPI_TOKEN',
            regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_\-]{50,}\b/g
        },
        {
            type: 'DOCKER_HUB_PAT',
            regex: /\bdckr_pat_[a-zA-Z0-9_\-]{27,}\b/g
        },

        // 5. Financial, SaaS, APM, and observability platform credentials
        {
            // Stripe API, webhook secrets, Datadog pipeline keys, Dynatrace, New Relic, Postman
            type: 'API_KEY',
            regex: /\b(?:(?:sk|rk|pk)[_-](?:live|test|proj|ant)[_-]|(?:stripe_)?whsec_[a-zA-Z0-9_]{16,}|ddp_sec_|dlp_live_sec_|NRAK-|dt0c01\.|PMAK-)[a-zA-Z0-9_\-.:]{16,}\b|\b(?:c2tfdGVzdF_|c2tmbGl2ZV_|c2tf|d2hzZWNf)[a-zA-Z0-9+/=_-]{20,}\b|(?<=\b(?:STRIPE_API_KEY|STRIPE_SECRET|STRIPE_TOKEN|STRIPE_KEY)\s*[:=]\s*["']?)[a-zA-Z0-9+/=_-]{20,}(?![a-zA-Z0-9/+=_-])/g
        },
        {
            // Kubeadm CA certificate trust hashes and discovery tokens
            type: 'API_KEY',
            regex: /(?<=(?:caCertHashes|discovery-token-ca-cert-hash)[\s\S]*?sha256:)[a-f0-9]{64}\b/gi
        },
        {
            type: 'SENDGRID_API_KEY',
            regex: /\bSG\.[a-zA-Z0-9_\-.]{40,}\b/g
        },
        {
            type: 'SLACK_TOKEN',
            regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g
        },
        {
            type: 'SLACK_WEBHOOK',
            regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]+\/B[0-9A-Z]+\/[0-9a-zA-Z]+/g
        },
        {
            type: 'VAULT_TOKEN',
            regex: /\b(?:hvs\.|s\.)[a-zA-Z0-9_\-]{16,}\b/g
        },
        {
            type: 'TWILIO_CREDENTIALS',
            regex: /\b(SK|AC)[a-fA-F0-9]{32}\b/g
        },

        // 6. Generic cryptographic tokens (JWT)
        {
            type: 'JWT_TOKEN',
            regex: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g
        }
    ];