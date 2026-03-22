# Deep Security Review — Phase 3.5 Device Approval / HPKE (2026-03-22)

Branch: `feat/phase-3-5-device-approval-hpke`
Review conducted per `docs/prompts/deep-security-code-review.md`.
Reviewer: Claude (claude-sonnet-4-6).
Supersedes: `deep-security-review-phase-3-5-2026-03-21.md`

Files reviewed: `src/lib/deviceCrypto.ts`, `src/hooks/usePlanSync.ts`, `src/lib/cosmos.ts`, `src/lib/indexedDbKv.ts`, `src/lib/crypto.ts`, `src/lib/deviceApi.ts`, `src/app/api/devices/route.ts`, `src/app/api/devices/[deviceId]/approve/route.ts`, `src/app/api/devices/[deviceId]/wrapped-dek/route.ts`, `src/components/AccountDataPanel.tsx`, `src/components/DeviceApprovalModal.tsx`, `tests/unit/deviceCrypto.test.ts`, `tests/ui/usePlanSyncDeviceApproval.test.tsx`.

## Changes since 2026-03-21 review

The following issues from the prior review have been resolved:

| Prior ID | Resolution |
|---|---|
| R7 (Chrome WebCrypto failure) | KEM switched from `DHKEM(X25519, HKDF-SHA256)` to `DHKEM(P-256, HKDF-SHA256)`. Public key length check updated to 65 bytes. IDB prefixes namespaced to `.p256.`. |
| R8 (Stale device directory) | `approvePendingDevice` now calls `fetchDevices()` immediately before validation, discarding stale local state. |
| R9 (Chrome decrypt failure) | Private key stored as a non-extractable `CryptoKey` in `StoredHpkeDeviceKeyPairV2`; passed directly to HPKE open without serialize/deserialize round-trip. |
| L3 (Plaintext private key in closure memory) | Resolved by V2: the private key is a `CryptoKey` handle, never a base64 string in application memory. |
| L4 (Legacy upgrade returns plaintext private key) | Resolved by V2: legacy V1 and pre-V1 formats fall through to fresh keypair generation; no migration path emits plaintext bytes. |

The following issues from the prior review remain open and are carried forward below: H2, M1, M2, M4. M5 is updated with P-256-specific byte lengths. L1 and L2 are carried forward unchanged. (H1 is now fixed in commit `9dd3d9e`; M3 is now fixed in commit `cb1d15e`.)

---

### Executive Summary

The branch has made meaningful progress since the 2026-03-21 review. The KEM switch to P-256 resolves real-world Chrome WebCrypto compatibility. The V2 non-extractable `CryptoKey` storage is a genuine security improvement — the device private key can no longer be extracted by JavaScript code, including an XSS attacker operating in the app origin. The stale-directory fix in `approvePendingDevice` removes a class of TOCTOU approval failures.

**The design still should not be approved for production as-is.** The two structural pre-launch blockers from the previous review are unchanged:

1. **Any authenticated session for a userId can win the approval race and install an arbitrary DEK for a pending device.** A compromised device can permanently lock a new device out of their plan.
2. **Test coverage remains minimal.** The test suite still contains only two HPKE round-trip unit tests and three UI state-machine tests. No adversarial or negative-path tests have been added.

The switch from X25519 to P-256 is pragmatic and cryptographically acceptable, but the security rationale for the KEM choice is not documented anywhere in the codebase.

---

### Architecture Understanding

Unchanged from the 2026-03-21 review. The protocol flow is:

1. User DEK (AES-256, 32 bytes) encrypts the plan blob in Cosmos DB (AES-256-GCM, AAD = `{scope, schemaVersion, userId}`).
2. Each device holds an HPKE P-256 keypair. The private key is stored in IndexedDB as a non-extractable `CryptoKey` (V2 format). The public key is stored server-side.
3. A new device registers, shows an approval code with a key fingerprint. An existing device validates the fingerprint, wraps the DEK via HPKE base mode (AAD = `{scope, userId, deviceId, requestId, schemaVersion, expiresAt}`), stores the package on the server.
4. The new device polls, recomputes the expected AAD locally, validates the stored AAD field matches, decrypts using its `CryptoKey` private key handle directly, stores the DEK wrapped by a local non-extractable KEK, signals consumption.
5. Server marks the device active on confirmed consumption.

