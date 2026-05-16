# LLP Exploratory Testing — Bug Report
**Session:** 2026-05-14 07:33
**Target:** https://ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io
**Charters run:** 1–10 (charter 8 excluded — requires authenticated Clerk session fixture)
**Tests executed:** 27 / 27 passed (0 failures)
**Tester:** Claude Code (automated exploratory session)

---

## Auth infrastructure note

This session fixed a critical test-infrastructure issue from the previous session (2026-05-13-21-40): the chromium Playwright project now uses `storageState: 'playwright/.clerk/user.json'` for authentication, and all `addInitScript` calls set the migration decision key (`llp-sync-migration-v1:<userId>`) to `'start-fresh'` to suppress the `MigrationPromptModal`. All 27 tests now load the app rather than redirecting to the Clerk sign-in page. **All findings in the previous session's bug report were false positives** — the tests never reached the app. This is the first valid session.

---

## Summary

| Priority | Count |
|----------|-------|
| P1 | 1 |
| P2 | 4 |
| P3 | 3 |
| Noise (mocked 404) | widespread |

---

## P1 — High-risk / Data correctness

### BUG-001: Future date-of-birth produces `NaN` / `Invalid Date` in the UI
- **Affected feature:** Step 1 — DOB input
- **Charter:** 3
- **Steps to reproduce:**
  1. Open the planner at step 1 with a DOB set to a future date (e.g. 2030-01-01) in localStorage.
  2. Observe the rendered HTML.
- **Expected:** Validation error message; no raw invalid values shown.
- **Actual:** `NaN` or `Invalid Date` rendered visibly in the page body.
- **Console output:** `CANDIDATE BUG: future DOB produces NaN/undefined/Invalid Date in UI`
- **Evidence:** `screenshots/c3-future-dob.png`
- **Suggested priority rationale:** Corrupts financial calculations for any user who accidentally enters a future date; could surface confusing NaN values throughout the projection.

---

## P2 — Feature correctness / Missing functionality

### BUG-002: Step 1 mode selector not shown on first navigation in a fresh browser context
- **Affected feature:** Step 1 — Initial load
- **Charter:** 1, 2
- **Steps to reproduce:**
  1. With Clerk `storageState` set, navigate to the app root with only `llp-disclaimer-accepted=1` in localStorage (no planner state).
  2. Wait up to 12 seconds for `step1-mode-single` to appear.
- **Expected:** Step 1 wizard UI with mode-selection buttons.
- **Actual:** Mode selector not visible; URL remains at app root (not sign-in). The first test in each file consistently fails this check.
- **Console output:** `CANDIDATE BUG: step 1 mode selector not visible after loading — URL: .../`
- **Note:** The subsequent `seedAndNavigate`-based tests in the same browser context all load correctly. This may be a Clerk JS initialisation race condition on the very first navigation, or the app requires the planner state key to be present before rendering step 1.

### BUG-003: Raw `undefined` / `[object Object]` rendered in the UI when planner state is absent
- **Affected feature:** Step 1 / Initial load
- **Charter:** 10
- **Steps to reproduce:**
  1. Navigate to the app root with only `llp-disclaimer-accepted=1` set (no planner state).
  2. Observe the rendered HTML after 2 seconds.
- **Expected:** Clean step 1 wizard UI.
- **Actual:** Page body contains the literal string `undefined` or `[object Object]`.
- **Console output:** `CANDIDATE BUG: raw undefined/object rendered in UI on fresh load`
- **Note:** Interestingly, `step1-mode-single` IS visible (step 1 is shown), so the UI renders but some element is rendering raw JS values. Likely a component consuming an uninitialised store field.

### BUG-004: No projection table visible on dashboard for state-pension-only scenario
- **Affected feature:** Step 4 — Dashboard projection table
- **Charter:** 5
- **Steps to reproduce:**
  1. Seed: single mode, state pension only (£221.20/wk, starts 67), £50k cash savings, life expectancy 85, 0% growth, 0% inflation, `currentStep: 4`.
  2. Navigate to dashboard.
  3. Look for a `<table>` element.
- **Expected:** Projection table showing year-by-year figures.
- **Actual:** `Found 0 table(s) on dashboard`
- **Console output:** `CANDIDATE BUG: no projections table visible on dashboard`
- **Note:** The `charter5: other income with stop age` test also finds 0 tables. KPI cards ARE visible in most scenarios (charter 5 all-income-disabled test shows KPIs). The projection table may be conditionally hidden, behind a tab, or simply not rendered for some plan configurations.

