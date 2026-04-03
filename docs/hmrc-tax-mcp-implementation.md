# HMRC Tax MCP — Implementation Guide

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-03
- Last reviewed: 2026-04-03

This document is the technical implementation reference for the HMRC Tax MCP integration. For the project-level plan, rationale, and scope decisions see [`docs/hmrc-tax-mcp-integration-plan.md`](./hmrc-tax-mcp-integration-plan.md).

---

## Overview

The integration replaces LLP's manually maintained UK tax constants with values derived from the `hmrc-tax-mcp` rule set. A build-time script (`scripts/gen-tax-snapshot.ts`) executes the relevant rules and emits a typed snapshot file (`src/config/taxRuleSnapshot.ts`). The projection engine reads from the snapshot at runtime — no network calls, no latency penalty.

```
hmrc-tax-mcp rules
        │
        ▼
scripts/gen-tax-snapshot.ts   (runs at build / npm run gen:tax-snapshot)
        │
        ▼
src/config/taxRuleSnapshot.ts  ──► src/config/financialConstants.ts
                                          │
                                          ▼
                               src/financialEngine/taxCalculations.ts
                                          │
                                          ▼
                               src/financialEngine/projectionEngine.ts
```

---

## Files Changed / Created

| File | Change |
|---|---|
| `scripts/gen-tax-snapshot.ts` | **New** — snapshot generator |
| `src/config/taxRuleSnapshot.ts` | **New** — generated typed snapshot (committed) |
| `src/config/financialConstants.ts` | **Modified** — imports snapshot; replaces hardcoded values |
| `src/financialEngine/taxCalculations.ts` | **Modified** — wrappers read from snapshot per tax year |
| `src/app/api/tax-trace/route.ts` | **New** — dev/audit trace endpoint |
| `tests/unit/taxCalculations.test.ts` | **Modified** — extended with worked examples |
| `.github/workflows/ci-cd.yml` | **Modified** — adds `validate-tax-rules` job |

---

## Snapshot Generator (`scripts/gen-tax-snapshot.ts`)

### What it does

For each tax year in the configured range, the script executes the Phase 1 rule set via `hmrc-local-execute_rule` and collects the outputs into a typed object, then writes `src/config/taxRuleSnapshot.ts`.

### Tax years generated

Currently: `2025-26`, `2026-27`, `2027-28`, `2028-29`, `2029-30`, `2030-31`

All at jurisdiction `rUK`. (Scotland added in Phase 3.)

**Important: rule coverage is not uniform across years.** Not all rules have entries for every tax year — HMRC has not confirmed future CGT rates or pension constants beyond 2026-27. The generator must handle per-rule gaps by falling back to the latest available entry for that rule:

| Rule | Full coverage (25-26 → 30-31) | Confirmed to year |
|---|---|---|
| `income_tax_due` | ✓ | 2030-31 |
| `income_tax_bands` | ✓ | 2030-31 |
| `cgt_due` | — | **2026-27** (fallback for 2027-28+) |
| `cgt_rates` | — | **2026-27** |
| `cgt_exempt` | — | **2026-27** |
| `is_higher_rate_taxpayer` | — | **2026-27** |
| `pa_taper` | — | **2026-27** |
| `pension_lsa` | — | **2026-27** |
| `pension_ufpls_tax_free_fraction` | — | **2026-27** |
| `pension_ufpls_taxable_fraction` | — | **2026-27** |
| `state_pension_annual` | — | **2026-27** |

The snapshot stores a `latestAvailableYear` per rule so `getSnapshotForYear` can fall back correctly and emit a structured warning.

### Rules executed per tax year

| Rule ID | Inputs | Snapshot key |
|---|---|---|
| `pension_lsa` | `{}` | `pensionLsa` |
| `pension_ufpls_tax_free_fraction` | `{}` | `ufplsTaxFreeFraction` |
| `pension_ufpls_taxable_fraction` | `{}` | `ufplsTaxableFraction` |
| `cgt_exempt` | `{}` | `cgtExemptAmount` |
| `cgt_rates` | `{}` | `cgtRates` (`{ basicRate, higherRate }`) |
| `state_pension_annual` | `{}` | `fullNewStatePensionAnnual` |
| `income_tax_due` | worked examples only — not snapshotted as a constant | — |
| `cgt_due` | worked examples only | — |

> `income_tax_due` and `cgt_due` are parametric (take income/gain as input). They are not snapshotted as constants — instead `taxCalculations.ts` calls them at simulation time via in-process wrappers backed by the DSL band values extracted from `income_tax_bands`.

### Snapshot shape