**Trust boundaries** and **trust model gaps** are unchanged from the prior review. The Clerk identity remains the sole anchor for the whole system.

---

### Critical Findings

None. Previous critical issues (R3-P0 key substitution, R2-P1 AAD trust) remain addressed.

---

### High Findings

#### H1 — Compromised device can install arbitrary DEK for any pending device

**Severity:** High — **resolved**
**Where:** `src/lib/cosmos.ts` (`approveDeviceWrappedDek`), `src/app/api/devices/[deviceId]/approve/route.ts`
**Why it is a problem:**
`approveDeviceWrappedDek` creates the wrapped DEK with `IfNoneMatch: *` and treats a 409/412 conflict as silent success. Any authenticated Clerk session for userId X can POST to `/api/devices/:deviceId/approve` with a `wrappedKeyPackage` of their choice — the first writer wins. A compromised device can:
1. See all pending approvals via `GET /api/devices`.
2. Race to approve a pending device with a DEK it controls (not the real DEK).
3. The legitimate approver receives 204 (conflict treated as success) but the stored package holds the fake DEK.
4. The new device unwraps the fake DEK, stores it, and permanently cannot decrypt the plan.

The stale-directory fix (R8) does not affect this. The re-fetch happens on the approver side, not the server side — the race is at the Cosmos write, not the directory read.

**Exploit scenario:** Unchanged from prior review. An attacker with a valid Clerk session for the victim userId races the approval write.

**Status:**
Fixed in commit `9dd3d9e`: `POST /api/devices/:deviceId/approve` now requires `approverDeviceId`, and the server verifies the approver device registration exists and is `status === 'active'` before accepting the wrapped DEK package.

**Type:** Design flaw + implementation flaw

---

#### H2 — No sender authentication in the HPKE wrapped package

**Severity:** High — **unchanged from 2026-03-21**
**Where:** `src/lib/deviceCrypto.ts` (`hpkeSealForRecipient`), HPKE base mode
**Why it is a problem:**
HPKE base mode provides no sender authentication. Any party with the recipient's public key can produce a valid ciphertext that the recipient will open. The wrapped package contains no signature, no sender attestation, and no sender public key. The recipient's security relies entirely on server authorization (see H1 for why that is insufficient) and Clerk session integrity.

**Remediation:**
HPKE auth mode (`createSenderContext({ senderKey })`) would provide sender authentication. Alternatively, the approver signs `(enc || ciphertext || aad)` with a separate signing key. At minimum, explicitly document in `docs/security-decisions.md` that sender authentication is absent and that the trust model depends on server authorization integrity.

**Type:** Design flaw

---

### Medium Findings

#### M1 — Algorithm suite identifiers not bound in AAD and not validated by recipient

**Severity:** Medium — **unchanged from 2026-03-21**
**Where:** `src/lib/deviceCrypto.ts` (`plannerDekWrapAad`), `src/hooks/usePlanSync.ts`
**Why it is a problem:**
`WrappedDekPackage.suite` (`{ kem, kdf, aead }`) is not included in the HPKE AAD and is not validated by the recipient against expected constants. Today this is unexploitable because the suite is hardcoded in `hpkeSuite()`. If a future version reads `pkg.suite` for algorithm selection, a server-side substitution enables a downgrade attack with no AAD mismatch.

The suite strings are hardcoded at the approver (`'DHKEM(P-256,HKDF-SHA256)'`, `'HKDF-SHA256'`, `'AES-256-GCM'`) but not verified at the recipient before decryption.

**Remediation:**
Add `kem`, `kdf`, `aead` identifiers to `plannerDekWrapAad`. Have the recipient assert `pkg.suite` matches expected constants before calling `unwrapDekToBase64`. Zero additional runtime cost.

