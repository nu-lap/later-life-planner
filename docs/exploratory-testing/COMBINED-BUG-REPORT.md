# LaterLifePlan — Combined Exploratory Testing Bug Report & Fix Plans

**Sources:**
- Session 2026-05-14-07-33 — Charters 1–10, full feature sweep (27 tests)
- Session 2026-05-14-21-00 — Charter 11, new-user persona journeys (7 tests)

**Code reviewed:** `src/lib/planningBounds.ts`, `src/lib/mockData.ts`, `src/store/plannerStore.ts`, `src/components/steps/Step1HouseholdSetup.tsx`, `src/components/steps/Step2SpendingGoals.tsx`, `src/components/steps/Step3IncomeSources.tsx`, `src/components/DashboardMain.tsx`

---

## Severity Overview

| ID | Title | Severity | Effort | Session |
|----|-------|----------|--------|---------|
| BUG-001 | Future DOB stores raw invalid value → NaN in projections | **P1** | Small | 07-33 |
| BUG-003 | `undefined` / `[object Object]` rendered on fresh load | **P2** | Small | 07-33 |
| BUG-015 | Minimum RLSS button has no visible effect on first visit | **P2** | Small | 21-00 |
| BUG-017 | GIA base cost (CGT) hidden until toggle enabled — easy to miss | **P2** | Small | 21-00 |
| BUG-002 | Step 1 not visible on first cold navigation (Clerk init race) | **P2** | Medium | 07-33 |
| BUG-006 | Mobile dashboard horizontal overflow (80 px at 375 px viewport) | **P3** | Small | 07-33 |
| BUG-004 | Projection table hidden behind a button — not discoverable | **P3** | Small | 07-33 |
| BUG-012 | FI age default (67) gives no guidance for early-retirement intent | **P3** | Small | 21-00 |
| BUG-014 | "Financial Independence age" is FIRE jargon — low-literacy barrier | **P3** | Small | 21-00 |
| BUG-016 | Building-phase context invisible after Step 1 | **P3** | Medium | 21-00 |
| BUG-005 | ISA depletion KPI — test oracle may be wrong | **Close** | — | 07-33 |
| BUG-013 | FI age doesn't update on DOB change | **Close** | — | 21-00 |

---

## P1

### BUG-001 — Future DOB stores raw invalid value, corrupting downstream calculations

**What happens:** When the browser fires a `change` event on the date-of-birth input while the user is still typing (e.g., partial year `0001-01-01` or a future date that fails the ISO format check), `clampDateOfBirth()` returns `''`. The store setter then writes:

```typescript
// src/store/plannerStore.ts  line 195
dateOfBirth: normalizedDob || dateOfBirth,   // ← raw input stored when clamp returns ''
```

If the raw value reaches `ageFromDOB()` it returns the default age (67) silently. However, if any component or utility formats `dateOfBirth` directly (e.g., displays it as a date string or derives a birth year from it for rendering), the raw invalid value propagates and renders as `NaN` or `Invalid Date`.

The same pattern appears in `setP2Dob()` at line 260.

**Why it matters (P1):** Users who type quickly or use auto-fill can briefly write a future date before correcting it. If the store captures the raw value mid-type, any projection that uses `dateOfBirth` directly produces NaN. NaN in financial projections is a data-correctness failure — it could influence a user's retirement decision.

**Files:** `src/store/plannerStore.ts:195, 260`

**Fix plan:**

1. **Change the fallback in both setters** from the raw input to the previous valid value stored in state:

   ```typescript
   // setP1Dob (line 195)
   dateOfBirth: normalizedDob || s.person1.dateOfBirth,
   
   // setP2Dob (line 260)
   dateOfBirth: normalizedDob || s.person2.dateOfBirth,
   ```

   This means a partial/future input is silently ignored — the DOB stays at whatever valid value was previously accepted. The user's typed text is still shown in the controlled input (managed by React local state in the component), but the store only receives it once it is valid.

2. **Guard `ageFromDOB` call against future dates explicitly** in `mockData.ts:28-42` — the existing guard `age < MIN_SUPPORTED_CURRENT_AGE` already catches this (negative ages), but add a comment clarifying the intent so future developers understand why the fallback is safe.

