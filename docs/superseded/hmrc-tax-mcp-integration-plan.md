# HMRC Tax MCP Integration Plan

## Document Control

- Status: Superseded
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-03
- Last reviewed: 2026-04-05
- Review cadence: On each phase completion and on rule-set version bumps

---

## Status Summary

Phase 1 is partly implemented:

- `src/config/taxRuleSnapshot.ts` exists and is committed
- `src/config/financialConstants.ts`, `src/financialEngine/taxCalculations.ts`, and `src/financialEngine/projectionEngine.ts` already consume the snapshot
- CI already validates snapshot drift

Important current-state correction:

- the current `scripts/gen-tax-snapshot.ts` emits committed values that were previously verified against `hmrc-tax-mcp`
- it does not execute live MCP calls in CI or at runtime today
- `src/app/api/tax-trace/route.ts` is still planned, not implemented

Superseded by:

- `docs/optimizer-architecture-reconciled.md`

For the reconciled architecture across HMRC MCP, optimizer, RAG, and LLM work, see `docs/optimizer-architecture-reconciled.md`.

## Problem Statement

Historically, LaterLifePlan's financial engine (`projectionEngine.ts`, `taxCalculations.ts`) used manually maintained constants in `financialConstants.ts` to compute UK income tax, CGT, and pension allowances. That created annual maintenance risk, weak auditability, and no clear mechanism to detect HMRC rule drift.

The `hmrc-tax-mcp` project provides a versioned, DSL-authored rule set for UK tax rules, covering income tax, CGT, UFPLS, personal allowance taper, and pension allowances. Integrating these rules makes LaterLifePlan's tax engine authoritative, versioned, and auditable.

---

## Objectives

1. Replace hardcoded UK tax constants in LaterLifePlan with values derived from the `hmrc-tax-mcp` rule set.
2. Support multi-year projections by mapping simulation years to the correct rule version.
3. Keep the projection engine client-safe and zero-latency (no runtime network calls during simulation).
4. Provide an audit trail for tax calculations (rule ID, version, tax year, input, output).
5. Enable future Scotland jurisdiction support without engine rewrites.

---

## Scope

### In scope (Phase 1)

| Rule ID | Replaces in LaterLifePlan |
|---|---|
| `income_tax_due` | `calcIncomeTax()` in `taxCalculations.ts` |
| `cgt_due` | `calcCGT()` in `taxCalculations.ts` |
| `is_higher_rate_taxpayer` | `isHigherRateTaxpayer()` in `taxCalculations.ts` |
| `pa_taper` | Composed into `income_tax_due`; also used for UI display of effective PA |
| `pension_lsa` | Hardcoded `£268,275` in `financialConstants.ts` |
| `pension_ufpls_tax_free_fraction` | Hardcoded `0.25` in `financialConstants.ts` |
| `pension_ufpls_taxable_fraction` | Hardcoded `0.75` in `financialConstants.ts` |
| `cgt_exempt` | Hardcoded `£3,000` in `financialConstants.ts` |
| `cgt_rates` | Hardcoded 18% / 24% in `financialConstants.ts` |

### In scope (Phase 2)

| Rule ID | Purpose |
|---|---|
| `state_pension_annual` | Seed default weekly State Pension input from authoritative annual figure |
| `pension_tapered_annual_allowance` | Tapered annual allowance for high earners (not currently modelled) |
| `money_purchase_annual_allowance` | MPAA after flexible access (not currently modelled) |

### Out of scope

- `savings_allowance_*` — LaterLifePlan does not model savings account interest income
- `dividend_income_bands` / `dividend_allowance` — LaterLifePlan does not model dividend income
- `property_income_bands` — LaterLifePlan handles rental as a raw annual income figure
- `savings_income_bands` — no savings income modelling
- Scotland jurisdiction (`jurisdiction: 'scotland'`) — Phase 3; requires data model change

---

## Architecture Decision: Hybrid Snapshot

Three options were considered:

| Option | Description | Verdict |
|---|---|---|
| A — Runtime execution | Call `hmrc-local` at simulation time via API route | Rejected: adds server round-trip latency; breaks client-side simulation |
| B — Manual constant extraction | Copy rule outputs into `financialConstants.ts` manually | Rejected: defeats the purpose of versioned rules |
| **C — Build-time snapshot (recommended)** | Run rules at build/CI time; emit typed `taxRuleSnapshot.ts` | **Selected** |

### How Option C works

```
scripts/gen-tax-snapshot.ts
  └─ executes hmrc-local rules for each required tax year
  └─ emits src/config/taxRuleSnapshot.ts (typed, committed)

src/config/taxRuleSnapshot.ts
  └─ consumed by financialConstants.ts (replaces hardcoded values)
  └─ consumed by taxCalculations.ts (thin wrappers)

src/financialEngine/projectionEngine.ts
  └─ unchanged interface — calls calcIncomeTax(), calcCGT() as today
  └─ these wrappers now read from snapshot instead of hardcoded constants

src/app/api/tax-trace/route.ts  (planned dev/audit only)
  └─ executes rules with trace=true at request time
  └─ returns step-by-step audit for a given person-year
```

