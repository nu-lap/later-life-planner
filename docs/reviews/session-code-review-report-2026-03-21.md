# Session Code Review Report (2026-03-21)

This document collates all issues raised by automated/code review feedback during this session, across multiple PRs/branches, and records how each item was resolved (or why it was deferred).

## Scope

- Phase 3: authenticated plan sync + migration UX (PR #110 lineage)
- Phase 3.5: device-to-device DEK sharing + device approval flow (PR #113 lineage)

## Findings And Outcomes

| ID | Severity | Area | Location | Issue | Outcome |
| --- | --- | --- | --- | --- | --- |
| R1-P1 | P1 | Migration durability | `src/hooks/usePlanSync.ts` | **Data-loss path**: legacy local cache was cleared before the remote save was confirmed; a failed save could leave the user with neither local nor remote data. | Fixed in `4e7d2f9` ("fix: keep legacy cache until import save succeeds"). |
| R1-P2 | P2 | Local persistence | `src/store/plannerStore.ts` | **Signed-out durability regression**: when Clerk was enabled, only UI state persisted for signed-out users, dropping domain data on refresh. | Fixed in `95a23f6` ("fix: restore full local persistence in no-auth mode"). |
| R2-P1 | P1 | HPKE context binding | `src/hooks/usePlanSync.ts` | **AAD trust bug**: recipient device accepted server-provided AAD rather than recomputing expected AAD locally. | Fixed by recomputing expected AAD and validating equality before unwrap (landed on Phase 3.5 branch; see `a5460b4`). |
| R2-P2 | P2 | Wrapped-DEK expiry | `src/lib/cosmos.ts` (`approveDeviceWrappedDek`) | **Expiry trust bug**: wrapped-DEK package expiry was treated as client-controlled (input-based) rather than server-authoritative. | Fixed by sourcing wrapped-DEK expiry from the device request record (`approveDeviceWrappedDek` used `device.requestExpiresAt`). Later strengthened by enforcing server TTL on device registration (`7400a1c`). |
| R2-P2 | P2 | Input validation | `src/app/api/devices/route.ts` | **Public key validation gap**: device registration accepted base64 but did not enforce expected byte length for X25519. | Fixed: enforce 32-byte public key via `isExpectedBase64ByteLength(..., 32)` (present on Phase 3.5 branch; validated during later reviews). |
| R3-P0 | P0 | Threat model (server key substitution) | `src/hooks/usePlanSync.ts` + `/api/devices` directory | **Key substitution**: approver wrapped DEK to a `publicKey` fetched from the server without any pinning/authentication, allowing a tampered directory to steal the DEK. | Mitigated in two layers: (1) approval requires pasting a code from the new device that includes a locally computed key fingerprint, and the approver verifies server key matches the fingerprint (`a5460b4`); (2) prevent device public-key replacement for an existing `deviceId` (`9deddf3`). |
| R3-P1 | P1 | Availability/correctness | `src/lib/cosmos.ts` | **One-time consumption ordering**: server consumed the wrapped-DEK and then performed other writes that could fail, potentially stranding the requester. | Initially reduced failure impact (`e48e45f`), then redesigned so server does not consume on fetch; consumption happens only after the recipient confirms successful decrypt/persist (`fffded1`). |
| R3-P1 | P1 | IndexedDB correctness | `src/lib/indexedDbKv.ts` | **Transaction completion bug**: `withStore` resolved on request success rather than `tx.oncomplete`, masking aborts. | Fixed in `a3e1592` ("fix: wait for IndexedDB transactions to complete"). |
| R3-P1 | P1 | Key material handling | `src/lib/deviceCrypto.ts` | **Secret persistence risk**: device private keys and the user DEK were stored as plaintext base64, and DEK generation/export was extractable. | Mitigated by encrypting at rest in IndexedDB using a non-extractable per-user AES-GCM key stored as a `CryptoKey` (`04d74fa`). |
| R3-P2 | P2 | UX safety | `src/components/AccountDataPanel.tsx` | **Approval code not enforced**: UI displayed an approval code, but approval action only used `deviceId`, making it easier to approve the wrong/injected device. | Fixed: approval now requires pasting the JSON approval code and validating `{deviceId, requestId, expiresAt, publicKeyFingerprint}` (`a5460b4`). |
| R4-P1 | P1 | Protocol/availability | `src/lib/cosmos.ts` | **Consume-before-confirm DoS**: wrapped-DEK was made unavailable after first fetch, even if recipient failed to decrypt/persist or crashed. Also enabled trivial session-based prefetch DoS. | Fixed by splitting into fetch (GET) and explicit consume (POST) after successful decrypt/persist (`fffded1`). |
| R4-P2 | P2 | Input validation | `src/app/api/devices/[deviceId]/wrapped-dek/route.ts` | **Unbounded params**: `deviceId` and `requestId` were not length-validated in the wrapped-DEK polling route, enabling avoidable 500s/DoS. | Fixed in `39089b9` ("fix: validate wrapped DEK polling params"). |
| R4-P2 | P2 | Idempotency | `src/lib/cosmos.ts` (`approveDeviceWrappedDek`) | **Non-idempotent approval**: duplicate creates returned conflicts and bubbled into 500s/failed approvals under retries. | Fixed: treat wrapped-DEK create conflicts as success (`c89f6cc`). |
| R5-M1 | MEDIUM | Browser capability | `src/hooks/usePlanSync.ts` | **IndexedDB unavailable**: in private/hardened browsers, IndexedDB may be blocked/undefined; key storage became a no-op leading to re-generated DEKs and perpetual approval loops, making remote plans undecryptable after reload. | Fixed: probe IndexedDB availability and fail fast into local-only mode with a clear terminal error; do not attempt to generate ephemeral sync keys (`5115c13`). |
| R6-P1 | P1 | Device directory integrity | `src/lib/cosmos.ts` (`upsertDeviceRegistration`) | **Overwrite existing deviceId**: an authenticated session could re-register another deviceId with a new public key, enabling key-substitution despite approval UX. | Fixed: device public keys are immutable per `deviceId` (key continuity enforced); conflicts return 409 (`9deddf3`). |
| R6-P2 | P2 | Approval expiry bounds | `src/app/api/devices/route.ts` | **Client-controlled expiry**: requester could set arbitrarily long `requestExpiresAt` windows. | Fixed: server enforces a fixed TTL (`now + 10m`) and returns it; client uses server expiry for polling and AAD (`7400a1c`). |
| R7-M1 | MEDIUM | Browser compatibility | `src/lib/deviceCrypto.ts` (HPKE suite) | **Chrome WebCrypto failure**: device approval could fail with `Failed to execute 'importKey' on 'SubtleCrypto': Algorithm: Unrecognized name` when using `DHKEM(X25519, HKDF-SHA256)` for the HPKE KEM. | Fixed: switch HPKE KEM to `DHKEM(P-256,HKDF-SHA256)` and update public-key validation length (65-byte uncompressed), suite metadata, and IDB key prefixes (`c1ab49e`). |
| R8-M1 | MEDIUM | Device approval reliability | `src/hooks/usePlanSync.ts` | **Stale device directory**: approving device could report `Device approval request not found` even though the pending request exists in Cosmos, if the approver’s local `devices` state was stale/empty at approval time. | Fixed: `approvePendingDevice` now re-fetches the device directory immediately before validating/approving the pasted code (adds test coverage) (`d4fe08e`). |
| R9-M1 | MEDIUM | Browser compatibility | `src/lib/deviceCrypto.ts` + `src/hooks/usePlanSync.ts` | **Chrome decrypt failure after approval**: new device could fail after approval with `OperationError: Data provided to an operation does not meet requirements` when attempting to import/deserialize a stored P-256 HPKE private key. | Fixed: store the HPKE private key as a non-extractable `CryptoKey` in IndexedDB and pass it directly to HPKE open (no serialize/import roundtrip) (`51f2281`). |
| R10-M1 | MEDIUM | UX/layout | `src/components/account/DeviceApprovalsPanel.tsx` | **Button text wraps awkwardly**: on `/account/devices` the “Back to account” (and other actions) could wrap onto 2 lines because the left header text competed for width, compressing the button group. | Fixed: allow the left header block to shrink (`min-w-0`) and prevent action buttons from wrapping (`flex-shrink-0` + `whitespace-nowrap`) (`667d5c2`). |
| R11-M1 | MEDIUM | UX/trust | `src/app/account/devices/approve/page.tsx` | **Approve-link landing page did not load pending devices**: `/account/devices/approve` prefilled the approval link/code but did not call `refreshDevices()`, so the pending device list showed empty and users lacked visual confirmation of what they were approving. | Fixed: call `refreshDevices()` on mount (commit `36e5e24`). |

## Notable Session Decisions

| Topic | Decision | Impact |
| --- | --- | --- |
| Legacy localStorage key migration | A prior change to accept legacy local DEK material stored in localStorage was reverted (`43a7bc5` reverted `e3304b9`) because there are no existing users. | Removes migration code paths and reduces bloat; re-introducing migration support later would require a new design decision and implementation. |

## Current Status (End Of Session)

- Device approval flow now:
  - binds approval to a user-verifiable approval code (includes request context and public key fingerprint)
  - uses server-enforced request expiry for both UI and HPKE AAD
  - avoids server-side consume until the recipient confirms successful decrypt + persistence
  - validates key sizes and route parameters to avoid avoidable failures
  - fails fast when IndexedDB is unavailable (local-only mode, no ephemeral DEK generation)

---

## Deep Security Review

- [`deep-security-review-phase-3-5-2026-03-21.md`](./deep-security-review-phase-3-5-2026-03-21.md) — initial review (X25519 KEM)
- [`deep-security-review-phase-3-5-2026-03-22.md`](./deep-security-review-phase-3-5-2026-03-22.md) — updated review after R7/R8/R9 fixes (P-256 KEM, non-extractable CryptoKey, stale-directory fix)
- [`deep-security-review-phase-3-5-ux-extension-2026-03-22.md`](./deep-security-review-phase-3-5-ux-extension-2026-03-22.md) — review of Phase 3.5 UX Extension (fragment-based approval link, account pages, QR flow)
