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
| `PrimaryResidenceAsset` type | ✅ Live | `src/models/types.ts` |
| Primary residence in `PlannerState` | ✅ Live | `primaryResidence` field; normalised on hydration |
| Primary residence UI (Step 3) | ✅ Live | Primary Residence card in Step 3 assets tab |
| IHT constants in `financialConstants.ts` | ❌ Not yet | — |
| `src/financialEngine/ihtProjection.ts` | ❌ Not yet | — |
| `IHTOutlookPanel.tsx` in Step 4 | ❌ Not yet | — |
| `NEXT_PUBLIC_IHT_ADVANCED_ENABLED` flag | ✅ Removed | Superseded by `NEXT_PUBLIC_PRO_ENABLED` (Phase 15) |
| `NEXT_PUBLIC_PRO_ENABLED` gate + IHT teaser | ✅ Live | Pro upgrade overlay + blurred IHT teaser in Step 4 |

---

## Feature Flag Strategy

**Phase IHT-1** (primary residence data model) is always on — it is plain data capture
with no advanced tax logic and no paywall implication.

**Phases IHT-2 through IHT-4** (constants, engine, UI panel) are gated by `NEXT_PUBLIC_PRO_ENABLED`,
the single Pro-tier feature flag introduced in Phase 15 (see `docs/ai-optimizer-implementation-plan.md`).

`NEXT_PUBLIC_IHT_ADVANCED_ENABLED` was removed in Phase 15 — it was never deployed and
IHT features gate on `NEXT_PUBLIC_PRO_ENABLED` instead.

The Pro gate behaviour for IHT (implemented in Phase 15, `src/components/steps/Step4Dashboard.tsx`):

| `proEnabled` | IHT constants / engine shipped | Rendered output |
|---|---|---|
| `false` | n/a | Blurred IHT estate teaser with `ProUpgradeOverlay` + interest-capture CTA |
| `true` | ❌ (IHT-3/4 not yet built) | "Coming soon" notice within the Pro panel |
| `true` | ✅ (after IHT-3/4 land) | Full `IHTOutlookPanel` with live projection |

The engine and constants are always compiled; only rendering is gated. This allows IHT-3/4
to land behind the flag without a separate infrastructure change.

---

## Phase Checklist

- [x] Phase IHT-1 — Primary Residence Data Model
- [x] Phase IHT-2 — Feature Flag (superseded by `NEXT_PUBLIC_PRO_ENABLED`; Pro gate live in Phase 15)
- [x] Phase IHT-3 — IHT Constants + Calculation Engine
- [x] Phase IHT-4 — IHT Outlook Panel in Step 4
- [ ] Phase IHT-5 — Gifting Optimiser

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

**Status: ✅ Implemented (via Phase 15).**

**Goal:** Gate all advanced IHT UI behind the Pro feature flag so it is only visible
to Pro subscribers.

**Depends on:** Phase IHT-1 complete.

### What changed from the original plan

The original plan proposed a dedicated `NEXT_PUBLIC_IHT_ADVANCED_ENABLED` environment
variable. Phase 15 superseded this: all advanced features (AI explainer, goal priorities,
IHT estate planning) are now gated by the single `NEXT_PUBLIC_PRO_ENABLED` flag.
`NEXT_PUBLIC_IHT_ADVANCED_ENABLED` was never deployed and has been removed from the
codebase and CI/CD pipeline.

### IHT-2.1 — Pro flag in `.env.example`

Already present as part of Phase 15:

```bash
# LaterLifePlan Pro tier
# Gates the AI explainer, goal-priority orchestration, and IHT estate planning panel.
# Set to true to enable for Pro subscribers (or for all users during testing).
NEXT_PUBLIC_PRO_ENABLED=false
```

### IHT-2.2 — IHT teaser when Pro is off