**Type:** Design flaw

---

#### M2 — No DEK-to-plan binding in the HPKE AAD

**Severity:** Medium — **unchanged from 2026-03-21**
**Where:** `src/lib/deviceCrypto.ts` (`plannerDekWrapAad`)
**Why it is a problem:**
AAD = `{ scope, userId, deviceId, requestId, schemaVersion, expiresAt }` — no plan or blob ID. In a multi-plan extension, a wrapped DEK for Plan A could be replayed for Plan B.

**Remediation:**
Add `planId: 'default'` or equivalent now. Costs nothing, eliminates the cross-plan replay risk permanently.

**Type:** Design flaw

---

#### M3 — Concurrent first-time device registration produces unhandled 500

**Severity:** Medium — **resolved**
**Where:** `src/lib/cosmos.ts` (`upsertDeviceRegistration`, line ~247)
**Why it is a problem:**
`container.items.create(created, { accessCondition: { type: 'IfNoneMatch', condition: '*' } })` has no try/catch. On a concurrent first-registration race (double-submit, back/reload), the second request receives a Cosmos 409/412 that propagates as an unhandled error through `responseForKnownError` (which only catches `DeviceRegistrationConflictError`) and returns a 500.

**Status:**
Fixed in `fix(cosmos): handle concurrent device registration create` (commit `cb1d15e`): `upsertDeviceRegistration` now catches 409/412 on first-create, re-reads, and returns the existing document (or surfaces a stable conflict error).

**Type:** Implementation flaw

---

#### M4 — Rate limiter is per-process; ineffective under horizontal scale

**Severity:** Medium — **unchanged from 2026-03-21**
**Where:** `src/lib/rateLimit.ts` (inferred), all device API routes
**Why it is a problem:**
In-memory rate limiter counters are per-replica. With N Azure Container Apps replicas, the effective rate limit is `max × N`.

**Remediation:**
Back the rate limiter with a shared store (Redis / Azure Cache for Redis) or document the per-replica limitation for operators.

**Type:** Implementation flaw

---

#### M5 — No minimum byte-length check on `enc` and `ciphertext` in approval body

**Severity:** Medium — **updated for P-256**
**Where:** `src/app/api/devices/[deviceId]/approve/route.ts` (`WrappedDekPackageSchema`)
**Why it is a problem:**
`enc` and `ciphertext` are validated only as non-empty base64 with max length caps. For `DHKEM(P-256, HKDF-SHA256)`, `enc` is the ephemeral sender's uncompressed P-256 public key: exactly **65 bytes** (88 base64 chars). `ciphertext` for a 32-byte DEK with a 16-byte AEAD tag is at least **48 bytes** (64 base64 chars). There is no minimum byte-length enforcement.

An attacker can store a 1-byte `enc`. The server accepts it. The recipient fails to deserialize the ephemeral key with a confusing error. Because the first writer wins (H1), this can be used to permanently poison an approval slot.

**Remediation:**
Add `isExpectedBase64ByteLength(value.enc, 65)` (exact, for P-256 uncompressed point) and a minimum byte-length check on `ciphertext` (≥ 48 bytes) in `WrappedDekPackageSchema`.

**Type:** Implementation flaw

---

### Low Findings

#### L1 — `pkg.suite` not validated at recipient

**Severity:** Low — **unchanged from 2026-03-21**
**Where:** `src/hooks/usePlanSync.ts` (polling interval)
**Why it is a problem:** The recipient fetches `pkg.suite` from the server but never compares it to the hardcoded expected values before calling `unwrapDekToBase64`. Inconsistent suite strings would not affect decryption today but create future confusion.
**Remediation:** Assert `pkg.suite.kem === 'DHKEM(P-256,HKDF-SHA256)'` etc. before decryption; throw a clear error on mismatch.

---

#### L2 — `deviceId` format not validated as UUID

