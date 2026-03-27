# Restore Exclusion Control

Status: active  
Owner: `nxlap-data-ops`  
Last reviewed: 2026-03-27  
Review cadence: Quarterly and after restore workflow changes

## Goal

Prevent deleted users from being reintroduced into production during restore operations.

This control is mandatory before any copy from recovery data back into production.

## Inputs

1. Restore candidate list (JSON array)
- one row per candidate document
- each row must include `id` (planner `userId`)

2. Deletion ledger (JSON array)
- one row per completed delete request
- each row must include `userId`

## Guard Command

```bash
node scripts/ops/verify-restore-exclusion.mjs \
  --restore /path/to/restore-candidates.json \
  --deleted /path/to/deletion-ledger.json
```

## Expected Outcomes

- exit `0`: safe to continue restore copy (no deleted `userId` overlap)
- exit `1`: overlap found, restore copy must stop
- exit `2`: input or parsing error, restore copy must stop

## Operator Actions on Failure

1. Stop restore copy immediately.
2. Remove overlapping `userId` records from restore candidate set.
3. Re-run guard command and keep output in incident evidence.
4. Continue only after command returns exit `0`.

## Evidence Required

- command used
- command output
- operator identity
- timestamp
- incident ticket id
