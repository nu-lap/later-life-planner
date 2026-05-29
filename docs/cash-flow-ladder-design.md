# Cash Flow Ladder Design

## Context

LLP's existing engine models retirement as a single pool of pots (SIPP, ISA, GIA, Cash) drawn down via a tax-optimised 7-step waterfall. This is efficient for minimising tax but provides no protection against **sequence of returns risk (SORR)** — a market crash in early retirement can force equity sales at depressed prices, permanently damaging the plan.

The **cash flow ladder** (bucket strategy) addresses this by holding 1–3 years of spending in safe assets (cash/gilts), 3–7 years in medium-risk assets (bonds), and the rest in long-term equities. The safe buckets act as a buffer — if markets fall, you draw from cash and delay selling equities until recovery.

The complexity for LLP is that each user's pots (SIPP, ISA, GIA) can hold a mix of asset types (cash, bonds, equities), and these allocations span across all pots — not cleanly mapped to a single pot type. For couples this is doubly complex.

**Key design decisions:**
- Asset-type allocations are captured **within each pot** (not just by pot type)
- Bucket aggregation is **automatic** across all pots by asset type
- The existing 7-step tax waterfall is **preserved** — the ladder adds a dimension of *what to sell within a pot* on top of *which pot to draw from*
- Couples use a **unified household bucket** (not separate per-person ladders)

---

## Bucket Structure

| Bucket | Time horizon | Asset types | Target size |
|--------|-------------|-------------|-------------|
| 1 — Cash | 1–2 years | Cash, money market, ultra-short gilts | `annualSpending × cashBufferYears` |
| 2 — Bonds | 3–7 years | Fixed income, gilts, bond funds, 60/40 blends | `annualSpending × bondBufferYears` |
| 3 — Equities | 8+ years | Equity funds, global stocks | Everything else |

Default parameters: 2 cash years, 5 bond years. Both are user-configurable.

The protective mechanism: if equities fall significantly (e.g. 30% in year 2), draw from Bucket 1 cash reserve while markets recover. Delay refilling Bucket 1 from Bucket 2 until markets stabilise. Never forced to sell equities at depressed prices.

---

## Data Model

### New types (`src/models/types.ts`)

```typescript
// Allocation of a single pot across asset types (must sum to 100)
export interface PotAllocation {
  cashPercent: number;      // cash, money market, ultra-short gilts
  bondsPercent: number;     // fixed income, gilts, bond funds
  equitiesPercent: number;  // equity funds, global stocks
}

// Config block added to PlannerState
export interface BucketLadderConfig {
  enabled: boolean;
  cashBufferYears: number;     // target years of spending in Bucket 1 (default 2)
  bondBufferYears: number;     // target years of spending in Bucket 2 (default 5)
  // Per-bucket growth rate overrides (0 = use financialConstants defaults)
  cashGrowthRate: number;
  bondsGrowthRate: number;
  equitiesGrowthRate: number;
}
```

### Asset interface extensions

`DCPensionAsset`, `ISAAsset`, and `GIAAsset` each gain an optional `allocation?: PotAllocation` field.

`CashSavingsAsset` is implicitly `{ cash: 100, bonds: 0, equities: 0 }` — no field needed.

### Default bucket growth rates (`src/config/financialConstants.ts`)

```typescript
BUCKET_LADDER: {
  DEFAULT_CASH_GROWTH: 4.0,        // money market / cash ISA
  DEFAULT_BONDS_GROWTH: 4.5,       // 60/40 bond-equity blend
  DEFAULT_EQUITIES_GROWTH: 6.0,    // 100% global equity
  DEFAULT_CASH_BUFFER_YEARS: 2,
  DEFAULT_BOND_BUFFER_YEARS: 5,
  SORR_EQUITY_SHOCK_PERCENT: 30,   // stress test: equities fall 30% in year 2
}
```

---

## New Engine: `src/financialEngine/bucketLadderEngine.ts`

All functions are pure and stateless (same pattern as `taxCalculations.ts`).

### `calculateBucketValues(state: PlannerState): BucketValues`

