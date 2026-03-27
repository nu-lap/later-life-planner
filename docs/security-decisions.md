# Security Decisions

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering + Security (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on security-control changes

This document records concrete security decisions for Later-Life Planner implementation.

It is intended to keep v1 delivery realistic while preventing architectural ambiguity.

## Security Principles

- Treat planner financial data as sensitive
- Keep plaintext financial data out of persistent server storage
- Minimize the server's role in data handling
- Authenticate every protected request
- Prefer explicit tradeoffs over vague "future secure" designs

## Canonical Decisions

### 1. Identity provider

Use Clerk.

Reason:

- mature Next.js integration
- route protection support
- session and JWT handling already planned

### 2. Storage backend

Use Azure Cosmos DB.

Reason:

- aligns with the existing storage design direction
- works with single-document encrypted blob persistence
- avoids building relational persistence that the planner does not need

### 3. Encryption location

Encrypt and decrypt in the browser.

Reason:

- database should never hold planner plaintext
- keeps server persistence thin

### 4. Version 1 key strategy

Use per-device keypairs with device-to-device DEK wrapping (HPKE), not passphrase-derived keys.

Reason:

- compatible with Clerk session flows
- lower UX complexity
- faster and safer to implement correctly

### 5. Version 1 persistence granularity

Persist the planner as one encrypted domain blob per user.

Reason:

- planner edits are personal and single-user
- no collaboration or partial merge requirement
- simpler migration and schema management

### 6. User identity source

User identity must come only from verified Clerk auth context.

Never trust:

- `userId` in request body
- query string user ids
- client-selected document ids

### 7. Conflict strategy

Use optimistic concurrency with a revision field.

Reason:

- clearer than timestamp-only conflict detection
- easier to test
- avoids silent overwrite

## Version 1 Deferred Items

These items are explicitly deferred unless priorities change:

- user-defined encryption passphrase
- recovery phrase flow
- account-shared plans
- collaborative editing
- field-level plan sync
- offline-first encrypted cache
- merge UI for conflicting saves

## Threat Model Priorities

Version 1 is primarily designed to reduce:

- plaintext exposure in database storage
- unauthorized cross-user access
- accidental leakage through logs
- stale write overwrites

Version 1 does not fully eliminate:

- browser compromise/XSS risk
- local-device compromise

Those risks should be acknowledged, not hidden.

## Browser Security Requirements

- use Web Crypto only
- generate a fresh IV per encryption operation
- keep decrypted state in memory only as needed
- clear decrypted state on sign-out
- do not write decrypted planner payloads to logs or analytics

## Server Security Requirements

- verify Clerk auth on every protected data route
- reject unauthenticated requests early
- validate request shapes strictly
- never log plaintext plan data
- never persist plaintext plan data
- apply rate limiting to protected data routes

## Data Validation Requirements

Validate:

- schema version
- revision
- ciphertext presence and format
- IV presence and format
- payload size limits

Do not assume:

- client payload is well-formed
- client revision is current

## Operational Assumptions

Primary target architecture:

- Next.js app
- Clerk auth
- Cosmos DB storage
- device-to-device key sharing for cross-device decryption (HPKE)

If hosted outside Azure, document the replacement secret and key access pattern explicitly before implementation.

## Logging Policy

Allowed to log:

- route timing
- auth success/failure at a high level
- generic save/load outcomes
- revision and schema metadata

Do not log:

- decrypted planner payload
- ciphertext contents unless strictly necessary for low-level debugging
- IV plus ciphertext in the same structured debug payload
- financial field values

## Recommended Security Tests

- protected route rejects missing auth
- protected route rejects invalid auth
- stale revision returns conflict
- malformed ciphertext payload returns validation error
- sign-out clears decrypted client state
- migration flow does not silently overwrite remote data

## Future Upgrade Path

If stronger privacy becomes a product priority later:

1. add optional user-defined encryption passphrase
2. derive browser-held key from passphrase
3. consider an optional server-assisted recovery mode (for example, envelope key wrapping using Azure Key Vault) with explicit trust-boundary language
4. document stronger-recovery tradeoffs explicitly

## Final v1 Position

Version 1 should be:

- authenticated
- encrypted at the application layer before persistence
- revision-safe
- test-covered
- operationally understandable

Version 1 should not attempt to solve every advanced privacy problem at once.