3. **Add an input-level validation message** in `Step1HouseholdSetup.tsx` when the rendered `person1.dateOfBirth` differs from what the user typed (i.e., the clamped value diverges). Show a small error: _"Date must be in the past"_ below the field.

4. **Unit test:** Add a test in `tests/unit/projectionEngine.test.ts` asserting that injecting `dateOfBirth: '2099-01-01'` directly into plan state does not produce NaN anywhere in `calculateProjections()` output.

---

## P2

### BUG-003 — `undefined` or `[object Object]` rendered in UI on fresh load

**What happens:** When the app loads with only `llp-disclaimer-accepted=1` in localStorage (no plan state), some component renders the literal string `undefined` or `[object Object]` in the page body. The mode selector is visible (Step 1 renders), so this is not a crash — it is a rendering fault on a secondary element.

**Most likely root cause:** `p2FiAge` is explicitly `undefined` by design in `createDefaultState()` (line 238 comment: _"p2FiAge is undefined by default — engine falls back to fiAge"_). If any template expression renders `{p2FiAge}` without a null guard it produces the string "undefined" in the DOM. A secondary candidate is `SummaryBar.tsx`'s `RLSS_STANDARDS[mode][rlssStandard]` lookup if `rlssStandard` is not a valid key.

**Why it matters (P2):** This is the first thing a brand-new user sees after accepting the disclaimer. Rendering garbage values destroys trust at the most critical moment in onboarding.

**Files:** `src/lib/mockData.ts:238`, `src/components/SummaryBar.tsx:50-52`, and any component that renders `p2FiAge` directly.

**Fix plan:**

1. **Audit `{p2FiAge}` render sites.** Run:
   ```bash
   grep -rn 'p2FiAge' src/components/
   ```
   Replace every bare `{p2FiAge}` with `{p2FiAge ?? fiAge}` or suppress with `{p2FiAge !== undefined && ...}`.

2. **Harden `SummaryBar.tsx:50-52`:**
   ```typescript
   // Before
   RLSS_STANDARDS[mode][rlssStandard]
   
   // After — explicit fallback
   (RLSS_STANDARDS[mode] as Record<string, unknown>)?.[rlssStandard ?? 'minimum'] ?? RLSS_STANDARDS[mode]['minimum']
   ```

3. **Add a snapshot/smoke test** that renders the full app with only `DISCLAIMER_KEY='1'` in localStorage and asserts the rendered HTML contains no literal "undefined" or "[object Object]" strings.

---

### BUG-015 — Selecting the "Minimum" RLSS tier on first visit has no visible effect

**What happens:** The default plan state in `createDefaultState()` sets `rlssStandard: 'minimum'` and pre-builds spending categories to the minimum template (`buildCategoriesForRlss('minimum', 'single')`). When a first-time user reaches the Spending step and clicks the Minimum button, `applyRlssTemplate('minimum')` fires but produces identical category values — so the `step2-total-spend` figure does not change (£13.4k → £13.4k single, £21.6k → £21.6k couple).

**Why it matters (P2):** The Spending step is where users commit to a lifestyle goal. If clicking the first option produces no visual change, users assume either the button didn't work or the app has frozen. This erodes trust at a key decision point. Moderate and Comfortable both produce visible jumps (£31.7k, £43.9k) so the inconsistency amplifies confusion.

**Files:** `src/lib/mockData.ts:224, 231`, `src/store/plannerStore.ts:370-374`

**Fix plan:**

1. **Change the initial `rlssStandard` in `createDefaultState()` to `null`** (or a sentinel value like `'unset'`):
   ```typescript
   // mockData.ts ~line 231
   rlssStandard: null,
   spendingCategories: [],  // empty — forces user to make an explicit choice
   ```
   Update the `PlannerState` type to allow `rlssStandard: 'minimum' | 'moderate' | 'comfortable' | null`.

2. **In `Step2SpendingGoals.tsx`:** When `rlssStandard === null`, render a prompt in place of the spend total:
   _"Choose a spending level to set your budget"_ — the tier cards are shown but none is pre-selected and the spend display shows `—` or `£0`.