```typescript
// src/config/taxRuleSnapshot.ts (generated — do not edit by hand)

export interface IncomeTaxBands {
  taxYear: string;
  ruleVersion: string;
  personalAllowance: number;
  basicRateLimit: number;
  additionalRateThreshold: number;
  paTaperThreshold: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
}

export interface CgtSnapshot {
  taxYear: string;
  exemptAmount: number;
  basicRate: number;
  higherRate: number;
}

export interface PensionSnapshot {
  taxYear: string;
  lsa: number;
  ufplsTaxFreeFraction: number;
  ufplsTaxableFraction: number;
}

// Resolved value returned by getSnapshotForYear — one entry per simulation year
export interface ResolvedSnapshot {
  taxYear: string;
  incomeTaxBands: IncomeTaxBands;
  cgt: CgtSnapshot;
  pension: PensionSnapshot;
  statePensionAnnual: number;
  cgtFallback: boolean;     // true when cgt entry was absent for requested year
  pensionFallback: boolean; // true when pension entry was absent for requested year
}

// The raw snapshot is grouped by rule, not keyed by year
export const TAX_RULE_SNAPSHOT: {
  incomeTaxBands: Record<string, IncomeTaxBands>; // confirmed through 2030-31
  cgt:            Record<string, CgtSnapshot>;    // confirmed through 2026-27
  pension:        Record<string, PensionSnapshot>; // confirmed through 2026-27
  statePension:   Record<string, { annualAmount: number }>; // confirmed through 2026-27
} = { ... };
```

### Running the generator

```bash
npm run gen:tax-snapshot
```

Add to `package.json`:

```json
"scripts": {
  "gen:tax-snapshot": "npx tsx scripts/gen-tax-snapshot.ts"
}
```

The script requires the `hmrc-local` MCP server to be reachable (it is available in the Copilot CLI environment). For CI, the server is available via the MCP tool runner.

---

## Tax Year Lookup (`getSnapshotForYear`)

The projection engine needs to look up the correct snapshot for each simulation year. Because rule coverage is not uniform, the snapshot stores each rule's value independently per tax year, with a per-rule fallback to its latest available entry.

Results are **memoized** (one `Map` keyed by `calendarYear`) and fallback warnings are **deduplicated** (emitted at most once per rule group per tax year per process, suppressed in `NODE_ENV=test`).

```typescript
// src/config/taxRuleSnapshot.ts

/** Memoized resolved snapshots keyed by calendarYear. */
const _resolvedCache = new Map<number, ResolvedSnapshot>();
/** Tracks which (group, taxYear) warnings have already been emitted. */
const _warnedKeys = new Set<string>();

export function getSnapshotForYear(calendarYear: number): ResolvedSnapshot {
  const cached = _resolvedCache.get(calendarYear);
  if (cached) return cached;

  const taxYear = `${calendarYear}-${String(calendarYear + 1).slice(-2)}`;

  // Income tax: full coverage through 2030-31.
  const incomeTaxBands =
    TAX_RULE_SNAPSHOT.incomeTaxBands[taxYear] ??
    TAX_RULE_SNAPSHOT.incomeTaxBands[LATEST_INCOME_TAX_YEAR];

  // CGT: only confirmed to 2026-27. Fall back gracefully.
  const cgtEntry = TAX_RULE_SNAPSHOT.cgt[taxYear];
  const cgtFallback = !cgtEntry;
  const cgt = cgtEntry ?? TAX_RULE_SNAPSHOT.cgt[LATEST_CGT_YEAR];

  // Pension: only confirmed to 2026-27. Fall back gracefully.
  const pensionEntry = TAX_RULE_SNAPSHOT.pension[taxYear];
  const pensionFallback = !pensionEntry;
  const pension = pensionEntry ?? TAX_RULE_SNAPSHOT.pension[LATEST_PENSION_YEAR];

  // State pension: only confirmed to 2026-27. Fall back gracefully.
  const spEntry = TAX_RULE_SNAPSHOT.statePension[taxYear];
  const statePensionAnnual = spEntry?.annualAmount
    ?? TAX_RULE_SNAPSHOT.statePension[LATEST_STATE_PENSION_YEAR].annualAmount;

  if (process.env.NODE_ENV !== 'test') {
    const warn = (key: string, message: string) => {
      if (!_warnedKeys.has(key)) { _warnedKeys.add(key); console.warn(message); }
    };
    if (cgtFallback)     warn(`cgt:${taxYear}`,     `[hmrc-tax-mcp] CGT not confirmed for ${taxYear}. Using ${LATEST_CGT_YEAR}.`);
    if (pensionFallback) warn(`pension:${taxYear}`, `[hmrc-tax-mcp] Pension not confirmed for ${taxYear}. Using ${LATEST_PENSION_YEAR}.`);
    if (!spEntry)        warn(`sp:${taxYear}`,      `[hmrc-tax-mcp] State pension not confirmed for ${taxYear}. Using ${LATEST_STATE_PENSION_YEAR}.`);
  }

  const resolved: ResolvedSnapshot = {
    taxYear, incomeTaxBands, cgt, pension, statePensionAnnual, cgtFallback, pensionFallback,
  };
  _resolvedCache.set(calendarYear, resolved);
  return resolved;
}
```
```

The snapshot is therefore structured by rule group, not as a flat record keyed only by year:

```typescript
export const TAX_RULE_SNAPSHOT = {
  incomeTaxBands: {
    "2025-26": { ... },
    "2026-27": { ... },
    // ... through 2030-31
  },
  cgt: {
    "2025-26": { exemptAmount: 3000, basicRate: 18, higherRate: 24 },
    "2026-27": { exemptAmount: 3000, basicRate: 18, higherRate: 24 },
    // no further confirmed entries yet
  },
  pension: {
    "2025-26": { lsa: 268275, ufplsTaxFreeFraction: 0.25, ufplsTaxableFraction: 0.75 },
    "2026-27": { lsa: 268275, ufplsTaxFreeFraction: 0.25, ufplsTaxableFraction: 0.75 },
    // no further confirmed entries yet
  },
};

