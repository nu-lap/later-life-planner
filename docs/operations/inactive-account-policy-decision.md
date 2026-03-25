# Inactive Account Review and Purge Decision

Status: approved for v1  
Decision date: 2026-03-25  
Owner: product + privacy owner (`NxLap Ltd`)

## Decision

For v1, **do not implement automatic inactivity purge**.

Instead:

- retain active-account planner data while the service remains active for that user
- use support-led deletion on verified request
- review inactivity posture on a fixed governance cadence

## Rationale

1. Product fit:
- later-life planning is long-lived and intermittent by nature
- long inactivity does not necessarily imply data is no longer needed

2. Risk control:
- automatic purge introduces high user-impact risk (unexpected data loss)
- current support-led deletion plus explicit runbooks is lower operational risk

3. Delivery scope:
- v1 prioritizes encrypted persistence reliability, restore safety, and deletion correctness
- inactivity automation can be added only after lifecycle controls and notices are mature

## Required Review Cadence

- review every 6 months
- review input:
  - total inactive accounts by age bucket
  - deletion-request volume
  - support incidents linked to long inactivity
  - legal/privacy changes affecting retention posture

## Trigger To Revisit Policy

Re-open this decision when any of the following occurs:

- new legal requirement mandates inactivity limits
- clear product requirement for automatic purge appears
- persistent storage cost/risk profile materially changes
- self-serve deletion and warning-notice UX are fully implemented

