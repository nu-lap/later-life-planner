# Planner Review and Implementation Plan

Review date: March 13, 2026

This document reviews the current state of the Later-Life Planner app against:

- `docs/prompts/product_prompt.md`
- `docs/superseded/auth-implementation-prompt.md`
- `docs/superseded/data-storage-design.md`

Decision precedence used in this review:

- `superseded/data-storage-design.md` overrides `superseded/auth-implementation-prompt.md` for storage and security architecture.
- `superseded/auth-implementation-prompt.md` still governs Clerk auth UX and migration flow where it does not conflict with the storage design.
- `prompts/product_prompt.md` governs product language, UX direction, financial rules, architecture boundaries, and testing expectations.

## Executive Summary

The planner app is already a strong and coherent local MVP. The main five-step flow exists, the financial engine is substantial, the UI follows the intended aspiration-first direction, and the app is in a healthy technical state.

What is still missing is the entire multi-user and secure persistence architecture. The codebase remains a local-only planner with Zustand persistence to `localStorage`. There is no Clerk integration, no protected routes, no encrypted storage flow, no `/api/data` persistence layer, and no Cosmos DB integration.

In short:

- Product MVP: mostly implemented
- Financial engine and dashboard: strongly implemented
- Auth and encrypted persistence: not yet implemented
- Product-language and documentation consistency: partially implemented

## Validation Snapshot

Current repo validation at review time:

- `npm test`: passed
- `npm run build`: passed

Observed test status:

- 8 test files passed
- 204 tests passed

This means the current app is internally stable even though it has not yet implemented the additional auth and storage work.

## Current State Against the Product Prompt

### Implemented Well

#### Core user journey

The main flow exists and matches the intended sequence:

1. Household Setup
2. Life Vision
3. Spending Goals
4. Income and Assets
5. Dashboard / Lifetime Plan

This is functionally aligned with the original product intent even though Step 5 and Step 7 from the product prompt are combined into one dashboard experience.

#### Financial independence framing

The app correctly uses financial independence age rather than framing the planner around "stopping work". The FI age drives life stage boundaries and display filtering from FI age onward.

#### Life stages

The Go-Go, Slo-Go, and No-Go stage model is implemented and adjustable. The planning engine also models pre-FI years while displaying charts from FI age onward, which is aligned with the prompt.

#### Spending goals and RLSS/PLSA templates

The app supports:

- Minimum / Moderate / Comfortable benchmarks
- Single and couple mode
- Category-level editing
- Dynamic benchmark comparison

This is close to the prompt and is one of the strongest parts of the current implementation.

#### Spending Smile framing

The app includes a Spending Smile explanation and uses that framing in the dashboard and spending step, which matches the prompt's educational layer requirement.

#### Care Reserve

Care Reserve is implemented in UI, state, and projections:

- toggleable
- configurable amount
- excluded from normal spending drawdown
- tracked separately
- shown distinctly in the dashboard

This is aligned with the product prompt.

#### Income and asset capture

The app supports:

- State Pension
- DB pension
- annuity
- part-time work
- other income
- DC pension
- ISA
- GIA
- cash
- property
- joint GIA

This covers the intended MVP scope well.

#### Tax-efficient drawdown engine

The financial engine includes:

- UFPLS-based DC drawdown
- LSA tracking
- per-person CGT handling
- joint GIA gain splitting
- gross-up iteration for tax-aware withdrawals
- FI-age-aware display logic

This is a major strength of the current app.

#### Dashboard and gamification

The dashboard includes:

- lifetime income vs spending
- asset chart
- depletion/surplus signaling
- tax overview
- year-by-year table
- income stability
- spending confidence
- funded goals

This effectively covers both the dashboard and gamification goals from the prompt.

#### Testing

Tests exist for:

- tax calculations
- projection engine
- planning bounds
- mock data normalization
- drawdown waterfall
- couple mode
- lifetime scenarios
- UI behavior

This is aligned with the engineering expectations in the product prompt.

### Partially Implemented

#### Product language consistency

The overall app mostly uses "later life" and "financial independence" framing, but "retirement" still appears in several user-facing or prompt-facing places:

- AI life-vision API prompt
- README
- some helper copy and references

This needs a cleanup pass so the product language is consistent.

#### Centralized financial constants

The project has a strong constants file and the engine uses it, but several components still hardcode tax figures or pension numbers in user-facing explanatory text. That weakens the stated design rule that financial values should be centralized.

#### Documentation

The README accurately reflects the current local MVP, but it no longer reflects the intended architecture from the auth and storage design documents. Documentation needs to be updated as implementation proceeds.

### Missing Relative to the Expanded Requirements

#### Auth and multi-user support

Not implemented:

- Clerk provider
- protected routes
- sign-in / sign-up pages
- user menu / sign-out flow
- signed-in planner shell
- migration flow for existing local users

#### Encrypted persistence architecture

Not implemented:

- browser crypto layer
- encrypted blob persistence
- `/api/data` GET and PUT routes
- Cosmos DB integration
- device-to-device DEK sharing (HPKE) for cross-device decryption
- secure user-specific persistence
- save indicator tied to remote sync