3. **When the first tier is selected:** `applyRlssTemplate()` fires, categories populate, the spend total shows the new number, and the selected tier card highlights. The user clearly sees the result of their choice.

4. **Update the exploratory test base state** in all 11 charter spec files — the existing seedAndNavigate base state sets `rlssStandard: 'moderate'`; add a comment explaining that null is the real initial default and 'moderate' is used for seeded tests to ensure a non-zero spend total.

5. **Update unit tests** that rely on `rlssStandard` defaulting to 'minimum'.

---

### BUG-017 — GIA base cost (CGT field) not visible until toggle is enabled, then easy to miss

**What happens:** In `Step3IncomeSources.tsx:468-470`, the GIA "Purchase price / base cost" input is a child of `SourceCard` — it only renders when `generalInvestments.enabled === true`. A user enabling a GIA for the first time sees the total value field but must scroll down to find the base cost below it. If they miss it, the default `baseCost: 0` means the engine assumes the entire GIA value is pure gain, overstating CGT liability.

**Why it matters (P2):** Incorrect base cost = incorrect CGT projection = incorrect net withdrawal estimates on the dashboard. For a high-net-worth user with a large GIA (e.g., Raj: £380k value, £210k cost), missing this field understates take-home income by thousands of pounds per year.

**Files:** `src/components/steps/Step3IncomeSources.tsx:461-483`

**Fix plan:**

1. **On first enable of GIA**, auto-scroll to and visually highlight the base cost field. Use a `useEffect` triggered on `generalInvestments.enabled` transitioning `false → true`:
   ```typescript
   useEffect(() => {
     if (generalInvestments.enabled) {
       baseCostRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
     }
   }, [generalInvestments.enabled]);
   ```

2. **Add an amber callout banner inside the GIA card when `baseCost === 0` and `totalValue > 0`:**
   > ⚠️ _Enter your original purchase price for accurate capital gains tax calculations. If you're unsure, use the total value above._

   The banner disappears once `baseCost > 0`.

3. **Add a `data-testid="step3-p1-gia-basecost"` attribute** to the base cost input for test coverage.

4. **Joint GIA** (`Step3IncomeSources.tsx:494-495`): apply the same callout pattern.

---

### BUG-002 — Step 1 mode selector not visible on first cold navigation (Clerk init race)

**What happens:** On the very first browser navigation to the app (cold start), the `step1-mode-single` button is not visible within 12 seconds. All subsequent navigations in the same browser context succeed. This affects charter-1 and charter-2 tests consistently on their first test.

**Most likely root cause:** `AuthenticatedPlannerShell` in `src/app/page.tsx` calls `usePlanSync()` which performs async operations (device registration, HPKE key wrapping, Cosmos status check). The shell renders a loading screen while `sync.isSyncReady === false`. On cold start, with no cached device state, this async chain can take well beyond the test's 12-second expectation. In the deployed Azure Container App environment this is compounded by cold-start latency (~25s).

**Why it matters (P2):** A real user on a slow connection, first visit, sees a blank loading screen for an unpredictable duration with no feedback on why it is taking so long. This is a direct abandonment risk.

**Files:** `src/hooks/usePlanSync.ts`, `src/app/page.tsx:150-207`

**Fix plan:**

1. **Add a hard timeout in `usePlanSync`**: If `isSyncReady` has not become `true` within 8 seconds, set it to `true` anyway and continue in degraded/offline mode. Sync operations can continue in the background after the wizard is shown.
   ```typescript
   useEffect(() => {
     const timeout = setTimeout(() => {
       if (!isSyncReady) {
         setSyncReady(true);  // Show the app; sync retries in background
       }
     }, 8000);
     return () => clearTimeout(timeout);
   }, [isSyncReady]);
   ```

2. **Improve the loading state UX**: Replace the blank loading screen with a skeleton of the wizard header + a progress indicator: _"Setting up your planner…"_ with a spinner. This reassures users that something is happening.

3. **In `playwright.exploratory.config.ts`**: Increase the first cold navigation timeout from 20s to 30s (already done for some charters). Verify all 11 charters use `{ timeout: 30000 }` for the first `page.goto`.

