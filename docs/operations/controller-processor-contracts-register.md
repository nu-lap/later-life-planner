# Controller-Processor Contracts Register

Status: active  
Owner: privacy owner + operations owner (`NxLap Ltd`)  
Last reviewed: 2026-03-25

## Purpose

Record controller-processor contract status for vendors used to run Later-Life Planner production persistence.

NxLap Ltd acts as controller for planner personal data; listed vendors operate as processors/sub-processors as applicable.

## Contract Position

| Vendor | Service role | Contract status | Evidence owner |
| --- | --- | --- | --- |
| Clerk | authentication/session provider | confirmed: platform terms + DPA accepted for production tenant | privacy owner |
| Microsoft Azure | hosting, Cosmos persistence, backup/recovery, operational logs | confirmed: Microsoft Online Services DPA applies to subscription | privacy owner |
| GitHub | source control and CI metadata | confirmed for operational metadata; no planner plaintext persistence in GitHub workflows | engineering owner |

## Control Requirements

- no production launch if any required processor terms are unconfirmed
- vendor onboarding checklist must include controller/processor terms check
- material vendor change requires this register update before rollout

## Evidence Handling

Evidence artifacts (signed terms, acceptance screenshots, contract references) are stored in the internal compliance workspace, not in this repository.

Minimum evidence fields:

- vendor
- agreement/DPA identifier or version
- acceptance/activation date
- accepted by (name/role)
- renewal or revalidation date, if applicable

## Review Cadence

- at least every 6 months
- immediately when a new processor is introduced
- immediately when legal terms materially change
