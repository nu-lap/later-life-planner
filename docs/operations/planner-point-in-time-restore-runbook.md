# Planner Point-in-Time Restore Runbook

Status: active  
Owner: `nxlap-data-ops`  
Last reviewed: 2026-03-25

## Purpose

Recover encrypted planner documents after accidental overwrite, corruption, or broad operational faults.

This runbook is split by backup mode:

- current production posture: periodic backup (no item-level PITR)
- target posture for PITR: continuous backup (7-day)

## Preconditions

- Incident ticket approved by incident commander.
- Restore requester identity verified.
- Restore window and impacted `userId` list documented.
- Restore access restricted to `nxlap-data-ops`.

## Current Production Path (Periodic Backup)

Current storage posture (as of 2026-03-25):

- periodic backup
- 4-hour interval
- 8-hour retention

Implications:

- no true point-in-time item restore
- recovery RPO is up to latest periodic snapshot
- restore must happen into a recovery account, then data is selectively copied

### Procedure

1. Create recovery workspace:
- restore Cosmos backup to a recovery account/resource group
- keep recovery account network-restricted and operator-only

2. Identify candidate planner documents:
- query by `id = <userId>`
- verify `schemaVersion`, `revision`, and `updatedAt`

3. Validate ciphertext payload shape before copy:
- `iv` and `ciphertext` fields present
- expected base64 formats and lengths

4. Copy only approved user records back to production.
- never bulk copy entire container
- apply deletion guard checks before copy (see restore exclusion control)

5. Verify in production:
- affected user can load encrypted plan
- no unrelated users changed

6. Record evidence:
- incident id
- source backup timestamp
- copied user ids
- operator + approver

## Target PITR Path (Continuous Backup 7-day)

When continuous backup is enabled:

1. Define restore timestamp (`T_restore`) and impacted user set.
2. Restore Cosmos data to a recovery account at `T_restore`.
3. Run restore exclusion check (deleted users must remain excluded).
4. Copy only approved user rows back to production.
5. Validate app behavior and close incident with evidence.

Do not restore directly into production without filtering.

## Runbook Test Record

### Drill 2026-03-25 (tabletop)

Scope:

- accidental overwrite scenario for one user
- verify decision points and evidence requirements

Result: PASS

Findings:

- operator and approver roles were clear
- selective copy requirement prevented unsafe bulk restore
- restore exclusion control is mandatory before production copy

Follow-up:

- keep this runbook aligned with actual Cosmos backup mode
- if backup mode changes to continuous, update this runbook with exact `az` commands used in the first live drill

