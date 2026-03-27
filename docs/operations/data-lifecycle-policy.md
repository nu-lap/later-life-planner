# Data Lifecycle Policy (Retention, Deletion, Export, Recovery)

Status: active  
Owner: `nxlap-data-ops`  
Last reviewed: 2026-03-27  
Review cadence: Quarterly and on lifecycle-policy changes

## Purpose

Define how user planner data is retained, exported, deleted, and recovered for Later-Life Planner.

This policy is the operational baseline for production persistence and aligns with:

- `docs/operations/user-deletion-runbook.md`
- `docs/operations/planner-point-in-time-restore-runbook.md`
- `docs/operations/restore-exclusion-control.md`

## Scope

In scope:

- encrypted planner blob in Cosmos (`id = <userId>`)
- device registration and wrapped-DEK records (`id = <userId>:device:*`, `<userId>:wrappedDek:*`)
- user-requested planner export (`/account` export flow)
- backup and recovery handling for the above records

Out of scope:

- Clerk identity-account lifecycle rules (managed by Clerk terms and app-level account closure policy)
- analytics or marketing datasets (not in launch scope)

## Data Retention Baseline

Live data retention:

- active user planner records: retained while account is active
- deleted-user planner records: removed from live datastore without undue delay after validated request
- inactive-account auto-purge: not enabled for initial release (see `docs/operations/inactive-account-policy-decision.md`)

Backup retention (current production posture):

- Cosmos periodic backup
- backup interval: 4 hours
- backup retention: 8 hours

Retention principle:

- keep only what is needed for service continuity, support, and user-requested recovery
- do not retain planner plaintext in logs or operational tooling

## Export Policy

Supported export:

- account holder can export canonical planner JSON from authenticated account UI
- export is initiated by the signed-in user and delivered client-side

Export constraints:

- no server-side plaintext export staging
- export reflects current canonical planner state available to the client

## Deletion Policy

Deletion entry point:

- support-led deletion request (planner-only or full account closure path)

Deletion behavior:

- live planner + device + wrapped-DEK records are deleted promptly after validation
- deletion is recorded in a support/operations ledger with timestamp, operator, and ticket reference
- backup copies may continue to exist until configured backup retention expires

Deletion safeguard:

- restored data must never reintroduce users who were deleted and whose deletion window has completed
- restore operations must follow `restore-exclusion-control.md`

## Backup and Recovery Policy

Recovery objective (current posture):

- recover from accidental overwrite/deletion using periodic backup restore into a recovery environment
- no direct item-level restore in the production account under periodic mode

Recovery constraints:

- restoration is operator-run and approval-gated
- recovery actions must be evidence-captured (who, when, why, source timestamp, outcome)
- user-deletion exclusions must be applied before any rehydration to production

Operational runbooks:

- planner restore runbook: `docs/operations/planner-point-in-time-restore-runbook.md`
- user deletion runbook: `docs/operations/user-deletion-runbook.md`
- restore exclusion control: `docs/operations/restore-exclusion-control.md`

## User-Facing Statements Required

Any user-facing privacy material must clearly state:

- encrypted planner data is retained while service is active for the user
- users can request deletion of planner data
- deletions are live-immediate, with limited backup-retention lag
- users can export planner data from account tools

## Review Cadence

- policy review: at least every 6 months
- mandatory review triggers:
  - Cosmos backup mode/retention change
  - launch of self-serve deletion
  - launch of analytics/marketing tracking
  - legal/privacy requirements update
