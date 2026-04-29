# Implementation Checklist

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Last reviewed: 2026-04-15
- Review cadence: Weekly while active implementation phases are open; otherwise monthly

This checklist translates the current canonical planning docs into a practical execution sequence:

- `docs/auth-plan.md`
- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`

Priority order:

1. Phase 0: product and consistency cleanup
2. Phase 1: Clerk auth foundation
3. Phase 1.5: Azure persistence infrastructure
4. Phase 2: encrypted persistence backbone
5. Phase 3: sync and migration UX
6. Phase 3.5: device-to-device DEK sharing (HPKE)
7. Phase 4: hardening, tests, and operational readiness
8. Phase 5: tests and docs
9. Phase 6: documentation consolidation and refresh
10. Phase 7: pension contribution modelling
11. Phase 8: IHT planning and post-freeze tax band escalation
12. Phase 9: PCLS + Bed & ISA withdrawal strategy

## Phase 0: Product and Consistency Cleanup

- [x] Remove forbidden user-facing uses of "retirement" where they conflict with the product prompt.
- [x] Update the AI life-vision route prompt to use later-life / freedom-phase language.
- [x] Replace hardcoded financial figures in UI copy with values sourced from `src/config/financialConstants.ts`.
- [x] Align `WITHDRAWAL_ORDER` constants with the actual implemented engine order, or refactor the engine to consume the central constant directly.
- [x] Update `README.md` language so it reflects the current product framing.

## Phase 1: Clerk Auth Foundation

- [x] Add `@clerk/nextjs`.
- [x] Add Clerk environment variable placeholders to `.env.example`.
- [x] Wrap the app with `ClerkProvider`.
- [x] Add `src/middleware.ts` for protected route handling.
- [x] Add `src/app/sign-in/[[...sign-in]]/page.tsx`.
- [x] Add `src/app/sign-up/[[...sign-up]]/page.tsx`.
- [x] Add a shared auth helper for protected server routes.
- [x] Add signed-in header controls:
- [x] User account button
- [x] Save-status area
- [x] Sign-out-safe reset behavior
- [x] Decide whether the disclaimer is pre-auth, post-auth, or both.
  Current decision: post-auth inside the protected planner shell.

## Phase 1.5: Azure Persistence Infrastructure

- [x] Decide whether persistence resources live in the existing `rg-later-life-planner` or a dedicated data resource group.
  Decision: use the existing `rg-later-life-planner` for v1.
- [x] Create Azure Cosmos DB account for planner persistence.
- [x] Choose the Cosmos DB backup mode and retention tier for planner data.
  Recommended: use the lowest-cost option that still meets recovery needs. For MVP, prefer periodic backup by default, or continuous 7-day only if point-in-time restore is required.
  Current: periodic backup, 4h interval, 8h retention, local redundancy.
- [x] Create database `later-life-planner`.
- [x] Create container `user-plans` with partition key `/id`.
- [x] Create an application Key Vault reserved for optional future envelope-key support.
- [x] Enable Key Vault soft delete and purge protection.
- [x] Decide and provision runtime Azure auth for app data access.
  Recommended: Azure Container Apps managed identity with data-plane access to Cosmos DB and Key Vault.
- [x] Wire Azure resource identifiers and access settings into Azure Container Apps.
  Current: deployed via CI/CD `deploy` job env wiring.
- [x] Update CI/CD to set Cosmos DB and Key Vault env vars on deploy.
- [x] Backfill IaC for Cosmos DB, Key Vault, and ACA managed identity (currently provisioned manually).
- [x] Smoke-test non-production access to Cosmos DB and Key Vault before writing persistence code.
  Current: automated post-deploy `persistence-smoke-test` job validates ACA managed identity role wiring and persistence env configuration.
- [x] Document who can run restore and deletion operations for planner data.
- [x] Keep ACR and ACA deployment resources as-is; this phase adds persistence resources rather than changing the release platform.

## Phase 2: Encrypted Persistence Backbone

- [x] Add `src/lib/crypto.ts`.
- [x] Add `src/lib/cosmos.ts`.
- [x] Add authenticated `GET /api/data`.
- [x] Add authenticated `PUT /api/data`.
- [x] Enforce identity from verified Clerk auth only.
- [x] Create the remote planner document only on first successful save or migration.
- [x] Persist ciphertext only; never persist plaintext planner data.
- [x] Introduce `createdAt`, `schemaVersion`, `revision`, and `updatedAt` handling.
- [x] Add validation for ciphertext payload shape and size.
- [x] Keep deletion support-led in the initial persistence release.

## Phase 3: Sync and Migration UX

- [x] Add a canonical planner hydration action to the Zustand store.
- [x] Separate domain state from UI-only state for persistence purposes.
- [x] Add `src/hooks/usePlanSync.ts`.
- [x] Load, decrypt, and hydrate planner state on authenticated startup.
- [x] Debounce encrypt-and-save on canonical planner state changes.
- [x] Add save-state UX:
- [x] Loading
- [x] Saving
- [x] Saved
- [x] Conflict
- [x] Error
- [x] Add localStorage migration prompt for legacy local plans.
- [x] Prevent silent overwrite of an existing remote plan.
- [x] Add a minimal account-data panel for lifecycle actions once the persistence core is stable.
- [x] Add browser-side export of canonical planner data.
- [x] Decide whether users can delete only planner data or must delete the full account.
  Decision: keep deletion support-led in-product for now; no self-serve planner delete until recovery runbooks are validated.
- [x] Add self-serve delete UI only when the support and recovery path is ready.
  Current implementation: gated off and intentionally not exposed.

## Phase 3.5: Device-to-Device DEK Sharing (HPKE)

Goal: enable cross-device decryption without storing the per-user DEK as a browser-local-only string.

Design guide: `docs/device-to-device.md`.

High-level outcome:

- the remote plan remains encrypted with a per-user DEK
- each device has its own keypair
- the DEK is wrapped per-device using HPKE and stored server-side as ciphertext
- a newly signed-in device becomes usable only after an explicit approval on an existing device

Implementation tasks:

- [x] Decide and document the HPKE suite for v1 (RFC 9180), including AAD binding fields.
  Current: `DHKEM(P-256,HKDF-SHA256)` / `HKDF-SHA256` / `AES-256-GCM`, with AAD binding `{ scope, userId, deviceId, requestId, schemaVersion, expiresAt }`.
- [x] Define the Cosmos data model for:
- [x] registered devices (public keys + status)
- [x] per-device wrapped DEK packages
- [x] Add protected API routes for device registration and approval:
- [x] `POST /api/devices` (register new device + public key)
- [x] `GET /api/devices` (list devices and pending approvals)
- [x] `POST /api/devices/:deviceId/approve` (store wrapped DEK package)
- [x] `GET /api/devices/:deviceId/wrapped-dek` (retrieve wrapped DEK package)
- [x] `POST /api/devices/:deviceId/wrapped-dek` (consume wrapped DEK after the recipient confirms decrypt + persistence)
- [x] Add rate limiting rules for the device-approval API surface (polling, approvals, retries, and consume).
- [x] Add a client-side device key store (private key + cached DEK) using IndexedDB.
  Current: device HPKE private key is stored as a non-extractable `CryptoKey` in IndexedDB; DEK is stored encrypted at rest in IndexedDB; when IndexedDB is blocked/unavailable, sync fails fast into local-only mode.
- [x] Add a "device approval required" UX:
- [x] show a copy/paste approval code with `{ deviceId, requestId, expiresAt, publicKeyFingerprint }` (JSON)
- [x] show pending-device list and an approve action on an already-authorized device (paste code + approve)
- [x] On successful approval, unwrap DEK, decrypt remote plan, and continue normal sync.
- [x] Add audit-friendly server logs for device registration and approvals (metadata only; never plaintext planner data or keys).
- [x] Add tests that lock the state machine:
- [x] new device cannot decrypt until approved
- [x] approval is single-use and expires
- [x] wrong user cannot approve or fetch wrapped keys
- [x] revoke/rotate behavior is well-defined

### Phase 3.5 UX Extension: Usable Key Exchange

Current status: the underlying security model is in place, but the UX for approving devices is too confusing (copy/paste JSON on the approving device, and device controls embedded in the main planner page).

Goal: keep the “new device” modal, but move the approving-device controls out of the planner flow and make approval link-first (QR + link), with paste-only as a fallback.

Implementation tasks:

- [x] Remove device approvals and sync controls from the main planner page UI.
  Current: `AccountDataPanel` is rendered in `src/app/page.tsx` on the planner shell.
- [x] Add a dedicated authenticated account area:
  - [x] `GET /account` (sync status, export, reload remote)
  - [x] `GET /account/devices` (device list + pending approvals + approval flow)
- [x] Add a header entry point that does not interrupt the planning journey:
  - [x] “Account” link/button next to the user button
  - [x] pending approvals badge (count) that links to `/account/devices`
- [x] Make the new-device modal approval UX link-first:
  - [x] show QR code for an approval link using a URL fragment (client-side only)
  - [x] add “Copy approval link” button
  - [x] keep “Copy approval code” as a fallback (advanced)
- [x] Make the approving-device UX understandable:
  - [x] approve screen supports opening an approval link (auto-prefill) and pasting code as fallback
  - [x] pending device list uses friendly labels and expiry countdown; hide raw ids behind a “details” toggle
- [x] Update tests to cover the new UX:
  - [x] header badge/link presence and navigation
  - [x] approval link parsing and prefill
  - [x] fallback paste still works
  - [x] regression tests for the approval state machine remain passing

## Phase 4: Security and Reliability

- [x] Add optimistic concurrency handling using `revision`.
- [x] Add route rate limiting for protected data routes.
- [x] Add secure handling for malformed ciphertext and corrupt payloads.
- [x] Ensure sign-out clears decrypted planner state from memory.
- [x] Ensure planner plaintext never reaches logs.
- [x] Define device revocation and DEK rotation rules and write a runbook for recovery scenarios.
- [x] Write and test point-in-time restore runbooks for planner data.
- [x] Write and test user-deletion runbooks, including backup-expiry handling.
- [x] Ensure erased user data is not reintroduced after restore operations.
- [x] Decide whether an inactive-account review or purge policy is required.
- [x] Complete a DPIA or documented DPIA screening decision before production persistence launch.
- [x] Document whether a DPO is required and record the reasoning.

## Phase 5: Tests and Docs

- [x] Add auth route tests.
- [x] Add protected API auth tests.
- [x] Add crypto round-trip tests.
- [x] Add sync-state and conflict tests.
- [x] Add migration-flow tests.
- [x] Update `README.md` to reflect authenticated encrypted persistence.
- [x] Update `.env.example` with Clerk, Cosmos, and Key Vault placeholders.
- [x] Document deployment assumptions for the chosen hosting environment.
- [x] Document retention, deletion, export, and backup-recovery policy for user data.
- [x] Publish a privacy notice before production persistence launches.
- [x] Decide the initial cookie posture and keep it essential-only unless a consent mechanism is ready.
- [x] Confirm controller-processor contracts or equivalent terms for NxLap Ltd with Clerk, Azure, and other relevant vendors.
- [x] Confirm the ICO data protection fee position for NxLap Ltd before launch.

## Phase 6: Documentation Consolidation and Refresh

Goal: clean up, align, and re-baseline all docs under `docs/` and the root `README.md` to the current shipped implementation.

Implementation tasks:

- [x] Add a docs ownership and review cadence section (owner + last-reviewed date) to each active docs file.
- [x] Add a docs index and status map in `docs/README.md` (active, operational, superseded).
- [x] Normalize cross-links and remove stale references to replaced workflows and old phase plans.
- [x] Align all operational runbooks under `docs/operations/` with the current device-approval and encrypted-sync implementation.
- [x] Reconcile product wording and technical terminology across `docs/auth-plan.md`, `docs/storage-plan.md`, `docs/security-decisions.md`, and `docs/azure-architecture.md`.
- [x] Update the root `README.md` to describe the current implementation state (auth, encrypted sync, account/device approval UX, and conflict handling).
- [x] Record unresolved or deferred docs updates as explicit backlog items in this checklist.

### Outstanding Documentation Work

- [ ] Full pass review/update of every active file under `docs/` (content + links + terminology consistency).
- [ ] Archive or mark superseded docs that no longer represent the active architecture/flow.
- [ ] Refresh historical operational docs under `docs/operations/` that still reference removed Codex workflows (`codex-auto-fix`, legacy review paths) or move them to `docs/superseded/`.
- [ ] Refresh the testing and operations docs to include current PR-gate/Copilot workflow troubleshooting guidance and expected run states.

### Completed Documentation Meta-Tasks
- [x] Replace the legacy "Immediate Next Slice" recommendations below with the next delivery backlog once the next active implementation phase is approved.

## Recommended Next Implementation Slice (Current)

- Complete the "Outstanding Documentation Work" backlog items listed above.
- After that docs backlog is complete, define and add the next product/engineering delivery phase to this checklist.

## Phase 7: Pension Contribution Modelling

Goal: expand asset capture so LaterLifePlan can model ongoing pension contributions
between now and FI age for both workplace pensions and SIPPs.

Implementation tasks:

- [ ] Extend the pension asset model to support workplace pension contributions as a fixed percentage of salary per year.
- [ ] Treat workplace pension contribution percentage as applying until FI age, then stopping automatically at FI age.
- [ ] Assume salary rises with inflation each year when projecting workplace pension contributions.
- [ ] Support workplace pension contribution inputs for both single and couple plans.
- [ ] Add workplace pension contribution inputs to the Get Started wizard.
- [ ] Add workplace pension contribution inputs to the `Income & Assets` flow inside the `DC / Personal Pension` panel.
- [ ] Add SIPP contribution inputs as a fixed gross annual amount.
- [ ] Treat the SIPP annual amount as rising with inflation each year until FI age.
- [ ] Make clear in UI copy that the SIPP amount is gross of basic-rate tax relief.
- [ ] Support SIPP contribution inputs for both single and couple plans.
- [ ] Thread both contribution types into the projection engine so pre-FI pension balances reflect ongoing contributions.
- [ ] Add validation and sensible bounds for percentage and annual-amount inputs.
- [ ] Add tests covering:
- [ ] single-plan workplace contribution projection
- [ ] couple-plan workplace contribution projection
- [ ] SIPP annual gross contribution uplift by inflation
- [ ] contribution stop at FI age
- [ ] parity between Get Started and `Income & Assets` entry points

## Phase 8: IHT Planning and Post-Freeze Tax Band Escalation

Goal: give users a credible long-range IHT forecast that accounts for UK tax-band
escalation after the known HMRC freeze ends, and surface actionable gifting guidance
that adjusts automatically as thresholds change over the projection horizon.

### IHT projection engine (IHT-1 through IHT-4)

- [x] Add `calculateIHTProjection()` pure function (`src/financialEngine/ihtProjection.ts`).
  Computes gross estate, NRB, RNRB (with taper), chargeable estate, IHT due, pension-estate delta, and annual gifting capacity.
- [x] Support couple mode: transferable NRB (IHTA 1984 s.8A) and transferable RNRB (s.8D).
- [x] Include DC pension pots in estate from 6 April 2027 (Finance Act 2025).
- [x] Add `IHTOutlookPanel` component to Step 4 dashboard.
- [x] Add `ihtProjection.test.ts` unit tests (28 tests).

### Gifting optimiser (IHT-5)

- [x] Add `calculateGiftingOptimisation()` pure function (`src/financialEngine/giftingOptimiser.ts`).
  Models s.21 surplus-income gifts, s.19 annual exempt gifts, and DC draw-and-gift strategy.
- [x] Apply 60% effective marginal IHT rate in the RNRB taper zone (each £2 gifted recovers £1 RNRB worth 40% IHT).
- [x] Compute RNRB recovery opportunity and pacing when estate is in the taper zone.
- [x] Add gifting strategy asset-trajectory comparison chart to `IHTOutlookPanel`.
- [x] Add `giftingOptimiser.test.ts` unit tests.

### Post-freeze tax band escalation — income tax, CGT, ISA (branch: `feat/tax-band-post-freeze-escalation`)

Background: HMRC has frozen income-tax thresholds (personal allowance, basic-rate limit,
additional-rate threshold) until April 2030 (tax year 2030-31). After the freeze Voyant
applies a 4%/yr Default Tax Table Assumption to all monetary income-tax thresholds.
CGT exempt amount and ISA annual allowance are also escalated at 4%/yr from the last
confirmed HMRC data year (currently 2026-27). Tax *rates* (20%/40%/45%, 18%/24%) are
never escalated — only monetary thresholds.

- [x] Add `TAX_BAND_FREEZE_END_YEAR = 2030` and `TAX_BAND_ESCALATION_RATE = 0.04` constants to `taxRuleSnapshot.ts`; re-export from `financialConstants.ts`.
- [x] Implement post-freeze escalation of income-tax thresholds (PA, BRL, ART, PA-taper) in `getSnapshotForYear()` for `calendarYear > 2030`.
- [x] Add `LATEST_CGT_CALENDAR_YEAR = 2026`, `LATEST_ISA_CALENDAR_YEAR = 2026`, `ISA_ANNUAL_ALLOWANCE_BASE = 20_000` sentinel constants; escalate CGT exempt amount and ISA annual allowance at 4%/yr from 2027 onwards.
- [x] Add `isaAnnualAllowance: number` to `ResolvedSnapshot` interface (infrastructure for future contribution-limit enforcement).
- [x] Add 14 new unit tests covering income-tax, CGT, and ISA escalation; 108 tests passing.

### Post-freeze IHT threshold escalation — NRB, RNRB, taper (branch: `feat/tax-band-post-freeze-escalation`)

Background: NRB (£325k) and RNRB (£175k) are legislatively frozen until April 2030.
Voyant models post-freeze NRB escalation at a configurable "Nil Rate Band Escalation %"
and RNRB escalation at the plan CPI rate (default ~2.5%). The RNRB taper threshold (£2m)
also escalates at CPI to maintain proportionality. This is distinct from the 4% income-tax
Default Tax Table rate — IHT thresholds track CPI, not the higher income-tax assumption.

- [x] Add `IHT_FREEZE_END_YEAR = 2030` and `IHT_ESCALATION_RATE = 0.025` (CPI) to `financialConstants.ts`.
- [x] Add `getNRBForYear(year)`, `getRNRBForYear(year)`, `getRNRBTaperThresholdForYear(year)` pure helper functions; frozen through 2030, escalate at 2.5%/yr from 2031.
- [x] Update `calculateIHTProjection()` to use `deathYear`-specific NRB, RNRB, and taper threshold; RNRB taper warning threshold tracks £200k below the escalated taper floor.
- [x] Add optional `calendarYear` to `GiftingOptimiserInputs`; `calculateGiftingOptimisation()` uses escalated RNRB and taper threshold so the 60% effective marginal rate zone boundary is year-accurate.
- [x] Update `IHTOutlookPanel` to pass `deathYear` as `calendarYear` to the gifting optimiser.
- [x] Add 13 new unit tests covering NRB/RNRB helpers and post-freeze projection behaviour; 118 total tests passing across `ihtProjection.test.ts` and `giftingOptimiser.test.ts`.

### Outstanding IHT / escalation work

- [ ] Open PR for `feat/tax-band-post-freeze-escalation` targeting `main` (or the appropriate integration branch).
- [ ] Expose escalation assumptions in the UI (e.g. a settings panel showing 4% income-tax escalation rate and 2.5% CPI for IHT thresholds) so advisers can override them — matching Voyant's configurable-rate approach.
- [ ] Thread `calendarYear` into the `projectionEngine.ts` per-year loop so in-projection IHT estimates (rather than just the death-year snapshot) also use escalated bands.
- [ ] Consider making `IHT_ESCALATION_RATE` user-configurable (plan-level CPI) consistent with Voyant's "Nil Rate Band Escalation %" setting.

---

## Phase 9 — PCLS + Bed & ISA Withdrawal Strategy

### Goal

Add a second drawdown strategy that takes person 1's full Pension Commencement Lump Sum (PCLS)
at the point of financial independence and reinvests the proceeds into ISA and GIA. Each
subsequent year, up to the ISA annual allowance is transferred from GIA into ISA ("Bed & ISA").
This shelters future growth from income tax and CGT, at the cost of paying CGT on any embedded
GIA gain at the time of transfer.

Simulated against Paul and Lisa's plan (lifeplan.json, FI age 56 → life expectancy 90):
- Standard UFPLS: £121,684 income tax + £10,358 CGT = **£132,042 lifetime tax**
- PCLS + joint Bed & ISA: £5,982 income tax + £22,073 CGT = **£28,055 lifetime tax**
- **Net lifetime tax saving: £103,987**

### Implementation checklist

#### Data model & persistence
- [x] Add `DrawdownStrategy = 'standard-ufpls' | 'pcls-bed-isa'` union type to `src/models/types.ts`
- [x] Add `drawdownStrategy: DrawdownStrategy` field to `PlannerState` in `src/models/types.ts`
- [x] Add `p1PclsEvent`, `p1BedIsaTransfer`, `p2BedIsaTransfer` fields to `YearlyProjection` in `src/models/types.ts`
- [x] Set `drawdownStrategy: 'standard-ufpls'` default in `createDefaultState()` in `src/lib/mockData.ts`
- [x] Add backward-compat `?? 'standard-ufpls'` fallback in `normalizePlannerState()` in `src/lib/mockData.ts`
- [x] Add `'drawdownStrategy'` to `PERSISTED_PLANNER_KEYS` in `src/lib/persistedPlan.ts`

#### Store
- [x] Import `DrawdownStrategy` and add `setDrawdownStrategy: (strategy: DrawdownStrategy) => void` action to `src/store/plannerStore.ts`

#### Projection engine (`src/financialEngine/projectionEngine.ts`)
- [x] Read `drawdownStrategy` from state; derive `isPclsBedIsa` flag
- [x] PCLS crystallisation block at year 0: extract `min(p1Dc × ufplsFrac, lsa)` from p1Dc; distribute up to ISA allowance → p1Isa, remainder → p1GiaV/BC; exhaust LSA (`p1LifetimePcls = yearPensionLsa`)
- [x] Annual Bed & ISA block (pre-drawdown snapshot, pre-gross-up): p1GiaV → p1Isa using `drawFromGIA()`; post-FI joint GIA → p2Isa (couple mode)
- [x] B&I capital gains (`p1BedIsaCg`, `p2BedIsaCg`) folded into `p1TotalCG`/`p2TotalCG` inside gross-up loop so CGT rate reflects iteration income context
- [x] Output new fields (`p1PclsEvent`, `p1BedIsaTransfer`, `p2BedIsaTransfer`) in yearly projection push

#### UI (`src/components/steps/Step4Dashboard.tsx`)
- [x] Destructure `drawdownStrategy` and `setDrawdownStrategy` from store state
- [x] Import `DrawdownStrategy` type
- [x] Add strategy selector card below the hero section, gated on `person1.incomeSources.dcPension.enabled`; two options: "Standard UFPLS" and "PCLS + Bed & ISA"

#### Tests
- [ ] Add unit tests in `tests/unit/projectionEngine.test.ts`:
  - PCLS fires at year 0 (`p1PclsEvent > 0`; p1Dc decreases; p1Isa increases)
  - After PCLS, p1LifetimePcls exhausted (all future DC draws 100% taxable, ufplsFrac = 0)
  - Bed & ISA transfer each year (p1GiaV decreases, p1Isa increases by same amount)
  - Post-FI joint GIA → p2Isa (couple mode)
  - Standard-ufpls mode: all new fields are 0 (no regression)
  - B&I CGT is included in `totalCgtPaid`

#### Outstanding
- [ ] Expose `p1PclsEvent`, `p1BedIsaTransfer`, `p2BedIsaTransfer` in a yearly breakdown view (e.g. expandable table row or tooltip) within the dashboard
- [ ] Consider a "Tax comparison" summary card surfacing PCLS vs standard UFPLS lifetime tax difference for the user's specific plan numbers

---

## Phase 10 — Planned Events (One-Off Expenditures)

### Goal

Allow users to model timed, one-off larger expenditures (e.g. a new car at age 62, a home
renovation at age 67, or a family gift at age 64) on top of their regular life-stage spending.
The engine inflation-adjusts each event to its target year and folds it into the spending target,
so the normal drawdown waterfall automatically funds the spike from the most tax-efficient bucket
available in that year. The Action Plan card for the event year reports which bucket funded it
and why.

This is "Option A" from the April 2025 one-off expenditure design review — the lightweight
implementation that delivers maximum clarity with minimal engine risk.

### Data model

Add a new `PlannedEvent` interface and `plannedEvents` array to `PlannerState`:

```typescript
// src/models/types.ts
export interface PlannedEvent {
  id: string;
  name: string;          // User-supplied label e.g. "Kitchen renovation"
  emoji: string;         // Single emoji chosen from a preset list
  p1Age: number;         // Person 1's age when the expense falls
  amount: number;        // Amount in today's £
  inflationLinked: boolean; // Default true; false for nominal fixed amounts
}
// Added to PlannerState:
plannedEvents: PlannedEvent[];
```

Add `plannedEventSpend: number` to `YearlyProjection` (sum of inflation-adjusted events in that
year) so the Action Plan can display event detail without re-filtering the original list.

### Engine change

In `projectionEngine.ts`, after computing `baseSpending`, add:

```typescript
const eventSpend = (state.plannedEvents ?? [])
  .filter(e => e.p1Age === p1Age)
  .reduce((s, e) => s + (e.inflationLinked ? e.amount * inflFactor : e.amount), 0);