#### Security controls from the storage design

Not implemented:

- Clerk JWT validation on data routes
- user identity extracted from token on persistence routes
- encrypted payload storage
- server-side pass-through storage layer
- rate limiting on plan storage routes
- secure transport/security header strategy for the persistence API

## Current State Against the Auth Implementation Prompt

The app does not yet implement the Clerk-based auth plan.

### Not Implemented

- `@clerk/nextjs` dependency
- `ClerkProvider` in app layout
- Clerk route middleware
- sign-in page
- sign-up page
- `UserButton` in header
- signed-in route protection
- user-specific plan sync hook
- store reset on sign-out
- localStorage-to-account migration UX
- loading state for authenticated plan fetch
- save/saving indicator

### Important Design Note

The auth prompt proposes Supabase storage, but this should not be implemented as written because the storage design document replaces Supabase with Cosmos DB plus client-side encryption.

Clerk remains valid.
Supabase does not.

## Current State Against the Data Storage Design

The secure storage design is not yet implemented.

### What Exists

- local-only persistence via Zustand `persist`
- one server route for AI life-vision generation
- a simple in-memory rate limiter used by that AI route

### What Is Missing

- encrypted blob model
- Web Crypto helper module
- Cosmos DB client wrapper
- authenticated `/api/data` routes
- Clerk JWT validation on persistence routes
- ciphertext-only server persistence
- device registry + per-device wrapped DEK packages (HPKE device approval flow)
- recovery-key UX or passphrase upgrade path
- remote sync conflict handling

### Security Gap Summary

Today, planner data is stored in plaintext in browser storage. That is acceptable for a local MVP, but it does not meet the requirements in `superseded/data-storage-design.md`.

## Key Findings and Gaps

### 1. The app is still a local MVP

The current planner is architecturally still "single user on one browser" software.

Implications:

- no account-based access
- no cross-device sync
- no server-side persistence
- no encrypted storage

### 2. Product language is not fully consistent

The product prompt explicitly says to avoid the term "retirement" in user-facing copy except where it is part of a named external concept or standard. The codebase still contains user-visible and prompt-visible uses of "retirement".

This is a correctness issue relative to the product definition, not just a copy preference.

### 3. Constants centralization is incomplete

The engine is well-structured, but some UI copy still hardcodes numeric tax/pension values instead of deriving them from the constants module.

This creates future maintenance risk when annual rates change.

### 4. Documentation currently describes the old architecture

The README and environment examples still describe:

- no auth
- no database
- no persistence beyond local state

That is accurate for today, but not for the target architecture. As soon as auth and encrypted persistence are introduced, docs will become a source of confusion unless updated in the same phase.

## Recommended Implementation Plan

## Phase 0: Hygiene and Alignment

Goal: remove obvious drift before larger architecture work.

### Tasks

- Remove user-facing and prompt-facing uses of "retirement" where they conflict with product language.
- Update the AI life-vision endpoint prompt to use later-life / freedom-phase language.
- Replace hardcoded tax and pension figures in UI copy with values sourced from `src/config/financialConstants.ts`.
- Align `WITHDRAWAL_ORDER` constants with the actual implemented engine ordering, or refactor the engine to consume the central ordering definition.
- Clean up README wording so the product language matches the app.

### Outcome

- Product language becomes consistent
- annual tax updates become easier
- future implementation work rests on clearer foundations

## Phase 1: Clerk Authentication Foundation

Goal: add multi-user identity without changing planner behavior yet.

### Tasks

- Add `@clerk/nextjs`
- Wrap the app with `ClerkProvider`
- Add `src/middleware.ts` for route protection
- Add sign-in route
- Add sign-up route
- Add account menu / sign-out UI in the header
- Define authenticated vs unauthenticated app shell behavior

### UX requirements

- Planner routes should require authentication once the authenticated architecture is enabled
- sign-in and sign-up routes should remain public
- sign-out should clear in-memory planner state

### Outcome

- identity model exists
- route protection exists
- the app is ready for user-specific plan storage

## Phase 2: Persistence Architecture Pivot

Goal: move from local-only persistence to the encrypted persistence design.

### Tasks

- Add `src/lib/crypto.ts`
- Add browser-side helpers for:
  - key derivation or key management
  - encrypt
  - decrypt
  - base64 conversion helpers
- Add `src/lib/cosmos.ts`
- Add `/api/data` GET route
- Add `/api/data` PUT route
- Validate Clerk JWT on both routes
- Ensure user identity is derived from the verified token only
- Persist only:
  - `id`
  - `schemaVersion`
  - `iv`
  - `ciphertext`
  - `updatedAt`

### Important architectural rule

The server must never receive or store plaintext planner state outside the encrypted blob contract.

### Outcome

- secure server persistence layer exists
- app is no longer dependent on localStorage as the source of truth

## Phase 3: Client Sync Layer

Goal: connect authenticated users to encrypted plan storage without rewriting the planner state shape.

