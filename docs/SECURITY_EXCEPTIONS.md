# Security exceptions

Use the [dependency-security process](DEPENDENCY_SECURITY.md) and the repository's actual risk-approval policy. This register records decisions; it grants no authority to accept risk. A dependency-fix request, bot PR or audit suppression is not exception approval.

## Approved current exceptions

No approved security exceptions are recorded. The remediation introducing this register creates no exceptions. An empty approved section does not establish a clean audit; consult the relevant run's finding inventory and raw evidence.

## Outstanding authority and proposals

No exception approval is proposed by this change. Repository-specific approval authority and policy are not identified in the checked-in guidance. Maintainers must establish them before accepting a future proposal. Do not invent an approver, owner, tracking ticket or expiry.

Keep unresolved findings and proposed, incomplete, expired or changed-scope decisions in the run's review inventory. A different version, parent route or exposure does not inherit previous acceptance, including acceptance in another repository.

## Evidence for human consideration

The following is an evidence checklist, not a replacement approval policy:

| Field | Required evidence |
| --- | --- |
| Identity | Canonical advisory and authoritative source. |
| Scope | Package, affected versions/ranges and every covered parent route. |
| Reason and exposure | Why a supported fix is blocked; actual runtime, build/test, packed and consumer exposure. |
| Mitigation | Applied controls, verification results and limitations. |
| Accountability | A real owner assignment and tracking reference. |
| Approval | Authorised decision maker, date and evidence for the exact accepted scope. |
| Reassessment | Policy-compliant review/expiry date and triggers. |

Only current, specifically authorised and fully scoped decisions belong in the approved section. Missing fields or expired approval leave the finding unresolved even if a tool suppresses it.

## Reassessment and removal

Reassess at the policy-required date and when dependency versions, paths, exposure or supported fixes change. Capture fresh production and complete recursive audits and verify every affected occurrence. Remove resolved entries and matching suppressions only after graph verification. Record any actual renewal separately; never silently extend expiry, transfer approval to new paths or regenerate a baseline to make a check pass.
