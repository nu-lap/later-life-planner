# Privacy Notice Outline

## Document Control

- Status: Active
- Owner: Privacy Owner (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on legal/policy changes

This outline is a product-specific starting point for the Later-Life Planner privacy notice operated by NxLap Ltd, trading as VictoryLap.

It is not final legal text.

Before publication, fill in the remaining controller details, vendor list, transfer details, and lawful-basis decisions with the appropriate legal or privacy owner.

## 1. Who We Are

Purpose:

- identify NxLap Ltd as the organisation operating Later-Life Planner, with VictoryLap as the trading name presented to users
- provide a contact route for privacy questions

Include:

- legal entity name: `NxLap Ltd`
- trading name: `VictoryLap`
- registered address or principal business address
- privacy contact email, for example `privacy@victorylap...`
- DPO contact details if one is appointed

Suggested plain-English heading:

- `Who we are`

## 2. What This Notice Covers

Purpose:

- explain that the notice applies to account creation, sign-in, planner use, saved plan storage, support requests, and related website operation

Suggested wording points:

- Later-Life Planner is provided by NxLap Ltd, trading as VictoryLap
- the planner helps users explore later-life financial planning scenarios
- the notice explains what personal data is used, why it is used, how long it is kept, and what rights users have

## 3. The Personal Data We Use

Purpose:

- group data into understandable categories

Suggested categories:

- account and identity data
  - name
  - email address
  - Clerk user identifier
- authentication and security data
  - sign-in events
  - session and device security information
  - IP address and browser metadata used for fraud prevention and service security
- planner data
  - household setup
  - income sources
  - assets
  - spending assumptions
  - lifestyle goals
  - encrypted saved-plan payload
- service-operation data
  - timestamps such as account creation, plan creation, and last saved time
  - support correspondence
  - error and operational logs that do not contain planner plaintext
- website and cookie data
  - essential cookies required for sign-in and service delivery
  - any analytics or preference cookies, if introduced later

## 4. Why We Use Your Data

Purpose:

- explain each purpose in user terms

Suggested purposes:

- create and manage user accounts
- authenticate users and protect the service from misuse
- save and restore encrypted planner data across sessions and devices
- provide customer support
- maintain service security, reliability, backup, and recovery operations
- comply with legal obligations and respond to rights requests
- improve the service, but only if the relevant analytics or feedback tooling is actually used

## 5. Our Lawful Bases

Purpose:

- map each main purpose to a UK GDPR lawful basis

This section must be completed with the final legal decision.

The lawful-basis table should be stated as the position of NxLap Ltd as controller.

Likely structure:

| Purpose | Likely lawful basis | Notes to confirm |
| --- | --- | --- |
| Account creation and sign-in | Contract or steps before entering a contract | Confirm product model |
| Saving and restoring planner data | Contract or legitimate interests | Confirm with legal owner |
| Security monitoring and abuse prevention | Legitimate interests or legal obligation | Confirm exact use case |
| Support and complaint handling | Legitimate interests or legal obligation | Confirm exact use case |
| Optional analytics or marketing cookies | Consent | Only if these are introduced |

If special-category data is not intentionally collected, say so only if that statement is accurate after review.

## 6. Where Planner Data Is Stored And Protected

Purpose:

- explain the core storage design simply

Suggested points:

- saved planner data is stored in encrypted form
- the service uses Azure-hosted infrastructure for storage and recovery
- account authentication is provided by Clerk
- backup and recovery systems may hold protected copies for limited periods
- deleting live planner data does not necessarily remove backup copies immediately; backups expire according to the service retention policy

Avoid overstating the architecture.

Do not describe the service as end-to-end encrypted unless the final implementation truly supports that claim.

## 7. Who We Share Data With

Purpose:

- identify categories of recipients and key processors

Likely categories:

- identity and authentication provider
- cloud hosting and storage providers
- customer support tools, if used
- regulators, law enforcement, courts, or advisers where legally required

The final notice should name the actual providers in use at launch where appropriate.

For the current architecture, that likely includes:

- Clerk
- Microsoft Azure

The notice should make clear that these providers act for NxLap Ltd in connection with operating Later-Life Planner, subject to the final legal and contractual structure.

## 8. International Transfers

Purpose:

- explain whether any personal data is transferred outside the UK and what safeguards apply

This section must be completed with the final vendor-specific facts.

Suggested structure:

- whether data is stored or accessed outside the UK
- which vendors are involved
- what transfer mechanism or safeguard applies

## 9. How Long We Keep Data

Purpose:

- explain retention in user terms

Suggested structure:

- account data: kept while the account is active and as needed for service delivery, security, and legal obligations
- live planner data: kept while the user keeps the account or saved plan active
- deleted planner data: removed from live systems without undue delay after a valid deletion request or account-closure flow, subject to limited backup retention
- support and rights-request records: kept only as long as needed to handle the request and demonstrate compliance
- cookie and analytics data: described separately if non-essential tracking is added later

This section should also explain:

- that there is no automatic inactivity deletion in the first persistence release, if that remains true at launch
- that backup copies may persist for a limited period after live deletion

## 10. Your Rights

Purpose:

- explain user rights under UK data protection law

Likely list:

- right to be informed
- right of access
- right to rectification
- right to erasure
- right to restrict processing
- right to object
- right to data portability
- rights related to automated decision-making, if relevant

For this product, call out specifically:

- how to request deletion of saved planner data
- how to request an export of planner data once export is supported
- how identity will be verified before acting on a request

## 11. Cookies And Similar Technologies

Purpose:

- explain the initial essential-only posture and leave room for later analytics consent if needed

Suggested structure:

- essential cookies used for sign-in, security, and service operation
- no non-essential analytics or marketing cookies in the initial release, if that remains true
- if non-essential cookies are added later, users will be given a clear choice before they are set

If a separate cookie notice is used, link to it here.

## 12. Automated Decision-Making

Purpose:

- explain whether the service uses automated decision-making with legal or similarly significant effects

Likely initial answer:

- the planner generates modelling outputs for user exploration
- it does not make legally binding decisions about the user

Confirm before publication.

## 13. Security And Recovery

Purpose:

- explain high-level security and recovery practices without oversharing

Suggested points:

- authentication controls
- encrypted storage design
- role-restricted administration
- backup and recovery testing
- incident handling process

Avoid detailed security claims that the team cannot maintain operationally.

## 14. How To Contact Us Or Complain

Purpose:

- provide the route for privacy questions and ICO complaints

Include:

- VictoryLap privacy contact email
- support contact route
- ICO complaint information and link

Suggested wording point:

- users can contact us first, but they also have the right to complain to the Information Commissioner's Office

## 15. Changes To This Notice

Purpose:

- explain how updates will be handled

Suggested points:

- include an effective date
- update the notice when practices change materially
- notify users where appropriate for significant changes

## Launch Recommendations

Before publishing the final notice:

- confirm NxLap Ltd's controller identity, registered details, and contact routes
- confirm the lawful basis for each main purpose
- confirm vendor list and transfer details
- confirm backup-retention wording matches the chosen Azure backup tier
- confirm the deletion wording matches the actual support and product flow
- confirm whether analytics or non-essential cookies are present at launch
- confirm whether a DPO is required and whether the notice needs DPO contact details
- confirm the notice is linked from sign-in, footer, and account/help areas
- confirm the company number and registered office details once NxLap Ltd is incorporated

## Source Material

- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`

External guidance:

- ICO privacy information content: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
- ICO timing of privacy information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/when-should-we-provide-privacy-information/
- ICO drafting privacy information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/how-should-we-draft-our-privacy-information/
- ICO right to erasure guidance: https://ico.org.uk/for-the-public/your-right-to-get-your-data-deleted/
- ICO right to data portability guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-data-portability/
- ICO cookie guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- ICO DPO guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-officers/