const spending = baseSpending + eventSpend;
```

No changes to the drawdown waterfall — the existing ISA → GIA → Cash → DC order naturally
funds from the cheapest-tax bucket. Output `plannedEventSpend: eventSpend` in the year record.

### Implementation checklist

#### Data model & persistence
- [ ] Add `PlannedEvent` interface to `src/models/types.ts`
- [ ] Add `plannedEvents: PlannedEvent[]` to `PlannerState` in `src/models/types.ts`
- [ ] Add `plannedEventSpend: number` to `YearlyProjection` in `src/models/types.ts`
- [ ] Set `plannedEvents: []` default in `createDefaultState()` in `src/lib/mockData.ts`
- [ ] Add `?? []` backward-compat fallback in `normalizePlannerState()` in `src/lib/mockData.ts`
- [ ] Add `'plannedEvents'` to `PERSISTED_PLANNER_KEYS` in `src/lib/persistedPlan.ts`

#### Store
- [ ] Add `addPlannedEvent`, `updatePlannedEvent`, `removePlannedEvent` actions to `src/store/plannerStore.ts`

#### Projection engine (`src/financialEngine/projectionEngine.ts`)
- [ ] Compute `eventSpend` from `state.plannedEvents` filtered to `p1Age` for the current year
- [ ] Add `eventSpend` to `baseSpending` to derive final `spending`
- [ ] Output `plannedEventSpend: eventSpend` in each `YearlyProjection` push

#### UI — Step 2 (Spending)
- [ ] Add "Planned big purchases" panel below the life-stage spending sliders in `src/components/steps/Step2SpendingGoals.tsx`
- [ ] Quick-add emoji chips: 🚗 Car · 🏠 Home improvement · ✈️ Holiday · 👶 Family gift · 🎓 Education · 🎁 Other
- [ ] Each event card: emoji display + name text field + age stepper (min: currentAge, max: lifeExpectancy) + £ amount field + inflation-linked toggle
- [ ] Add / remove event controls
- [ ] Validation: amount > 0, age within plan horizon

#### UI — Step 4 Action Plan
- [ ] In `OptimizerPanel.tsx` action plan section, when `apProj.plannedEventSpend > 0`, render a purple "🎯 Big purchase this year" card showing event names, total amount, and the bucket(s) that funded it (derived from `apBd`)
- [ ] Add event milestone markers on the spending chart (vertical dashed lines at event ages) in `src/components/steps/Step4Dashboard.tsx`

#### Tests
- [ ] Unit test: `plannedEventSpend` is zero when no events (`tests/unit/projectionEngine.test.ts`)
- [ ] Unit test: single event — spending increases by inflation-adjusted amount in the target year only
- [ ] Unit test: `inflationLinked: false` — event amount is nominal (not adjusted)
- [ ] Unit test: two events in the same year — amounts are summed
- [ ] Unit test: event before FI age — added to building-phase spending correctly
- [ ] UI test: add an event card, verify it appears and can be removed (`tests/ui/`)

---

## Phase 11 — Independent FI Ages per Person (Couple Mode)

### Goal

Allow each person in a couple to have their own financial independence age. Currently a single
`fiAge` applies to both persons, which means person2's work income and DC pension contributions
always stop at the same time as person1's. In reality, partners frequently retire at different
ages. This change lets each person's building-phase contributions and work income stop
independently, making projections more accurate for real-world couples.

### Design decisions

- **`fiAge` stays as person1's FI age** (backward-compatible; no migration needed for single-mode
  users or existing persisted plans).
- **`p2FiAge?: number`** is added as an optional top-level field. When absent it defaults to
  `fiAge` at runtime — existing saved plans continue to behave identically.
- **Life stages (Go-Go / Slo-Go / No-Go) remain anchored to `fiAge` (person1).** The household
  lifestyle transition is driven by person1's FI; person2 retiring later simply means their
  individual contributions and work income stop at a later point while spending stages are
  unchanged.
- **`householdFiStarted` remains tied to person1's FI age** for Bed & ISA transfers and PCLS
  crystallisation — these are household-level financial events.
- **Person2's DC contributions and the DC contribution line for person2 use `p2FiAge`**, not the
  shared `fiAge`.
- **Dashboard "Gross income at FI" and projection filter** remain based on `fiAge` (person1).
- **`displayProjections` filter** in Step4Dashboard is unchanged (`p1Age >= fiAge`).

### Data model (`src/models/types.ts`)

```typescript
/**
 * Financial independence age for person2 — when person2's work income and DC
 * pension contributions stop. Only used in couple mode; single mode ignores it.
 * Defaults to `fiAge` (person1's FI age) when not set, so existing plans are
 * backward-compatible.
 */
