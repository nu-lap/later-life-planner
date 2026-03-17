# Storage Plan

Status: draft

This document defines persisted storage for Later-Life Planner.

It supersedes the Supabase storage direction in `docs/superseded/auth-implementation-prompt.md`.

Use this document as the storage source of truth for implementation.

## Summary

Persist each user's planner state as a single encrypted blob.

Architecture:

- Auth: Clerk
- Database: Azure Cosmos DB
- Encryption: browser-side Web Crypto
- Server role: authenticated pass-through only

## Goals

- Store user plans securely across devices
- Prevent plaintext financial data from being stored in the database
- Avoid large server-side domain logic around persistence
- Preserve the current planner domain model and sync the full plan as one document
- Support a clear user lifecycle from first save to long-term retention to user-requested deletion
- Keep the initial persistence release simple while leaving room for export, deletion, and inactivity controls later
- Use Azure-native recovery and deletion features deliberately rather than ad hoc support steps

## Non-Goals

- server-side financial calculations from persisted data
- field-level database querying
- collaborative editing
- partial document merges
- indefinite in-app version history
- immediate surgical deletion of individual records from Azure backup snapshots

## Version 1 Decision

Ship one storage mode first:

- encrypted blob persistence with Cosmos DB
- wrapped-key model for key management

Defer passphrase-based stronger E2EE to a later version.

Rationale:

- lower implementation risk
- compatible with Clerk login flows
- avoids password-handling assumptions that do not fit Clerk-managed auth

## Storage Model

Each user has one persisted planner document.

Do not create a Cosmos DB document at sign-up.

Create the persisted planner document only on:

- the first successful save from an authenticated session
- a successful local-to-remote migration

### Cosmos DB

- database: `later-life-planner`
- container: `user-plans`
- partition key: `/id`
- document id: Clerk `userId`

### Stored document

```json
{
  "id": "user_xxx",
  "schemaVersion": 1,
  "revision": 7,
  "keyVersion": 1,
  "wrappedKey": "base64...",
  "iv": "base64...",
  "ciphertext": "base64...",
  "createdAt": "2026-03-13T11:00:00Z",
  "updatedAt": "2026-03-13T12:00:00Z"
}
```

### Field meaning

- `id`: Clerk user id
- `schemaVersion`: planner data schema version
- `revision`: optimistic concurrency counter
- `keyVersion`: wrapped-key version for rotation
- `wrappedKey`: wrapped data key or key reference metadata
- `iv`: AES-GCM IV for the encrypted payload
- `ciphertext`: encrypted planner payload
- `createdAt`: document creation timestamp
- `updatedAt`: last-write timestamp

### Optional lifecycle metadata for later phases

These fields are not required for the first persistence slice, but reserve the model for later lifecycle work:

- `lifecycleState`: `active` or `pending_deletion`
- `deletionRequestedAt`: when a verified deletion request was accepted
- `purgeAfter`: when the document should be automatically removed if a deferred delete flow is used

## Persisted Payload Shape

Persist only canonical planner domain data.

Do not persist:

- current wizard step
- max visited step
- disclaimer acceptance
- modal state
- transient save state
- computed projections
- chart-specific derived data

Recommended encrypted payload:

```json
{
  "mode": "single",
  "person1": {},
  "person2": {},
  "fiAge": 65,
  "lifeVision": "",
  "aspirations": [],
  "lifeStages": [],
  "spendingCategories": [],
  "assumptions": {},
  "rlssStandard": "minimum",
  "jointGia": {},
  "careReserve": {}
}
```

## Crypto Model

### Browser responsibility

The browser must:

- obtain or derive the data key
- encrypt planner state before upload
- decrypt planner state after download

### Server responsibility

The server must:

- authenticate the request
- validate payload shape
- read and write ciphertext documents
- never inspect planner plaintext

### Algorithm

Use:

- AES-GCM 256-bit
- fresh random IV per encryption
- Web Crypto API only

Recommended:

- bind stable metadata as additional authenticated data where practical:
  - `userId`
  - `schemaVersion`
  - `revision`

