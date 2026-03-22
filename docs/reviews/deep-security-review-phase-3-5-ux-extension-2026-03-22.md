# Deep Security Review — Phase 3.5 UX Extension (2026-03-22)

Branch reviewed: `feat/phase-3-5-key-exchange-ux`
Base review: [`deep-security-review-phase-3-5-2026-03-22.md`](./deep-security-review-phase-3-5-2026-03-22.md)
All tests: **258 passed (258)**

This review covers the UX Extension layer added on top of the previously reviewed HPKE core. It does not re-examine the cryptographic protocol, which was covered in the 2026-03-22 base review. It focuses on the new presentation layer, the approval link mechanism, the account route tree, and how the new UI interacts with the existing security model.

---

## Executive Summary

The UX Extension moves device approval controls out of the main planner shell into a dedicated `/account/devices` area, replaces copy/paste-JSON approval with a QR/link-first flow, and adds an account overview page. The changes are well-structured and the key design decision — putting the approval code in a URL fragment rather than the path or query string — is correct and eliminates a class of server-side leakage risks.

The prior security review issued two pre-launch blockers (H1 and M3). This UX Extension review originally noted they were not addressed in the UX branch alone; both should be closed before production. (M3 is now fixed in commit `cb1d15e`.)

No new critical or high findings are introduced by the UX extension itself. Two medium-severity UX/security gaps are introduced.

**Would you approve this design for production handling sensitive encrypted user data?**

Not yet. The same pre-launch blockers from the base review (H1 and M3) must be closed first. The UX layer is otherwise close to production-ready. (M3 is now fixed in commit `cb1d15e`.)

**Top three concerns:**

1. **H1 (inherited, unresolved)** — The approve endpoint never verifies that the approving device is `status === 'active'`. A compromised or revoked device can still wrap the DEK.
2. **UX-M1** — The `/account/devices/approve` page prefills from `window.location.href` but does not call `refreshDevices()` on mount. The pending device list renders empty while the approval textarea is already filled, leaving the user with no visible device to relate the approval to. (Fixed in commit `36e5e24`.)
3. **M3 (inherited, unresolved)** — `upsertDeviceRegistration` has no try/catch around `container.items.create`; a concurrent first-registration race yields an unhandled 500. (Fixed in commit `cb1d15e`.)

---

## Architecture Understanding

The UX Extension adds three layers:

### 1. Approval link encoding (`src/lib/deviceApprovalLink.ts`)

The approval code JSON (`{v, deviceId, requestId, expiresAt, publicKeyFingerprint}`) is base64-encoded (ASCII-safe `btoa`) and URL-encoded, then placed in a URL fragment: `/account/devices/approve#code=<encoded>`. The fragment is never sent to the server in HTTP requests, never appears in server logs, and is not included in the HTTP Referer header when navigating away.

`extractApprovalCodeJson` accepts three forms:
- Raw JSON (`{…}`)
- Full URL (parsed with `new URL`, fragment extracted)
- Raw fragment string (`#code=…` or `code=…`)

### 2. Account route tree (`src/app/account/`)

Three new pages, all protected by Clerk middleware:
- `/account` — sync status, revision, last-saved, link to manage devices
- `/account/devices` — pending approvals list + paste/approve form
- `/account/devices/approve` — same form, prefilled from `window.location.href`

All three render `usePlanSync()` for state; none introduce new API calls.

### 3. Header and modal updates

`DeviceApprovalModal` now shows a QR code (lazily imported `qrcode` library) and the approval link alongside the existing raw-JSON fallback. The header's `authControls` slot surfaces an Account link and a pending-approval badge.

### Trust boundaries

No new trust boundaries. The account pages consume the same `usePlanSync` hook state as before. No new server routes were added. The `usePlanSync` hook's cryptographic operations are unchanged.

### Assumptions carried forward

- Clerk JWT remains the sole identity anchor.
- `approvePendingDevice` re-fetches the device directory immediately before validation (R8 fix).
- DEK wrapping and HPKE remain in `deviceCrypto.ts`; the UI is a thin shell.

---

## Critical Findings

None introduced by the UX Extension.

---

## High Findings

None introduced by the UX Extension.

See **H1** in [`deep-security-review-phase-3-5-2026-03-22.md`](./deep-security-review-phase-3-5-2026-03-22.md) — unresolved pre-launch blocker.