p2FiAge?: number;
```

### Planning bounds (`src/lib/planningBounds.ts`)

Add `clampP2FiAge(p2FiAge, p2CurrentAge, lifeExpectancy)` — identical logic to `clampFiAge` but
using person2's current age as the lower bound.

Update `normalizePlanningBounds()` to accept and return `p2FiAge`.

### Store (`src/store/plannerStore.ts`)

- Add `'p2FiAge'` to `PERSISTED_PLANNER_KEYS`.
- Add `setP2FiAge(age: number)` action — clamps to `[person2.currentAge, getFiAgeMax(lifeExpectancy)]`
  and normalises bounds.
- In `setP2Dob` / `setP2Age` — re-clamp `p2FiAge` if it falls below the new person2 current age.
- In `normalizePlannerState()` in `src/lib/mockData.ts` — add `p2FiAge ?? undefined` fallback for
  backward-compat hydration.

### Projection engine (`src/financialEngine/projectionEngine.ts`)

At the top of `calculateProjections`, resolve:

```typescript
const p2FiAge = state.p2FiAge ?? state.fiAge;
```

Change the DC-contribution block from the shared `!householdFiStarted` guard for person2:

```typescript
// Before:
if (!householdFiStarted) {
  if (person2.incomeSources.dcPension.enabled) {
    p2Dc += getAnnualDcContribution(person2.incomeSources.dcPension, y, inflation);
  }
}
// After:
const p2FiStarted = mode === 'couple' && p2Age !== null ? p2Age >= p2FiAge : true;
if (!householdFiStarted) {
  // person1 contributions unchanged
}
if (!p2FiStarted && mode === 'couple') {
  if (person2.incomeSources.dcPension.enabled) {
    p2Dc += getAnnualDcContribution(person2.incomeSources.dcPension, y, inflation);
  }
}
```

### UI — Step 1 (`src/components/steps/Step1HouseholdSetup.tsx`)

In couple mode, show a second "Person 2 FI age" slider beneath person1's:

- Label: "{p2Name}'s financial independence age"
- min: `person2.currentAge`, max: `getFiAgeMax(lifeExpectancy)`, step: 1
- Same visual style as person1 slider
- Shows building-phase span for person2: `age {person2.currentAge} → {p2FiAge - 1}`
- Calls `setP2FiAge(age)` on change

Person1 slider label updated to "{p1Name}'s financial independence age" in couple mode only
(single mode remains unchanged).

### UI — Step 3 (`src/components/steps/Step3IncomeSources.tsx`)

Update the DC pension drawdown label in person2's section to reference `p2FiAge` rather than
`fiAge` (e.g., "Drawdown starts: Age {p2FiAge}").

### Implementation checklist

#### Data model & persistence
- [ ] Add `p2FiAge?: number` to `PlannerState` in `src/models/types.ts`
- [ ] Add `'p2FiAge'` to `PERSISTED_PLANNER_KEYS` in `src/lib/persistedPlan.ts`
- [ ] Add `p2FiAge: undefined` default in `createDefaultState()` in `src/lib/mockData.ts`
- [ ] Add backward-compat `?? undefined` fallback in `normalizePlannerState()` in `src/lib/mockData.ts`

#### Planning bounds
- [ ] Add `clampP2FiAge(p2FiAge, p2CurrentAge, lifeExpectancy)` to `src/lib/planningBounds.ts`
- [ ] Update `normalizePlanningBounds()` to accept `p2FiAge` and return a clamped `p2FiAge`

#### Store
- [ ] Add `setP2FiAge(age: number)` action to `src/store/plannerStore.ts`
- [ ] In `setP2Dob` / `setP2Age` — re-clamp `p2FiAge` if it falls below the new person2 current age
- [ ] In `normalizePlanningBounds()` call sites — pass `s.p2FiAge ?? s.fiAge` and store the result

#### Projection engine
- [ ] Resolve `p2FiAge = state.p2FiAge ?? state.fiAge` at the top of `calculateProjections` in `src/financialEngine/projectionEngine.ts`
- [ ] Compute `p2FiStarted = mode === 'couple' && p2Age !== null ? p2Age >= p2FiAge : true`
- [ ] Move person2 DC contribution accumulation to use `p2FiStarted` instead of `householdFiStarted`

#### UI — Step 1
- [ ] In couple mode, add a second FI age slider for person2 in `src/components/steps/Step1HouseholdSetup.tsx`
- [ ] Update person1 slider label to include person1's name in couple mode

#### UI — Step 3
- [ ] In person2's DC pension section, reference `p2FiAge` for the drawdown-start age label in `src/components/steps/Step3IncomeSources.tsx`

#### Tests
- [ ] Unit test: couple — person2 DC contributions continue past `fiAge` when `p2FiAge > fiAge`
- [ ] Unit test: couple — person2 DC contributions stop exactly at `p2FiAge`
- [ ] Unit test: couple — when `p2FiAge` is undefined, person2 behaves as if `p2FiAge === fiAge`
- [ ] Unit test: single mode — `p2FiAge` is irrelevant; projections unchanged
- [ ] Unit test: `clampP2FiAge` — clamps to `[person2.currentAge, getFiAgeMax(lifeExpectancy)]`
- [ ] UI test: couple mode Step1 — p2 FI slider visible and calls `setP2FiAge`