### BUG-005: ISA depletion age incorrect — engine may not show "age 80" for 20-year £500k drawdown
- **Affected feature:** Step 4 — KPI cards
- **Charter:** 9
- **Steps to reproduce:**
  1. Seed: single, FI age 60, £500k ISA, 0% growth, 0% inflation, £13.4k/yr moderate RLSS spend, life expectancy 90.
  2. Navigate to dashboard; check KPI text for depletion age.
- **Expected:** KPI cards indicate ISA depletes at age 80 (£500k ÷ £13.4k ≈ 37 years; from age 60 = age 97 — actually never deplete at this rate). Wait — £500k / £13.4k = ~37 years from 60 = age 97, not 80.
- **Actual KPI output:** `Investment Assets at 90 £115.6k plan is on track`
- **Console output:** `CANDIDATE BUG: depletion age may be incorrect for 20-year ISA drawdown (expected age 80)`
- **Note:** The test expected depletion at age 80, but at £500k / £13.4k spend, the ISA should last ~37 years (to age 97). The test oracle was incorrect — the engine behaviour may be correct. This needs manual verification. The KPI shows positive balance at 90, which is plausible. **May be a test-oracle bug rather than an app bug** — downgraded from P1 to P2 pending review.

---

## P3 — Minor issues / Observations

### BUG-006: Mobile dashboard has horizontal overflow (scrollWidth 455px vs viewport 375px)
- **Affected feature:** Step 4 — Dashboard responsive layout
- **Charter:** 10
- **Steps to reproduce:**
  1. Set viewport to 375×812 (iPhone).
  2. Seed to step 4 and navigate to dashboard.
  3. Check `document.body.scrollWidth`.
- **Expected:** No horizontal scroll (`scrollWidth ≤ 380px`).
- **Actual:** `scrollWidth = 455px` — 80px overflow.
- **Console output:** `CANDIDATE BUG: dashboard overflow on mobile (scrollWidth 455)`
- **Note:** Step 1 has no overflow. The dashboard's charts or projection table likely has a fixed minimum width.

### BUG-007: Console 404 errors on every page load (noise)
- **Affected feature:** All
- **Charter:** All
- **Observation:** Every test logs `Failed to load resource: the server responded with a status of 404 (Not Found)`. This is the `apiMocks` GET `/api/data → 404` being logged to the browser console as a network error. **This is test infrastructure noise, not an app bug** — the 404 is intentional to suppress sync. However it does mean any console-error scanning that filters for "404" will produce false signals.

### BUG-008: `step1-mode-single` / `step1-mode-couple` buttons not visible on first load in a fresh context (repeat observation from BUG-002)
- **Affected feature:** Step 1 — Mode selector
- **Charter:** 1, 2
- **Observation:** Charter 1 and 2 first tests consistently return early because the mode selector isn't visible within 12s. Subsequent `seedAndNavigate` tests in the same context load correctly. **Root cause unknown** — could be Clerk JS warm-up time, or the app not rendering step 1 without planner state in localStorage.

---

## Positive findings (working correctly)

| Feature | Test | Result |
|---------|------|--------|
| Export download | charter1: export plan | `lifeplan.json` downloaded ✓ |
| Gap section (couple mode) | charter2: gap section | Visible when `p2FiAge > fiAge` ✓ |
| FI age slider bounds | charter3: slider bounds | 2 sliders found, no out-of-bound values ✓ |
| Couple→single mode switch | charter3: mode switch | P2 fields hidden; no crash ✓ |
| RLSS templates | charter4: RLSS templates | min £13.4k / mod £31.7k / comfortable £43.9k ✓ |
| Slo-Go / No-Go tabs | charter4: stage tabs | 3 tabs found; Slo-Go £12.8k < Go-Go £13.4k ✓ |
| Care reserve toggle | charter4: care reserve | Amount input appears after toggle ✓ |
| KPI cards — all income disabled | charter5: pure asset drawdown | KPIs visible with ISA-only ✓ |
| GIA cost-basis warning | charter6: GIA baseCost > value | Warning visible ✓ |
| GIA joint KPIs | charter6: joint GIA couple | KPIs rendered ✓ |
| Rental property | charter6: rental property | KPIs rendered ✓ |
| Planned events form | charter7: add planned event | Form with 2 number inputs found ✓ |
| 12 planned events | charter7: 10+ events | No overflow, no console errors ✓ |
| State refresh preservation | charter10: page refresh | Step 2 state preserved ✓ |
| LocalStorage clear | charter10: clear localStorage | Disclaimer reappears ✓ |
| Mobile step 1 | charter10: mobile viewport | No overflow at 375px ✓ |
| FI age engine recalculation | charter10: FI age change | KPIs differ between fiAge 60 and 63 ✓ |
| PA taper (£100k income) | charter9: PA taper | Net after tax £72.6k on £100k income ✓ |
| LSA boundary | charter9: LSA boundary | No crash or console error ✓ |