---

## P3

### BUG-006 — Mobile dashboard has 80px horizontal overflow at 375px viewport

**What happens:** On iPhone-sized viewports (375px wide), `document.body.scrollWidth` is 455px — 80px wider than the viewport. Step 1 has no overflow at 375px; the overflow originates from the dashboard charts or projection table.

**Root cause:** The `LifetimeChart` and `AssetChart` components (dynamically imported in `DashboardMain.tsx:18-20`) likely render Recharts containers with a fixed minimum width. The projection table already handles this with `overflow-x-auto -mx-2 sm:mx-0` on its wrapper, but the chart wrappers do not.

**Files:** `src/components/DashboardMain.tsx:335-358`, `src/components/charts/LifetimeChart.tsx`, `src/components/charts/AssetChart.tsx`

**Fix plan:**

1. **Wrap each chart section** in `DashboardMain.tsx` with `overflow-x-auto`:
   ```tsx
   {/* Before (line ~335) */}
   <div className="mb-6">
     <LifetimeChart ... />
   </div>
   
   {/* After */}
   <div className="mb-6 overflow-x-auto">
     <div className="min-w-[560px]">   {/* let chart breathe at its natural width */}
       <LifetimeChart ... />
     </div>
   </div>
   ```

2. **Inside each chart component**, ensure the Recharts `<ResponsiveContainer>` has `minWidth` set to a value that prevents collapse (e.g., `minWidth={320}`) rather than a fixed `width`.

3. **Add a charter-10 / charter-11 mobile assertion** that navigates to the dashboard with a valid seeded state at 375px and asserts `scrollWidth ≤ 380`.

---

### BUG-004 — Projection table hidden behind a toggle button; zero tables found by tests

**What happens:** `DashboardMain.tsx:162` initialises `showDetailedTable = false`. The table only renders on `showDetailedTable === true` (line ~363). Tests that look for `<table>` elements find zero.

**Reassessment:** This is intentional design (performance + progressive disclosure). The finding is not a correctness bug but a discoverability and test-coverage gap.

**Fix plan:**

1. **Make the "Show detailed table" / "Show detailed data" button more prominent**: move it above the fold (just below the KPI cards) rather than at the bottom of the charts section. Add a `data-testid="step4-show-projection-table"`.

2. **Update charter-5 test** to click the reveal button before asserting `<table>` presence:
   ```typescript
   const revealBtn = page.getByTestId('step4-show-projection-table');
   if (await revealBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
     await revealBtn.click();
     await page.waitForTimeout(500);
   }
   const tableCount = await page.locator('table').count();
   ```

3. **Consider auto-revealing the table on simple plans** (state-pension-only, ≤2 income sources) where the chart provides limited visual value and the year-by-year table is more informative.

---

### BUG-012 — FI age default of 67 gives no guidance for early-retirement intent

**What happens:** `createDefaultState()` sets `fiAge` to `DEFAULT_ASSUMPTIONS.FI_AGE` (67) for any user under 67. This is correct — 67 is the State Pension Age and the right starting point for most users. However, for users planning early retirement (e.g., Raj at 57, David at 58), the slider starts at 67 with no contextual nudge that they should adjust it downward.

**Reassessment:** The default value itself is correct. This is a copy / affordance gap, not a code bug.

**Fix plan:**

1. **In `Step1HouseholdSetup.tsx`**, below the FI age slider, expand the current building-phase label to include explicit guidance when the building phase is long (≥7 years):
   ```
   Building phase: age 58 → 66 · Drag left to explore early retirement
   ```
   Show `Freedom phase starts now` when `fiAge === currentAge`, `Drag left to explore early retirement` when `fiAge - currentAge ≥ 7`, and plain `Building phase: age X → Y` otherwise.

2. **Add a tooltip or info icon** next to the "Financial independence age" heading that expands to: _"The age you'd like to stop needing paid work. State Pension age is 67, but you can choose any age from your current age onwards."_

---

### BUG-014 — "Financial Independence age" is FIRE-movement jargon; inaccessible to low-literacy users