export const LATEST_INCOME_TAX_YEAR = "2030-31";
export const LATEST_CGT_YEAR        = "2026-27";
export const LATEST_PENSION_YEAR    = "2026-27";
```

---

## Updated Tax Calculations (`taxCalculations.ts`)

The three main functions gain a `calendarYear` parameter and delegate to snapshot-backed band values. Their external signatures remain backward-compatible for existing call sites that do not need multi-year awareness.

### `calcIncomeTax`

```typescript
/**
 * Calculates income tax due using HMRC rule `income_tax_due`.
 * rule_id: income_tax_due | version: 1.0.0+
 */
export function calcIncomeTax(
  adjustedNetIncome: number,
  calendarYear: number = CURRENT_TAX_YEAR_START
): number {
  const s = getSnapshotForYear(calendarYear);
  const effectivePa = Math.max(
    s.incomeTaxBands.personalAllowance -
      Math.max(adjustedNetIncome - s.incomeTaxBands.paTaperThreshold, 0) / 2,
    0
  );
  const taxable = Math.max(adjustedNetIncome - effectivePa, 0);
  const basicBand = Math.min(taxable, s.incomeTaxBands.basicRateLimit - s.incomeTaxBands.personalAllowance);
  const higherBand = Math.max(
    Math.min(adjustedNetIncome, s.incomeTaxBands.additionalRateThreshold) - effectivePa - basicBand,
    0
  );
  const additionalBand = Math.max(
    adjustedNetIncome - s.incomeTaxBands.additionalRateThreshold,
    0
  );
  return Math.round(
    (basicBand * s.incomeTaxBands.basicRate +
      higherBand * s.incomeTaxBands.higherRate +
      additionalBand * s.incomeTaxBands.additionalRate) *
      100
  ) / 100;
}
```

### `isHigherRateTaxpayer`

```typescript
/**
 * rule_id: is_higher_rate_taxpayer | version: 1.0.0+
 */
export function isHigherRateTaxpayer(
  adjustedNetIncome: number,
  calendarYear: number = CURRENT_TAX_YEAR_START
): boolean {
  const s = getSnapshotForYear(calendarYear);
  return adjustedNetIncome > s.incomeTaxBands.basicRateLimit;
}
```

### `calcCGT`

```typescript
/**
 * rule_id: cgt_due | version: 1.0.0+
 */
export function calcCGT(
  capitalGain: number,
  higherRate: boolean,
  calendarYear: number = CURRENT_TAX_YEAR_START
): number {
  const s = getSnapshotForYear(calendarYear);
  const taxableGain = Math.max(capitalGain - s.cgtExemptAmount, 0);
  const rate = higherRate ? s.cgtRates.higherRate : s.cgtRates.basicRate;
  return Math.round(taxableGain * (rate / 100) * 100) / 100;
}
```

### Constants consumed from snapshot

In `financialConstants.ts`, replace hardcoded pension constants with snapshot values. Use the pinned `CURRENT_TAX_YEAR_START` constant (not `new Date()`) for deterministic server/client behaviour:

```typescript
import { getSnapshotForYear } from "./taxRuleSnapshot";

