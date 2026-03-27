# DPIA Screening Decision

Status: completed  
Decision date: 2026-03-25  
Owner: privacy owner (`NxLap Ltd`)
Review cadence: Reassess before major product-scope changes

## Scope Screened

Later-Life Planner authenticated persistence:

- account-linked planner storage
- encrypted financial planning data at rest
- long-lived user records
- support-led deletion and restore operations
- third-party processors (Clerk, Azure)

## Screening Outcome

**Outcome: full DPIA required before production persistence launch.**

## Screening Basis

The following risk factors are present:

- financial planning data with potential high user impact if mishandled
- cross-device persistence and key-management workflows
- restore and deletion operations with lifecycle complexity
- third-party processing and operational access paths
- potential rights-impacting scenarios (deletion, access, portability)

Given these factors, a lightweight screening note is not sufficient for launch governance.

## Required Exit Criteria

A production launch for persistence requires:

1. DPIA document completed and approved by the privacy owner.
2. Mitigations for high and medium risks tracked to closure or accepted risk record.
3. Link to approved runbooks for restore, deletion, revocation, and reintroduction prevention.
4. Privacy notice wording aligned to actual operational behavior.

## Current Launch Gate State

- DPIA approved: `NO`
- Persistence production launch gate: `BLOCKED` until DPIA approval
