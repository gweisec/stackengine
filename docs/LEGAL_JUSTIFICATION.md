# Legal Justification Memo: StackEngine CLI (BSL 1.1)

**Target Audience:** Corporate Legal, IP Counsel, and Open Source Program Offices (OSPO)  
**Subject:** Approval Request for Internal Use of StackEngine CLI under Business Source License 1.1  
**Product:** StackEngine CLI  
**Licensor:** The StackEngine Authors (`contact@stackengine.dev`)  
**License Type:** Business Source License 1.1 (BSL 1.1) → Transitioning to Apache License 2.0  

---

## 1. Executive Summary

StackEngine CLI is distributed as source-available software under the **Business Source License 1.1 (BSL 1.1)**, converting automatically to **Apache-2.0** two years after each release.

Under the terms of the StackEngine BSL 1.1 Additional Use Grant, **individual developer workstation workflows (local secret redaction, clipboard tokenization, local proxying, and pre-commit scanning with up to 2 local rules) are free for internal business use without license fees or copyleft obligations**. 

Unattended execution in CI/CD remediation pipelines (`stackengine fix`), repository-wide policy enforcement (`.stackengine.yaml` or >2 custom rules), full compliance matrix exports, or repositories exceeding 3 active Git committers (measured over a rolling 30-day window) requires a Commercial License (Team/Enterprise).

---

## 2. Key Legal & Compliance Risk Assessments

| Compliance Concern | Risk Rating | Legal & Technical Assessment |
| :--- | :--- | :--- |
| **Copyleft / Code Taint** | **Negligible Risk (Out-of-Process)** | StackEngine CLI operates strictly as an independent out-of-process executable and local HTTP reverse proxy (`127.0.0.1`). It is not linked (neither statically nor dynamically) into proprietary applications or distributed customer-facing binaries. Surrounding source code remains untouched and unburdened. |
| **Additional Use Grant** | **Fully Compliant** | The license grant explicitly permits free internal developer workstation workflows (clipboard tokenization, file redaction, local proxy, pre-commit hooks with ≤2 local rules, and manual secret scanning). Commercial licensing is triggered only when deploying repository-wide shared policies (`.stackengine.yaml` or >2 custom rules), automated CI/CD remediation PR pipelines (`stackengine fix`), full compliance matrix exports, or teams exceeding 3 active Git committers (measured over a rolling 30-day window). |
| **License Expiration & Longevity** | **Contractual Apache-2.0 Conversion** | Per the license Change Date terms, each version automatically converts to standard Apache License 2.0 exactly two years after publication, eliminating long-term proprietary lock-in. |
| **Network & Data Egress** | **Zero Cloud Backend · 100% Local Execution** | All AST parsing, regex evaluation, and deterministic tokenization execute strictly on the local workstation or customer-isolated CI runner. In all standalone CLI modes (`redact`, `scan`, `restore`, `policy`, `copy`, `paste`), network egress is zero. In `proxy` and `fix` workflows, outbound egress is strictly bounded to forwarding sanitized, tokenized payloads to customer-configured LLM endpoints (BYOK), accompanied by cryptographic SHA-256 zero-plaintext-egress attestations. |

---

## 3. Automated Scanner Override Guidance (Snyk, FOSSA, Mend, Black Duck)

If your automated compliance scanner flags `BUSL-1.1` (or `BSL-1.1`) as a non-OSI license or commercial risk:

1. **Recommended Action:** Grant a scope-limited policy exception / override for package `stackengine` (or binary `stackengine`).
2. **Approved Deployment Scope:** `local-developer-environment`, `internal-developer-tooling` (and `ci-cd-pipeline` with commercial license or on repositories with ≤3 active committers measured over a rolling 30-day window).
3. **Audit Justification Template:**
   > *"Approved for internal development and secret redaction workflows under StackEngine BSL 1.1 Additional Use Grant. Tool operates as an out-of-process CLI/proxy with no runtime linking to commercial deliverables."*

---

## 4. Summary Table for Legal Sign-off

| Attribute | Details |
| :--- | :--- |
| **Commercial Distribution Permitted?** | No (only internal use permitted under BSL; commercial distribution permitted after Apache-2.0 change date) |
| **Workstation / Community Use Permitted?** | Yes (explicitly covered under Additional Use Grant for developer workstations and repos with ≤3 active committers over a rolling 30-day window) |
| **Royalties or License Fees Required?** | None for Community Edition workstation scope. Commercial License required for automated CI/CD PR pipelines (`stackengine fix`), repo-wide shared policies (`.stackengine.yaml`), full compliance matrix exports, or teams >3 active committers (measured over a rolling 30-day window). |
| **Patent / Trademark Claims?** | Standard BSL 1.1 terms apply |

---

*For commercial team licenses, enterprise air-gapped deployments, or offline cryptographic keys, visit [StackEngine Pricing](https://stackengine.dev/#pricing) or contact: contact@stackengine.dev*