## Key Management

### Version 1

Use a wrapped-key model:

1. Browser generates a random data key
2. Server uses Azure Key Vault to wrap it
3. Wrapped key is stored with the encrypted document
4. On later sessions, the wrapped key is recovered and unwrapped via the authorized path

This is the pragmatic v1 model.

### Deferred Version 2

Potential future enhancement:

- user-defined encryption passphrase
- browser-derived key
- optional recovery mechanism

Do not design v1 around the user's Clerk password.

## Lifecycle And Retention Model

Later-life planning is a long-lived use case.

Users may create an account long before they save their first plan, may keep a plan for many years, and may later ask for deletion or export.

The storage design needs to reflect those states explicitly.

### New user

For a newly authenticated user:

- Clerk holds the account identity and session
- the planner should not create a Cosmos DB document until the user actually saves or accepts a migration
- unsaved planner state can remain local to the browser session until the first remote save

This keeps the initial data footprint smaller and aligns with data-minimisation expectations.

If a user signs up and leaves without ever saving, the planner storage layer should hold no persisted plan document for that user.

### Long-term active user

For an active long-term user:

- keep exactly one active encrypted planner document per user
- update it in place using `revision`, not an in-app snapshot history
- track `createdAt` and `updatedAt` for support, recovery, and retention review
- retain the plan while the account remains active and the plan is still needed to provide the service

The app should not accumulate hidden plan archives by default.

If version history becomes a product requirement later, it should be introduced deliberately with its own retention policy rather than appearing accidentally through backups or debugging tools.

### User who has left

For a user who closes their account or asks for erasure:

- delete the active planner document from Cosmos DB without undue delay
- stop normal sync for that user
- remove any live operational copies created by the app
- keep only the minimum evidence needed to demonstrate the deletion request was handled, and keep that evidence outside the main planner document where practical

Two separate records exist in practice:

- the Clerk account lifecycle
- the planner document lifecycle

The product and support process must decide whether:

- deleting the Clerk account also deletes the planner document immediately, or
- the user can delete the planner document without deleting the full account

The initial implementation can keep this simple by making deletion support-led first, then adding self-serve controls later.

### Inactive accounts

Do not add automatic inactivity deletion in the first persistence release.

Why:

- later-life planning may legitimately span many years
- automatic deletion adds product, support, and legal-policy complexity
- it is safer to land authenticated encrypted persistence first, then add inactivity controls with clear notice

Later phases can add:

- an inactivity review policy
- warning notices before deletion
- an automated purge workflow using item-level TTL or a scheduled job where appropriate

## UK Data Protection Considerations

This section is engineering guidance, not legal advice.

Before production, confirm the final privacy notice, lawful basis, retention schedule, and data-subject-rights process with the appropriate legal or privacy owner.

The storage design should assume the following UK data protection expectations:

- personal data must not be kept for longer than needed
- retention periods must be thought through and documented
- users may ask for deletion when the data is no longer needed or where another erasure condition applies
- users may also have portability rights for data processed by automated means under the relevant lawful basis

For this app, the practical engineering implications are:

- document why plan data is retained while an account remains active
- periodically review whether inactive-account retention still matches the service purpose
- provide a process for erasure requests and record the decision
- provide a machine-readable export path in a later phase
- ensure deleted live data is not casually reintroduced from a backup restore

The current app should treat the following as required operational capabilities, even if the first user-facing UI remains minimal:

- a one-calendar-month response process for verified rights requests
- a deletion and restriction decision log
- a clear retention statement for live data and backup data

### Public-facing privacy requirements

The app does not need a special "GDPR declaration" page.

It does need a proper privacy notice.

For this product, the recommended baseline is:

- publish a privacy notice before live encrypted persistence launches
- link the notice from the sign-in flow, footer, and any account/help area
- explain the data lifecycle in plain language, including live retention and backup-retention limits
- identify `NxLap Ltd` as the controller for Later-Life Planner, with `VictoryLap` used as the public trading name unless the corporate structure changes before launch
- include a VictoryLap privacy contact route, lawful basis, recipients, international transfers, rights, and complaint route to the ICO