When `NEXT_PUBLIC_PRO_ENABLED=false` (already live in `Step4Dashboard.tsx`):
- A blurred IHT estate breakdown panel is shown using real plan data (residence, savings, pensions).
- The panel is wrapped in `ProUpgradeOverlay`.
- No exact £ figures appear in the overlay copy.
- CTA opens `ProInterestModal` with `sourcePanel="iht-planning"`.

### IHT-2.3 — Coming soon when Pro is on (before IHT-3/4 land)

When `NEXT_PUBLIC_PRO_ENABLED=true` but IHT-3/4 are not yet built:
- A "Coming soon" notice is shown within the Pro IHT panel.
- This will be replaced by `IHTOutlookPanel` once IHT-3 and IHT-4 are complete.

**Acceptance criteria:**
- [x] `NEXT_PUBLIC_PRO_ENABLED=false` shows blurred IHT teaser with interest-capture CTA
- [x] `NEXT_PUBLIC_IHT_ADVANCED_ENABLED` removed from codebase, `.env.example`, and CI
- [x] `NEXT_PUBLIC_PRO_ENABLED` present in `.env.example` with explanatory comment

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
- [x] `IHT` constants block in `financialConstants.ts`
- [x] `calculateIHTProjection` exported from `ihtProjection.ts`
- [x] All unit test cases passing
- [x] Pure function — no imports from `src/app`, `src/hooks`, or any API layer

---

## Phase IHT-4 — IHT Outlook Panel in Step 4

**Goal:** Surface projected IHT liability and actionable mitigation signals in the
Step 4 dashboard, gated behind `NEXT_PUBLIC_PRO_ENABLED`.

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
const proEnabled = process.env.NEXT_PUBLIC_PRO_ENABLED === 'true';
// ...
{proEnabled && <IHTOutlookPanel ... />}
```

### IHT-4.2 — Wire into `Step4Dashboard.tsx`

- Extract final-year DC, ISA, GIA, cash values from the existing projection results.
- Pass `primaryResidence` from store.
- Compute `deathYear` from `person1.dateOfBirth` + life expectancy assumption.
- Render `IHTOutlookPanel` after the main asset depletion chart, before the care reserve section.

**Acceptance criteria:**
- [x] Panel hidden when `NEXT_PUBLIC_PRO_ENABLED=false` (teaser shown via Phase 15 overlay)
- [x] Panel visible and correct when `NEXT_PUBLIC_PRO_ENABLED=true`
- [x] Estate breakdown figures match projection engine final-year values
- [x] RNRB taper warning appears for estates > £1.8m
- [x] Pension delta card shows correct before/after 2027 figures
- [x] Gifting capacity section only shown when surplus > 0
- [x] No change to existing Step 4 content when Pro is off

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
IHTOutlookPanel.tsx  (only when NEXT_PUBLIC_PRO_ENABLED=true)
```

---

## Out of Scope (Future)

These were identified as planning scenarios but are deferred:

| Scenario | Notes |
|---|---|
| IHT-aware DC drawdown optimizer candidate | New optimizer strategy drawing to basic-rate ceiling annually; requires optimizer Phase 11 first |
| Charitable legacy 10% optimisation | Show break-even analysis; requires charity intent capture in Step 1 |
| Spousal NRB pass-through optimisation | Cross-death asset rebalancing advice; complex two-death modelling |
| Whole-of-life insurance trade-off | Out of scope for v1 |
| Pension vs ISA accumulation post-2027 | Requires accumulation phase modelling |

---

## Phase IHT-5 — Gifting Optimiser

**Goal:** Model and optimise an annual gifting strategy that minimises _total_ tax
(income tax on withdrawals + IHT on estate), not just IHT in isolation.  Simply
withdrawing from a DC pension and gifting only reduces tax if the income tax cost is
less than the IHT saving — and this calculus changes significantly when the estate sits
in the RNRB taper zone (£2m–£2.35m single / £2.7m couple) where the effective marginal
IHT rate is **60%** rather than 40%.

**Depends on:** Phase IHT-3, Phase IHT-4 complete.