**Severity:** Low — **unchanged from 2026-03-21**
**Where:** `src/app/api/devices/route.ts` (`PostPayloadSchema`)
**Why it is a problem:** `deviceId` is only length-checked (8–128). The client generates UUIDs but the server does not enforce it. Non-UUID device IDs complicate logging and future tooling.
**Remediation:** Add `.uuid()` refinement to `DeviceIdSchema`.

---

#### L3 — P-256 KEM rationale not documented

**Severity:** Low — **new**
**Where:** `src/lib/deviceCrypto.ts` (`hpkeSuite`), `docs/security-decisions.md`
**Why it is a problem:**
The KEM was changed from `DHKEM(X25519, HKDF-SHA256)` to `DHKEM(P-256, HKDF-SHA256)` (commit `c1ab49e`) to resolve Chrome WebCrypto compatibility. This is the right practical call — P-256 is cryptographically sound and widely deployed. However, the decision is not documented. X25519 is generally preferred in modern protocols (Signal, WireGuard, TLS 1.3) for its resistance to side-channel attacks and simpler constant-time implementation. In the WebCrypto context, P-256 operations are implemented by the browser vendor and should be constant-time, which mitigates the side-channel concern — but this rationale doesn't appear in the codebase.

Without documentation, a future reviewer may re-introduce the X25519 preference debate or attempt to switch back without understanding the browser compatibility constraint.

**Remediation:**
Add a comment to `hpkeSuite()` and a note to `docs/security-decisions.md` explaining: P-256 was chosen for Chrome WebCrypto compatibility; X25519 is not natively supported by Chrome's SubtleCrypto in the context `@hpke/core` requires; P-256 is cryptographically sound; timing-attack resistance is delegated to the browser vendor.

**Type:** Documentation gap

---

#### L4 — No runtime assertion that retrieved V2 `CryptoKey` is non-extractable

**Severity:** Low — **new**
**Where:** `src/lib/deviceCrypto.ts` (`getOrCreateDeviceKeyPair`, V2 branch)
**Why it is a problem:**
The V2 format stores the private key as a non-extractable `CryptoKey` in IndexedDB. Browsers preserve the extractability attribute through IndexedDB structured cloning. However, there is no runtime check after retrieval that the key is actually non-extractable. A browser bug, test environment override, or polyfill could silently return an extractable key while the code proceeds as if the security property holds.

**Remediation:**
Low priority. Optionally add a debug-mode assertion after retrieval: attempt `crypto.subtle.exportKey('raw', stored.privateKey)` and verify it throws `InvalidAccessError`. Not needed in production but would catch environment regressions in tests.

**Type:** Implementation quality

---

#### L5 — Silent keypair regeneration for legacy V1 / pre-V1 formats

**Severity:** Low — **new**
**Where:** `src/lib/deviceCrypto.ts` (`getOrCreateDeviceKeyPair`)
**Why it is a problem:**
When V1 or pre-V1 data is found in IndexedDB, the code falls through silently to generate a fresh V2 keypair, overwriting the old data. The device loses its previous keypair and any pending wrapped DEKs sealed to the old public key become undecryptable. This is intentional (no existing users, documented in comments), but the failure mode is silent — there is no log, error, or user-visible notification that a keypair was regenerated.

