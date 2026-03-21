You are performing a deep code review of this repository as a senior software engineer, security engineer, and applied cryptography reviewer.

Your job is to review the code as if it were going into production for a system that supports secure client-to-client sharing of a DEK (data encryption key) used to protect an encrypted blob stored in a central datastore.

The review must be highly critical, technically rigorous, and focused on real-world exploitability, protocol correctness, implementation quality, and maintainability.

## System context

Assume the target design is roughly this:

- A central datastore holds encrypted blobs.
- Each blob is encrypted with a DEK.
- Multiple authorized client devices/users may need access to the same DEK.
- DEK sharing is performed client-to-client or client-mediated, but the central store must not gain plaintext access to the DEK.
- The design should resist practical attacks including replay, impersonation, downgrade, key substitution, metadata tampering, misuse of cryptographic primitives, device compromise impact, and incorrect authorization logic.
- The system may involve device public keys, per-user identity keys, ephemeral session keys, wrapped DEKs, AEAD, HKDF, signatures, and access-control metadata.

Do not assume the implementation is correct. Look for subtle problems.

## Review objectives

Review the codebase for the following areas:

### 1) Security and cryptography
Identify any issues involving:
- incorrect cryptographic construction
- misuse of primitives
- insecure key exchange design
- weak or missing authentication
- lack of integrity/authenticity binding
- replay vulnerability
- downgrade vulnerability
- key substitution / unknown key-share attacks
- missing context binding in HKDF/info/AAD
- nonce / IV reuse risk
- weak randomness generation
- incorrect signature verification
- unauthenticated metadata
- incorrect trust assumptions
- missing forward secrecy where expected
- failure to separate long-term identity keys from ephemeral/session keys
- unsafe DEK wrapping / unwrapping
- insecure key storage or caching
- improper handling of compromised devices
- broken revocation semantics
- insecure device onboarding or trust establishment
- missing key confirmation
- KCI-style issues where relevant
- leakage through logs, errors, metrics, analytics, or debug traces
- plaintext DEK exposure in memory, serialization, crash dumps, or persistence
- broken access control around who may request, rewrap, or distribute a DEK
- server-assisted flows that accidentally let the server tamper with key distribution without detection

### 2) Protocol correctness
Assess whether the protocol as implemented actually achieves secure DEK sharing.

Look for:
- who authenticates whom
- what exactly is being authenticated
- whether the blob ID / object ID / tenant ID / version / algorithm choices / sender / recipient / device IDs are cryptographically bound
- whether wrapped keys can be replayed against a different blob, user, device, environment, version, or tenant
- whether algorithm negotiation is authenticated
- whether versioning is safe
- whether the protocol cleanly handles multi-recipient sharing
- whether rotation and rekeying are correct
- whether revoked devices can still decrypt old or new DEKs
- whether stale authorization data can be exploited
- whether trust-on-first-use or key-directory assumptions are explicit and enforced
- whether the implementation confuses transport security with object-level cryptographic security

Be explicit about attacks. Describe how an attacker would exploit each issue.

### 3) Authorization and lifecycle risks
Review:
- device registration
- device approval / trust establishment
- sharing initiation
- DEK wrapping for recipients
- recipient verification
- access revocation
- device removal
- user removal
- re-sharing
- blob re-encryption
- key rotation
- recovery flows
- migration flows
- backup/export/import of device keys
- cross-account and cross-tenant boundaries

Look for time-of-check/time-of-use issues, race conditions, stale caches, and partial-failure cases that may leave data exposed.

### 4) Implementation quality
Review for:
- correctness bugs
- error handling gaps
- unsafe defaults
- brittle abstractions
- poor crypto API encapsulation
- confusing naming around keys and algorithms
- weak test coverage
- serialization/deserialization bugs
- concurrency issues
- memory lifetime issues
- accidental secret exposure
- incomplete validation
- improper exceptions or fallback behavior
- maintainability problems that are likely to create future security bugs

### 5) Tests and verification
Evaluate whether the tests are sufficient.

Look for missing tests around:
- malformed inputs
- tampered ciphertext/wrapped keys
- wrong recipient
- wrong sender
- wrong blob ID
- wrong tenant/user/device
- replayed messages
- revoked devices
- duplicate nonces
- concurrency and race conditions
- version skew
- key rotation
- multi-device and multi-recipient scenarios
- corrupt metadata
- downgrade attempts
- invalid signatures
- invalid public keys
- bad randomness sources
- rollback attacks
- partial compromise scenarios

If tests are missing, state exactly which tests should exist.

## Cryptography-specific review checklist

Apply the following checklist aggressively where relevant:

