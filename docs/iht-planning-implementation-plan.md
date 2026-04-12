# IHT Planning Feature — Implementation Plan

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-12
- Last reviewed: 2026-04-12
- Review cadence: On phase completion or architecture change

This document covers the end-to-end delivery of IHT planning features in LLP, motivated
by the Finance Act 2025 change bringing unspent DC pension pots into the IHT estate from
6 April 2027.

---

## Background

From 6 April 2027, unused DC pension funds (uncrystallised and drawdown) are included in
the deceased's estate for IHT at 40%. Combined with income tax when beneficiaries draw the
inherited pension, this creates a double-taxation risk:

| Scenario | £100k DC pot |
|---|---|
| Left in pension; beneficiary basic-rate | 40% IHT → £60k; beneficiary pays 20% → **£48k net (52% tax)** |
| Left in pension; beneficiary higher-rate | 40% IHT → £60k; beneficiary pays 40% → **£36k net (64% tax)** |
| Drawn at basic rate and gifted | 20% income tax → **£80k to family; 0% IHT (20% total tax)** |

HMRC citations:
- Finance Act 2025 (prospective) — Autumn Budget 2024
- [HMRC IHT on Pensions consultation](https://www.gov.uk/government/consultations/inheritance-tax-on-pensions-liability-reporting-and-payment)
- IHTA 1984 ss. 7, 8A, 8D, 21
- [HMRC IHT rates and thresholds](https://www.gov.uk/government/publications/rates-and-allowances-inheritance-tax/inheritance-tax-thresholds-and-nil-rate-band)

---

## Current State

| Component | Status | Notes |
|---|---|---|
| `PrimaryResidenceAsset` type | ❌ Not yet | Existing `PropertyAsset` is BTL/rental only |
| Primary residence in `PlannerState` | ❌ Not yet | No plan-level home asset |
| Primary residence UI (Step 3) | ❌ Not yet | — |
| IHT constants in `financialConstants.ts` | ❌ Not yet | — |
| `src/financialEngine/ihtProjection.ts` | ❌ Not yet | — |
| `IHTOutlookPanel.tsx` in Step 4 | ❌ Not yet | — |
| `NEXT_PUBLIC_IHT_ADVANCED_ENABLED` flag | ❌ Not yet | — |

---

## Feature Flag Strategy

**Phase IHT-1** (primary residence data model) is always on — it is plain data capture
with no advanced tax logic and no paywall implication.

**Phases IHT-2 through IHT-4** (constants, engine, UI panel) are gated by:

```
NEXT_PUBLIC_IHT_ADVANCED_ENABLED=false   # off by default
```

This follows the existing `NEXT_PUBLIC_OPTIMIZER_ENABLED` pattern. The engine and
constants are always compiled; only rendering is gated. This allows the feature to be
enabled per-user (e.g. via a Clerk subscription tier check or a server-set env var)
without a code deploy.

---

## Phase Checklist

- [ ] Phase IHT-1 — Primary Residence Data Model
- [ ] Phase IHT-2 — Feature Flag
- [ ] Phase IHT-3 — IHT Constants + Calculation Engine
- [ ] Phase IHT-4 — IHT Outlook Panel in Step 4

---

## Phase IHT-1 — Primary Residence Data Model

**Goal:** Capture the user's primary home as a distinct, plan-level asset. This is
different from the existing per-person `PropertyAsset` (which models BTL/rental
investment property). A primary home is shared by a couple, has no rental income, and
is subject to Principal Private Residence relief (no CGT on sale).

**Always on — no feature flag required.**

**No dependencies.**

### IHT-1.1 — Add `PrimaryResidenceAsset` type

File: `src/models/types.ts`

```typescript
/**
 * The household's primary residence — distinct from investment/BTL property.
 * Used for IHT estate projections and RNRB eligibility.
 * Principal Private Residence relief means no CGT applies on sale.
 */
export interface PrimaryResidenceAsset {
  enabled: boolean;
  /** Estimated current market value in pounds. */
  currentValue: number;
  /** Outstanding mortgage balance — reduces net estate value for IHT. */
  mortgageOutstanding: number;
  /**
   * True if the property is intended to pass to direct descendants (children,
   * grandchildren). Required to claim the Residence Nil-Rate Band (RNRB).
   * IHTA 1984 s.8H.
   */
  leavesToDescendants: boolean;
}
```

Add `primaryResidence: PrimaryResidenceAsset` to `PlannerState` alongside `careReserve`
and `jointGia` (plan-level fields, not per-person).

`PersistedPlannerState` inherits the field automatically via the `Omit<PlannerState, ...>`
type alias.

### IHT-1.2 — Store default + action

File: `src/store/plannerStore.ts`

- Add `defaultPrimaryResidence` constant.
- Add `setPrimaryResidence(updates: Partial<PrimaryResidenceAsset>)` action (shallow merge,
  matching the pattern of `setCareReserve`).
- Include in initial state and `hydratePlannerState` / `extractPersistedPlannerState`.

### IHT-1.3 — Step 3 UI card

File: `src/components/steps/Step3IncomeSources.tsx`

Add a **Primary Residence** card in the Assets section, rendered below the existing
"Rental Property" card. Fields:

| Field | Control | Notes |
|---|---|---|
| Enabled | Toggle | Default off |
| Current market value | `CurrencyInput` | Max £5m, step £5k |
| Outstanding mortgage | `CurrencyInput` | Reduces net estate |
| Passes to direct descendants? | Checkbox | Required for RNRB |

When disabled the card shows a collapsed summary (same pattern as other asset cards).
No rental income or CGT fields — those belong in the BTL property card.

**Acceptance criteria:**
- [ ] `PrimaryResidenceAsset` interface added to `types.ts`
- [ ] `primaryResidence` in `PlannerState`; serialised/deserialised correctly
- [ ] `setPrimaryResidence` action available in store
- [ ] Primary Residence card renders in Step 3 and persists changes
- [ ] Existing BTL property card and projection engine unaffected

---

## Phase IHT-2 — Feature Flag

**Goal:** Gate all advanced IHT UI behind `NEXT_PUBLIC_IHT_ADVANCED_ENABLED`.

**Depends on:** Phase IHT-1 complete.

### IHT-2.1 — Add flag to `.env.example`

```bash
# IHT Advanced Planning Panel
# Gates the IHT Outlook panel in Step 4 (estate projection, 2027 pension delta,
# gifting capacity). Intended as a premium / paywall feature.
# Set to true to enable for all users, or check user subscription tier at render time.
NEXT_PUBLIC_IHT_ADVANCED_ENABLED=false
```

**Acceptance criteria:**
- [ ] Flag present in `.env.example` with comment explaining paywall intent
- [ ] Pattern consistent with `NEXT_PUBLIC_OPTIMIZER_ENABLED`

---

## Phase IHT-3 — IHT Constants + Calculation Engine

**Goal:** Pure, deterministic IHT projection function. No LLM, no network.

**Depends on:** Phase IHT-1, Phase IHT-2.

### IHT-3.1 — IHT constants

File: `src/config/financialConstants.ts`

```typescript
// ─── Inheritance Tax ──────────────────────────────────────────────────────────
// All thresholds frozen until at least 5 April 2030 (Finance Act 2021, Autumn Budget 2024).
// Source: HMRC IHT rates and thresholds; IHTA 1984 ss. 7, 8A, 8D.

export const IHT = {
  /** Standard IHT rate on estate above nil-rate bands. IHTA 1984 s.7. */
  RATE: 0.40,
  /** Reduced rate when ≥10% of net estate left to charity. IHTA 1984 s.7A. */
  CHARITY_RATE: 0.36,
  /** Nil-Rate Band — frozen to April 2030. */
  NRB: 325_000,
  /** Residence Nil-Rate Band — frozen to April 2030. IHTA 1984 s.8D. */
  RNRB: 175_000,
  /**
   * Estate value above which RNRB tapers at £1 per £2 of excess.
   * RNRB is fully withdrawn at RNRB_TAPER_THRESHOLD + 2 × RNRB (£2,350,000 for a couple).
   * IHTA 1984 s.8D(5).
   */
  RNRB_TAPER_THRESHOLD: 2_000_000,
  /**
   * Tax year from which unspent DC pension pots are included in the IHT estate.
   * Finance Act 2025 (prospective); effective 6 April 2027.
   */
  PENSION_ESTATE_INCLUSION_YEAR: 2027,
  /** Annual gift exemption per person. IHTA 1984 s.19. */
  ANNUAL_GIFT_EXEMPTION: 3_000,
  /** Small gifts exemption per recipient per year. IHTA 1984 s.20. */
  SMALL_GIFT_EXEMPTION: 250,
  /** Minimum charity fraction of net estate to qualify for reduced IHT rate. */
  CHARITY_THRESHOLD_FRACTION: 0.10,
} as const;
```

### IHT-3.2 — `ihtProjection.ts` engine

File: `src/financialEngine/ihtProjection.ts`

**Exported types:**

```typescript
export interface IHTProjectionInputs {
  /** Calendar year of projected death (used for pension inclusion threshold). */
  deathYear: number;
  /** Net value of primary residence (currentValue − mortgageOutstanding). */
  primaryResidenceNetValue: number;
  /** True if residence passes to direct descendants (RNRB eligibility). */
  residenceLeavesToDescendants: boolean;
  /** Combined ISA balance at death. */
  isaValue: number;
  /** Combined GIA balance at death. */
  giaValue: number;
  /** Combined cash savings at death. */
  cashValue: number;
  /** Combined DC pension pot at death (included in estate from 2027). */
  dcPensionValue: number;
  /** BTL/investment property net value at death (if applicable). */
  investmentPropertyValue: number;
  /** Fraction of first spouse's NRB unused at their death (0–1). */
  unusedNrbFraction: number;
  /** True for couple mode — enables transferable NRB. */
  isCouple: boolean;
  /** True if ≥10% of net estate is earmarked for charity. */
  charitableEstate: boolean;
  /** Annual net income during projection years (for s.21 gift capacity). */
  annualIncome: number;
  /** Annual spending during projection years. */
  annualSpending: number;
}

export interface IHTProjectionResult {
  /** Total gross estate value (all assets including pension from 2027). */
  grossEstate: number;
  /** DC pension contribution to estate (0 before 2027). */
  pensionInEstate: number;
  /** Effective NRB available (including transferable NRB if couple). */
  nrbAvailable: number;
  /** Effective RNRB after taper. */
  rnrbAvailable: number;
  /** Net chargeable estate (grossEstate − nrbAvailable − rnrbAvailable). */
  chargeableEstate: number;
  /** IHT payable in pounds. */
  ihtDue: number;
  /** IHT rate applied (0.36 if charitable, else 0.40). */
  ihtRate: number;
  /** IHT that would apply if pension were excluded (pre-2027 comparison). */
  ihtDueExcludingPension: number;
  /** Extra IHT caused by pension inclusion. */
  pensionIHTDelta: number;
  /** True if estate is above RNRB taper threshold. */
  rnrbTaperWarning: boolean;
  /** Annual surplus income available for s.21 normal-expenditure gifts. */
  annualGiftingCapacity: number;
  /** Cumulative IHT saving over remainingYears from annual gifting. */
  cumulativeGiftingIHTSaving: number;
  /** Years used for cumulative gifting projection. */
  remainingYears: number;
}
```

**Implementation rules:**
- RNRB taper: `max(0, RNRB − (max(0, grossEstate − RNRB_TAPER_THRESHOLD) / 2))`
- Transferable NRB: `NRB × (1 + unusedNrbFraction)` when `isCouple`
- Pension in estate: `dcPensionValue` when `deathYear >= PENSION_ESTATE_INCLUSION_YEAR`, else `0`
- IHT rate: `charitableEstate && chargeableEstate * CHARITY_THRESHOLD_FRACTION ≤ charityAmount` → `0.36`, else `0.40`
- Annual gifting capacity: `max(0, annualIncome − annualSpending)` — surplus income eligible for IHTA 1984 s.21 exemption
- Cumulative saving: `annualGiftingCapacity × remainingYears × IHT.RATE`

### IHT-3.3 — Unit tests

File: `tests/unit/ihtProjection.test.ts`

Test cases:

| Case | Key assertion |
|---|---|
| Estate below NRB — single | `ihtDue === 0` |
| Estate below combined NRB+RNRB — couple | `ihtDue === 0` |
| Basic couple: £1.6m estate, full RNRB | `ihtDue === 240_000` |
| Estate £2.05m — RNRB partially tapered | RNRB < 175k; IHT increases vs untapered |
| Estate £2.35m — RNRB fully tapered to zero | `rnrbAvailable === 0` |
| Pension excluded before 2027 | `pensionInEstate === 0`; `pensionIHTDelta === 0` |
| Pension included from 2027 | `pensionInEstate === dcPensionValue`; `pensionIHTDelta > 0` |
| Charitable legacy 10% | `ihtRate === 0.36` |
| Below 10% charity threshold | `ihtRate === 0.40` |
| Annual gifting capacity | `annualGiftingCapacity === income − spending` |

**Acceptance criteria:**
- [ ] `IHT` constants block in `financialConstants.ts`
- [ ] `calculateIHTProjection` exported from `ihtProjection.ts`
- [ ] All unit test cases passing
- [ ] Pure function — no imports from `src/app`, `src/hooks`, or any API layer

---

## Phase IHT-4 — IHT Outlook Panel in Step 4

**Goal:** Surface projected IHT liability and actionable mitigation signals in the
Step 4 dashboard, gated behind `NEXT_PUBLIC_IHT_ADVANCED_ENABLED`.

**Depends on:** Phase IHT-3, Phase IHT-1 UI (Step 3 card).

### IHT-4.1 — `IHTOutlookPanel.tsx` component

File: `src/components/IHTOutlookPanel.tsx`

Sections:

1. **Estate Breakdown** — horizontal stacked summary showing:
   - Primary home (net of mortgage)
   - ISA + GIA + cash
   - DC pension (labelled "included in estate from April 2027" with a flag)
   - BTL property (if applicable)
   - Total gross estate

2. **IHT Projection** — table or card showing:
   - NRB + RNRB available
   - Chargeable estate
   - IHT due
   - RNRB taper warning badge if `grossEstate > £1.8m` (amber warning before the £2m cliff)

3. **April 2027 Impact** — delta card:
   - "Without pension in estate: £X"
   - "With pension in estate (from 2027): £Y"
   - "Additional IHT from pension: £Z"

4. **Gifting Capacity** — if `annualGiftingCapacity > 0`:
   - "You have an estimated £X/yr surplus income available for IHT-exempt gifts"
   - "Over 10 years this could save £Y in IHT (IHTA 1984 s.21)"

**Render gate:**

```typescript
const ihtAdvancedEnabled = process.env.NEXT_PUBLIC_IHT_ADVANCED_ENABLED === 'true';
// ...
{ihtAdvancedEnabled && <IHTOutlookPanel ... />}
```

### IHT-4.2 — Wire into `Step4Dashboard.tsx`

- Extract final-year DC, ISA, GIA, cash values from the existing projection results.
- Pass `primaryResidence` from store.
- Compute `deathYear` from `person1.dateOfBirth` + life expectancy assumption.
- Render `IHTOutlookPanel` after the main asset depletion chart, before the care reserve section.

**Acceptance criteria:**
- [ ] Panel hidden when `NEXT_PUBLIC_IHT_ADVANCED_ENABLED=false`
- [ ] Panel visible and correct when flag is `true`
- [ ] Estate breakdown figures match projection engine final-year values
- [ ] RNRB taper warning appears for estates > £1.8m
- [ ] Pension delta card shows correct before/after 2027 figures
- [ ] Gifting capacity section only shown when surplus > 0
- [ ] No change to existing Step 4 content when flag is off

---

## Data Flow

```
PlannerState.primaryResidence
PlannerState.person1 / person2 (DC pots, ISA, GIA, cash)
        │
        ▼
projectionEngine.ts  ──► final-year asset balances
        │
        ▼
ihtProjection.ts  ──► IHTProjectionResult
        │
        ▼
IHTOutlookPanel.tsx  (only when NEXT_PUBLIC_IHT_ADVANCED_ENABLED=true)
```

---

## Out of Scope (Future)

These were identified as planning scenarios but are deferred:

| Scenario | Notes |
|---|---|
| IHT-aware DC drawdown optimizer candidate | New optimizer strategy drawing to basic-rate ceiling annually; requires optimizer Phase 11 first |
| Structured annual gifts modelling (£3k/£250 exemptions) | Year-by-year gifting plan; future enhancement to IHTOutlookPanel |
| Charitable legacy 10% optimisation | Show break-even analysis; requires charity intent capture in Step 1 |
| Spousal NRB pass-through optimisation | Cross-death asset rebalancing advice; complex two-death modelling |
| Whole-of-life insurance trade-off | Out of scope for v1 |
| Pension vs ISA accumulation post-2027 | Requires accumulation phase modelling |
