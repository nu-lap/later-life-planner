# Device-to-Device DEK Sharing (HPKE)

This document describes a device-approval flow that keeps planner encryption/decryption in the browser, while enabling the same signed-in user to decrypt their remote plan on multiple devices.

The core primitive is **per-device DEK wrapping using HPKE (RFC 9180)**. The server stores only ciphertext (the plan ciphertext and the wrapped DEK); it never needs to persist plaintext planner data.

## Goal

- Each user has a single **data encryption key (DEK)** used to encrypt planner state.
- Each device has its own **device keypair**.
- When a new device is added, an existing device encrypts (wraps) the DEK to the new device’s public key using **HPKE**, and uploads only the wrapped key package.

## Threat Model Notes

- This flow is designed for multi-device UX without forcing a user passphrase.
- It does not protect against XSS on your origin. Any attacker running JS on your origin can perform crypto operations with keys available to that origin.
- It does reduce accidental key exfiltration compared to storing the DEK as an easily copyable string (depending on how keys are stored).

## Cryptography

### HPKE ciphersuite

Use a standard HPKE suite:

- `KEM`: `DHKEM(P-256, HKDF-SHA256)`
- `KDF`: `HKDF-SHA256`
- `AEAD`: `AES-256-GCM`

HPKE is a hybrid scheme:

- It uses an ephemeral sender key and recipient’s public key (KEM) to derive a shared secret.
- It uses the shared secret (KDF) to derive a symmetric key.
- It uses the symmetric key (AEAD) to encrypt the payload (the DEK bytes).

### What gets encrypted

Wrap the raw DEK bytes as the HPKE plaintext.

- `plaintext`: `DEK_raw` (32 bytes for AES-256 DEK)
- `aad`: stable context string or JSON bytes binding the wrap to this user and device

Recommended AAD fields:

- `scope`: `"planner-dek-wrap"`
- `userId`
- `deviceId`
- `requestId`
- `schemaVersion`
- `createdAt` or `expiresAt`

### Key formats and storage

HPKE with X25519 is not consistently exposed as a first-class primitive via Web Crypto in all browsers. For v1, use P-256 in HPKE so the implementation can use WebCrypto-native key material.

Store:

- Device private key material: in `IndexedDB` as a non-extractable `CryptoKey` where possible
- Device public key: safe to store server-side (P-256 uncompressed public key bytes, 65 bytes, base64)

If you later add WebAuthn/passkeys, use them to protect the device private key (or to encrypt the DEK locally), but HPKE wrapping still works as the transfer mechanism.

## Wrapped Key Package Format

Store one wrapped DEK per device per user:

```json
{
  "v": 1,
  "suite": {
    "kem": "DHKEM(P-256,HKDF-SHA256)",
    "kdf": "HKDF-SHA256",
    "aead": "AES-256-GCM"
  },
  "deviceId": "uuid",
  "requestId": "uuid",
  "enc": "base64(hpke_enc)",
  "ciphertext": "base64(hpke_ciphertext)",
  "aad": "base64(aad_bytes)",
  "createdAt": "2026-03-21T00:00:00.000Z"
}
```

Notes:

- `enc` is the HPKE encapsulated key output (KEM output).
- `ciphertext` is the AEAD-encrypted DEK bytes (plus tag, as defined by the HPKE implementation).
- `aad` must be identical for encryption and decryption.

## Data Model (Cosmos)

Minimum viable split:

- `user_devices` (partition key: `/userId`)
  - `userId`, `deviceId`, `publicKey` (P-256 uncompressed public key bytes, base64)
  - `status`: `pending` | `active` | `revoked`
  - `createdAt`, `lastSeenAt`, `label` (optional)
- `user_device_wrapped_dek` (partition key: `/userId`)
  - `userId`, `deviceId`, `wrappedKeyPackage` (JSON payload above)
  - `createdAt`

The remote plan document remains separate and continues to store only ciphertext for the planner state.

## API Shape (Authenticated)

These are indicative endpoints. They assume Clerk-verified user identity on the server.

- `POST /api/devices`
  - input: `{ deviceId, publicKeyB64, label? }`
  - creates device record as `pending`
- `GET /api/devices`
  - returns devices for signed-in user (so an existing device can approve pending ones)
- `POST /api/devices/:deviceId/approve`
  - input: `{ requestId, wrappedKeyPackage }`
  - stores wrapped DEK for that device and marks device `active`
- `GET /api/devices/:deviceId/wrapped-dek?requestId=...`
  - returns the wrapped key package for that device (only for the signed-in user)

Operational rule: the server must never accept `userId` from the client. It must derive it from auth context.

## State Machine

Model the client flow as an explicit state machine so error handling and retries are deterministic:

- `unregistered`: no `deviceId` and no device keypair on disk
- `registered_pending`: device keypair exists and the device is registered, but there is no wrapped DEK package yet
- `authorized`: wrapped DEK package exists and the device can decrypt the plan
- `revoked`: server has marked this device as revoked (the client may still have cached key material; treat the server state as authoritative for future wrapping)

Transitions:

- `unregistered` -> `registered_pending`: generate keypair; register public key
- `registered_pending` -> `authorized`: approval completes; wrapped DEK package is fetched and unwrapped
- `authorized` -> `revoked`: server-side revoke action; future refreshes should refuse to accept wrapped keys for this device id

Error posture:

- never clear a user's only decrypt-capable key material as part of retry logic
- treat expiry as a normal outcome: request again, do not silently fallback to overwriting remote plans

## Rate Limiting and Abuse Controls

The device approval surface is inherently poll-heavy. Set explicit policies:

- `/api/devices/:deviceId/wrapped-dek` polling should be rate-limited per user and per IP.
- `requestId` must expire quickly (minutes), be single-use, and be bound to:
  - the signed-in `userId`
  - the `deviceId`
- `POST /api/devices/:deviceId/approve` should reject approvals when:
  - the device is not `pending`
  - the request is expired
  - a wrapped key package for that `requestId` already exists (replay)

## Client Storage Requirements

To avoid the current "localStorage-only key" limitation:

- store the device private key material in IndexedDB
- store the unwrapped DEK in IndexedDB
- do not store the DEK as a raw base64 string in `localStorage`

The client should be able to reconstruct its decrypt capability after refresh from IndexedDB alone.

## Flows

### Bootstrap (first device)

1. On the first successful remote save/migration, generate the per-user DEK (32 bytes).
2. Generate a device P-256 HPKE keypair; store the private key locally; register the public key.
3. Create a wrapped-key package for this same device as a convenience (optional), so a cleared browser can recover without another device approval.

### Add new device (device-to-device approval)

On new device (Device B):

1. User signs in.
2. Generate device P-256 HPKE keypair; store private key locally.
3. `POST /api/devices` to register Device B as `pending`.
4. Display an approval request (QR code or short code) containing `{ deviceId, requestId, expiresAt }`.

On existing device (Device A, already has DEK):

5. User signs in.
6. Fetch pending devices via `GET /api/devices`.
7. User selects Device B and confirms approve.
8. Device A runs HPKE encryption to Device B’s public key:
   - `SetupBaseS(RecipientPublicKey)`
   - `Seal(aad, DEK_raw)` -> `(enc, ciphertext)`
9. Device A uploads the wrapped key package to `POST /api/devices/:deviceId/approve`.

Back on Device B:

10. Device B polls `GET /api/devices/:deviceId/wrapped-dek?requestId=...`.
11. Device B runs HPKE decryption:
   - `SetupBaseR(RecipientPrivateKey, enc)`
   - `Open(aad, ciphertext)` -> `DEK_raw`
12. Device B stores the DEK locally and can now decrypt the remote plan ciphertext.

## Revocation and Rotation

### Definitions

- **Device revocation** means: the server will not accept new approvals to that `deviceId` (no new wrapped DEK packages should be created for it), and clients should treat the server directory as authoritative for whether a device should be considered trusted going forward.
- **DEK rotation** means: generating a new per-user DEK, re-encrypting the planner blob under that DEK, and re-wrapping the new DEK to the set of remaining trusted devices.

### Important limitation (v1)

Revoking a device cannot remove a DEK that is already cached on that device. If a device was compromised after it obtained the DEK, it can continue decrypting any planner ciphertext that is still encrypted under that same DEK.

So, server-side revocation is primarily:

- a prevention control against issuing new wrapped keys to a device that should no longer be trusted
- a UI/ops control to record that a device should be treated as compromised

### When to rotate the DEK

Rotate when you need to reduce future exposure after suspected device compromise, for example:

- a user reports a lost/stolen device that previously decrypted the plan
- suspicious approvals were performed

Do not rotate for routine operations (migration, minor schema changes) because it forces re-authorization work.

### Rotation procedure (runbook-level)

1. Mark the compromised device(s) as `revoked` in the device directory.
2. Generate a new DEK in the browser (or in a support-led recovery flow).
3. Re-encrypt the canonical planner state with the new DEK and write it as the latest persisted ciphertext.
4. For each remaining trusted device:
   - create a new wrapped-DEK package bound to that device’s current public key and the new key version
   - store it server-side
5. On the next sync on each device:
   - fetch and unwrap the latest wrapped-DEK package
   - stop using any older cached DEK

If a user has no remaining trusted device, the plan is unrecoverable by design and should be treated as a support-led recovery problem (for example: export from the last authorized device if it still exists, or accept loss).

## Implementation Notes

- Prefer an HPKE library that clearly states RFC 9180 compliance and uses constant-time primitives.
- Always set a short expiry on `requestId` (minutes), enforce single-use, and rate limit polling.
- Include `userId`, `deviceId`, and `requestId` in AAD to prevent cross-device replay within the same account.

## Migration Notes

Existing users may already have a remote plan encrypted under a DEK that lives only on their original device.

Recommended migration behavior:

- on the original device (where decryption succeeds), create and store a wrapped DEK package for that device
- do not rotate the DEK just to migrate storage; keep the same DEK and only change how it is persisted per-device
- only after a wrapped DEK package exists for at least one device should the app consider the plan "recoverable"

If the user has no remaining authorized device, the plan is not decryptable by design and should be treated as unrecoverable.