The notice should be written for ordinary users, not compliance specialists.

Use layered presentation where helpful:

- a short summary near the relevant UI
- a full privacy notice on a dedicated page

### Cookies and tracking

For the initial release, keep the posture simple:

- use essential cookies only where practical
- explain essential auth and security cookies in the privacy or cookie notice
- do not add non-essential analytics or marketing cookies unless the app is ready to collect and manage valid consent

If non-essential cookies or similar tracking technologies are introduced later:

- add a consent mechanism before setting them
- allow users to reject them as easily as they can accept them
- document the categories and purposes clearly

### Internal accountability requirements

Before production persistence goes live, `NxLap Ltd` should have:

- a documented lawful-basis decision for the planner data
- a record of processing activities
- controller-processor contracts or equivalent terms with relevant vendors
- a rights-handling process for access, export, deletion, and complaint handling
- an incident and breach-response process
- a documented retention and erasure policy

### DPIA and governance recommendations

The storage design does not automatically require a DPO.

However, `NxLap Ltd` should:

- document whether a DPO is required under the UK GDPR criteria
- record that decision even if the answer is no
- complete a DPIA before production persistence launches, or at minimum document a formal DPIA screening decision

Inference from the ICO guidance:

- a full DPIA is not automatically mandatory just because financial planning data is involved
- but it is strongly advisable here because the app handles sensitive financial information, account-based persistence, deletion rights, third-party processors, and long-lived user records

### ICO fee and registration check

Before launch, confirm whether `NxLap Ltd` must pay the ICO data protection fee.

Do not assume exemption.

Treat this as a launch checklist item, not something to revisit after production data already exists.

## Azure Platform Capabilities To Use

Use Azure platform features intentionally rather than treating recovery as a manual afterthought.

Recommended baseline:

- Azure Cosmos DB continuous backup with point-in-time restore
- the 7-day continuous backup tier for the initial release, unless a longer recovery window is explicitly justified
- same-account restore for accidentally deleted Cosmos databases or containers where Azure supports it

Current provisioned backup policy:

- periodic backup
- 4-hour interval
- 8-hour retention
- local redundancy

This means point-in-time restore is not currently available. If PITR is required for production, switch to continuous 7-day and update the runbooks.
- Azure Key Vault soft delete and purge protection for the application key vault
- Azure activity logs and diagnostics for restore actions and key operations

Later phases can additionally use:

- Cosmos DB item-level TTL for deferred purges or tombstones
- a separate deletion-ledger or tombstone container if the team needs stronger guardrails against accidental reintroduction of deleted records

## Backup, Recovery, And Deletion Operations

### Operational ownership

Restore and deletion operations must be restricted to a small, explicitly named operator group for `NxLap Ltd`.

Initial ownership model:

- operators: Azure AD group `nxlap-data-ops` (initial members: engineering lead + one designated backup operator)
- approvals: any restore or deletion workflow requires explicit human approval, not just automated jobs
- access control: use Azure RBAC roles scoped to the specific Cosmos account and Key Vault, preferably with time-bounded access

This prevents accidental restores into production and creates a clear accountability trail.

If the `nxlap-data-ops` group is not yet provisioned, use a break-glass owner temporarily and record the membership in the ops log.

### Administrative posture

Recovery and deletion are administrative workflows, not just API features.

They need documented runbooks, narrow permissions, and auditable approvals.

### Recommended operational model

| Scenario | Azure capability | Initial posture | Later-phase enhancement |
| --- | --- | --- | --- |
| Accidental overwrite or corruption of planner data | Cosmos DB periodic backup restore | Restore the latest periodic backup (RPO up to 4 hours) into a recovery account, then manually extract the user's encrypted document only after approval | Switch to continuous 7-day for PITR and add a scripted extraction workflow |
| Accidental deletion of a database or container | Cosmos DB periodic backup restore | Restore from periodic backup into a recovery account and manually copy the needed data | Switch to continuous backup to unlock same-account restore and add alerting/restore drills |
| Accidental deletion of wrap/unwrap key material | Key Vault soft delete and purge protection | Enable both at vault creation and recover deleted key versions instead of recreating keys | Add a formal key-rotation and rewrap runbook |
| User-requested deletion | Live Cosmos document deletion plus backup expiry | Delete the active document promptly and let backup copies age out within the configured retention window | Add a deletion ledger, self-serve delete UI, and automated purge safeguards |
| Inactive-user purge | Cosmos TTL or scheduled purge worker | Defer from the initial release | Add warning notices, a retention policy, and TTL-driven cleanup if justified |

