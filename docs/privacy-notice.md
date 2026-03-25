# Privacy Notice (Later-Life Planner)

Status: published for production persistence launch readiness  
Controller: `NxLap Ltd` (trading as `VictoryLap`)  
Effective date: 2026-03-25  
Last reviewed: 2026-03-25

## 1. Who We Are

Later-Life Planner is operated by NxLap Ltd, trading as VictoryLap.

NxLap Ltd is the controller for personal data described in this notice.

Privacy and data-rights requests can be submitted through the Later-Life Planner support route. A dedicated privacy contact mailbox will be published in-product before public launch.

You can also complain to the UK Information Commissioner's Office (ICO): https://ico.org.uk/make-a-complaint/

## 2. What This Notice Covers

This notice applies to:

- account sign-in and account security
- use of planner features
- encrypted saved-plan persistence
- support and operational handling related to the service

## 3. Data We Use

We use the following categories of data:

- account and identity data (for example Clerk user identifier and account email)
- authentication/security telemetry (for example sign-in/session metadata and abuse-prevention signals)
- planner content entered by the user (stored remotely as encrypted payloads)
- service-operation metadata (for example created/updated timestamps, revision markers, support ticket references)
- essential cookie/session data required for sign-in and secure service operation

We do not intentionally log plaintext planner financial content in server logs.

## 4. Why We Use Data

We use personal data to:

- provide account access and secure authentication
- save and restore encrypted planner records
- support multi-device planner access after device approval
- provide customer support and rights handling
- maintain service reliability, recovery, and abuse prevention
- meet legal and regulatory obligations

## 5. Lawful Bases

NxLap Ltd relies on the following UK GDPR lawful bases:

| Purpose | Lawful basis |
| --- | --- |
| account provisioning and sign-in | contract (or steps prior to contract) |
| planner persistence and restore | contract |
| security controls, abuse prevention, and operational monitoring | legitimate interests |
| support and rights request handling | legitimate interests and legal obligation where applicable |
| legal/regulatory compliance record-keeping | legal obligation |

If non-essential analytics or marketing cookies are introduced in the future, consent will be used before those technologies are set.

## 6. Storage, Security, and Recovery

Planner data is stored in encrypted form in Azure-hosted persistence services.

Authentication is provided by Clerk.

Backup and recovery controls are documented in operational runbooks. Live deletion is prompt after validated request, but backup copies can persist until configured retention expires.

## 7. Data Sharing

We share personal data with processors that operate parts of the service on our behalf, including:

- Clerk (identity/authentication)
- Microsoft Azure (application hosting, storage, and backup/recovery infrastructure)

We may also disclose data where legally required (for example to regulators or law enforcement).

## 8. International Transfers

Some processors may process or access personal data outside the UK.

Where transfers occur, NxLap Ltd will rely on appropriate safeguards under UK data protection law (for example UK IDTA or approved addendum terms via processor agreements).

## 9. Retention

High-level retention posture:

- live planner records: retained while account/service use is active
- deleted planner records: removed from live systems without undue delay after validated request
- backup data: retained only for the configured backup window
- support/compliance records: retained only as long as necessary for handling and audit

Current backup posture is periodic backup with limited retention, as described in the data lifecycle policy and runbooks.

## 10. Your Rights

Subject to applicable law, you can request:

- access to your personal data
- correction of inaccurate data
- deletion of your personal data
- restriction or objection to certain processing
- data portability for data provided by you

Identity verification is required before rights requests are fulfilled.

## 11. Cookies and Similar Technologies

Initial launch posture is essential-only cookies/technologies:

- authentication/session integrity
- security and anti-abuse protections
- core product operation

Non-essential analytics or marketing cookies are not enabled by default for launch. If introduced later, the service will apply a consent mechanism before enabling them.

## 12. Automated Decision-Making

The service provides planning outputs for user exploration and does not make automated decisions with legal or similarly significant effects about the user.

## 13. Changes to This Notice

This notice will be updated when product, legal, or processor arrangements change. The effective date above will be updated on each revision.
