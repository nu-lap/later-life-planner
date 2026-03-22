# Implementation Checklist

Status: active draft

This checklist translates the current canonical planning docs into a practical execution sequence:

- `docs/auth-plan.md`
- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`

Priority order:

1. Phase 0: product and consistency cleanup
2. Phase 1: Clerk auth foundation
3. Phase 1.5: Azure persistence infrastructure
4. Phase 2: encrypted persistence backbone
5. Phase 3: sync and migration UX
6. Phase 3.5: device-to-device DEK sharing (HPKE)
7. Phase 4: hardening, tests, and operational readiness
8. Phase 5: tests and docs

## Phase 0: Product and Consistency Cleanup

- [x] Remove forbidden user-facing uses of "retirement" where they conflict with the product prompt.
- [x] Update the AI life-vision route prompt to use later-life / freedom-phase language.
- [x] Replace hardcoded financial figures in UI copy with values sourced from `src/config/financialConstants.ts`.
- [x] Align `WITHDRAWAL_ORDER` constants with the actual implemented engine order, or refactor the engine to consume the central constant directly.
- [x] Update `README.md` language so it reflects the current product framing.

## Phase 1: Clerk Auth Foundation

- [x] Add `@clerk/nextjs`.
- [x] Add Clerk environment variable placeholders to `.env.example`.
- [x] Wrap the app with `ClerkProvider`.
- [x] Add `src/middleware.ts` for protected route handling.
- [x] Add `src/app/sign-in/[[...sign-in]]/page.tsx`.
- [x] Add `src/app/sign-up/[[...sign-up]]/page.tsx`.
- [x] Add a shared auth helper for protected server routes.
- [x] Add signed-in header controls:
- [x] User account button
- [x] Save-status area
- [x] Sign-out-safe reset behavior
- [x] Decide whether the disclaimer is pre-auth, post-auth, or both.
  Current decision: post-auth inside the protected planner shell.

## Phase 1.5: Azure Persistence Infrastructure

- [x] Decide whether persistence resources live in the existing `rg-later-life-planner` or a dedicated data resource group.
  Decision: use the existing `rg-later-life-planner` for v1.
- [x] Create Azure Cosmos DB account for planner persistence.
- [x] Choose the Cosmos DB backup mode and retention tier for planner data.
  Recommended: use the lowest-cost option that still meets recovery needs. For MVP, prefer periodic backup by default, or continuous 7-day only if point-in-time restore is required.
  Current: periodic backup, 4h interval, 8h retention, local redundancy.
- [x] Create database `later-life-planner`.
- [x] Create container `user-plans` with partition key `/id`.
- [x] Create an application Key Vault reserved for optional future envelope-key support.
- [x] Enable Key Vault soft delete and purge protection.
- [x] Decide and provision runtime Azure auth for app data access.
  Recommended: Azure Container Apps managed identity with data-plane access to Cosmos DB and Key Vault.
- [x] Wire Azure resource identifiers and access settings into Azure Container Apps.
  Current: deployed via CI/CD `deploy` job env wiring.
- [x] Update CI/CD to set Cosmos DB and Key Vault env vars on deploy.
- [x] Backfill IaC for Cosmos DB, Key Vault, and ACA managed identity (currently provisioned manually).
- [x] Smoke-test non-production access to Cosmos DB and Key Vault before writing persistence code.
  Current: automated post-deploy `persistence-smoke-test` job validates ACA managed identity role wiring and persistence env configuration.
- [x] Document who can run restore and deletion operations for planner data.
- [x] Keep ACR and ACA deployment resources as-is; this phase adds persistence resources rather than changing the release platform.

## Phase 2: Encrypted Persistence Backbone

- [x] Add `src/lib/crypto.ts`.
- [x] Add `src/lib/cosmos.ts`.
- [x] Add authenticated `GET /api/data`.
- [x] Add authenticated `PUT /api/data`.
- [x] Enforce identity from verified Clerk auth only.
- [x] Create the remote planner document only on first successful save or migration.
- [x] Persist ciphertext only; never persist plaintext planner data.
- [x] Introduce `createdAt`, `schemaVersion`, `revision`, and `updatedAt` handling.
- [x] Add validation for ciphertext payload shape and size.
- [x] Keep deletion support-led in the initial persistence release.

## Phase 3: Sync and Migration UX

- [x] Add a canonical planner hydration action to the Zustand store.
- [x] Separate domain state from UI-only state for persistence purposes.
- [x] Add `src/hooks/usePlanSync.ts`.
- [x] Load, decrypt, and hydrate planner state on authenticated startup.
- [x] Debounce encrypt-and-save on canonical planner state changes.
- [x] Add save-state UX:
- [x] Loading
- [x] Saving
- [x] Saved
- [x] Conflict
- [x] Error
- [x] Add localStorage migration prompt for legacy local plans.
- [x] Prevent silent overwrite of an existing remote plan.
- [x] Add a minimal account-data panel for lifecycle actions once the persistence core is stable.
- [x] Add browser-side export of canonical planner data.
- [x] Decide whether users can delete only planner data or must delete the full account.
  Decision: keep deletion support-led in-product for now; no self-serve planner delete until recovery runbooks are validated.
- [x] Add self-serve delete UI only when the support and recovery path is ready.
  Current implementation: gated off and intentionally not exposed.

## Phase 3.5: Device-to-Device DEK Sharing (HPKE)

Goal: enable cross-device decryption without storing the per-user DEK as a browser-local-only string.

Design guide: `docs/device-to-device.md`.

High-level outcome:

- the remote plan remains encrypted with a per-user DEK
- each device has its own keypair
- the DEK is wrapped per-device using HPKE and stored server-side as ciphertext
- a newly signed-in device becomes usable only after an explicit approval on an existing device

Implementation tasks:

- [x] Decide and document the HPKE suite for v1 (RFC 9180), including AAD binding fields.
  Current: `DHKEM(P-256,HKDF-SHA256)` / `HKDF-SHA256` / `AES-256-GCM`, with AAD binding `{ scope, userId, deviceId, requestId, schemaVersion, expiresAt }`.
- [x] Define the Cosmos data model for:
- [x] registered devices (public keys + status)
- [x] per-device wrapped DEK packages
- [x] Add protected API routes for device registration and approval:
- [x] `POST /api/devices` (register new device + public key)
- [x] `GET /api/devices` (list devices and pending approvals)
- [x] `POST /api/devices/:deviceId/approve` (store wrapped DEK package)
- [x] `GET /api/devices/:deviceId/wrapped-dek` (retrieve wrapped DEK package)
- [x] `POST /api/devices/:deviceId/wrapped-dek` (consume wrapped DEK after the recipient confirms decrypt + persistence)
- [x] Add rate limiting rules for the device-approval API surface (polling, approvals, retries, and consume).
- [x] Add a client-side device key store (private key + cached DEK) using IndexedDB.
  Current: device HPKE private key is stored as a non-extractable `CryptoKey` in IndexedDB; DEK is stored encrypted at rest in IndexedDB; when IndexedDB is blocked/unavailable, sync fails fast into local-only mode.
- [x] Add a "device approval required" UX:
- [x] show a copy/paste approval code with `{ deviceId, requestId, expiresAt, publicKeyFingerprint }` (JSON)
- [x] show pending-device list and an approve action on an already-authorized device (paste code + approve)
- [x] On successful approval, unwrap DEK, decrypt remote plan, and continue normal sync.
- [ ] Add audit-friendly server logs for device registration and approvals (metadata only; never plaintext planner data or keys).
- [ ] Add tests that lock the state machine:
- [x] new device cannot decrypt until approved
- [x] approval is single-use and expires
- [ ] wrong user cannot approve or fetch wrapped keys
- [ ] revoke/rotate behavior is well-defined

### Phase 3.5 UX Extension: Usable Key Exchange

Current status: the underlying security model is in place, but the UX for approving devices is too confusing (copy/paste JSON on the approving device, and device controls embedded in the main planner page).

Goal: keep the “new device” modal, but move the approving-device controls out of the planner flow and make approval link-first (QR + link), with paste-only as a fallback.

Implementation tasks:

- [x] Remove device approvals and sync controls from the main planner page UI.
  Current: `AccountDataPanel` is rendered in `src/app/page.tsx` on the planner shell.
- [x] Add a dedicated authenticated account area:
  - [x] `GET /account` (sync status, export, reload remote)
  - [x] `GET /account/devices` (device list + pending approvals + approval flow)
- [x] Add a header entry point that does not interrupt the planning journey:
  - [x] “Account” link/button next to the user button
  - [x] pending approvals badge (count) that links to `/account/devices`
- [x] Make the new-device modal approval UX link-first:
  - [x] show QR code for an approval link using a URL fragment (client-side only)
  - [x] add “Copy approval link” button
  - [x] keep “Copy approval code” as a fallback (advanced)
- [x] Make the approving-device UX understandable:
  - [x] approve screen supports opening an approval link (auto-prefill) and pasting code as fallback
  - [x] pending device list uses friendly labels and expiry countdown; hide raw ids behind a “details” toggle
- [x] Update tests to cover the new UX:
  - [x] header badge/link presence and navigation
  - [x] approval link parsing and prefill
  - [x] fallback paste still works
  - [x] regression tests for the approval state machine remain passing

## Phase 4: Security and Reliability

- [ ] Add optimistic concurrency handling using `revision`.
- [ ] Add route rate limiting for protected data routes.
- [ ] Add secure handling for malformed ciphertext and corrupt payloads.
- [ ] Ensure sign-out clears decrypted planner state from memory.
- [ ] Ensure planner plaintext never reaches logs.
- [ ] Define device revocation and DEK rotation rules and write a runbook for recovery scenarios.
- [ ] Write and test point-in-time restore runbooks for planner data.
- [ ] Write and test user-deletion runbooks, including backup-expiry handling.
- [ ] Ensure erased user data is not reintroduced after restore operations.
- [ ] Decide whether an inactive-account review or purge policy is required.
- [ ] Complete a DPIA or documented DPIA screening decision before production persistence launch.
- [ ] Document whether a DPO is required and record the reasoning.

## Phase 5: Tests and Docs

- [ ] Add auth route tests.
- [ ] Add protected API auth tests.
- [ ] Add crypto round-trip tests.
- [ ] Add sync-state and conflict tests.
- [ ] Add migration-flow tests.
- [ ] Update `README.md` to reflect authenticated encrypted persistence.
- [ ] Update `.env.example` with Clerk, Cosmos, and Key Vault placeholders.
- [ ] Document deployment assumptions for the chosen hosting environment.
- [ ] Document retention, deletion, export, and backup-recovery policy for user data.
- [ ] Publish a privacy notice before production persistence launches.
- [ ] Decide the initial cookie posture and keep it essential-only unless a consent mechanism is ready.
- [ ] Confirm controller-processor contracts or equivalent terms for NxLap Ltd with Clerk, Azure, and other relevant vendors.
- [ ] Confirm the ICO data protection fee position for NxLap Ltd before launch.

## Immediate Next Slice

Recommended next implementation slice:

1. Implement device registration and per-device wrapped DEK storage (Phase 3.5).
2. Add the device approval UX flow (QR/short code + approve from existing device).
3. Migrate sync encryption away from browser-local-only DEK storage.
4. Add tests for the device approval state machine and rate limiting.
