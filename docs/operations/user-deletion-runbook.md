# User Deletion Runbook (Planner Data)

Status: active  
Owner: `nxlap-data-ops`  
Last reviewed: 2026-03-25

## Purpose

Handle support-led deletion requests for planner persistence, including backup-expiry expectations.

## Scope

Applies to encrypted planner data in Cosmos (`id = <userId>`) and associated device records.

It does not delete the Clerk account unless explicitly requested through the account-closure process.

## Preconditions

- Verified requester identity.
- Deletion request recorded in support ticket.
- Deletion approved by authorized operator.

## Procedure

1. Confirm deletion type:
- planner-data-only delete
- full account closure (planner + identity)

2. Read current records for evidence:
- planner document (`id = <userId>`)
- device records (`id = <userId>:device:*`)
- wrapped DEK records (`id = <userId>:wrappedDek:*`)

3. Delete live planner data:
- delete planner document first
- delete device and wrapped-DEK records for the same user

4. Record deletion ledger entry:
- `userId`
- request timestamp
- live delete timestamp
- operator
- ticket id
- backup expiry deadline (based on current backup retention)

5. Verify live deletion:
- `GET /api/data` returns `404`
- `GET /api/devices` returns empty list

6. Send confirmation:
- confirm live deletion complete
- explain backup retention window and expiry date

## Backup Expiry Handling

Current production backup posture:

- periodic backup
- 8-hour retention

Operational requirement:

- deleted records may still exist in backup snapshots until retention expiry
- restore workflow must not reintroduce deleted users into production

Each deletion request must include:

- calculated backup-expiry timestamp
- closure task to confirm no restore/import reintroduced the deleted user after expiry

## Evidence Required

- ticket id and requester verification
- deleted document ids
- operator and approval identity
- verification results (`/api/data` and `/api/devices`)
- backup-expiry timestamp

## Runbook Test Record

### Drill 2026-03-25 (tabletop)

Scope:

- support-led planner-data deletion for a single user
- backup-expiry communication and evidence capture

Result: PASS

Findings:

- deletion evidence fields were sufficient for audit trail
- backup-expiry communication template was clear
- explicit restore-exclusion dependency required for safe recoveries