### Tasks

- Add a `loadState` or equivalent hydration action to the planner store
- Add `src/hooks/usePlanSync.ts`
- On authenticated app load:
  - fetch encrypted plan
  - decrypt in browser
  - hydrate Zustand
- On planner changes:
  - debounce
  - encrypt full state
  - persist via `PUT /api/data`
- Add UI save states:
  - loading
  - saving
  - saved
  - error

### Migration behavior

- Detect existing `localStorage` planner state on first authenticated session
- Offer import/migration into the new encrypted account storage
- Keep the migration explicit rather than automatic

### Outcome

- user plans become portable across devices
- the current store model is preserved
- users get visible save status

## Phase 4: Key Management Strategy

Goal: implement the storage design's key handling in a practical sequence.

### Recommended approach

Implement device-to-device DEK sharing first:

- generate a random DEK in the browser
- authorize additional devices by wrapping the DEK per-device using HPKE and storing only the wrapped package server-side
- avoid a routine server-side unwrap path for user DEKs

Then design a passphrase-based mode as a later enhancement:

- local passphrase
- PBKDF2-based browser-derived key
- recovery-key flow

### Why this order

Option B is faster to ship and easier to fit into Clerk-based authentication.

Option A provides stronger end-to-end guarantees but adds significant UX and recovery complexity.

### Outcome

- secure practical persistence ships sooner
- architecture remains open to stronger future privacy guarantees

## Phase 5: Security Hardening

Goal: satisfy the operational controls in the storage design.

### Tasks

- Add rate limiting to `/api/data`
- Add secure headers strategy for persistence routes and app shell
- Ensure no planner plaintext is logged
- Validate payload shapes strictly
- Add schema versioning for encrypted state
- Add explicit error handling for:
  - invalid token
  - corrupt ciphertext
  - missing plan
  - stale plan
  - sync conflict

### Outcome

- storage flow becomes production-credible
- risk of data leakage is materially reduced

## Phase 6: Documentation and Operational Readiness

Goal: make the repo truthful and maintainable after the architectural change.

### Tasks

- Update `README.md`
- Update `.env.example`
- Document required environment variables for:
  - Clerk
  - Cosmos DB
  - Key Vault
  - any route protection / crypto settings
- Document local development flow
- Document migration from old local-only planner state
- Document deployment assumptions for Vercel and Azure resources

### Outcome

- future contributors will not reintroduce stale architecture assumptions
- deployment becomes repeatable

## Recommended Execution Order

Recommended practical order:

1. Phase 0: hygiene and consistency
2. Phase 1: Clerk auth foundation
3. Phase 2: encrypted persistence API and Cosmos integration
4. Phase 3: Zustand sync layer and save UX
5. Phase 4: key management implementation
6. Phase 5: security hardening
7. Phase 6: docs and deployment updates

## Recommendations

### Recommendation 1

Do not implement Supabase.

Reason:

`superseded/data-storage-design.md` explicitly replaces Supabase with Cosmos DB and client-side encryption. Implementing Supabase now would create throwaway work and architectural drift.

### Recommendation 2

Keep the current planner UI structure.

Reason:

The existing five-step flow already matches the product intent well. The missing work is mostly architectural, not structural.

### Recommendation 3

Treat the life-vision AI endpoint as low-sensitivity copy generation only.

Reason:

It currently only uses aspiration tags and planning mode. That is a safe boundary. Do not send full financial plans to third-party model APIs unless that is explicitly designed and disclosed.

### Recommendation 4

Preserve the current financial engine boundary.

Reason:

The separation between:

- UI
- store
- constants
- financial engine
- tests

is already one of the best parts of the codebase.

### Recommendation 5

Prefer small phases with passing tests after each step.

Reason:

The app is already stable. The auth and persistence work is invasive enough that it should be introduced incrementally:

- auth first
- persistence API second
- sync third
- docs last

### Recommendation 6

Update docs as soon as the architecture shifts.

Reason:

Today the docs are accurate for the current MVP. Once auth and encrypted persistence start landing, stale docs will become a liability immediately.

## Suggested Near-Term Milestones

### Milestone 1

Product and consistency cleanup:

- remove forbidden wording
- centralize displayed constants
- align docs and constant ordering

### Milestone 2

Authentication shell:

- Clerk provider
- middleware
- sign-in / sign-up
- user button

### Milestone 3

Secure storage backbone:

- crypto helpers
- Cosmos client
- `/api/data`
- JWT validation

### Milestone 4

Plan sync UX:

- load/decrypt/hydrate
- debounce/encrypt/save
- save status
- local migration flow

### Milestone 5

Hardening and release readiness:

- security controls
- env docs
- deployment docs
- regression tests

## Final Assessment

The planner app is already ahead of a typical MVP in product depth, modeling quality, and test coverage. The core planning experience is real and usable now.

The next major step is not more calculator work. It is the transition from a polished single-browser planner into a secure multi-user product with authenticated, encrypted persistence.

That should be treated as the primary implementation track from here.