### Recovery constraints to acknowledge

- Cosmos point-in-time restore of live data restores into a new account
- same-account restore is for deleted databases or containers, not general item history
- if a user deletes their data, a later platform restore must not silently repopulate that user's plan back into production
- if TTL is used later, restore procedures must account for TTL behavior before reconnecting recovered data
- if Cosmos DB customer-managed keys are used, the key material required at backup time must remain available for restore

### Deletion constraints to acknowledge

The app can delete the live planner document immediately.

Azure backup retention is different:

- backup copies may persist until the configured retention window expires
- the operational requirement is to put deleted data beyond normal use and avoid reintroducing it into production
- restore runbooks must include a step to filter or re-delete records that were previously erased by user request

## API Contract

Create a dedicated persistence surface:

- `GET /api/data`
- `PUT /api/data`

Optional future route:

- `POST /api/migrate-local-plan`
- `DELETE /api/data`

### GET /api/data

Behavior:

- verify Clerk auth
- identify user from token only
- fetch ciphertext document by user id
- return encrypted payload fields

Response cases:

- `200`: encrypted document exists
- `404`: no document yet
- `401`: auth missing or invalid

### PUT /api/data

Request body:

```json
{
  "schemaVersion": 1,
  "baseRevision": 6,
  "iv": "base64...",
  "ciphertext": "base64..."
}
```

Behavior:

- verify Clerk auth
- identify user from token only
- validate payload shape and size
- reject stale writes if `baseRevision` is older than current revision
- write new document version

Response cases:

- `200`: save accepted, returns new `revision` and `updatedAt`
- `401`: auth missing or invalid
- `409`: write conflict
- `400`: invalid payload

### DELETE /api/data

This route is deferred for a later phase when self-serve deletion is ready.

Behavior:

- verify Clerk auth
- identify user from token only
- delete the active planner document by verified user id
- return `204` on success

If self-serve deletion is not yet enabled, use a support-led process instead of exposing this route in the UI.

## Sync Behavior

The app should sync the full encrypted plan, not field-level patches.

### Load flow

1. user is authenticated
2. fetch encrypted document
3. unwrap or recover key
4. decrypt payload
5. hydrate planner store

### Save flow

1. subscribe to canonical planner-state changes
2. debounce
3. serialize canonical payload
4. encrypt in browser
5. send `PUT /api/data`
6. update save status and revision

### Conflict handling

Use optimistic concurrency based on `revision`.

If a save conflicts:

- surface `Conflict` in the UI
- allow the user to reload the remote version

## UI And Product Changes

Keep the initial persistence release simple.

### Initial release

The first encrypted-persistence release only needs lightweight UI changes:

- keep the signed-in save-status area
- make it clear that account-backed saving starts on first successful save
- link to the privacy notice and support contact from an account/help location
- if cookies remain essential-only, do not add a full consent banner yet

Do not block the initial release on a full account settings screen.

### Later phases

Once the persistence core is stable, add a dedicated account-data area with:

- last saved timestamp
- browser-side export of canonical planner JSON
- delete-plan or delete-account controls
- a clear warning that live deletion is immediate but backup expiry may take up to the configured backup retention period
- inactivity warnings if the product later adopts an inactivity deletion policy
- cookie or tracking preferences if non-essential tracking is added later

Export should be produced in the browser from decrypted canonical planner data where possible, so the server does not need to generate plaintext exports.

## Phased Delivery

### Phase 1.5: Azure persistence infrastructure