**Gated by:** `NEXT_PUBLIC_PRO_ENABLED` (same as IHT-4).

---

### Financial background

#### RNRB taper and effective marginal IHT rate

The RNRB tapers at £1 per £2 of estate above £2,000,000 (IHTA 1984 s.8D(5)).
Each £2 gifted from an estate above £2m recovers £1 of RNRB, saving a further
£0.40 in IHT (at 40% rate). Combined with the direct 40% IHT saving per £1 gifted,
the effective marginal rate while in the taper zone is **60%**.

| Estate position | Effective marginal IHT rate on next £1 gifted |
|---|---|
| Estate ≤ NRB+RNRB (no IHT) | 0% |
| Estate > NRB+RNRB, ≤ £2m (standard zone) | 40% |
| Estate > £2m, RNRB not yet fully tapered | **60%** (40% IHT + 20% RNRB recovery) |
| Estate > taper ceiling (RNRB fully lost) | 40% |

**Taper ceiling:**
- Single: £2,000,000 + 2 × £175,000 = **£2,350,000**
- Couple: £2,000,000 + 2 × £350,000 = **£2,700,000** (using both RNRB allowances)

#### Gift types modelled

| Exemption | Annual limit | 7-year rule? | Notes |
|---|---|---|---|
| Normal expenditure out of income (s.21) | Unlimited (must be from surplus income after normal living) | ❌ Exempt immediately | Requires pattern of regular giving |
| Annual exempt gift (s.19) | £3,000 per donor per year (carry forward unused to next year; max £6,000) | ❌ Exempt immediately | Each spouse/partner can use own allowance |
| Potentially Exempt Transfers (PETs) | Unlimited | ✅ Fully exempt after 7 years | Taper relief 3–7 years; full IHT if < 3 years |

For modelling the DC draw-and-gift analysis, PETs are the primary vehicle for
larger gifts. The model uses the plan's remaining years to determine the number of
full 7-year PET windows available.

#### Break-even logic

A DC draw-and-gift is beneficial when:

```
income_tax_on_withdrawal < effective_marginal_IHT_rate × gift_amount
```

Equivalently:

```
marginal_income_tax_rate < effective_marginal_IHT_rate
```

| Marginal income tax rate | Estate ≤ £2m (40% IHT) | Estate in taper zone (60% effective IHT) |
|---|---|---|
| 20% basic rate | ✅ Net benefit: 20p/£ | ✅ Net benefit: 40p/£ |
| 40% higher rate | ❌ No net benefit | ✅ Net benefit: 20p/£ |
| 45% additional rate | ❌ No net benefit | ❌ No net benefit |
| ~60% (PA taper zone) | ❌ No net benefit | ❌ No net benefit |

---

### IHT-5.1 — `giftingOptimiser.ts` engine

File: `src/financialEngine/giftingOptimiser.ts`

Pure function; no network, no side effects.

**Inputs:**

```typescript
export interface GiftingOptimiserInputs {
  /** Total gross estate from IHT projection. */
  grossEstate: number;
  /** Current IHT liability. */
  ihtDue: number;
  /** RNRB after taper (may be less than full RNRB if estate > £2m). */
  rnrbAvailable: number;
  /** True if couple (affects RNRB cap and annual gift allowance). */
  isCouple: boolean;
  /** Combined DC pension value — source of additional gifting via drawdown. */
  dcPensionValue: number;
  /** Annual surplus income after normal living expenditure (s.21 capacity). */
  annualSurplusIncome: number;
  /** Annual income used to determine marginal income tax band on extra DC withdrawals. */
  annualIncome: number;
  /** Remaining years until projected death. */
  remainingYears: number;
}
```

**Outputs:**

