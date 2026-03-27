# Testing Plan — Later Life Planner

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on test-strategy changes

## Overview

This document defines the complete testing strategy for the Later Life Planner application. The app is a UK later-life financial planning tool with a complex calculation engine; correctness of the tax and drawdown logic is critical.

**Test framework:** Vitest (already installed)
**Test runner:** `npm test` (runs all suites)
**Coverage:** `npm run test:coverage`

---

## Test Layers

| Layer | What it tests | Location |
|---|---|---|
| Unit — Tax | `calcIncomeTax`, `calcCGT`, `drawFromGIA`, `isHigherRateTaxpayer` | `tests/unit/taxCalculations.test.ts` |
| Unit — Engine helpers | `formatCurrency`, `getStageTotalSpending`, `getAssetDepletionAge`, `getTotalUnrealisedGain`, `getSustainableRlssLevel`, `calculateGamificationMetrics` | `tests/unit/projectionEngine.test.ts` |
| Unit — Mock data | `createDefaultState`, `buildDefaultLifeStages`, `ageFromDOB`, `dobFromAge`, `buildCategoriesForRlss` | `tests/unit/mockData.test.ts` |
| Integration — Waterfall | DC within PA, GIA CGT budget, ISA ordering, remaining GIA, Cash, DC above PA | `tests/integration/drawdownWaterfall.test.ts` |
| Integration — Couple mode | Joint GIA CGT split, joint property rent de-duplication, per-person PA/LSA independence | `tests/integration/coupleMode.test.ts` |
| Integration — Scenarios | End-to-end realistic plans validated against known outputs | `tests/integration/lifetimeScenarios.test.ts` |

---

## 1. Unit: Tax Calculations

### `calcIncomeTax`

| # | Input | Expected | Rationale |
|---|---|---|---|
| 1 | £0 | £0 | Below PA |
| 2 | £12,570 (PA exactly) | £0 | At boundary |
| 3 | £12,571 | £0.20 | First £1 of taxable income |
| 4 | £20,000 | £1,486 | £7,430 basic band × 20% |
| 5 | £50,270 (basic limit) | £7,540 | Full basic band |
| 6 | £60,000 | £11,432 | Basic band + higher rate on £9,730 |
| 7 | −£5,000 | £0 | Negative income clamped |

### `calcCGT`

| # | Gain | Higher rate? | Expected |
|---|---|---|---|
| 1 | £0 | false | £0 |
| 2 | £3,000 (exempt exactly) | false | £0 |
| 3 | £3,001 | false | £0.18 (1p gain × 18%) |
| 4 | £10,000 | false | £1,260 (£7,000 × 18%) |
| 5 | £10,000 | true | £1,680 (£7,000 × 24%) |
| 6 | −£5,000 | false | £0 |

### `drawFromGIA`

| # | Value | Base cost | Draw | Expected drawn | Expected gain | Expected new base cost |
|---|---|---|---|---|---|---|
| 1 | £10,000 | £6,000 | £2,000 | £2,000 | £800 | £4,800 |
| 2 | £10,000 | £10,000 | £2,000 | £2,000 | £0 | £8,000 |
| 3 | £5,000 | £3,000 | £10,000 | £5,000 (capped) | £1,200 | £0 |
| 4 | £0 | £0 | £1,000 | £0 | £0 | £0 |
| 5 | £10,000 | £6,000 | £0 | £0 | £0 | £6,000 |

---

## 2. Unit: Projection Engine Helpers

### `formatCurrency`

| Input | compact? | Expected |
|---|---|---|
| £1,234,567 | false | `£1,234,567` |
| £44,300 | true | `£44.3k` |
| £500 | true | `£500` |
| £1,234.7 | false | `£1,235` |
| £1,000,000 | true | `£1m` or `£1,000k` |

### `getStageTotalSpending`

- Returns sum of all category amounts for a given stage ID
- Returns 0 for unknown stage IDs

### `getAssetDepletionAge`

- Returns null when assets never reach zero
- Returns the correct age when assets hit zero mid-projection
- Returns null for a well-funded plan

### `getTotalUnrealisedGain`

- Sum of (value − baseCost) across all GIAs (including joint in couple mode)
- Returns 0 when all base costs equal values
- Handles disabled assets

### `getSustainableRlssLevel`

- Returns the highest RLSS level (minimum/moderate/comfortable) that the plan can sustain
- Returns null if even the minimum level cannot be covered

### `calculateGamificationMetrics`

- All metric values are numeric and non-negative
- `taxEfficiencyScore` is in range 0–100
- `incomeStabilityScore` is in range 0–100

---

## 3. Unit: Mock Data

### `createDefaultState`

- Returns a valid `PlannerState` with mode 'single'
- Has three life stages with correct IDs (go-go, slo-go, no-go)
- `fiAge` defaults to 65
- `person1.currentAge` matches the argument
- Has non-empty spending categories