---

## Medium Findings

### UX-M1 — Approve page renders empty pending-device list while approval textarea is prefilled

- **Severity:** Medium
- **Where:** `src/app/account/devices/approve/page.tsx`, `src/components/account/DeviceApprovalsPanel.tsx`
- **Why it is a problem:** The approve page sets `prefill = window.location.href` on mount and does not call `refreshDevices()`. When the approver follows a QR/link on a freshly loaded session, `sync.devices` is initially empty. The approval textarea is immediately prefilled with the encoded link, but the "Pending approvals" section shows "No pending device approvals." The user is being asked to approve a device they cannot see in the list. This creates a meaningful trust UX gap: a user has no visual confirmation that they are approving the device they think they are approving before they click the button.
- **Exploit scenario:** An attacker who can deliver a crafted `/account/devices/approve#code=<encoded>` URL to a victim causes the victim's approval form to be prefilled with the attacker's device code. Because no pending device is shown (devices not loaded), the victim has no UI-level context to detect the substitution. The fingerprint check in `approvePendingDevice` still catches key-substitution at the API level, but the user cannot see the device label or request ID in the UI to manually cross-check.
- **Concrete remediation:**
  1. Call `void refreshDevices()` in the `useEffect` on the approve page (same as the devices list page does).
  2. Optionally, disable the "Approve device" button until `sync.devices` has been loaded at least once, or until the prefilled code is decoded and matched to a visible pending entry.
- **Status:** Fixed in commit `36e5e24` (`fix(ux): refresh device directory on approve-link landing`).
- **Type:** Implementation flaw.

### UX-M2 (inherited, unresolved) — M1: Suite identifiers and plan ID not included in AAD

Not newly introduced by this branch. Still open. See base review.

---

## Low Findings

### UX-L1 — `btoa` in `encodeApprovalCodeToFragment` throws on non-ASCII input without a descriptive error

- **Severity:** Low
- **Where:** `src/lib/deviceApprovalLink.ts:8`
- **Why it is a problem:** `b64EncodeAscii` calls `btoa(value)`, which throws `DOMException: The string to be encoded contains characters outside of the Latin1 range` if given non-ASCII characters. The approval code JSON currently only contains UUIDs, ISO dates, and hex/base64 fingerprints — all ASCII-safe. However, if a future `label` field or other user-controlled string were added to the code JSON, `buildDeviceApprovalLink` would throw an uncaught exception in `DeviceApprovalModal`'s `useEffect`. The error would not surface to the user.
- **Concrete remediation:** Use `encodeURIComponent` + `unescape` or `TextEncoder` + `Uint8Array` → base64 for a Unicode-safe implementation, or add an explicit ASCII check and throw with a descriptive message.
- **Type:** Implementation flaw (latent).

### UX-L2 — No input size limit in `extractApprovalCodeJson`

- **Severity:** Low
- **Where:** `src/lib/deviceApprovalLink.ts:32`
- **Why it is a problem:** `extractApprovalCodeJson` accepts any string length without a size gate. A very large paste (e.g., 10 MB) is passed through `new URL()` and `decodeURIComponent`, which on a low-powered device or within a constrained jsdom environment could cause perceptible latency. This is a client-side concern only; the server validates all inputs independently.
- **Concrete remediation:** Add a `MAX_INPUT_LENGTH` guard (e.g., 4096 chars) before processing.
- **Type:** Implementation flaw (minor).

### UX-L3 — `countPendingApprovals` logic duplicated

- **Severity:** Low
- **Where:** `src/app/account/page.tsx:10` and `src/app/page.tsx:166`
- **Why it is a problem:** Both files implement the same pending-approval count with the same `status === 'pending' && requestExpiresAt > now` logic inline. If the definition of a pending approval changes (e.g., a new status enum value, a different expiry field), the two sites may diverge.
- **Concrete remediation:** Export `countPendingApprovals` from `src/lib/deviceApprovalLink.ts` or a shared util module and import it in both files.
- **Type:** Implementation quality.

### UX-L4 — Azure AD application ID hardcoded in `.well-known` route