```typescript
export interface GiftingOptimiserResult {
  // ── Tax rate context ──────────────────────────────────────────────────────
  /** Effective marginal IHT rate: 0.60 in RNRB taper zone, 0.40 otherwise. */
  effectiveMarginalIHTRate: number;
  /** Estimated marginal income tax rate on additional DC withdrawals. */
  marginalIncomeTaxRate: number;
  /** True if draw-and-gift reduces total tax (income tax < effective IHT rate). */
  isDrawAndGiftWorthwhile: boolean;

  // ── RNRB taper recovery ────────────────────────────────────────────────────
  /** True if estate is above the £2m RNRB taper threshold. */
  isInTaperZone: boolean;
  /** Maximum additional IHT saving from recovering full RNRB (£0 if not in taper zone). */
  rnrbRecoveryOpportunity: number;
  /** Total gifting required to bring estate to £2m taper floor (0 if already below). */
  giftingNeededForRNRBRecovery: number;

  // ── Annual gifting breakdown ───────────────────────────────────────────────
  /** s.21 — from surplus income (immediately IHT-exempt, no 7-year rule). */
  annualExemptFromIncome: number;
  /** s.19 — annual exempt gift allowance (£3k/person, £6k couple). */
  annualExemptGiftAllowance: number;
  /**
   * DC to draw down (gross pre-tax) and gift as a PET.
   * Only non-zero when isDrawAndGiftWorthwhile is true and DC pot is available.
   * Capped to avoid exhausting DC pot before RNRB recovery target is met.
   */
  annualDCDrawdownGross: number;
  /** Income tax cost of annualDCDrawdownGross. */
  annualDCDrawdownIncomeTaxCost: number;
  /** Net gift amount from DC drawdown (after income tax). */
  annualDCDrawdownGiftNet: number;
  /** Total gift amount per year across all strategies. */
  annualTotalGift: number;

  // ── Annual net benefit ─────────────────────────────────────────────────────
  /** Direct IHT reduction from annual gifting (estate × effective marginal rate). */
  annualIHTSaving: number;
  /** Total income tax paid on DC drawdown this year. */
  annualIncomeTaxCost: number;
  /** Net annual benefit (IHT saving − income tax cost). Negative means not worthwhile. */
  annualNetBenefit: number;

  // ── Cumulative projection (over remainingYears) ────────────────────────────
  cumulativeIHTSaving: number;
  cumulativeIncomeTaxCost: number;
  cumulativeNetBenefit: number;

  // ── Recommendation ─────────────────────────────────────────────────────────
  /**
   * - `no-action`: IHT due is zero; no gifting needed.
   * - `income-gifts-only`: gifting surplus income worthwhile; DC draw-and-gift is not.
   * - `rnrb-recovery-priority`: estate in taper zone; prioritise gifting to £2m first.
   * - `draw-and-gift`: draw from DC and gift is tax-efficient.
   */
  recommendationTier: 'no-action' | 'income-gifts-only' | 'draw-and-gift' | 'rnrb-recovery-priority';
}
```

**Marginal income tax rate estimation** (derived from `annualIncome`):

Use a step function against the current tax year's bands from `getSnapshotForYear`:

| Income range | Marginal rate |
|---|---|
| ≤ personal allowance | 0% |
| Personal allowance → basic rate limit (£50,270) | 20% |
| £50,270 → £100,000 | 40% |
| £100,000 → £125,140 (PA taper zone) | ~60% (effective) |
| > £125,140 | 45% |

**Key calculation rules:**

1. **Effective marginal IHT rate:**
   - Max RNRB (pre-taper) = `isCouple ? IHT.RNRB * 2 : IHT.RNRB`
   - If `grossEstate > IHT.RNRB_TAPER_THRESHOLD && rnrbAvailable < maxRNRB` → `0.60`
   - Otherwise → `IHT.RATE` (0.40)

2. **RNRB recovery opportunity:**
   - `giftingNeededForRNRBRecovery = max(0, grossEstate − IHT.RNRB_TAPER_THRESHOLD)`
   - `rnrbRecoveryOpportunity = (maxRNRB − rnrbAvailable) * IHT.RATE`