// Pinned to the current tax year — bump each April alongside `npm run gen:tax-snapshot`.
export const CURRENT_TAX_YEAR_START = 2025; // 2025-26 tax year
const _snapshot = getSnapshotForYear(CURRENT_TAX_YEAR_START);

export const PENSION_RULES = {
  UFPLS_TAX_FREE_FRACTION: _snapshot.pension.ufplsTaxFreeFraction,  // 0.25
  UFPLS_TAXABLE_FRACTION:  _snapshot.pension.ufplsTaxableFraction,   // 0.75
  LIFETIME_LUMP_SUM_ALLOWANCE: _snapshot.pension.lsa,                // 268275
  // ... rest unchanged
};

export const CGT = {
  ANNUAL_EXEMPT: _snapshot.cgt.exemptAmount, // 3000
  BASIC_RATE:    _snapshot.cgt.basicRate,    // 0.18
  HIGHER_RATE:   _snapshot.cgt.higherRate,   // 0.24
  // ...
};
```

> The projection engine should pass `calendarYear` into `calcIncomeTax`, `calcCGT`, and `isHigherRateTaxpayer` so multi-year projections use the correct rule snapshot for each year. This is the only change needed in `projectionEngine.ts`.

---

## Audit / Trace API Route (`src/app/api/tax-trace/route.ts`)

A `GET` endpoint that executes a rule with full trace and returns the result. Intended for developer tooling and future "explain my tax" UI feature. Protected by Clerk auth.

### Request

```
GET /api/tax-trace?rule=income_tax_due&income=75000&year=2025-26
```

Query parameters:

| Param | Type | Description |
|---|---|---|
| `rule` | string | Rule ID (e.g. `income_tax_due`, `cgt_due`) |
| `income` | number | `adjusted_net_income` (for income tax rules) |
| `gain` | number | `capital_gain` (for CGT rules) |
| `isHigher` | boolean | `is_higher_rate_taxpayer` (for CGT rules) |
| `year` | string | Tax year, e.g. `2025-26` |

### Response

```json
{
  "rule_id": "income_tax_due",
  "tax_year": "2025-26",
  "version": "1.0.0",
  "inputs": { "adjusted_net_income": 75000 },
  "result": 24432.00,
  "trace": [ ... ]
}
```

---

## Projection Engine Changes (`projectionEngine.ts`)

The projection engine needs minimal changes:

1. Import `getSnapshotForYear` to read LSA and UFPLS fraction per year.
2. Pass `calendarYear` to `calcIncomeTax`, `calcCGT`, `isHigherRateTaxpayer`.

```typescript
// Inside the main simulation loop, at the top of each year iteration:
const calendarYear = CURRENT_TAX_YEAR_START + y;
const yearSnapshot = getSnapshotForYear(calendarYear);

// Replace hardcoded constants:
const lsa = yearSnapshot.pension.lsa;                          // was: PENSION_RULES.LIFETIME_LUMP_SUM_ALLOWANCE
const ufplsFraction = yearSnapshot.pension.ufplsTaxFreeFraction; // was: PENSION_RULES.UFPLS_TAX_FREE_FRACTION

// Pass calendarYear to tax functions:
const p1Tax = calcIncomeTax(p1TaxBasis, calendarYear);
const p2Tax = calcIncomeTax(p2TaxBasis, calendarYear);
const p1IsHigher = isHigherRateTaxpayer(p1TaxBasis, calendarYear);
const p1Cgt = calcCGT(p1TotalCG, p1IsHigher, calendarYear);
```

---

## Tests

### Unit tests (`tests/unit/taxCalculations.test.ts`)

Extend existing tests with worked examples from HMRC guidance. Each test asserts against a known answer and specifies `calendarYear`.

#### Worked examples to cover

| Scenario | `adjusted_net_income` | Expected tax | Source |
|---|---|---|---|
| Income below PA | £10,000 | £0 | HMRC basic |
| Basic rate only | £30,000 | £3,486.00 | HMRC calculator |
| Higher rate band | £75,000 | £17,432.00 | HMRC calculator |
| PA taper (£110,000) | £110,000 | £33,432.00 | HMRC calculator |
| PA fully tapered (£130,000) | £130,000 | £44,703.00 | HMRC calculator |

| CGT Scenario | `capital_gain` | `is_higher_rate` | Expected CGT | Source |
|---|---|---|---|---|
| Below exempt amount | £2,000 | false | £0 | HMRC |
| Basic rate taxpayer | £10,000 | false | £1,260.00 | 18% on £7,000 |
| Higher rate taxpayer | £10,000 | true | £1,680.00 | 24% on £7,000 |

### Integration tests

- Assert that `gen:tax-snapshot` produces a valid, parseable `taxRuleSnapshot.ts`
- Assert snapshot values match independently verified HMRC rates for 2025-26
- Assert `getSnapshotForYear(2031)` falls back to `2030-31` with no thrown error

### Cross-validation tests

- Run `drawFromGIA` and compare gain to `gia_disposal_gain` rule output for the same inputs
- These live in `tests/unit/taxCalculations.test.ts` as validation-only cases (no snapshot dependency)

---

## CI Validation (`validate-tax-rules` job)

Add a new job to `.github/workflows/ci-cd.yml`:

```yaml
validate-tax-rules:
  name: Validate HMRC Tax Rule Snapshot
  runs-on: ubuntu-latest
  needs: []
  steps:
    - uses: actions/checkout@<SHA> # vN
    - uses: actions/setup-node@<SHA> # vN
      with:
        node-version: "20"
        cache: "npm"
    - run: npm ci
    - name: Regenerate snapshot
      run: npm run gen:tax-snapshot
    - name: Assert snapshot unchanged
      run: git diff --exit-code src/config/taxRuleSnapshot.ts
    - name: Run tax calculation tests
      run: npx vitest run tests/unit/taxCalculations.test.ts