**What happens:** The section heading on Step 1 uses the term "Financial Independence age" with no tooltip or plain-language alternative. The helper text _"The age from which work becomes a choice, not a necessity"_ is present but sits below the heading in smaller, muted text. Users who aren't familiar with the FIRE movement (Financial Independence, Retire Early) may not understand what value to enter.

**Personas at risk:** Margaret (retired nurse, low literacy), Patricia & James (working-class couple, very low financial literacy).

**Fix plan:**

1. **Rename the heading** in `Step1HouseholdSetup.tsx` to use a dual label:
   ```
   Financial independence age
   <span className="text-slate-400 font-normal text-sm ml-2">— when work becomes a choice</span>
   ```

2. **Promote the helper text** so it appears directly under the heading (before the slider), not after it. Currently it appears as a section subheading below the slider value.

3. **No functionality change required.** This is a copy-only fix.

---

### BUG-016 — Building-phase context invisible after Step 1; no accumulation guidance for pre-retirees

**What happens:** The building-phase label is shown in Step 1 (below the FI age slider: _"Building phase: age 55 → 66"_). However, once the user advances to Step 2 (Spending), Step 3 (Income & Assets), and the Dashboard, there is no persistent reminder that they are still in their accumulation years. Spending controls only show Go-Go/Slo-Go/No-Go stages with no pre-FI stage. The projection table shows pre-FI years but does not label them distinctly.

**Why this matters:** For Patricia & James (ages 55/57, FI age 67), 10–12 years of accumulation are modelled but invisible in the UI. The app shows spending for Go-Go years that are a decade away. Users may not realise that the projection includes their ongoing working years and may not think to enter their current income/contributions.

**Fix plan:**

1. **Add a pre-FI banner to the dashboard** when `currentAge < fiAge`. Show it in the KPI row or above the charts:
   ```
   📅 Building phase  ·  age 55 → 66  ·  12 years until financial independence
   ```
   Tapping/clicking expands to: _"These years are modelled using your Go-Go spending as a baseline. Add your current income and workplace contributions on the Income & Assets step to see how your pot grows."_

2. **On the Income & Assets step**, add a contextual tip at the top when `currentAge < fiAge`:
   > _You're in the building phase. Add your current income now — it affects how much your investments grow before age {fiAge}._

3. **In the projection table**, add a visual separator row or shaded region for years before `fiAge`, labelled "Building phase".

4. This is a **medium-effort feature addition**, not a bug fix. Treat it as a sprint story rather than a hotfix.

---

## Closed / Not a Bug

### BUG-005 — ISA depletion age appears wrong for 20-year £500k drawdown

**Finding:** The test expected depletion at age 80, but the math shows £500k ÷ £13.4k/yr ≈ 37 years → age 97. The engine output ("Investment Assets at 90 £115.6k — plan is on track") is correct. **Test oracle was wrong.** Closing.

---

### BUG-013 — FI age slider does not update after DOB entry

**Finding:** Code inspection confirms `setP1Dob()` preserves the user's existing `fiAge` value, only clamping it upward if the new age exceeds it. This is correct — the user's chosen FI age should not reset when they correct their DOB. The behaviour reported as a bug ("FI age after DOB entry = 67") is by design. The observation was a false positive from the charter-11 test measuring post-navigation slider state. **Closing as not a bug.** Addressed UX-side by BUG-012 fix plan above.

---

## Recommended Priority Order

| Sprint priority | Bug(s) | Rationale |
|----------------|--------|-----------|
| **Fix now (P1/P2, small)** | BUG-001, BUG-003, BUG-015, BUG-017 | High impact, 1–2 line fixes each. BUG-001 is a data-correctness issue. BUG-015 makes the core onboarding flow feel broken on first visit. BUG-017 causes silently incorrect CGT calculations. |
| **Fix this sprint (P2, medium)** | BUG-002 | Sync timeout/loading UX. Affects all first-time users on slow connections or cold-start deployments. |
| **Fix next sprint (P3, small)** | BUG-006, BUG-004, BUG-012, BUG-014 | CSS overflow (trivial), table discoverability (easy), copy improvements (trivial). |
| **Roadmap (P3, medium)** | BUG-016 | Meaningful feature addition for the 50-60 demographic. Requires design + build. |