3. **Annual DC drawdown gift** (only if `isDrawAndGiftWorthwhile`):
   - Target: gift enough each year so that over `remainingYears` the estate reaches £2m
     (or exhausts the DC pot if pot is insufficient)
   - Annual target gross = `min(giftingNeededForRNRBRecovery / remainingYears, dcPensionValue / remainingYears)`
   - Income tax cost = `annualDCDrawdownGross * marginalIncomeTaxRate`
   - Net gift = `annualDCDrawdownGross * (1 − marginalIncomeTaxRate)`

4. **Annual IHT saving:**
   - `(annualExemptFromIncome + annualExemptGiftAllowance) * IHT.RATE`
   - Plus: `annualDCDrawdownGiftNet * effectiveMarginalIHTRate`
   - Capped at `ihtDue` (cannot save more than the liability)

5. **Recommendation tier logic:**
   - `ihtDue === 0` → `'no-action'`
   - `ihtDue > 0 && isInTaperZone && isDrawAndGiftWorthwhile` → `'rnrb-recovery-priority'`
   - `ihtDue > 0 && !isInTaperZone && isDrawAndGiftWorthwhile` → `'draw-and-gift'`
   - `ihtDue > 0 && !isDrawAndGiftWorthwhile && annualSurplusIncome > 0` → `'income-gifts-only'`
   - `ihtDue > 0 && !isDrawAndGiftWorthwhile && annualSurplusIncome === 0` → `'no-action'`

---

### IHT-5.2 — Unit tests

File: `tests/unit/giftingOptimiser.test.ts`

| Test case | Key assertion |
|---|---|
| No IHT due | `recommendationTier === 'no-action'`; all saving values are 0 |
| Basic rate taxpayer, estate £1.5m (standard zone) | `effectiveMarginalIHTRate === 0.40`; `isDrawAndGiftWorthwhile === true` |
| Higher rate taxpayer, estate £1.5m (standard zone) | `isDrawAndGiftWorthwhile === false`; `recommendationTier !== 'draw-and-gift'` |
| Estate £2.2m (taper zone), basic rate | `effectiveMarginalIHTRate === 0.60`; `isInTaperZone === true`; `recommendationTier === 'rnrb-recovery-priority'` |
| Estate £2.2m (taper zone), higher rate | `effectiveMarginalIHTRate === 0.60`; `isDrawAndGiftWorthwhile === true` (40% < 60%) |
| Estate £2.2m (taper zone), additional rate | `effectiveMarginalIHTRate === 0.60`; `isDrawAndGiftWorthwhile === false` (45% < 60% → actually true); check correctly |
| RNRB recovery opportunity calculation | `rnrbRecoveryOpportunity === (maxRNRB − rnrbAvailable) * 0.40` |
| Annual net benefit = IHT saving − income tax | `annualNetBenefit === annualIHTSaving − annualIncomeTaxCost` |
| Cumulative projection over N years | `cumulativeNetBenefit === annualNetBenefit * N` |
| No DC pot available | `annualDCDrawdownGross === 0`; no draw-and-gift recommendation without DC |
| Couple vs single annual gift allowance | Couple: `annualExemptGiftAllowance === 6_000`; Single: `3_000` |

---

### IHT-5.3 — `IHTOutlookPanel.tsx` enhanced gifting section

Replace the current simple "Gifting Capacity" section (Section 4) with a comprehensive
optimiser-backed display.

**When `recommendationTier === 'no-action'`:**
- Don't render the gifting section (no IHT to mitigate).

**When `recommendationTier === 'income-gifts-only'`:**
- Show the existing simple s.21 card (surplus income → IHT exempt gifts).
- Add s.19 annual exempt gift amounts.
- Explain why DC draw-and-gift is not beneficial at the current income level.