- create Cosmos DB and Key Vault resources
- choose the Cosmos continuous backup tier
- enable Key Vault purge protection
- document who is allowed to run restore and delete operations

### Phase 2: encrypted persistence MVP

- create the planner document on first save only
- support authenticated `GET /api/data` and `PUT /api/data`
- store `createdAt`, `updatedAt`, `schemaVersion`, and `revision`
- keep deletion support-led
- do not implement inactivity deletion yet

### Phase 3: user lifecycle controls

- add browser-side export
- add a minimal account-data panel
- add a product decision for plan-only deletion versus full account deletion
- add self-serve deletion only when the support and recovery path is ready

### Phase 4: operational hardening

- test point-in-time restore runbooks
- add deletion-request logging and approval flow
- ensure erased data is not reintroduced after restores
- add inactivity review and purge policy only if the business can justify it clearly
- complete a DPIA or documented DPIA screening decision before production persistence launch
- publish the VictoryLap privacy notice, identifying `NxLap Ltd` as controller, and confirm the ICO fee and controller-processor contract position

## External References

- ICO storage limitation guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/
- ICO privacy information content: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
- ICO timing of privacy information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/when-should-we-provide-privacy-information/
- ICO drafting privacy information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/how-should-we-draft-our-privacy-information/
- ICO right to erasure guidance: https://ico.org.uk/for-the-public/your-right-to-get-your-data-deleted/
- ICO right to data portability guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/
- ICO lawful basis guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/
- ICO documentation / Article 30 guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation/what-is-documentation/
- ICO processor contract guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/when-is-a-contract-needed-and-why-is-it-important/
- ICO cookie guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- ICO DPO guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-officers/
- ICO DPIA guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/
- GOV.UK ICO data protection fee: https://www.gov.uk/data-protection-register-notify-ico-personal-data
- Azure Cosmos DB continuous backup and point-in-time restore: https://learn.microsoft.com/en-us/azure/cosmos-db/continuous-backup-restore-introduction
- Azure Cosmos DB same-account restore: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-restore-in-account-continuous-backup
- Azure Cosmos DB TTL: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-time-to-live
- Azure Cosmos DB restore audit logging: https://learn.microsoft.com/en-us/azure/cosmos-db/audit-restore-continuous
- Azure Key Vault recovery, soft delete, and purge protection: https://learn.microsoft.com/en-us/azure/key-vault/general/key-vault-recovery

## Merge Strategy

- consider future merge UX only if real demand appears

For v1, no automatic merge logic is needed.

## Migration from Current Local Persistence

Current state is stored locally via Zustand persistence.

Migration behavior:

- detect legacy local planner data after auth
- allow explicit import into the new encrypted remote store
- once imported, mark migration complete locally

Do not silently overwrite an existing remote plan.

## Validation Rules

Add explicit limits:

- maximum ciphertext payload size
- valid base64 encoding checks
- valid revision type
- valid schema version

Corruption behavior:

- show a recoverable error state
- do not wipe remote data automatically
- allow retry or support-guided recovery path later

## Implementation Components

Recommended files:

- `src/lib/crypto.ts`
- `src/lib/cosmos.ts`
- `src/hooks/usePlanSync.ts`
- `src/app/api/data/route.ts`
- `src/lib/auth/requireUser.ts` or equivalent

Store updates:

- add hydration action for canonical plan payload
- move remote sync responsibility out of raw Zustand `persist`

## Testing Plan

Add tests for:

- encrypt/decrypt round trip
- malformed ciphertext rejection
- payload validation
- authenticated GET/PUT behavior
- unauthorized access rejection
- optimistic concurrency conflict
- local migration import
- sync retry/error behavior

## Delivery Order

Recommended order:

1. shared auth helper
2. crypto helper
3. Cosmos client
4. `GET /api/data`
5. `PUT /api/data`
6. Zustand hydration action
7. sync hook
8. migration flow
9. conflict UX

## Explicit Rejections

Do not implement:

- Supabase persistence
- plaintext planner storage server-side
- persistence keyed by user id from request body
- server-side parsing of planner financial fields for normal saves
