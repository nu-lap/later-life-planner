# Persistence Security Review

Status: draft

This document consolidates the current security analysis for encrypted planner persistence.

It records:

- the current design and trust boundaries
- the main risks in the proposed key-sharing implementation
- what would need to change to materially improve protection against insider access

Read alongside:

- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`
- `docs/device-to-device.md`

## Executive Summary

The current design is reasonable for protecting planner data from plaintext exposure in Cosmos DB and from basic cross-user access mistakes.

It is not strongly resistant to deploy-path insider access.

In the current v1 direction, the server stores only ciphertext and per-device wrapped DEK packages, and it does not need a routine server-side unwrap path for user DEKs.
That improves the trust boundary relative to a server-assisted unwrap design.

The current design should therefore be described as:

- browser-side encryption with device-to-device key sharing (explicit approval)
- protective against database compromise
- not protective against a privileged deployer who can ship malicious frontend code

If resistance to deploy-path insiders becomes a core requirement, a standard web app is a weak fit. See "Inherent Limits Of A Web App".

## Current Design Summary

The current persistence plan is:

- Clerk for authentication
- Azure Cosmos DB for one encrypted planner document per user
- browser-side Web Crypto for encryption and decryption
- device registry and per-device wrapped DEK packages for cross-device decryption
- Azure Container Apps runtime identity for Cosmos DB access

The server remains an authenticated persistence surface. It stores:

- ciphertext planner documents
- device public keys and device metadata
- wrapped DEK packages produced by an authorized device

The current trust boundary is therefore:

- Cosmos DB does not hold plaintext planner data
- the server does not need a routine unwrap path for the DEK
- the frontend deployment path remains a confidentiality boundary (a malicious deploy can still steal plaintext/keys during use)

## Threat Model Framing

### Threats the current design helps with

- plaintext financial data being exposed directly from Cosmos DB
- accidental logging of raw planner data
- cross-user data access caused by trusting client-supplied identifiers
- stale write overwrites

### Threats the current design does not fully solve

- privileged insider access through the app runtime
- malicious or compromised CI/CD deployments
- browser compromise or XSS on authenticated planner routes
- metadata leakage through identifiers and timestamps

## Findings On The Current Design

### 1. The device-approval design is not strongly deploy-insider resistant

Severity: critical

The current plan uses browser-side encryption and removes the need for a routine server-side unwrap path, but a privileged deployer can still ship code that steals:

- plaintext after decryption
- the unwrapped DEK (or passphrases/recovery secrets if later introduced)

As a result, this is not a design that can credibly claim protection against malicious frontend deployments.
It is a design where:

- the database stores ciphertext only
- ordinary server-side operations do not imply DEK recovery
- the deployment path remains a confidentiality boundary

This is the most important point to state clearly in the docs. Without that clarity, the design can be misread as stronger than it is.

### 2. The device-approval boundary must be specified tightly

Severity: high

The design must define:

- which routes create device registrations and approvals
- what authorization checks gate approval and wrapped-key retrieval
- how polling and retries are rate-limited
- what audit trail is kept for device registration and approval events

Without this, the system risks becoming a key-distribution oracle for anyone who can obtain valid app access or influence runtime behavior.

At minimum, the device approval flow must enforce:

- per-user authorization based only on verified Clerk identity
- short-lived, single-use approval requests (`requestId` with expiry)
- device identity binding (`deviceId` + user identity) across all endpoints
- strong audit logging of device registration and approval events (metadata only)
- rate limiting and anomaly detection

### 3. AES-GCM key and nonce handling need tighter rules

Severity: high

The current plan correctly calls for AES-GCM and a fresh random IV, but it does not define a strict data-key lifecycle.

That leaves open questions such as:

- whether one DEK is reused across many saves
- how IV uniqueness is guaranteed over time
- what metadata is bound as additional authenticated data
- how key rotation is handled during long-lived planner use

The practical v1 rule should be stricter than the draft currently says:

- require a fresh random IV for every encryption operation
- make AAD mandatory, not optional
- bind at least `userId`, `schemaVersion`, `revision`, and the key identifier
- define when DEK rotation occurs and how rewrap is performed for active devices

### 4. Browser compromise remains a dominant confidentiality risk

Severity: high

Because plaintext and usable keys exist in the browser, any XSS issue, unsafe third-party script, or compromised browser context can defeat the design before upload or after download.

This is especially important because the product handles sensitive financial planning data in an authenticated session.

The current design should therefore assume a strict frontend hardening baseline:

- strong Content Security Policy
- no inline script exceptions unless unavoidable
- no unsafe HTML rendering paths
- minimal third-party JavaScript on authenticated planner routes
- careful review of analytics and session tooling

### 5. Device revocation, DEK rotation, and recovery are not fully specified

Severity: medium

The key strategy must explicitly define:

- how a device is revoked and what "revoked" means in practice
- how DEK rotation rewraps the new DEK for all active devices
- what happens if a user has no remaining authorized device
- how approvals are replay-protected and expired

Rotation and revocation are product and ops concerns, not just implementation details. They need a runbook.

### 6. CI/CD remains inside the trust boundary

Severity: medium

The current deployment path relies on a secret-based Azure service principal in GitHub Actions.

Anyone who can misuse that credential, or who can alter the production deployment path, may be able to:

- deploy code that exfiltrates plaintext or keys
- widen Azure access permissions
- alter runtime configuration to weaken controls

That means the CI/CD system is part of the confidentiality boundary.

Moving the deploy path to GitHub OIDC improves this, but does not eliminate deploy-side trust.

### 7. Metadata leakage is accepted but should be called out explicitly

Severity: medium

Using the Clerk user id as both document id and partition key simplifies the model, but it leaks stable identity linkage into persistence metadata.

Even if ciphertext remains opaque, an insider with data-plane access can still learn:

- which users have stored plans
- when those plans were updated
- revision activity over time

This may be acceptable for v1, but it should be documented as a privacy tradeoff.

## What Insider Resistance Would Require

### Core Principle

If the goal is to protect user data from privileged operators, the normal app backend must not have a routine ability to recover user DEKs.

That means the strongest practical change is:

- user-controlled decryption material
- browser-only decryption
- ciphertext-only storage on the server
- no standard server-side recovery path

## Recommended Product Model

The cleanest way to express the tradeoff is to split the product into two explicit modes.

### Option A: Device-Approved Sync (HPKE)

This is the current v1 direction.

Properties:

- easiest multi-device UX
- explicit device approval required for new devices
- protects against database plaintext exposure
- does not protect against privileged deploy access
- reduces reliance on a server-side unwrap path for DEKs

### Option B: Private Vault

This is the insider-resistant mode.

Properties:

- decryption key is controlled by the user or user device
- server stores ciphertext only
- no server-side unwrap in normal operation
- stronger protection from database admins and most app-side insiders
- harder recovery and support model

If both modes are offered, they should be described honestly rather than presented as equivalent security postures.

## Recommended Insider-Resistant Design

### 1. Move to user-controlled key protection

Preferred design:

1. Browser generates a random DEK
2. Browser encrypts planner payload with AES-GCM
3. Browser protects the DEK with user-controlled material
4. Server stores only ciphertext, IV, metadata, and the browser-produced wrapped DEK

Good user-controlled key options:

- a user-defined passphrase processed in the browser with a strong password-based KDF
- a device-bound key such as a WebAuthn-backed credential used to protect the DEK
- a hybrid model that supports both

In all of these models, the application server should not have ordinary unwrap capability.

### 2. Treat recovery as a product tradeoff, not a hidden capability

If the system offers support-led recovery, then privileged operators are back inside the trust boundary.

That is acceptable only if documented clearly.

For a genuinely insider-resistant mode, recovery should be one of:

- no recovery
- user-managed recovery kit
- threshold or split-key recovery with strong governance and explicit user consent model

### 3. Harden deployment and admin paths anyway

Even with client-held keys, a malicious deployer can still ship code that steals plaintext or passphrases when users load the app.

So insider-resistant design still needs operational controls:

- migrate GitHub Actions Azure auth from long-lived secrets to OIDC federation
- require approval and just-in-time elevation for privileged Azure roles
- separate deployment authority from data-plane authority
- use environment-scoped deployment protections
- alert on unusual production deployments and Cosmos DB access patterns

### 4. Consider confidential-compute-assisted recovery only if recovery is mandatory

If product requirements insist on recovery or server-assisted access, the least-bad Azure pattern is not a normal unwrap API.

Instead, use confidential computing with attested key release:

- keep the standard app runtime unable to unwrap user keys directly
- release sensitive key material only to an attested confidential environment
- tightly restrict who can alter the release policy

This is operationally more complex and still not equivalent to pure client-held keys, but it is stronger than giving the normal app runtime routine unwrap capability.

### 5. Reduce metadata exposure

For stronger insider privacy, consider:

- storing a stable opaque internal document id instead of raw Clerk `userId`
- minimizing exposed activity timestamps
- keeping diagnostic metadata separate from user document storage when possible

## Inherent Limits Of A Web App

Even a better client-side encryption design has an important limit:

if an insider can deploy arbitrary JavaScript to the production app, they can likely steal plaintext or user-controlled secrets on a later visit.

That means:

- browser-only encryption can protect well against database compromise
- browser-only encryption can protect well against many storage-side insiders
- browser-only encryption cannot fully protect against malicious frontend deployments

If the requirement is to protect against deploy insiders as well, the strongest answer is not a standard web app. It is a separately controlled signed client, browser extension, or hardware-backed local application with its own release trust model.

## Practical Recommendation

If the project wants the fastest safe v1:

- keep the current device-approval design
- document it honestly as database-protective and server-unwrap-minimizing, not deploy-insider resistant
- tighten device approval, AAD, rotation, audit, logging, and CI/CD controls

If insider resistance is a real product requirement:

- make user-controlled key mode the primary design
- avoid any ordinary server-side DEK recovery path
- accept the recovery and support tradeoffs explicitly
- treat deployment security as part of the confidentiality model

## Suggested Documentation Changes

The existing design docs should be updated to state explicitly:

- v1 is not deploy-insider resistant end-to-end encryption
- the deployment path remains a confidentiality boundary
- the server does not require a routine unwrap path for user DEKs in the device-approval model
- AAD is mandatory
- DEK lifecycle and device-approval rules are part of the design, not implementation detail
- insider-resistant mode requires user-controlled keys and no ordinary server-side recovery path

## References

### Internal references

- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`

### External references

- GitHub Actions OIDC for Azure: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure
- Azure Secure Key Release and attestation: https://learn.microsoft.com/en-us/azure/confidential-computing/concept-skr-attestation
- Azure RBAC security roles: https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/security
- Microsoft Entra Privileged Identity Management deployment planning: https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-deployment-plan
- Azure Container Apps security overview: https://learn.microsoft.com/en-us/azure/container-apps/security
- OWASP Cross Site Scripting Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- NIST note on GCM and GMAC revision work: https://csrc.nist.gov/News/2024/nist-to-revise-sp-80038d-gcm-and-gmac-modes