Aggregates across all pots by asset type:
- Bucket 1 = Σ(pot.totalValue × pot.allocation.cashPercent / 100) + cashSavings (both persons)
- Bucket 2 = Σ(pot.totalValue × pot.allocation.bondsPercent / 100)
- Bucket 3 = Σ(pot.totalValue × pot.allocation.equitiesPercent / 100)

Covers: person1 assets, person2 assets, jointGia.

### `calculateBucketTargets(annualSpending: number, config: BucketLadderConfig): BucketTargets`

Returns target sizes for Buckets 1 and 2 based on configured buffer years.

### `calculateRefillSchedule(projections: YearProjection[], config: BucketLadderConfig): RefillEvent[]`

Walks the year-by-year projection tracking bucket balances. A refill fires when Bucket 1 drops below 6 months of spending. Refill source priority: Bucket 2 bonds first, then Bucket 3 equities.

Returns: `[{ year, age, fromBucket, toBucket, amount, source }]`

### `runSorrStressTest(state: PlannerState, shockYear: number, shockPercent: number): SorrComparison`

Runs two projection passes:
- **Pass A (standard waterfall)**: normal projection with full equity growth
- **Pass B (bucket ladder)**: equities drop `shockPercent`% in `shockYear`; ladder delays refill from equities by 2 years

Returns: `{ standardDepletionAge, ladderDepletionAge, yearsSaved, portfolioAtAge85Delta }`

---

## Projection Engine Changes (`src/financialEngine/projectionEngine.ts`)

The existing waterfall order is unchanged. Two additions:

**1. Bucket value tracking per year**

At the start of each year, call `calculateBucketValues` and attach bucket balances to `YearProjection` output. Feeds dashboard health cards and refill schedule.

**2. Blended per-pot growth rates**

When `bucketLadderEnabled`, compute a blended growth rate for each pot from its allocation and the bucket growth rates in `financialConstants`:

```
blendedRate = (cashPct × cashGrowthRate + bondsPct × bondsGrowthRate + equitiesPct × equitiesGrowthRate) / 100
```

This replaces the flat `growthRate` for that pot in the growth step (not in the waterfall draw step).

---

## UI: Pot Allocation Inputs (`src/components/steps/Step3AssetsIncome.tsx`)

For each enabled pot (SIPP, ISA, GIA per person; joint GIA), add a collapsible "Asset mix" section visible when `bucketLadderEnabled`.

```
SIPP  £280,000  [growth rate]
▾ Asset mix  (defaults to 100% equities if not set)
  Cash / money market    [  0] %
  Bonds / gilts          [ 20] %
  Equities               [ 80] %   ← auto-calculated remainder
```

- Three number inputs; the third auto-calculates to keep the sum at 100
- Inline validation: warn if edited values would exceed 100
- Persist via `setPotAllocation(person, assetKey, allocation)`
- All new inputs must have `data-testid` values registered in `src/lib/testIds.ts`

---

## UI: Bucket Ladder Panel (`src/components/BucketLadderPanel.tsx`)

Mounted in `Step4Dashboard.tsx`. Three sections:

### 1. Bucket health cards

| Card | Content |
|------|---------|
| Bucket 1 — Cash | £X current / £Y target; status pill: OK (≥100%) / Low (75–99%) / Critical (<75%) |
| Bucket 2 — Bonds | £X current / £Y target; status pill |
| Bucket 3 — Equities | £X current (no target; grows to fill) |

### 2. Refilling schedule

Year-by-year table from `calculateRefillSchedule`:

| Year | Age | Action | Amount | Source |
|------|-----|--------|--------|--------|
| 2028 | 63 | Refill cash from bonds | £30,000 | P1 ISA bonds |
| 2033 | 68 | Refill bonds from equities | £75,000 | SIPP equities |

### 3. SORR scenario comparison

Result from `runSorrStressTest` (30% equity shock in year 2):

| | Standard waterfall | Bucket ladder |
|---|---|---|
| Plan survives to | Age 87 | Age 96 |
| Portfolio at 85 | £42k | £180k |
| Forced equity sales in crash year | Yes | No |