**When `recommendationTier === 'draw-and-gift'` or `'rnrb-recovery-priority'`:**
- Show a multi-tier optimiser card with:
  - Effective marginal IHT rate badge (amber badge "60% effective" if in taper zone)
  - If RNRB recovery: callout explaining the £2m taper threshold and opportunity
  - Annual gifting breakdown table:
    - From surplus income (s.21): `annualExemptFromIncome`
    - Annual exempt allowance (s.19): `annualExemptGiftAllowance`
    - DC drawdown & gift (PET): `annualDCDrawdownGiftNet` (net of income tax)
    - **Total annual gift:** `annualTotalGift`
  - Net benefit analysis card:
    - "IHT saving: £X/yr"
    - "Income tax cost: −£Y/yr"
    - **"Net benefit: +£Z/yr"** (green when positive)
  - Cumulative saving over remaining years

**Acceptance criteria:**

- [ ] `calculateGiftingOptimisation` exported from `giftingOptimiser.ts`
- [ ] All unit test cases passing
- [ ] Pure function — no imports from `src/app`, `src/hooks`, or any API layer
- [ ] `IHTOutlookPanel` gifting section replaced with optimiser-backed display
- [ ] RNRB taper zone correctly triggers 60% effective rate and `rnrb-recovery-priority` tier
- [ ] Draw-and-gift correctly absent for higher-rate taxpayers in standard IHT zone
- [ ] Draw-and-gift correctly present for higher-rate taxpayers in taper zone (40% < 60%)
- [ ] Annual gift allowance doubles for couples vs singles
- [ ] Cumulative projection matches `annualNetBenefit × remainingYears`
- [ ] No visible change when `ihtDue === 0`

---

## Phase IHT-6 — RNRB Taper Clawback Scenario Analysis

### Background

For high-value estates (gross estate > £2m), the RNRB is tapered at £1 per £2 of excess.
A couple's full transferable RNRB (2 × £175k = £350k) is worth £140k of IHT saving. When
the estate is in the taper zone, the effective marginal IHT rate is **60p per £1 gifted**
(40p direct IHT saving + 20p from RNRB recovery) rather than the standard 40p.

From April 2027, unspent DC pots enter the estate (Finance Act 2025). For pension-heavy
couples with gross estates of £5m–£10m, the DC contribution can be £1m–£2m, making
proactive pre-retirement actions highly effective.

### Three Directional Scenarios

The following scenarios model the IHT impact of pension actions taken **before or at
the start of the retirement phase** (FI age), based on a representative couple:

- **Person 1 (P1)**: age 56, FI at 60, DC pot ~£1.44m at retirement → PCLS = £268,275 (capped at LSA)
- **Person 2 (P2)**: age 57, DC pot ~£360k at retirement → PCLS = £90k
- **Gross estate at death**: ~£9m (fully in RNRB taper zone, RNRB = £0)
- **Baseline IHT**: ~£3.34m (at 40% on £9m − £650k NRB)
- **Years in retirement**: 36

#### Scenario B1 — P1 PCLS only

| Item | Value |
|---|---|
| Tax-free PCLS (P1 crystallises at FI) | £268,275 |
| Annual drawdown | £0 |
| Total estate reduction | £268,275 |
| IHT saving (at 40%) | ~£107k |
| Income tax cost | £0 |
| **Net benefit** | **~£107k** |

_Lower risk. P1 simply takes 25% tax-free cash at FI and gifts it as a PET. No income tax
cost. Modest IHT saving unless it crosses the £2m taper threshold._

#### Scenario B2 — Both PCLS + Ongoing Drawdown

| Item | Value |
|---|---|
| Tax-free PCLS (P1 + P2 combined) | ~£358k |
| Annual DC drawdown (gross) | £50,000/yr |
| Annual income tax at 20% | £10,000/yr |
| Annual net gift (PET) | £40,000/yr |
| Total estate reduction (36 yrs) | £358k + £1.8m = ~£2.16m |
| IHT saving | ~£864k |
| Income tax cost | £360k |
| **Net benefit** | **~£504k** |

_Higher complexity but much larger saving. The ongoing drawdown systematically reduces the
DC pot (and thus the estate from 2027) while gifting net proceeds. Likely brings the estate
below £2m taper threshold, recovering the full transferable RNRB (additional ~£140k IHT
saving)._