If somehow V1 data exists in the wild (e.g., a developer's own browser, a staging environment), the device will silently re-register with a new public key and appear stuck in a perpetual approval-pending state until an approver responds to the new registration.

**Remediation:**
Add a `console.warn` or structured log when legacy data is detected and discarded. Aids debugging without affecting security.

**Type:** Implementation quality

---

#### L6 — IDB key prefix change orphans old device IDs silently

**Severity:** Low — **new**
**Where:** `src/lib/deviceCrypto.ts` (key prefixes `llp.deviceId.p256.`, `llp.deviceKeypair.p256.`)
**Why it is a problem:**
The switch to P-256 introduced new IDB key prefixes (`llp.deviceId.p256.*`, `llp.deviceKeypair.p256.*`). Any old data stored under the previous prefix (`llp.deviceId.*`, `llp.deviceKeypair.*`) is not read, not migrated, and not deleted. Old entries accumulate in IndexedDB silently. This is harmless for the no-existing-users scenario but leaves stale data in developer/staging environments that could cause confusion.

**Remediation:**
On first load under the new prefix, optionally delete any known old-prefix keys to keep storage clean. Or document this as a known artifact.

**Type:** Implementation quality

---

### Cryptography Assessment

**KEM change: X25519 → P-256**

The switch from `DHKEM(X25519, HKDF-SHA256)` to `DHKEM(P-256, HKDF-SHA256)` was made for Chrome WebCrypto compatibility. Cryptographic assessment:

- P-256 is a NIST prime-order curve standardized in FIPS 186. It is widely deployed in TLS, FIDO2, and JOSE. No practical breaks are known.
- X25519 (Curve25519) has stronger theoretical side-channel resistance properties due to its Montgomery form and constant-time ladder, making it the preferred choice for new protocols. In a WebCrypto environment, however, both curves are implemented by the browser vendor and should be constant-time — the browser trust assumption applies equally to both.
- P-256 key encoding: 65-byte uncompressed public key (0x04 prefix + 32-byte X + 32-byte Y). The server validates `isExpectedBase64ByteLength(publicKey, 65)`. Correct.
- The KDF (HKDF-SHA256) and AEAD (AES-256-GCM) are unchanged and remain sound.

**Private key storage improvement (V2)**

The V2 format is a meaningful security improvement. The private key is now a non-extractable `CryptoKey` object:
- JavaScript code (including XSS) cannot call `exportKey('raw', privateKey)` — the call throws `InvalidAccessError`.
- An XSS attacker in the app origin can still call `hpkeOpenAsRecipient` using the key handle, but cannot exfiltrate the key material itself. This limits the attack from "steal the key and decrypt forever" to "decrypt within this session while the page is loaded."
- The non-extractable property depends on IndexedDB correctly preserving the structured-clone extractability flag, which all major browsers do. See L4.

**Full cryptographic property table**

| Property | Assessment |
|---|---|
| **Authenticity** | Partial. HPKE AEAD guarantees ciphertext integrity and recipient exclusivity. No cryptographic sender authentication (base mode). See H2. |
| **Forward secrecy** | Present per-message. The ephemeral `enc` provides forward secrecy against post-compromise of the long-term private key for previously received DEKs. Long-term device keypairs are never rotated, so future wrapped DEKs remain at risk after device compromise. |
| **Replay** | Well-mitigated. AAD binds `userId`, `deviceId`, `requestId`, `schemaVersion`, `expiresAt`. Server enforces requestId uniqueness. Client recomputes AAD locally. Replay against a different userId, deviceId, or requestId fails HPKE open. |
| **Downgrade** | Not cryptographically mitigated. Suite identifiers absent from AAD (M1). No algorithm negotiation protocol. Low current risk (algorithm hardcoded) but a future footgun. |
| **Key substitution** | Mitigated. `deviceId → publicKey` is immutable once registered (server enforces). Out-of-band fingerprint check prevents approver from wrapping to a server-injected key. |
| **Recipient binding** | Strong. `deviceId` and `requestId` in AAD; server checks both before storing the wrapped package; recipient validates both. |
| **Sender binding** | Absent cryptographically. See H2. |
| **Metadata binding** | Partial. No algorithm identifiers in AAD (M1). No plan/blob ID in AAD (M2). |
| **Revocation semantics** | Advisory only. Revoked devices retain local DEK access to previously synced plans (correct historical-access semantics). Future sync blocked at API level. |
| **Key separation** | Acceptable for v1. DEK and device private key are both protected by the same KEK. Loss of KEK exposes both. Separation into distinct KEK derivations would be stronger. |
| **Misuse resistance** | Good. DEK encryption uses random IV per write (AES-GCM). HPKE uses fresh ephemeral KEM material per seal. Non-extractable KEK and CryptoKey private key prevent JS-level key exfiltration. XSS can trigger operations using the keys but cannot exfiltrate the key material. |

---

### Authorization and Lifecycle Assessment

| Lifecycle stage | Assessment |
|---|---|
| **Device registration** | Server enforces 65-byte P-256 public key (correct for updated KEM). Server-controlled 10-minute TTL. Key immutability per `deviceId`. Concurrent first-creation still produces unhandled 500 (M3). |
| **Device approval** | Out-of-band code includes fingerprint check. Fresh device directory fetched before approval (R8 fixed). **Any authenticated Clerk session can win the approval race with a fake DEK** (H1). Approver identity is not cryptographically bound to the wrapped package (H2). |
| **Sharing initiation** | Triggered automatically when a device loads and finds the plan exists but the DEK is missing. Correct. |
| **DEK wrapping** | HPKE base mode with locally-recomputed AAD verification at recipient. Sound. |
| **Recipient verification** | Client-side: fingerprint check via `publicKeyFingerprintB64`. Server-side: requestId, userId, expiresAt checks. Adequate. |
| **Access revocation** | Advisory only. No API route to revoke in reviewed code. |
| **Device removal** | Not implemented. |
| **Re-sharing** | Device can re-request approval on expiry. Server allows requestId refresh for pending devices with the same public key. |
| **Blob re-encryption** | Not implemented. No flow to rekey if DEK is suspected compromised. |
| **Key rotation** | Not implemented. Device keypairs are permanent. |
| **Recovery** | Not implemented. Loss of all devices' IndexedDB = permanent plan inaccessibility. |

---

### Testing Gaps

The test suite previously had minimal coverage (2 HPKE round-trip unit tests, 3 UI state-machine tests). This review now tracks test coverage explicitly by mapping each suggested test to an existing test case by name.

**Highest-priority tests (mapped to implemented cases):**

| Suggested test | Test case name |
|---|---|
| `hpkeOpenAsRecipient` with wrong recipient private key | `tests/unit/deviceCrypto.test.ts` → `deviceCrypto HPKE` → `fails to open with the wrong recipient private key` |
| `hpkeSealForRecipient` + `hpkeOpenAsRecipient` with tampered ciphertext | `tests/unit/deviceCrypto.test.ts` → `deviceCrypto HPKE` → `rejects tampered ciphertext` |
| Full DEK round-trip (32-byte payload) | `tests/unit/deviceCrypto.test.ts` → `deviceCrypto HPKE` → `round-trips a 32-byte DEK payload` |
| `plannerDekWrapAad` output stability | `tests/unit/deviceCrypto.test.ts` → `deviceCrypto HPKE` → `plannerDekWrapAad is stable for the same inputs` |
| `approvePendingDevice` with fingerprint mismatch | `tests/ui/usePlanSyncApprovePendingDeviceValidation.test.tsx` → `rejects when public key fingerprint does not match` |
| `approvePendingDevice` with expired request | `tests/ui/usePlanSyncApprovePendingDeviceValidation.test.tsx` → `rejects when approval request is expired` |
| `approvePendingDevice` with `target.requestId !== code.requestId` | `tests/ui/usePlanSyncApprovePendingDeviceValidation.test.tsx` → `rejects when requestId does not match pending device request` |
| `approvePendingDevice` fresh-fetch behaviour (R8) | `tests/ui/usePlanSyncApprovePendingDevice.test.tsx` → `re-fetches devices directory before approving` |
| Wrapped DEK fetch uses auth userId (no client userId trust) | `tests/unit/deviceWrappedDekRoute.test.ts` → `GET returns wrapped key package without consuming it` |
| Approve route uses auth userId (no client userId trust) | `tests/unit/deviceApproveRoute.test.ts` → `passes userId from auth context to persistence layer` |
| Wrapped DEK consume is explicit (consume-after-confirm) | `tests/unit/deviceWrappedDekRoute.test.ts` → `POST consumes after client confirms decrypt/persist` |
| Wrapped DEK polling validates bounded IDs | `tests/unit/deviceWrappedDekRoute.test.ts` → `GET rejects unbounded/invalid ids` |
| Device registration enforces server TTL | `tests/unit/devicesRoute.test.ts` → `POST enforces server TTL regardless of requestExpiresAt input` |
| Device registration enforces P-256 public key size | `tests/unit/devicesRoute.test.ts` → `POST rejects invalid public key length` |

**Missing: revoked and degraded flows**
- Approval attempt when approver is `status === 'revoked'`.
- Fetch / consume for a revoked device.
- `getUserDekB64` when stored version `v` ≠ 1.

**Still missing (no tests yet):**

| Suggested test | Status |
|---|---|
| Recipient: `pkg.deviceId !== deviceId` context mismatch rejection | Not implemented as a deterministic unit test; currently exercised only indirectly via UI polling logic. |
| Recipient: `pkg.aad !== expectedAadB64` AAD mismatch rejection | Not implemented as a deterministic unit test; currently exercised only indirectly via UI polling logic. |
| Two concurrent approvals for same pending device | Not implemented; requires an integration-style test harness for Cosmos concurrency behavior. |
| Wrapped DEK fetch after `consumedAt` is set (server-side) | Not implemented; requires persistence-layer tests against Cosmos emulator or a mocked container with ETag semantics. |
| Consume after already consumed (server-side) | Not implemented; requires persistence-layer tests against Cosmos emulator or a mocked container with ETag semantics. |
| `upsertDeviceRegistration` concurrent first-creation (server-side) | Not implemented; requires persistence-layer tests against Cosmos emulator or a mocked container with ETag semantics. |
| V2 keypair read-after-write roundtrip via real IndexedDB structured clone | Not implemented; would require a browser-run test (Playwright) to validate CryptoKey persistence semantics end-to-end. |

---

### Suggested Fixes in Priority Order

1. **[H1] Require the approver to be an active device.** Implemented in commit `9dd3d9e`.

2. **[M3] Handle Cosmos 409/412 on first-create in `upsertDeviceRegistration`.** Implemented in commit `cb1d15e`.

3. **[M5] Enforce exact byte-length on `enc` (65 bytes) and minimum on `ciphertext` (≥ 48 bytes)** in `WrappedDekPackageSchema` using `isExpectedBase64ByteLength`.

4. **[Testing] Add the highest-value adversarial tests listed above.** Prioritize: wrong-recipient decryption, tampered ciphertext, fingerprint mismatch, AAD mismatch, approval race.

5. **[M1] Add algorithm identifiers to `plannerDekWrapAad`.** Include `kem`, `kdf`, `aead` in the AAD. Validate `pkg.suite` at the recipient before decryption.

6. **[M2] Add `planId: 'default'` to `plannerDekWrapAad`.** Eliminates cross-plan replay risk for free.

7. **[L3] Document the P-256 KEM choice.** Add a comment to `hpkeSuite()` and a note in `docs/security-decisions.md` explaining the Chrome WebCrypto compatibility rationale.

8. **[H2] Document the absence of sender authentication** in `docs/security-decisions.md` and `docs/device-to-device.md`. Evaluate HPKE auth mode for v2.

9. **[L1] Validate `pkg.suite` constants at recipient** before calling `unwrapDekToBase64`.

---

### Approval Recommendation

**Approve with changes**

The cryptographic fundamentals are sound. HPKE base mode with P-256, AES-256-GCM, HKDF-SHA256 is a well-specified combination. The V2 non-extractable `CryptoKey` private key storage is a genuine improvement. AAD recomputation at the recipient, fingerprint-based key pinning, server-enforced TTL, device key immutability, and consume-after-confirm remain correctly implemented.

Approval is conditional on addressing before production launch:
1. **Testing** — add at minimum: wrong-recipient decryption, tampered ciphertext, fingerprint mismatch, AAD mismatch rejection.

M1, M2, M5, L1–L6 are recommended for the next sprint but do not block launch once the minimum test additions are in place.

The absence of device key rotation, recovery flows, blob re-encryption, and sender authentication (H2) are accepted v1 limitations and should be tracked as explicit future work items in the backlog.