- **Severity:** Low
- **Where:** `src/app/.well-known/microsoft-identity-association.json/route.ts:6`
- **Why it is a problem:** The Azure AD application ID (`1bad3129-83bf-4d79-8cac-1ab7410ea7ec`) is a public identifier, not a secret, so embedding it in source is not a security vulnerability. However, it ties the deployed code to a single application registration. If the app registration changes or is rotated, a code change and deploy is required.
- **Concrete remediation:** Move to `process.env.AZURE_AD_APPLICATION_ID` with a fallback compile-time assertion. Document that this is non-secret.
- **Type:** Maintainability.

### UX-L5 — `AccountLayoutShell` no-op `onReset` handler

- **Severity:** Low
- **Where:** `src/components/account/AccountLayoutShell.tsx:19`
- **Why it is a problem:** `<Header onReset={() => {}} showPlannerActions={false}>` passes a silent no-op as the reset handler. The Reset button is hidden by `showPlannerActions={false}`, so this is safe today. If `showPlannerActions` were ever accidentally set to `true` on an account layout page, the Reset action would silently do nothing, which could confuse users expecting a plan reset.
- **Concrete remediation:** Pass a handler that throws `new Error('Reset is not available on account pages')`, or remove the `onReset` prop from the `Header` interface when `showPlannerActions` is false via a discriminated prop union.
- **Type:** Implementation quality (fragile).

---

## Cryptography Assessment

No cryptographic changes in this branch. The HPKE core, AAD construction, DEK wrapping, key storage, and fingerprint verification are unchanged from the base reviewed state.

The fragment-based approval link design is **cryptographically sound for its stated purpose**: the approval code is not secret (it contains only a public key fingerprint and identifiers that are already server-side), and placing it in a URL fragment rather than the path or query string correctly prevents server-log leakage and HTTP Referer leakage.

The QR code is generated entirely in the browser from the fragment-based URL. No secret material is involved.

**Residual risks from base review not addressed here:**

| Risk | Status |
| --- | --- |
| Authenticity (no sender auth in HPKE base mode) | Open (H2, accepted by design) |
| Forward secrecy (per-session, not per-message) | Acceptable |
| Replay (AAD binds requestId + expiresAt) | Mitigated |
| Downgrade (suite not in AAD) | Open (M1) |
| Key substitution (fingerprint check + key immutability) | Mitigated |
| Recipient binding (AAD binds deviceId) | Mitigated |
| Sender binding (none) | Open (H2, accepted by design) |
| Metadata binding (planId not in AAD) | Open (M2) |
| Revocation semantics (no UI, no runbook) | Open (Phase 4) |
| Key separation (KEK / DEK / HPKE keys are distinct) | Sound |
| Misuse resistance (non-extractable CryptoKey, IDB only) | Sound |

---

## Authorization and Lifecycle Assessment

### Device onboarding (unchanged)
No change. Covered in base review.

### Device approval — new UX flow
Approval is now initiated via QR code or link. The cryptographic checks (`approvePendingDevice` re-fetching the device directory, fingerprint validation, AAD binding) are unchanged. The UX presentation layer does not weaken these controls.

**Gap:** The approve page (`/account/devices/approve`) now loads devices on mount so the pending-device list is populated when arriving from a QR/link. (Fixed by commit `36e5e24`.)

**H1 remains open:** The approve API endpoint does not verify that the approving device is `status === 'active'`. Any authenticated user session — including one from a compromised or pending device — can call `POST /api/devices/:deviceId/approve` and wrap the DEK for any device in the directory.

### Active device list
There is no UI to view or revoke active devices. The `/account/devices` page shows only `status === 'pending'` devices. This is a known gap (Phase 4 item in the checklist). It means users cannot audit which devices hold a wrapped DEK copy or revoke access from a compromised device through the UI. This is acceptable pre-launch if the phase 4 hardening work is tracked, but the absence of any revocation path is a meaningful security gap for a system that wraps the DEK per device.

### Concurrent first-registration (M3)
`upsertDeviceRegistration` now wraps `container.items.create` in a try/catch and handles 409/412 conflicts by re-reading and returning the existing device document. (Fixed in commit `cb1d15e`.)

### Re-sharing, rotation, recovery
Unchanged from base review. No runbook yet.

---

## Testing Gaps

### New tests added in this branch

