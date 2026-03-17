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
6. Phase 4: hardening, tests, and operational readiness
7. Phase 5: tests and docs

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
- [x] Create an application Key Vault for wrapped-key support.
- [x] Enable Key Vault soft delete and purge protection.
- [x] Decide and provision runtime Azure auth for app data access.
  Recommended: Azure Container Apps managed identity with data-plane access to Cosmos DB and Key Vault.
- [x] Wire Azure resource identifiers and access settings into Azure Container Apps (manual update).
- [ ] Update CI/CD to set Cosmos DB and Key Vault env vars on deploy.
- [ ] Backfill IaC for Cosmos DB, Key Vault, and ACA managed identity (currently provisioned manually).
- [ ] Smoke-test non-production access to Cosmos DB and Key Vault before writing persistence code.
- [x] Document who can run restore and deletion operations for planner data.
- [x] Keep ACR and ACA deployment resources as-is; this phase adds persistence resources rather than changing the release platform.

## Phase 2: Encrypted Persistence Backbone

- [ ] Add `src/lib/crypto.ts`.
- [ ] Add `src/lib/cosmos.ts`.
- [ ] Add authenticated `GET /api/data`.
- [ ] Add authenticated `PUT /api/data`.
- [ ] Enforce identity from verified Clerk auth only.
- [ ] Create the remote planner document only on first successful save or migration.
- [ ] Persist ciphertext only; never persist plaintext planner data.
- [ ] Introduce `createdAt`, `schemaVersion`, `revision`, and `updatedAt` handling.
- [ ] Add validation for ciphertext payload shape and size.
- [ ] Keep deletion support-led in the initial persistence release.

## Phase 3: Sync and Migration UX

- [ ] Add a canonical planner hydration action to the Zustand store.
- [ ] Separate domain state from UI-only state for persistence purposes.
- [ ] Add `src/hooks/usePlanSync.ts`.
- [ ] Load, decrypt, and hydrate planner state on authenticated startup.
- [ ] Debounce encrypt-and-save on canonical planner state changes.
- [ ] Add save-state UX:
- [ ] Loading
- [ ] Saving
- [ ] Saved
- [ ] Conflict
- [ ] Error
- [ ] Add localStorage migration prompt for legacy local plans.
- [ ] Prevent silent overwrite of an existing remote plan.
- [ ] Add a minimal account-data panel for lifecycle actions once the persistence core is stable.
- [ ] Add browser-side export of canonical planner data.
- [ ] Decide whether users can delete only planner data or must delete the full account.
- [ ] Add self-serve delete UI only when the support and recovery path is ready.

## Phase 4: Security and Reliability

- [ ] Add optimistic concurrency handling using `revision`.
- [ ] Add route rate limiting for protected data routes.
- [ ] Add secure handling for malformed ciphertext and corrupt payloads.
- [ ] Ensure sign-out clears decrypted planner state from memory.
- [ ] Ensure planner plaintext never reaches logs.
- [ ] Define key-wrapping integration path with Azure Key Vault.
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

1. Create Cosmos DB and application Key Vault resources.
2. Choose the Cosmos backup tier and enable Key Vault soft delete and purge protection.
3. Decide the runtime auth path from Azure Container Apps to Cosmos DB and Key Vault.
4. Wire resource identifiers and access settings into the deployed app environment.
5. Smoke-test connectivity from the running app environment.
6. Start `src/lib/crypto.ts`, `src/lib/cosmos.ts`, and the protected persistence routes.