```

The job fails if the committed snapshot differs from a freshly generated one. This ensures the snapshot stays in sync with the rule set on every PR.

> **Note:** The `gen:tax-snapshot` step requires the `hmrc-local` MCP server. In CI this is available via the Copilot MCP tool runner. If unavailable, the step is skipped and a warning is emitted — the existing committed snapshot is used for the test run.

---

## How to Bump Rule Versions

When `hmrc-tax-mcp` publishes updated rule versions or new tax years:

1. Run `npm run gen:tax-snapshot` locally to regenerate `src/config/taxRuleSnapshot.ts`.
2. Review the diff — verify changed values against HMRC guidance.
3. Run `npx vitest run tests/unit/taxCalculations.test.ts` to confirm tests pass.
4. Update worked-example test assertions if HMRC rates changed.
5. Commit both `taxRuleSnapshot.ts` and any test changes together in one PR.
6. The PR's `validate-tax-rules` CI job will confirm the snapshot is consistent.

### Adding a new tax year

If a new tax year (e.g. `2031-32`) becomes available in the rule set:

1. Add the year to the `TAX_YEARS` array in `scripts/gen-tax-snapshot.ts`.
2. Run `npm run gen:tax-snapshot`.
3. Update `LATEST_TAX_YEAR` in `taxRuleSnapshot.ts` if appropriate.
4. Check that long-lived projections use the new year rather than the fallback.

---

## Adding Scotland Support (Phase 3)

1. Add `jurisdiction: 'rUK' | 'scotland'` to the `Person` type in `src/models/types.ts`.
2. Extend `gen-tax-snapshot.ts` to also execute Scotland-jurisdiction rules and add a parallel `scotland` entry in the snapshot.
3. Pass `jurisdiction` into `calcIncomeTax`, `calcCGT`, `isHigherRateTaxpayer`.
4. Update `getSnapshotForYear(year, jurisdiction)` to select the correct entry.
5. Add UI control in the person wizard to select Scotland/rUK.
6. Add Scotland-specific test cases.

---

## Rule Reference

All rules are sourced from `hmrc-tax-mcp` at version `1.0.0`+. Authoritative HMRC citations are embedded in each rule's DSL metadata.

| Rule ID | HMRC Citation |
|---|---|
| `income_tax_due` | [HMRC Income Tax rates and allowances](https://www.gov.uk/income-tax-rates); ITA 2007 s.35 |
| `cgt_due` | [HMRC CGT rates and allowances](https://www.gov.uk/capital-gains-tax/allowances); Autumn Budget 2024 |
| `pa_taper` | [HMRC Income Tax rates](https://www.gov.uk/income-tax-rates); ITA 2007 s.35 |
| `pension_lsa` | [HMRC Pension schemes rates](https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates); Finance Act 2024 s.18 |
| `pension_ufpls_tax_free_fraction` | [HMRC Tax on private pension](https://www.gov.uk/tax-on-pension) |
| `cgt_exempt` | [HMRC CGT allowances](https://www.gov.uk/capital-gains-tax/allowances) |
| `cgt_rates` | [HMRC CGT rates](https://www.gov.uk/government/publications/rates-and-allowances-capital-gains-tax) |
| `state_pension_annual` | [HMRC State Pension rates](https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions) |
