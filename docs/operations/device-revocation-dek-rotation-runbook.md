# Device Revocation and DEK Rotation Runbook

Status: active  
Owner: `nxlap-data-ops`  
Last reviewed: 2026-03-25

## Purpose

Define the operational rules and recovery procedure when a device is lost, compromised, or no longer trusted.

This runbook covers:

- revoking device access in the device directory
- rotating the planner DEK after compromise
- evidence to capture for security and compliance review

## Security Rules

1. Device status is authoritative on the server:
- `pending`: waiting for approval
- `active`: approved and trusted
- `revoked`: permanently untrusted for future approvals

2. A revoked `deviceId` must never be re-activated with a different key.

3. Any confirmed device compromise requires DEK rotation.

4. Revocation alone is not enough for confidentiality recovery.
- A previously compromised device may already hold an old DEK.
- Rotation is required to prevent future decrypt of newly saved planner ciphertext.

## Preconditions

- Incident ticket exists with severity and requester identity verified.
- At least one trusted `active` device is available.
- Operator is in `nxlap-data-ops` and has approved temporary Cosmos write access.

## Procedure A: Revoke a Device

1. Identify user and device record:
- `id = <userId>:device:<deviceId>`
- confirm record belongs to the target `userId`

2. Update the device record:
- set `status = "revoked"`
- set `requestId = null`
- set `requestExpiresAt = null`
- update `lastSeenAt` to current UTC timestamp

3. Verify:
- `GET /api/devices` for the user shows the device as `revoked`
- new approvals for that `deviceId` fail

4. Record evidence in the incident ticket:
- operator
- timestamp
- device id
- reason for revocation

## Procedure B: Rotate DEK After Compromise

1. Revoke compromised devices first (Procedure A).

2. On a trusted active device:
- sign in
- confirm remote plan can be decrypted
- export canonical planner JSON as a rollback artifact

3. Generate a new DEK and re-encrypt planner state from the trusted device.
- Rotation must produce a new encrypted planner blob revision.
- Old DEK material must not be reused for new saves.

4. Re-approve remaining trusted devices so each receives a wrapped package for the new DEK.

5. Verify post-rotation:
- trusted device can load and save plan
- revoked device cannot be approved
- stale wrapped DEK packages for the compromised request ids are expired or consumed

6. Capture rotation evidence:
- user id
- old revision and new revision
- list of revoked devices
- list of re-approved devices
- operator and approver identities

## Recovery Notes

- If no trusted active device remains, account recovery is support-led.
- Recovery path is "new approval chain" from a newly verified device, followed by DEK rotation once access is restored.

## Rollback

Use exported canonical planner JSON from step B2 only if rotation fails mid-process.

- restore data on a trusted device
- re-encrypt with the newly generated DEK
- save as the next revision

Do not restore encrypted payloads from compromised devices.

