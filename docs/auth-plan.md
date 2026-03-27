# Auth Plan

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on auth/session flow changes

This document defines the authentication and signed-in planner experience for Later-Life Planner.

It intentionally covers identity, route protection, planner session UX, migration, and save-state behavior only.

It does not define persisted storage architecture. Storage is owned by `docs/storage-plan.md`.

## Scope

This plan covers:

- Clerk as the authentication provider
- protected and public routes
- sign-in and sign-up UX
- planner shell behavior for authenticated users
- sign-out and reset behavior
- migration from the existing local-only planner state
- save-status UX
- auth-related tests

This plan does not cover:

- encrypted blob storage format
- Cosmos DB data model
- browser crypto implementation
- device key sharing / key-management implementation

Those belong to `docs/storage-plan.md` and `docs/security-decisions.md`.

## Goals

- Add account-based access without disrupting the current planner flow
- Keep the current planner UI and domain model intact
- Make the app safe for multi-user use on shared devices
- Support migration from the current local-only planner state
- Provide a clear signed-in experience with visible load/save status

## Non-Goals

- Rebuilding the planner state model
- Changing the five-step planner flow
- Replacing Zustand
- Adding team collaboration or shared household editing

## Chosen Identity Provider

Use Clerk for:

- sign-in
- sign-up
- session management
- route protection
- account menu
- JWT issuance for server-side verification

## Route Policy

Recommended v1 route policy:

- `/sign-in`: public
- `/sign-up`: public
- `/`: protected planner route

Rationale:

- The product is moving from local-only to user-specific saved plans
- A protected root keeps planner data and persistence behavior unambiguous
- It avoids building two planner modes at once

Optional future enhancement:

- A marketing or landing page can be added later at a separate public route if needed

## Auth Architecture

### App shell

- Wrap the app in `ClerkProvider`
- Add Clerk middleware to protect planner routes
- Add Clerk sign-in and sign-up route segments
- Add a signed-in header area with:
  - user menu
  - save status
  - reset plan action

### Shared auth helper

Create a single server-side helper for protected routes, for example:

- `requireUser()`

Responsibilities:

- verify Clerk session/JWT
- return stable user identity
- centralize unauthorized responses

This helper should be used by all future protected API routes.

## Planner State Boundaries

Do not persist the entire Zustand store as-is once authenticated storage is introduced.

Split planner state conceptually into:

### Domain state

Persist remotely:

- household mode
- persons
- FI age
- life vision
- aspirations
- life stages
- spending categories
- assumptions
- RLSS standard
- joint GIA
- care reserve

### UI state

Keep local or in-memory only:

- current step
- max visited step
- disclaimer acceptance
- wizard open/closed state
- local modal state
- save banners or transient error flags

Rationale:

- Remote persistence should store the plan, not the temporary UI session
- This reduces migration burden and future schema noise

## Signed-In Planner UX

### First load

When an authenticated user opens the planner:

1. Show a loading shell
2. If the device is not yet authorized, show a device approval prompt and block decryption until approval completes
3. Fetch the encrypted saved plan
4. Decrypt in the browser
5. Hydrate the planner state
6. Render the planner

If no saved plan exists:

- load a default new-plan state
- begin at Step 1

### Save indicator

Add a visible status indicator in the header with these states:

- `Loading`
- `Saving`
- `Saved`
- `Error`
- `Conflict`

This indicator should reflect actual remote sync state, not just local edits.

### Sign-out behavior

On sign-out:

- clear decrypted planner state from memory
- clear any local migration cache or temporary encrypted cache
- reset Zustand to a safe default
- redirect to sign-in

This behavior should be explicit and tested.

## Migration from Local-Only State

The current app stores planner data in localStorage.

On first authenticated session:

1. Check for existing legacy local planner data
2. If present, show a migration prompt
3. Offer:
   - `Import local plan`
   - `Start fresh`
   - `Keep remote plan` if a remote plan already exists

Do not auto-import silently.

Rationale:

- local data may be stale
- shared-device users may see another person's old local plan
- explicit choice is safer

## Reset Behavior

Keep two distinct user actions:

### Reset plan

- resets the current planner data
- if authenticated, saves the reset state remotely after confirmation

### Sign out

- ends the authenticated session
- clears in-memory planner data
- does not itself imply deleting the saved remote plan

If account-level plan deletion is needed later, make it a separate settings action.

## Clerk Implementation Checklist

- add `@clerk/nextjs`
- wrap layout in `ClerkProvider`
- add `src/middleware.ts`
- add `src/app/sign-in/[[...sign-in]]/page.tsx`
- add `src/app/sign-up/[[...sign-up]]/page.tsx`
- add signed-in header controls
- add auth helper for server routes
- wire sign-out reset behavior

## Testing Plan

Add tests for:

- unauthenticated access to `/` redirects correctly
- sign-in and sign-up routes remain public
- authenticated user can load planner shell
- sign-out clears planner state
- migration prompt appears when legacy local data exists
- save indicator transitions through load/save/error states
- protected API routes reject missing or invalid auth

## Delivery Order

Recommended order:

1. Clerk provider and middleware
2. sign-in/sign-up routes
3. header user controls
4. shared auth helper
5. migration prompt shell
6. save-status UX

## Open Questions

- Should the disclaimer be shown before sign-in, after sign-in, or both?
- Should the app ever support an anonymous local-only mode once authenticated storage ships?
- Should the planner root remain `/`, or should the signed-in planner move to `/app` or `/planner`?