| Test file | Tests | Coverage |
| --- | --- | --- |
| `tests/unit/deviceApprovalLink.test.ts` | 3 | Encode/decode roundtrip; raw JSON; raw fragment |
| `tests/ui/header.test.tsx` | 2 | `showPlannerActions` prop behavior |
| `tests/ui/deviceApprovalsPanel.test.tsx` | 1 | `defaultApprovalInput` prefill |
| `tests/ui/usePlanSyncDeviceApproval.test.tsx` | 3 | Approval prompt open; closed after DEK unwrap; IndexedDB unavailable fallback |

### Missing tests

| Priority | Test | Why valuable |
| --- | --- | --- |
| HIGH | Approve page calls `refreshDevices()` on mount | Directly tests the UX-M1 fix; ensures pending device list is populated when the approve link is opened |
| HIGH | `extractApprovalCodeJson` with a link whose `deviceId` doesn't match any pending device | Ensures "Device approval request not found" is surfaced clearly |
| MEDIUM | `extractApprovalCodeJson` with oversized input (> 4096 chars) | Guards UX-L2 |
| MEDIUM | `encodeApprovalCodeToFragment` with a non-ASCII string | Guards UX-L1 (expected throw) |
| MEDIUM | `DeviceApprovalsPanel` with an expired pending device | Ensures expired entries are filtered from the list |
| MEDIUM | Header pending-approvals badge count and link navigation | Validates badge logic and routing |
| LOW | `buildDeviceApprovalLink` produces a fragment URL (not path/query) | Locks the security-critical fragment placement |
| LOW | `extractApprovalCodeJson` returns null for empty/whitespace input | Edge-case regression |

### Still missing from base review (unchanged)

- Concurrent Cosmos writes (require emulator or ETag mock harness): concurrent approval race
- Server-side consume semantics (require emulator)
- V2 CryptoKey IDB roundtrip (requires Playwright)
- Revoked device flows
- `getUserDekB64` with unsupported version

---

## Suggested Fixes in Priority Order

1. **(Pre-launch, H1)** Add `approverDeviceId` to `POST /api/devices/:deviceId/approve` body; server verifies `approverDeviceId` has `status === 'active'` for the same `userId`. Closes the compromised-device DEK-substitution path.

2. **(Pre-launch, M3)** Wrap `container.items.create` in `upsertDeviceRegistration` with a try/catch; treat 409/412 as `DeviceRegistrationConflictError` and re-read + return the existing document.

3. **(UX-M1)** Add `useEffect(() => { void refreshDevices(); }, [refreshDevices])` to `AccountDevicesApprovePageWithClerk` — same pattern already used in `AccountDevicesPageWithClerk`.

4. **(M5)** Add `isExpectedBase64ByteLength(value.enc, 65)` and minimum ciphertext byte-length check (≥48 bytes, representing a 0-byte plaintext AEAD overhead) in `WrappedDekPackageSchema` in the approve route.

5. **(M1/M2)** Add `kem`, `kdf`, `aead`, `planId: 'default'` to `plannerDekWrapAad`; validate `pkg.suite` at recipient against known-good constants before calling `unwrapDekToBase64`.

6. **(UX-L1)** Replace `btoa` with a Unicode-safe base64 encoder in `encodeApprovalCodeToFragment`.

7. **(UX-L2)** Add input length guard in `extractApprovalCodeJson`.

8. **(UX-L3)** Extract `countPendingApprovals` to a shared module.

---

## Approval Recommendation

**Approve with changes**

The UX Extension itself does not introduce new critical or high security issues. The fragment-based link design, authentication wiring, and thin-shell UI pattern are sound. The `approvePendingDevice` cryptographic checks are unchanged and still correct.

However:

- **H1 (pre-launch blocker)** must be resolved before this goes to production. The approve flow has a polished new UX, which will make it more accessible to users — but the underlying server endpoint still allows a compromised device to wrap the DEK. The improved UX makes this more urgently visible.
- **UX-M1** is resolved: the approve-link landing page now calls `refreshDevices()` on mount so pending device context is visible (commit `36e5e24`).
- **M3** is resolved: concurrent registration create conflicts are handled and no longer bubble as unhandled 500s (commit `cb1d15e`).

All other open items are pre-launch desirable or Phase 4 hardening work, not blockers.