### `buildDefaultLifeStages`

- Go-Go stage starts at fiAge
- Each stage end age = next stage start age − 1
- No-Go stage ends at lifeExpectancy

### `ageFromDOB` / `dobFromAge`

- Round-trip: `ageFromDOB(dobFromAge(57))` ≈ 57
- Handles future DOB gracefully
- Invalid DOB string falls back to fallback value

---

## 4. Integration: Drawdown Waterfall

Tests verify the **ordering** of the drawdown waterfall and that each step is only used when the preceding steps are exhausted or inapplicable.

### Step 1 — DC within Personal Allowance

- With £0 other taxable income: DC drawn up to £16,760 gross (PA ÷ 0.75)
- With DB pension occupying PA headroom: DC draw is reduced proportionally
- When State Pension starts and exceeds PA: DC draw in step 1 is £0
- When age < fiAge: no DC drawn at all
- LSA cap: when `p1LifetimePcls` approaches £268,275, tax-free fraction reduces

### Step 2 — GIA within CGT budget

- Individual GIA drawn to maximise £3,000 exempt: gain crystallised = exactly £3,000 (if enough gain available)
- Joint GIA capped so neither person exceeds their remaining £3,000 budget
- GIA drawn before ISA while gains exist
- No GIA drawn when age < fiAge

### Step 3 — ISA

- ISA drawn after GIA CGT-free slice
- ISA drawn before remaining (taxable) GIA
- No ISA drawn when age < fiAge

### Gross-up convergence

- `netIncome ≈ spending` (within £1) for all years where assets cover spending
- Convergence achieved within 4 iterations

---

## 5. Integration: Couple Mode

- Each person has independent personal allowance headroom
- Joint GIA capital gains split 50/50 — each person taxed on their half share
- Joint property rental income counted once (not doubled)
- Each person tracks their own LSA independently
- Different DC start ages (e.g. p1 age 60, p2 age 62) correctly respected
- Both persons' DC drawn in the same year when both are eligible

---

## 6. Integration: Lifetime Scenarios

### Scenario A — Paul & Lisa (from debug validation)

Exact inputs: Paul age 56, FI 60, DC £1.144m; Lisa age 56, DC £264k; Joint GIA £51k.
Expected (years 60–66): zero income tax, zero CGT each year.
Expected year 67: small IT when SP starts, zero CGT.
Total tax years 60–67 < £2,000.

### Scenario B — Single person, ISA only

Person age 65, FI 65, ISA £400k, no DC, no other income, spending £25k/year.
Expected: zero income tax every year (ISA withdrawals not taxable).
No depletion before age 81.

### Scenario C — LSA exhaustion

Single person with very large DC pension (£4m). After enough UFPLS withdrawals, LSA (£268,275 total tax-free cash) should be fully consumed. Subsequent DC withdrawals should show zero tax-free portion.

### Scenario D — State Pension sole-income exemption

Single person, no assets, SP as only income from age 67. With `statePensionSoleIncomeExempt: true`: zero income tax. With `statePensionSoleIncomeExempt: false`: income tax on SP above PA.

### Scenario E — Care reserve excluded from drawdown

Assets: ISA £10k + care reserve £50k, spending requires £15k/year. Assets deplete from ISA only; care reserve balance grows but is never drawn for spending.

### Scenario F — High earner above basic rate limit

Single person, DB pension £40k + DC drawdown pushing income above £50,270. Verify higher-rate income tax applies and CGT uses 24% rate.

---

## 7. Edge Cases

| Scenario | Test |
|---|---|
| Assets all zero from year 1 | Projections still generated with £0 drawdowns |
| Life expectancy = current age | Returns single-year projection |
| All assets depleted before life expectancy | `getAssetDepletionAge` returns correct age, projections continue with £0 total assets |
| Negative inflation (deflation) | Spending decreases year-on-year |
| 0% investment growth | Asset balances decrease monotonically when drawn |
| SP start age same as FI age | SP and DC both active in year 1 |
| Base cost > value (underwater GIA) | `drawFromGIA` returns 0 capital gain |
| fiAge > person's current age | No drawdown in pre-FI years |

---

## Fixtures & Helpers

`tests/fixtures/states.ts` — Reusable `PlannerState` factory functions
`tests/fixtures/helpers.ts` — Utilities: `getYearByAge`, `totalTax`, `firstFiYear`

---

## Test commands

```bash
npm test                  # run all suites once
npm run test:watch        # watch mode (vitest)
npm run test:coverage     # coverage report
```

---

## Known issues in original test file (fixed in new suite)

1. References to `p.pclsAmount` — field does not exist on `YearlyProjection`; removed
2. References to `p.spendingGap` — field does not exist; removed
3. Stage ID `'active'` used in `getStageTotalSpending` — correct ID is `'go-go'`
4. `createMockDemoState()` p2Age assumed to be 55 — fragile; use dynamic check
