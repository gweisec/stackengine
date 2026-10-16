# Legal Justification Memo: StackEngine CLI (BSL 1.1)

**Target Audience:** Corporate Legal, IP Counsel, and Open Source Program Offices (OSPO)  
**Subject:** Approval Request for Internal Use of StackEngine CLI under Business Source License 1.1  
**Product:** StackEngine CLI  
**Licensor:** The StackEngine Authors (`contact@stackengine.dev`)  
**License Type:** Business Source License 1.1 (BSL 1.1) → Transitioning to Apache License 2.0  

---

## 1. Executive Summary

StackEngine CLI is distributed as source-available software under the **Business Source License 1.1 (BSL 1.1)**, converting automatically to **Apache-2.0** two years after each release.

The software is used solely for **internal developer workflows, local secret redaction, and security compliance**. Under the terms of the StackEngine BSL 1.1 Additional Use Grant, this internal use is **explicitly permitted without license fees, royalties, or copyleft obligations**.

---

## 2. Key Legal & Compliance Risk Assessments

| Compliance Concern | Risk Rating | Legal & Technical Assessment |
| :--- | :--- | :--- |
| **Copyleft / Code Taint** | **Negligible Risk (Out-of-Process)** | StackEngine CLI operates strictly as an independent out-of-process executable and local HTTP reverse proxy (`127.0.0.1`). It is not linked (neither statically nor dynamically) into proprietary applications or distributed customer-facing binaries. Surrounding source code remains untouched and unburdened. |
| **Additional Use Grant** | **Fully Compliant** | The license grant explicitly permits: *"You may use the Licensed Work for any internal business purpose, evaluation, and development workflows"*, provided that the functionality is not made available to third parties as a commercial product, paid service, or competitive developer tooling. |
| **License Expiration & Longevity** | **Contractual Apache-2.0 Conversion** | Per the license Change Date terms, each version automatically converts to standard Apache License 2.0 exactly two years after publication, eliminating long-term proprietary lock-in. |
| **Network & Data Egress** | **Zero Cloud Backend · 100% Local Execution (Proxy Egress Bounded)** | All AST parsing, regular expression scanning, and deterministic tokenization execute strictly on the local machine (`127.0.0.1`). StackEngine CLI operates 100% client-side with zero cloud backend infrastructure, transmitting no analytics beacons or remote telemetry. In CLI execution modes (`redact`, `scan`, `restore`), network egress is zero. In local proxy mode, outbound egress is strictly bounded to forwarding tokenized payloads to the user-configured upstream LLM API endpoint. |

---

## 3. Automated Scanner Override Guidance (Snyk, FOSSA, Mend, Black Duck)

If your automated compliance scanner flags `BUSL-1.1` (or `BSL-1.1`) as a non-OSI license or commercial risk:

1. **Recommended Action:** Grant a scope-limited policy exception / override for package `stackengine` (or binary `stackengine`).
2. **Approved Deployment Scope:** `internal-tooling`, `local-developer-environment`, `ci-cd-pipeline`.
3. **Audit Justification Template:**
   > *"Approved for internal development and secret redaction workflows under StackEngine BSL 1.1 Additional Use Grant. Tool operates as an out-of-process CLI/proxy with no runtime linking to commercial deliverables."*

---

## 4. Summary Table for Legal Sign-off

| Attribute | Details |
| :--- | :--- |
| **Commercial Distribution Permitted?** | No (only internal use permitted under BSL; commercial distribution permitted after Apache-2.0 change date) |
| **Internal Commercial / Enterprise Use Permitted?** | Yes (explicitly covered under Additional Use Grant) |
| **Royalties or License Fees Required?** | None for internal business use |
| **Patent / Trademark Claims?** | Standard BSL 1.1 terms apply |

---

*For enterprise procurement, annual invoiced billing, offline cryptographic licensing, or direct architect onboarding: contact@stackengine.dev*