Explainer: "Without a cash buffer, a 30% equity fall in early retirement forces you to sell investments at depressed prices. The bucket strategy draws from your 2-year cash reserve while markets recover."

---

## Store Changes (`src/store/plannerStore.ts`)

Initial state addition:

```typescript
bucketLadderConfig: {
  enabled: false,
  cashBufferYears: 2,
  bondBufferYears: 5,
  cashGrowthRate: 0,
  bondsGrowthRate: 0,
  equitiesGrowthRate: 0,
}
```

New actions:
- `setBucketLadderEnabled(enabled: boolean)`
- `setBucketLadderConfig(updates: Partial<BucketLadderConfig>)`
- `setPotAllocation(person: 'p1' | 'p2' | 'joint', assetKey: string, allocation: PotAllocation)`

---

## Implementation Checklist

### Phase 1 — Data model

- [ ] Add `PotAllocation` and `BucketLadderConfig` interfaces to `src/models/types.ts`
- [ ] Add optional `allocation?: PotAllocation` to `DCPensionAsset`, `ISAAsset`, `GIAAsset`
- [ ] Add `BUCKET_LADDER` defaults block to `src/config/financialConstants.ts`
- [ ] Add `bucketLadderConfig` to initial state in `src/store/plannerStore.ts`
- [ ] Add `setBucketLadderEnabled`, `setBucketLadderConfig`, `setPotAllocation` actions to store
- [ ] Add new `data-testid` keys to `src/lib/testIds.ts` for allocation inputs and bucket panel elements

### Phase 2 — Bucket engine

- [ ] Create `src/financialEngine/bucketLadderEngine.ts`
- [ ] Implement `calculateBucketValues` — aggregate pots by asset type across both persons + joint
- [ ] Implement `calculateBucketTargets` — target sizes from buffer years × annual spending
- [ ] Implement `calculateRefillSchedule` — walk projections, fire refill events on trigger condition
- [ ] Implement `runSorrStressTest` — dual projection pass with equity shock in specified year
- [ ] Create `tests/unit/bucketLadderEngine.test.ts` covering all four functions

### Phase 3 — Projection engine integration

- [ ] Attach bucket values to `YearProjection` output (call `calculateBucketValues` per year)
- [ ] Implement blended growth rate calculation when `bucketLadderEnabled`
- [ ] Add tests to `tests/unit/projectionEngine.test.ts` for blended rate and bucket tracking
- [ ] Run critical test gate: `npx vitest run tests/unit/projectionEngine.test.ts tests/unit/taxCalculations.test.ts`

### Phase 4 — UI: pot allocation inputs

- [ ] Add collapsible "Asset mix" section to each pot in `Step3AssetsIncome.tsx`
- [ ] Show only when `bucketLadderEnabled` (or add a "Set up bucket strategy" toggle)
- [ ] Auto-calculate equities% remainder as user edits cash% and bonds%
- [ ] Inline validation: sum must equal 100
- [ ] Wire to `setPotAllocation` store action
- [ ] Add UI tests in `tests/ui/` for allocation inputs

### Phase 5 — UI: bucket ladder dashboard panel

- [ ] Create `src/components/BucketLadderPanel.tsx` with three sections
- [ ] Bucket health cards (current vs target, status pills)
- [ ] Refilling schedule table (from `calculateRefillSchedule`)
- [ ] SORR comparison (from `runSorrStressTest`)
- [ ] Mount `BucketLadderPanel` in `src/components/steps/Step4Dashboard.tsx`
- [ ] Add UI tests for panel render and data binding

### Phase 6 — QA

- [ ] Full test suite green: `npm run test`
- [ ] Manual: enable bucket ladder, enter allocations, verify health cards and refill schedule
- [ ] Manual: run SORR comparison, confirm positive age-delta for ladder vs standard
- [ ] Edge cases: single person plan, all pots with default allocation (no `PotAllocation` set), 0% equities in all pots
- [ ] SonarCloud rules check: `htmlFor`/`id` pairs, no self-closing non-void JSX, no identical ternary branches