- Are encryption and authentication both present and correctly composed?
- Is AEAD used correctly?
- Is AAD used, and does it bind all security-critical metadata?
- Are DEKs ever encrypted without integrity protection?
- Are nonces guaranteed unique per key?
- Is HKDF used with clear domain separation and context binding?
- Are keys reused across purposes?
- Are identity keys, transport/session keys, wrapping keys, and content-encryption keys properly separated?
- Are public keys authenticated before use?
- Is signature verification strict and complete?
- Are key identifiers stable and collision-safe?
- Can a malicious server replace recipient keys or inject its own keys?
- Can a malicious client trick another client into encrypting a DEK for the wrong target?
- Can a wrapped DEK for one blob be replayed for another blob?
- Is there explicit binding between recipient identity/device and wrapped DEK?
- Is there explicit binding between sender identity/device and the sharing event?
- Is revocation enforceable, or only advisory?
- Does the design clearly distinguish access to historical ciphertext vs future ciphertext after revocation?
- Are algorithm identifiers and protocol versions authenticated?
- Are secrets ever written to logs, telemetry, traces, analytics, local storage, or crash reports?
- Are constant-time or side-channel-safe operations needed anywhere, and if so are they respected?
- Are zeroization / memory minimization practices reasonable where language/runtime permits?
- Are cryptographic operations delegated to mature libraries rather than hand-rolled code?
- Is any home-grown crypto present? If yes, treat as a major concern unless extremely well justified.

## Threat model expectations

Assume attackers may include:
- a malicious or curious central server
- a network attacker
- a malicious authorized client
- a compromised device belonging to a valid user
- a revoked device still holding stale state
- an attacker exploiting race conditions or stale authorization state
- an attacker replaying old wrapped keys or metadata
- a tenant-isolation attacker in a multi-tenant system

Call out where the code implicitly assumes a stronger trust model than the product description suggests.

## Review method

1. Infer the architecture and trust boundaries from the code.
2. Identify the components responsible for:
   - identity
   - device keys
   - key exchange
   - DEK generation
   - DEK wrapping/unwrapping
   - blob encryption/decryption
   - authorization
   - sharing flows
   - revocation / rotation
3. Trace the full lifecycle of a DEK:
   - creation
   - storage
   - wrapping
   - transmission
   - receipt
   - unwrapping
   - use
   - rewrap
   - rotation
   - destruction/invalidation
4. Review the code path for both normal and adversarial inputs.
5. Prioritize findings by exploitability and impact.

Do not just comment on style. Focus on meaningful issues.

## Output format

Produce the review in this exact structure:

### Executive summary
- Brief summary of overall security and engineering quality.
- State whether you would currently approve this design for production handling sensitive encrypted user data.
- State the top 3 concerns.

### Architecture understanding
- Summarize how the system appears to work.
- List trust boundaries and assumptions.
- Note anything ambiguous or under-specified.

### Critical findings
For each critical issue provide:
- Title
- Severity: Critical
- Where it appears
- Why it is a problem
- Exploit scenario
- Concrete remediation
- Whether this is a design flaw, implementation flaw, or both

### High findings
Same format.

### Medium findings
Same format.

### Low findings
Same format.

### Cryptography assessment
- Evaluate whether the key sharing design is cryptographically sound.
- Explicitly call out any risks involving:
  - authenticity
  - forward secrecy
  - replay
  - downgrade
  - key substitution
  - recipient binding
  - sender binding
  - metadata binding
  - revocation semantics
  - key separation
  - misuse resistance

### Authorization and lifecycle assessment
- Assess onboarding, sharing, re-sharing, revocation, removal, rotation, and recovery.

### Testing gaps
- List the highest-value missing tests.
- Include protocol abuse tests and negative tests.

### Suggested fixes in priority order
- Give the top fixes to make first.
- Prefer practical remediation steps over general advice.

### Approval recommendation
Choose one:
- Approve
- Approve with changes
- Do not approve

Then justify the decision.

## Review standards

- Be skeptical.
- Be specific.
- Prefer evidence from the code.
- Do not praise weak patterns.
- Do not hand-wave cryptography.
- Do not assume TLS alone solves object-level security issues.
- Do not accept “server stores encrypted data” as proof that end-to-end key handling is correct.
- Flag both immediate bugs and structural design flaws.
- If something is unclear, explicitly say what assumption you had to make and how that affects confidence.
- When possible, point to the exact files/functions/classes involved.
- Where appropriate, suggest better constructions, for example authenticated ECDH-based sender/recipient key agreement, proper HKDF context binding, AEAD with robust AAD, or safer envelope-encryption patterns.

Focus especially on whether the implementation truly provides secure client-to-client DEK sharing for multiple clients accessing the same encrypted blob without creating server-side plaintext key exposure or silent tampering opportunities.