The snapshot is committed to the repository. CI regenerates and validates it on PRs that touch rule versions. Developers run `npm run gen:tax-snapshot` to refresh locally.

---

## Tax Year Mapping

The projection engine simulates from the current calendar year to life expectancy. Each simulation year maps to a UK tax year as follows:

```
taxYear = `${calendarYear}-${String(calendarYear + 1).slice(-2)}`
// e.g. year 2028 → "2028-29"
```

**Rule coverage is not uniform.** The snapshot stores each rule group separately with its own `latestAvailableYear`:

| Rule group | Confirmed through | Fallback for years beyond |
|---|---|---|
| Income tax bands (`income_tax_due`, `income_tax_bands`) | **2030-31** | Fall back to 2030-31 |
| CGT (`cgt_due`, `cgt_rates`, `cgt_exempt`, `is_higher_rate_taxpayer`) | **2026-27** | Fall back to 2026-27 + log warning |
| Pension / UFPLS (`pension_lsa`, `pa_taper`, UFPLS fractions) | **2026-27** | Fall back to 2026-27 + log warning |
| State Pension (`state_pension_annual`) | **2026-27** | Fall back to 2026-27 + log warning |

HMRC has not published CGT rates or pension constants beyond 2026-27. When a simulation year uses a fallback entry, `getSnapshotForYear` emits a structured `console.warn` (suppressed in test env) identifying the rule group, the requested year, and the actual year used. This is by design — the fallback is the best available authoritative value — but it must be visible to developers and in CI logs.

---

## Input/Output Mapping

### `income_tax_due`

| Direction | LaterLifePlan variable | Rule variable |
|---|---|---|
| Input | `p1TaxBasis` (sum of taxable income sources) | `adjusted_net_income` |
| Output | `p1IncomeTax` | return value (£, rounded to 2dp) |

`p1TaxBasis` is already assembled in the engine as: State Pension (conditional) + DB Pension + Part-time Work + Other Income + Property Rent + DC drawdown taxable portion.

### `cgt_due`

| Direction | LaterLifePlan variable | Rule variable |
|---|---|---|
| Input | `p1TotalCG` (capital gains realised this year) | `capital_gain` |
| Input | result of `is_higher_rate_taxpayer` | `is_higher_rate_taxpayer` |
| Output | `p1CgtPaid` | return value (£, rounded to 2dp) |

### `is_higher_rate_taxpayer`

| Direction | LaterLifePlan variable | Rule variable |
|---|---|---|
| Input | `p1TaxBasis` | `adjusted_net_income` |
| Output | used to select CGT rate | return value (boolean) |

### Constant rules (no inputs)

These rules return a single value for a given tax year. Because CGT and pension rules are only confirmed to 2026-27, the snapshot key routes through the per-group fallback (see Tax Year Mapping above).

| Rule | Snapshot group | Snapshot key | Replaces | Confirmed to |
|---|---|---|---|---|
| `pension_lsa` | `pension` | `pension[taxYear].lsa` | `PENSION_RULES.LIFETIME_LUMP_SUM_ALLOWANCE` | 2026-27 |
| `pension_ufpls_tax_free_fraction` | `pension` | `pension[taxYear].ufplsTaxFreeFraction` | `PENSION_RULES.UFPLS_TAX_FREE_FRACTION` | 2026-27 |
| `pension_ufpls_taxable_fraction` | `pension` | `pension[taxYear].ufplsTaxableFraction` | `PENSION_RULES.UFPLS_TAXABLE_FRACTION` | 2026-27 |
| `cgt_exempt` | `cgt` | `cgt[taxYear].exemptAmount` | `CGT.ANNUAL_EXEMPT_AMOUNT` | 2026-27 |
| `cgt_rates` | `cgt` | `cgt[taxYear].basicRate`, `.higherRate` | `CGT.BASIC_RATE`, `CGT.HIGHER_RATE` | 2026-27 |

---

## Gaps Identified

1. **Tax year hardcoding and uneven rule coverage** — `financialConstants.ts` currently holds 2024/25 values. Phase 1 snapshot covers 2025-26 onwards. More importantly, coverage is not uniform across rules: `income_tax_due` / `income_tax_bands` run through 2030-31, but `cgt_due`, `pension_lsa`, `pa_taper`, and UFPLS fraction rules are only confirmed to **2026-27** — HMRC has not published future CGT rates. For simulation years beyond 2026-27, CGT and pension constants fall back to the latest confirmed entry with a logged warning. The snapshot structure stores each rule group separately with its own `latestAvailableYear` to make the fallback explicit and auditable.

