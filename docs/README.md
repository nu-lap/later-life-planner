# Documentation Index

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on material implementation change

This index is the source of truth for documentation status and ownership.

## Active Core Docs

| File | Purpose | Owner | Status |
| --- | --- | --- | --- |
| `docs/implementation-checklist.md` | Delivery phases and completion tracking | Engineering | Active |
| `docs/auth-plan.md` | Authentication/session model and protected-route UX | Engineering | Active |
| `docs/storage-plan.md` | Encrypted persistence architecture and sync model | Engineering | Active |
| `docs/security-decisions.md` | Security decisions and guardrails | Engineering + Security | Active |
| `docs/azure-architecture.md` | Azure runtime/deployment architecture | Engineering + Platform | Active |
| `docs/device-to-device.md` | Device approval and HPKE DEK sharing design | Engineering + Security | Active |
| `docs/testing-plan.md` | Testing scope and strategy | Engineering | Active |
| `docs/persistence-security-review.md` | Security review baseline for persistence model | Engineering + Security | Active |
| `docs/privacy-notice.md` | Production privacy notice text | Privacy Owner | Active |
| `docs/privacy-notice-outline.md` | Drafting baseline for privacy notice updates | Privacy Owner | Active |
| `docs/withdrawal-optimizer-mcp-design.md` | Forward-looking optimizer/MCP design notes | Engineering | Active |

## Active Operational Docs

| File | Purpose | Owner | Status |
| --- | --- | --- | --- |
| `docs/operations/deployment-assumptions.md` | Deployment baseline and runtime assumptions | Platform | Active |
| `docs/operations/data-lifecycle-policy.md` | Retention/deletion/export/recovery policy | Data Ops + Privacy | Active |
| `docs/operations/device-revocation-dek-rotation-runbook.md` | Device compromise, revocation, and DEK rotation response | Data Ops | Active |
| `docs/operations/planner-point-in-time-restore-runbook.md` | Planner recovery runbook | Data Ops | Active |
| `docs/operations/user-deletion-runbook.md` | Support-led planner data deletion runbook | Data Ops | Active |
| `docs/operations/restore-exclusion-control.md` | Restore guard to prevent deleted user reintroduction | Data Ops | Active |
| `docs/operations/cookie-posture-decision.md` | Cookie posture decision record | Product + Privacy | Active |
| `docs/operations/controller-processor-contracts-register.md` | Vendor controller/processor contract status | Privacy + Operations | Active |
| `docs/operations/dpia-screening-decision.md` | DPIA screening decision | Privacy Owner | Active |
| `docs/operations/dpo-decision-record.md` | DPO requirement decision record | Privacy Owner | Active |
| `docs/operations/ico-data-protection-fee-position.md` | ICO fee/register decision record | Privacy Owner | Active |
| `docs/operations/inactive-account-policy-decision.md` | Inactivity purge/review policy decision | Product + Privacy | Active |

## Reference / Prompt Docs

Use as implementation aides; not canonical architecture sources.

- `docs/prompts/product_prompt.md`
- `docs/prompts/branding-expert.md`
- `docs/prompts/deep-security-code-review.md`
- `docs/codex-later-life-planner-engineer-prompt.md`

## Historical / Point-in-Time Docs

Retained for traceability; not active implementation sources.

- `docs/reviews/*`
- `docs/operations/codex-auto-fix-issues.md`
- `docs/operations/ci-cd-review.md`
- `docs/operations/ci-cd-claude-test-instructions.md`
- `docs/operations/azure-codex-vault.md`
- `docs/operations/codex-prompts/*`

## Superseded Docs

- `docs/superseded/auth-implementation-prompt.md`
- `docs/superseded/data-storage-design.md`

## Maintenance Rules

- Update this index whenever a doc changes status, ownership, or source-of-truth role.
- New architecture/policy docs must include a `Document Control` section.
- When a doc is replaced, mark it as historical or superseded and link to its replacement.