#### Scenario C2 — Drawdown Only (No Lump Sums)

| Item | Value |
|---|---|
| Tax-free PCLS | £0 |
| Annual DC drawdown (basic-rate band capacity: £37,700) | £37,700/yr |
| Annual income tax at 20% | £7,540/yr |
| Annual net gift (PET) | £30,160/yr |
| Total estate reduction (36 yrs) | ~£1.36m |
| IHT saving | ~£542k |
| Income tax cost | £271k |
| **Net benefit** | **~£271k** |

_No upfront action required — purely disciplined post-FI drawdown at the basic-rate ceiling.
Simpler to explain and execute. Meaningful saving but less than B2 due to smaller drawdown
and no PCLS._

### Trade-Off Summary

| Scenario | Income Tax Cost | IHT Saving | Net Benefit | RNRB Threshold |
|---|---|---|---|---|
| Baseline | £0 | £0 | £0 | Fully tapered |
| B1 | £0 | ~£107k | ~£107k | Likely still above |
| C2 | ~£271k | ~£542k | ~£271k | May be crossed |
| B2 | ~£360k | ~£864k | ~£504k | Likely crossed (★) |

(★) When the estate crosses the £2m RNRB taper threshold, the full transferable RNRB
(£350k for couples) is recovered, saving an additional £140k in IHT.

### Key Tax Considerations

- **PCLS is tax-free**: The 25% pension commencement lump sum has no income tax cost.
  It does count towards the Lifetime Lump Sum Allowance (LSA = £268,275 per person).
- **DC drawdown is income**: Basic-rate drawdown (20%) is cost-effective because the IHT
  saving exceeds the income tax cost, especially in the 60% effective rate zone.
- **7-year PET rule**: Gifts clear the estate after 7 years. With 36 years of retirement,
  all PETs from FI onwards are clear by death.
- **Post-freeze escalation**: From 2031, NRB, RNRB, and the £2m taper threshold all
  escalate at 2.5% CPI per year (Voyant convention). This means later years can draw
  more DC before hitting the 45% higher-rate band.
- **45% rate caution**: If gross income (including DC drawdown) exceeds £125,140, the
  personal allowance is tapered, and marginal rate hits 60%. Keep annual drawdown below
  this ceiling to preserve basic-rate efficiency.

### Implementation (IHT-6)

**`calculateRNRBScenarios()` in `src/financialEngine/giftingOptimiser.ts`:**
- Pure function — takes baseline IHT result + DC balances at retirement start
- Returns B1, B2, C2 scenario results with full breakdown
- Uses simplified delta model (not a full projection re-run) — results are directional

**`IHTOutlookPanel.tsx` Section 5:**
- Shown when `ihtDue > 0`
- Three toggle buttons (B1 / B2 / C2); click to expand detail card
- Star badge on scenarios that breach the £2m RNRB taper threshold
- Shows: PCLS, drawdown, income tax cost, estate reduction, new IHT, net benefit

**Unit tests:** `tests/unit/giftingOptimiser.test.ts` — 14 new tests covering:
- PCLS LSA cap enforcement
- Income tax = BASIC_RATE × drawdown × years
- Net benefit = IHT saving − income tax cost
- `breachesRNRBTaperThreshold` logic (freeze-period and post-freeze)
- Single vs couple P2 PCLS inclusion
- Custom drawdown overrides

### Acceptance Criteria

- [ ] `calculateRNRBScenarios` exported from `giftingOptimiser.ts`
- [ ] All unit tests pass (38 total in `giftingOptimiser.test.ts`)
- [ ] Section 5 only shown when `ihtDue > 0`
- [ ] All three scenarios always rendered; toggle hides/shows detail
- [ ] Star marker on scenarios that cross the £2m threshold
- [ ] RNRB recovery clearly called out when applicable
- [ ] Disclaimer: "directional estimate, does not re-run the full projection engine"
