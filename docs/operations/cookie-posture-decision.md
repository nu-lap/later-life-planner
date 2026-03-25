# Cookie Posture Decision (Initial Launch)

Status: approved  
Owner: product + privacy owner (`NxLap Ltd`)  
Decision date: 2026-03-25  
Last reviewed: 2026-03-25

## Decision

Initial launch posture is essential-only cookies and equivalent local technologies.

Non-essential analytics, advertising, personalization, or cross-site tracking cookies are not enabled in the initial production persistence release.

## Essential-Only Scope

Allowed without consent banner:

- authentication/session continuity
- security and anti-abuse controls
- strictly necessary product operation state

Not allowed in initial launch:

- marketing or advertising trackers
- behavior analytics that are not strictly necessary
- third-party tags that set non-essential cookies

## Rule for Future Changes

If non-essential cookies or similar trackers are introduced later:

1. add a consent mechanism before setting those cookies
2. update privacy/cookie notice wording
3. record a new decision entry with implementation date and owner

## Validation Checklist

- application dependencies reviewed for non-essential trackers before each release
- marketing/analytics snippets must not be added directly to app shell without privacy-owner sign-off
- privacy notice kept aligned with implemented cookie posture