2. **No jurisdiction field** — `Person` has no `jurisdiction: 'rUK' | 'scotland'` field. Phase 1 assumes rUK for all users. Phase 3 adds this.

3. **State Pension user input** — `StatePensionSource.weeklyAmount` is user-supplied. `state_pension_annual` provides the authoritative full new SP for validation/defaulting, but does not replace the user field.

4. **`drawFromGIA()` correctness** — LaterLifePlan's proportional disposal method is equivalent to the `gia_disposal_gain` rule. No code change required; the rule is used for cross-validation in tests only.

5. **Rule coverage beyond 2030-31** — The current rule set ends at 2030-31. Projections beyond that fall back to latest. A CI check will warn if simulation horizon exceeds rule coverage.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rule version mismatch causes silent behavioural change | Medium | Pin rule versions in snapshot; CI diff on rule outputs |
| CGT/pension fallback silently uses stale 2026-27 rates for 2027+ years | **High** (by design until HMRC publishes) | `getSnapshotForYear` emits structured warning per rule group; CI job asserts warning is expected and documented |
| Simulation horizon exceeds income-tax rule coverage (beyond 2030-31) | Medium (long-lived plans) | Fallback to 2030-31 + warning; CI alert if new rule versions available |
| Decimal precision drift between rule engine and LaterLifePlan | Low | Rules use `round(…, 2)`; LaterLifePlan uses `Math.round`; add precision test |
| Scotland users silently computed at rUK rates | Medium (Phase 1) | Add UI disclaimer; fix in Phase 3 |
| `hmrc-local` changes API shape | Low | Snapshot isolates runtime from tool changes; generator fails loudly |
| HMRC changes CGT rates for 2026-27 retroactively | Very low | CI diff job detects snapshot drift; snapshot is committed and reviewed in PRs |

---

## Phases and Deliverables

### Phase 1 — Core Tax Engine Integration

| Deliverable | File(s) |
|---|---|
| Snapshot generator script | `scripts/gen-tax-snapshot.ts` |
| Typed snapshot | `src/config/taxRuleSnapshot.ts` |
| Updated constants | `src/config/financialConstants.ts` (references snapshot) |
| Updated tax calculations | `src/financialEngine/taxCalculations.ts` (wrappers) |
| Dev audit API route | `src/app/api/tax-trace/route.ts` (planned) |
| Unit + integration tests | `tests/unit/taxCalculations.test.ts` (extended) |
| CI validation step | `.github/workflows/ci-cd.yml` (new job: `validate-tax-rules`) |
| Developer docs | `docs/superseded/hmrc-tax-mcp-implementation.md` |

### Phase 2 — Extended Rule Coverage

- State Pension default seeding from `state_pension_annual`
- Tapered annual allowance modelling
- MPAA modelling

### Phase 3 — Scotland Jurisdiction

- Add `jurisdiction: 'rUK' | 'scotland'` to `Person` model
- Snapshot generator fetches Scotland variants
- Tax calculations select jurisdiction per person

---

## Acceptance Criteria

### Snapshot generation
- [ ] `npm run gen:tax-snapshot` executes all Phase 1 rules and writes a valid, parseable `taxRuleSnapshot.ts`
- [ ] Snapshot structure is per rule group (`incomeTaxBands`, `cgt`, `pension`), each with its own `latestAvailableYear` sentinel
- [ ] Income tax bands are present for all years 2025-26 → 2030-31
- [ ] CGT and pension groups are present for 2025-26 and 2026-27; no entries exist for 2027-28+ (correct gap, not a bug)

### Tax year fallback behaviour
- [ ] `getSnapshotForYear(2028)` for the `cgt` group returns the 2026-27 entry and emits a `console.warn` identifying the rule group, requested year, and actual year used
- [ ] `getSnapshotForYear(2028)` for `incomeTaxBands` returns the exact 2028-29 entry with no warning
- [ ] The warning is suppressed when `NODE_ENV === "test"`

### Correctness
- [ ] Projection engine produces numerically identical results to current implementation for 2025-26 tax year inputs (regression tests pass)
- [ ] New tests assert correct income tax, CGT, and UFPLS outputs for at least three worked examples drawn from HMRC guidance
- [ ] A test explicitly asserts that CGT for a 2030 simulation year uses 2026-27 rates (expected fallback behaviour documented and tested, not silent)

### CI
- [ ] `validate-tax-rules` job passes on PRs
- [ ] CI job fails if regenerated snapshot differs from the committed snapshot (drift detection)
- [ ] CI job emits the expected fallback warnings and does not treat them as errors

### Code quality
- [ ] All rule references in code include `rule_id`, `version`, `tax_year`, and `latestAvailableYear` in comments or snapshot metadata
- [ ] `docs/superseded/hmrc-tax-mcp-implementation.md` explains the per-group fallback and how to bump rule versions when HMRC publishes new years
