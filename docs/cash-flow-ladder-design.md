# Cash Flow Ladder Design

## Context

LLP's existing engine models retirement as a single pool of pots (SIPP, ISA, GIA, Cash) drawn down via a tax-optimised 7-step waterfall. This is efficient for minimising tax but provides no protection against **sequence of returns risk (SORR)** — a market crash in early retirement can force equity sales at depressed prices, permanently damaging the plan.

The **cash flow ladder** (bucket strategy) addresses this by holding 1–3 years of spending in **Bucket 1 — Cash** (cash, money market, ultra-short gilts), 3–7 years in **Bucket 2 — Income & Stability** (bonds, gilts, precious metals, REITs, infrastructure, absolute-return funds), and the rest in **Bucket 3 — Growth** (global equities, equity funds, alternative growth assets). The defensive buckets act as a buffer — if markets fall, you draw from cash and delay selling growth assets until recovery.

The complexity for LLP is that each user's pots (SIPP, ISA, GIA) can hold many different funds and assets, and the asset-type mix spans across all pots — not cleanly mapped to a single pot type. A single fund can also be mixed (e.g. a 60/40 bond-equity blend). For couples this is doubly complex.

**Key design decisions:**
- Users capture **specific holdings within each pot** (fund name + value + asset type tag); a quick-mode fallback lets users enter a single percentage split per pot if they don't want to itemise
- Asset types include cash, bonds/gilts, equities, precious metals, alternatives (REITs/infrastructure/commodities), and mixed (with a sub-allocation)
- Bucket aggregation is **automatic** across all pots by asset type — driven by holdings, not pot identity
- The existing 7-step tax waterfall is **preserved** — the ladder adds a dimension of *what asset type to sell within a pot* on top of *which pot to draw from*
- **Rebalancing** runs on configurable triggers (each withdrawal / annual / drift threshold) — when a bucket drifts from its target, the engine generates rebalance actions moving value between buckets and surfaces them to the user
- Couples use a **unified household bucket** (not separate per-person ladders)

---

## Validation Approach (Build Order)

This feature is large enough that we want to **prove the model against real portfolio data before wiring up any UI**. The implementation is therefore split into two stages, gated on validation:

**Stage A — Engine + scenario harness (no UI changes):**
1. Land the data model and the pure-function bucket engine
2. Integrate bucket tracking + rebalancing into `projectionEngine` behind a feature flag (`bucketLadderConfig.enabled`, **default false**)
3. Build a standalone scenario harness (CLI script + JSON fixtures + golden snapshot tests) that loads a real portfolio, runs side-by-side scenarios, and prints comparison tables
4. **Decision gate**: run the user's actual portfolio through the harness, review the year-by-year tables and SORR comparisons, and only proceed to Stage B if results match expectations

**Stage B — UI exposure:**
5. Add the Step 3 holdings/allocation inputs and bucket settings accordion
6. Add the dashboard `BucketLadderPanel`
7. Flip the default in `bucketLadderConfig.enabled` only after end-to-end QA

The engine code written in Stage A is the same code consumed by the UI in Stage B — no throwaway scaffolding. The harness becomes the regression suite that protects the engine going forward.

---

## Bucket Structure

| Bucket | Time horizon | Asset types | Target size |
|--------|-------------|-------------|-------------|
| 1 — Cash | 1–2 years | Cash, money market, ultra-short gilts | `annualSpending × cashBufferYears` |
| 2 — Income & Stability | 3–7 years | Bonds, gilts, bond funds, precious metals, REITs, infrastructure, absolute-return funds, 60/40 blends | `annualSpending × incomeBufferYears` |
| 3 — Growth | 8+ years | Global equities, equity funds, growth-oriented alternatives | Everything else |

Default parameters: 2 cash years, 5 income years. Both are user-configurable.

The protective mechanism: if growth assets fall significantly (e.g. 30% in year 2), draw from Bucket 1 cash reserve while markets recover. Delay refilling Bucket 1 from Bucket 2 until markets stabilise. Never forced to sell growth assets at depressed prices.

Asset type to bucket mapping (`src/financialEngine/bucketLadderEngine.ts`):

| Asset type tag | Bucket |
|----------------|--------|
| `cash` | 1 |
| `bonds` | 2 |
| `preciousMetals` | 2 |
| `alternatives` (REITs, infrastructure, commodities) | 2 |
| `equities` | 3 |
| `mixed` | sub-allocation splits across buckets |

---

## Data Model

### New types (`src/models/types.ts`)

```typescript
// The five concrete asset types + 'mixed' for blended funds.
export type AssetType =
  | 'cash'              // cash, money market, ultra-short gilts → Bucket 1
  | 'bonds'             // bonds, gilts, bond funds → Bucket 2
  | 'preciousMetals'    // gold, silver, precious-metal funds → Bucket 2
  | 'alternatives'      // REITs, infrastructure, commodities, absolute-return → Bucket 2
  | 'equities'          // equity funds, global stocks → Bucket 3
  | 'mixed';            // blended fund — use mixedAllocation sub-split

// Sub-allocation used only when assetType === 'mixed'. Must sum to 100.
export interface MixedAllocation {
  cashPercent: number;
  bondsPercent: number;
  preciousMetalsPercent: number;
  alternativesPercent: number;
  equitiesPercent: number;
}

// One specific holding inside a pot (e.g. "Vanguard FTSE Global All Cap, £45,000, equities")
export interface PotHolding {
  id: string;                       // stable client-generated id (uuid-ish)
  name: string;                     // user-provided fund/asset name
  value: number;                    // £ value
  assetType: AssetType;
  mixedAllocation?: MixedAllocation; // required when assetType === 'mixed'
}

// Quick-mode fallback: a single percentage split for a whole pot.
// Used when the user doesn't want to itemise individual holdings.
// Must sum to 100.
export interface PotAllocation {
  cashPercent: number;
  bondsPercent: number;
  preciousMetalsPercent: number;
  alternativesPercent: number;
  equitiesPercent: number;
}

// Rebalancing trigger modes
export type RebalanceTrigger = 'onWithdrawal' | 'annual' | 'threshold' | 'off';

// Config block added to PlannerState
export interface BucketLadderConfig {
  enabled: boolean;
  cashBufferYears: number;        // target years of spending in Bucket 1 (default 2)
  incomeBufferYears: number;      // target years of spending in Bucket 2 (default 5)

  // Per-bucket growth rate overrides (0 = use financialConstants defaults)
  cashGrowthRate: number;
  incomeGrowthRate: number;       // blended weight for income bucket
  growthGrowthRate: number;

  // Rebalancing
  rebalanceTrigger: RebalanceTrigger;    // default 'onWithdrawal'
  rebalanceThresholdPercent: number;     // drift % that fires a rebalance (default 10)
  pauseRebalanceAfterEquityDropPercent: number; // skip refill if growth bucket fell by this much (default 15)
}
```

### Asset interface extensions

Each pot (`DCPensionAsset`, `ISAAsset`, `GIAAsset`) gains **two optional fields** so users can choose detail level:

```typescript
holdings?: PotHolding[];     // detailed mode — itemised funds/assets
allocation?: PotAllocation;  // quick mode — single percentage split for the whole pot
```

Resolution order: if `holdings` is set and non-empty, walk it; else if `allocation` is set, use it; else default to 100% equities (Bucket 3) — matching today's behaviour.

`CashSavingsAsset` is implicitly `{ cash: 100, ... }` — no field needed.

### Default bucket growth rates (`src/config/financialConstants.ts`)

```typescript
BUCKET_LADDER: {
  DEFAULT_CASH_GROWTH: 4.0,           // money market / cash ISA
  DEFAULT_INCOME_GROWTH: 4.5,         // bonds, gilts, metals, alternatives blend
  DEFAULT_GROWTH_GROWTH: 6.0,         // 100% global equity
  DEFAULT_CASH_BUFFER_YEARS: 2,
  DEFAULT_INCOME_BUFFER_YEARS: 5,
  SORR_EQUITY_SHOCK_PERCENT: 30,      // stress test: growth assets fall 30% in year 2
  DEFAULT_REBALANCE_TRIGGER: 'onWithdrawal',
  DEFAULT_REBALANCE_THRESHOLD_PERCENT: 10,
  DEFAULT_PAUSE_REBALANCE_AFTER_DROP_PERCENT: 15,
}
```

Per-asset-type default growth rates (used by the income bucket blend and for individual mixed-fund growth):

```typescript
ASSET_TYPE_GROWTH: {
  cash: 4.0,
  bonds: 4.5,
  preciousMetals: 3.5,
  alternatives: 5.0,
  equities: 6.0,
}
```

---

## New Engine: `src/financialEngine/bucketLadderEngine.ts`

All functions are pure and stateless (same pattern as `taxCalculations.ts`).

### `resolvePotBucketSplit(pot): { cash: number, income: number, growth: number }`

Internal helper. For a given pot, returns its value split across the three buckets in £. Resolution:

1. If `pot.holdings` is set and non-empty: sum each holding into its bucket using `ASSET_TYPE_TO_BUCKET[h.assetType]`; for `mixed` holdings, split the holding value across buckets using `h.mixedAllocation`.
2. Else if `pot.allocation` is set: multiply `pot.totalValue` by the relevant percentages.
3. Else: 100% growth bucket (legacy default).

### `calculateBucketValues(state: PlannerState): BucketValues`

Aggregates across all pots by bucket:
- Bucket 1 (cash) = Σ over all pots of `resolvePotBucketSplit(pot).cash` + cashSavings (both persons)
- Bucket 2 (income) = Σ over all pots of `resolvePotBucketSplit(pot).income`
- Bucket 3 (growth) = Σ over all pots of `resolvePotBucketSplit(pot).growth`

Covers: person1 assets, person2 assets, jointGia.

### `calculateBucketTargets(annualSpending: number, config: BucketLadderConfig): BucketTargets`

Returns target sizes for Buckets 1 and 2 based on configured buffer years. Bucket 3 has no target — it absorbs the remainder.

### `calculateRefillSchedule(projections: YearProjection[], config: BucketLadderConfig): RefillEvent[]`

Walks the year-by-year projection tracking bucket balances. A refill fires when Bucket 1 drops below 6 months of spending. Refill source priority: Bucket 2 (income) first, then Bucket 3 (growth). Refill from growth is paused when growth bucket dropped by more than `pauseRebalanceAfterEquityDropPercent` in the last year.

Returns: `[{ year, age, fromBucket, toBucket, amount, source }]`

### `calculateRebalancingActions(buckets, targets, config, lastYearGrowthChangePct): RebalanceAction[]`

Pure function that produces zero or more rebalance moves to bring buckets back toward target. Drift is computed as `(current − target) / target`; only buckets drifting beyond `rebalanceThresholdPercent` are touched. Moves are generated as:

- Bucket 1 under target → pull from Bucket 2 (income) first, then Bucket 3 (growth)
- Bucket 2 under target → pull from Bucket 3 (growth)
- Bucket 1 or 2 over target by threshold → push surplus to the next bucket (1 → 2, 2 → 3) so income/growth aren't starved

Returns: `[{ fromBucket, toBucket, amount, reason, trigger }]`.

### `runSorrStressTest(state: PlannerState, shockYear: number, shockPercent: number): SorrComparison`

Runs two projection passes:
- **Pass A (standard waterfall)**: normal projection with uniform growth
- **Pass B (bucket ladder)**: growth bucket drops `shockPercent`% in `shockYear`; ladder pauses refill from growth for 2 years

Returns: `{ standardDepletionAge, ladderDepletionAge, yearsSaved, portfolioAtAge85Delta }`

---

## Projection Engine Changes (`src/financialEngine/projectionEngine.ts`)

The existing waterfall order is unchanged. Three additions:

**1. Bucket value tracking per year**

At the start of each year, call `calculateBucketValues` and attach bucket balances to `YearProjection` output. Feeds dashboard health cards, refill schedule, and the rebalance log.

**2. Blended per-pot growth rates**

When `bucketLadderEnabled`, compute a blended growth rate for each pot from its holdings (or quick-mode allocation) and the per-asset-type growth rates in `financialConstants.ASSET_TYPE_GROWTH`. For each holding the rate is its asset-type rate (or, if mixed, the weighted sum of its `mixedAllocation`). The pot's blended growth rate is the value-weighted average of its holdings' rates:

```
blendedRate = Σ (holding.value × holdingRate) / pot.totalValue
```

This replaces the flat `growthRate` for that pot in the growth step (not in the waterfall draw step).

**3. Rebalancing step**

After each year's withdrawals are applied, the engine evaluates whether to rebalance. The trigger is governed by `config.rebalanceTrigger`:

| Trigger | Behaviour |
|---------|-----------|
| `off` | No rebalance applied |
| `onWithdrawal` | Run `calculateRebalancingActions` after every withdrawal (default) |
| `annual` | Run once per simulation year, regardless of withdrawals |
| `threshold` | Only when a bucket drifts beyond `rebalanceThresholdPercent` |

When an action fires, the engine updates the underlying holdings or quick-mode allocation in the in-memory state for the rest of the simulation, and appends the action to `YearProjection.rebalanceActions[]` so the UI can display the running log. Rebalances from the growth bucket are suppressed when last year's growth-bucket return was below `−pauseRebalanceAfterEquityDropPercent` — this is the SORR protection in action.

Rebalance actions are *cash-flow neutral* (they don't trigger CGT in the simulation) because they're modelled as fund switches within the same pot. A future enhancement could model GIA-internal switches as CGT events; out of scope for this iteration.

---

## UI: Pot Holdings & Allocation Inputs (`src/components/steps/Step3AssetsIncome.tsx`)

For each enabled pot (SIPP, ISA, GIA per person; joint GIA), add a collapsible "Asset mix" section visible when `bucketLadderEnabled`. Inside, the user picks one of two input modes via a small tab toggle:

### Mode A — Quick allocation (default)

A single percentage split for the whole pot. Five number inputs; the last auto-calculates to keep the sum at 100.

```
SIPP  £280,000  [growth rate]
▾ Asset mix  ◉ Quick allocation   ○ Itemise holdings
  Cash / money market       [  0] %
  Bonds / gilts             [ 20] %
  Precious metals           [  5] %
  Alternatives (REITs etc.) [  5] %
  Equities                  [ 70] %   ← auto-calculated remainder
```

- Inline validation: warn if edited values would exceed 100
- Persist via `setPotAllocation(person, assetKey, allocation)`

### Mode B — Itemised holdings

A list of holdings. Each row: name, value, asset type dropdown, optional "edit mix" for `mixed`. Total of values must equal the pot's total value (inline warning if not).

```
SIPP  £280,000  [growth rate]
▾ Asset mix  ○ Quick allocation   ◉ Itemise holdings
  ┌────────────────────────────────────────────────────────────────┐
  │ Vanguard FTSE Global All Cap   £180,000   [Equities ▾]    🗑 │
  │ iShares Core UK Gilts          £ 60,000   [Bonds ▾]       🗑 │
  │ iShares Physical Gold ETC      £ 20,000   [Precious m. ▾] 🗑 │
  │ Vanguard LifeStrategy 60       £ 20,000   [Mixed ▾]  ✎    🗑 │
  └────────────────────────────────────────────────────────────────┘
  + Add holding
  Total holdings: £280,000 (matches pot value ✓)
```

- Asset types: Cash, Bonds / Gilts, Equities, Precious metals, Alternatives, Mixed
- "Mixed" reveals a 5-input sub-allocation popover (Cash / Bonds / Precious metals / Alternatives / Equities, must sum to 100)
- "Add holding" appends a blank row
- Persist via `addPotHolding`, `updatePotHolding`, `removePotHolding`
- All new inputs must have `data-testid` values registered in `src/lib/testIds.ts`

### Bucket strategy settings panel

A new top-of-step accordion exposes the household-level config:

```
▾ Bucket strategy
  ☑ Enable cash flow ladder
  Cash buffer years            [ 2 ]
  Income buffer years          [ 5 ]

  Rebalancing
  ◉ On each withdrawal   ○ Annually   ○ Threshold only   ○ Off
  Drift threshold              [ 10 ] %
  Pause refill after growth drop > [ 15 ] %
```

---

## UI: Bucket Ladder Panel (`src/components/BucketLadderPanel.tsx`)

Mounted in `Step4Dashboard.tsx`. Four sections:

### 1. Bucket health cards

| Card | Content |
|------|---------|
| Bucket 1 — Cash | £X current / £Y target; status pill: OK (≥100%) / Low (75–99%) / Critical (<75%) |
| Bucket 2 — Income & Stability | £X current / £Y target; status pill; small breakdown chip (bonds / metals / alternatives shares) |
| Bucket 3 — Growth | £X current (no target; grows to fill) |

### 2. Refilling schedule

Year-by-year table from `calculateRefillSchedule`:

| Year | Age | Action | Amount | Source |
|------|-----|--------|--------|--------|
| 2028 | 63 | Refill cash from income | £30,000 | P1 ISA gilts |
| 2033 | 68 | Refill income from growth | £75,000 | SIPP equities |

### 3. Rebalance log

Running list of rebalance actions executed during the projection (sourced from `YearProjection.rebalanceActions[]`). Empty state copy: "No rebalancing needed yet — buckets are within drift threshold."

| Year | Age | Trigger | Action | Amount |
|------|-----|---------|--------|--------|
| 2029 | 64 | On withdrawal | Top up cash from income | £12,000 |
| 2031 | 66 | Drift threshold | Trim income surplus into growth | £8,500 |
| 2034 | 69 | Paused — growth fell 22% | (no refill from growth this year) | — |

### 4. SORR scenario comparison

Result from `runSorrStressTest` (30% growth shock in year 2):

| | Standard waterfall | Bucket ladder |
|---|---|---|
| Plan survives to | Age 87 | Age 96 |
| Portfolio at 85 | £42k | £180k |
| Forced growth-asset sales in crash year | Yes | No |

Explainer: "Without a cash buffer, a 30% fall in growth assets in early retirement forces you to sell investments at depressed prices. The bucket strategy draws from your 2-year cash reserve while markets recover, and rebalancing is paused so you don't crystallise the loss."

---

## Store Changes (`src/store/plannerStore.ts`)

Initial state addition:

```typescript
bucketLadderConfig: {
  enabled: false,
  cashBufferYears: 2,
  incomeBufferYears: 5,
  cashGrowthRate: 0,
  incomeGrowthRate: 0,
  growthGrowthRate: 0,
  rebalanceTrigger: 'onWithdrawal',
  rebalanceThresholdPercent: 10,
  pauseRebalanceAfterEquityDropPercent: 15,
}
```

New actions:
- `setBucketLadderEnabled(enabled: boolean)`
- `setBucketLadderConfig(updates: Partial<BucketLadderConfig>)`
- `setPotAllocation(person: 'p1' | 'p2' | 'joint', assetKey: string, allocation: PotAllocation)` — quick mode
- `addPotHolding(person, assetKey, holding: Omit<PotHolding, 'id'>)` — detailed mode
- `updatePotHolding(person, assetKey, holdingId, updates: Partial<PotHolding>)`
- `removePotHolding(person, assetKey, holdingId)`
- `setPotInputMode(person, assetKey, mode: 'quick' | 'holdings')` — UI-only flag persisted so the chosen tab survives reloads

---

## Scenario Validation Harness

Goal: let the user run their **actual portfolio** through the bucket engine and compare scenarios side-by-side, **without touching the production UI or default app behaviour**.

### Components

**1. Portfolio fixture format (`scripts/bucket-scenarios/fixtures/*.json`)**

A fixture is a serialised `PlannerState` snapshot — the same shape as what `plannerStore` produces. Either hand-craft one or export from the running app via the existing store's `localStorage` JSON. Holdings on each pot use the new `PotHolding[]` shape.

```jsonc
{
  "label": "My current portfolio — 2026 baseline",
  "person1": {
    "currentAge": 56,
    "assets": {
      "sipp": {
        "totalValue": 280000,
        "growthRate": 5,
        "holdings": [
          { "id": "h1", "name": "Vanguard FTSE Global All Cap", "value": 200000, "assetType": "equities" },
          { "id": "h2", "name": "iShares Core UK Gilts",        "value":  60000, "assetType": "bonds" },
          { "id": "h3", "name": "iShares Physical Gold ETC",    "value":  20000, "assetType": "preciousMetals" }
        ]
      },
      "isa":  { /* ... */ },
      "gia":  { /* ... */ },
      "cash": { /* ... */ }
    }
  },
  "person2": { /* optional */ },
  "annualSpending": 42000,
  "lifeExpectancy": 92
}
```

Fixtures are git-ignored by default (`scripts/bucket-scenarios/fixtures/*.json` added to `.gitignore`) so real portfolio data never lands in the repo. Anonymised example fixtures live alongside under `examples/` and **are** committed for regression tests.

**2. Scenario definition (`scripts/bucket-scenarios/scenarios.ts`)**

A scenario is a `{ name, configOverride, mutateState? }` tuple applied to a fixture before projection.

Pre-built scenarios:

| Scenario | Description |
|----------|-------------|
| `baseline` | Ladder disabled — current production behaviour |
| `ladder-default` | Ladder enabled, 2/5 buffer years, on-withdrawal rebalance |
| `ladder-annual` | Ladder enabled, annual rebalance |
| `ladder-threshold` | Ladder enabled, threshold-only rebalance (10% drift) |
| `ladder-no-rebalance` | Ladder enabled, rebalance off — see drift |
| `sorr-shock-year2` | Ladder enabled, 30% growth drop in year 2 |
| `sorr-shock-year2-baseline` | Same shock, ladder disabled (for comparison) |
| `sorr-shock-year5` | Ladder enabled, 30% growth drop in year 5 |
| `extended-cash-buffer` | Ladder with 3/7 buffer years |

**3. Runner (`scripts/bucket-scenarios/run.ts`)**

```bash
# Run one scenario against one fixture, printing a year-by-year table
npx tsx scripts/bucket-scenarios/run.ts --fixture my-portfolio.json --scenario ladder-default

# Compare multiple scenarios side-by-side (summary only)
npx tsx scripts/bucket-scenarios/run.ts --fixture my-portfolio.json --compare baseline,ladder-default,sorr-shock-year2

# Save full output to a markdown file for review
npx tsx scripts/bucket-scenarios/run.ts --fixture my-portfolio.json --scenario ladder-default --out reports/2026-05-31.md
```

**4. Year-by-year output**

```
Scenario: ladder-default   Fixture: my-portfolio.json
─────────────────────────────────────────────────────────────────────────────────
Year  Age  Spend    B1 Cash   B2 Inc    B3 Grow   Drew   Tax   Rebal  Total
2026   56  £42,000  £84,000   £210,000  £786,000  £0     £0    0      £1,080,000
2027   57  £43,260  £62,000   £218,000  £820,000  £42k   £4k   1      £1,100,000
2028   58  £44,558  £40,000   £225,000  £855,000  £43k   £4k   1      £1,120,000
…
2058   88  £71,234  £24,000   £18,000   £0        £71k   £8k   0      £42,000

Summary
  Depletion age:           89  (vs life expectancy 92 — 3yr shortfall)
  Total tax paid:          £148,400
  Total rebalances:        24
  Max single drawdown:     £71,234 (age 88)
  Avg B1 utilisation:      78% of target
```

**5. Comparison output**

```
Comparison: baseline vs ladder-default vs sorr-shock-year2
─────────────────────────────────────────────────────────────────────
                          baseline    ladder-default  sorr-shock-y2
Depletion age             87          92              90
Total tax paid            £162,200    £148,400        £151,000
Final portfolio @ 85      £42,000     £180,000        £128,000
Forced growth sales y2    Yes         No              No
Years of cash buffer @75  N/A         1.9             1.6
```

**6. Golden snapshot tests (`tests/scenarios/bucketLadder.scenario.test.ts`)**

For each committed example fixture × scenario combination, snapshot the summary block. Vitest's `toMatchSnapshot()` catches any regression in engine output between commits.

### What this gives the user

- Load your real portfolio (holdings + values), run the engine, and read the year-by-year table — no UI work needed
- Compare ladder vs baseline vs SORR scenarios in one command
- See the rebalance log printed inline so you can sanity-check trigger behaviour
- All without enabling the feature in the live app or seeing it in the wizard

### Decision criteria for proceeding to Stage B (UI)

Proceed if, against the user's real portfolio:
- Bucket aggregation matches the user's mental model of their holdings (spot-check 3+ pots)
- `ladder-default` extends depletion age by ≥ 2 years vs `baseline` in the SORR shock scenario
- Rebalance frequency under `onWithdrawal` is reasonable (e.g. ≤ 2 per year on average) — not so noisy that it would clutter the UI log
- Mixed-fund allocations produce expected bucket splits

If any of these fail, fix the engine before any UI work begins.

---

## Implementation Checklist

> **Stage A — Engine + harness (Phases 1–4).** All work invisible to the running app: `bucketLadderConfig.enabled` defaults to `false`, no wizard fields, no dashboard panel. End of Stage A is the decision gate.
>
> **Stage B — UI exposure (Phases 5–7).** Only start after Phase 4 validation passes.

### Phase 1 — Data model (no app behaviour change)

- [ ] Add `AssetType`, `MixedAllocation`, `PotHolding`, `PotAllocation`, `RebalanceTrigger`, `RebalanceAction`, `BucketLadderConfig` interfaces to `src/models/types.ts`
- [ ] Add optional `holdings?: PotHolding[]` and `allocation?: PotAllocation` to `DCPensionAsset`, `ISAAsset`, `GIAAsset`
- [ ] Add `BUCKET_LADDER` + `ASSET_TYPE_GROWTH` defaults blocks to `src/config/financialConstants.ts`
- [ ] Add `ASSET_TYPE_TO_BUCKET` constant in `src/financialEngine/bucketLadderEngine.ts`
- [ ] Add `bucketLadderConfig` to initial state in `src/store/plannerStore.ts` (with `enabled: false`)
- [ ] Add store actions: `setBucketLadderEnabled`, `setBucketLadderConfig`, `setPotAllocation`, `addPotHolding`, `updatePotHolding`, `removePotHolding`, `setPotInputMode`
- [ ] Add `data-testid` keys to `src/lib/testIds.ts` (parked for Stage B, defined now so the engine tests can reference them)
- [ ] **Verify**: app runs unchanged, all existing tests pass, `enabled` remains `false`

### Phase 2 — Bucket engine (pure functions, no integration)

- [ ] Create `src/financialEngine/bucketLadderEngine.ts`
- [ ] Implement `resolvePotBucketSplit` (holdings → quick allocation → legacy default fallback)
- [ ] Implement `calculateBucketValues` — aggregate buckets across both persons + joint
- [ ] Implement `calculateBucketTargets` — target sizes from buffer years × annual spending
- [ ] Implement `calculateRefillSchedule` — walk projections, fire refill events on trigger condition, honour SORR pause
- [ ] Implement `calculateRebalancingActions` — drift-based rebalance generator
- [ ] Implement `runSorrStressTest` — dual projection pass with growth shock in specified year
- [ ] Create `tests/unit/bucketLadderEngine.test.ts` covering all functions + mixed-fund and quick-mode resolution
- [ ] **Verify**: `npx vitest run tests/unit/bucketLadderEngine.test.ts` green; no other test file touched

### Phase 3 — Projection engine integration (feature-flagged off)

- [ ] Attach bucket values to `YearProjection` output (call `calculateBucketValues` per year) — runs even when `enabled: false` so the harness can read them
- [ ] Add `rebalanceActions: RebalanceAction[]` to `YearProjection`
- [ ] Implement blended growth rate from holdings / quick-mode allocation — **only applied when `bucketLadderConfig.enabled === true`**
- [ ] Wire the rebalance step into the per-year loop, gated on `config.enabled && config.rebalanceTrigger !== 'off'`
- [ ] Implement SORR pause: skip growth-bucket refill when last year's growth return < `−pauseRebalanceAfterEquityDropPercent`
- [ ] Add tests to `tests/unit/projectionEngine.test.ts` for: bucket tracking present when disabled, blended rate applied when enabled, each rebalance trigger mode, SORR pause behaviour
- [ ] Critical test gate: `npx vitest run tests/unit/projectionEngine.test.ts tests/unit/taxCalculations.test.ts`
- [ ] **Verify**: with `enabled: false`, every existing projection test produces byte-identical output to before this branch

### Phase 4 — Scenario harness + validation gate

- [ ] Add `scripts/bucket-scenarios/fixtures/*.json` to `.gitignore`
- [ ] Create `scripts/bucket-scenarios/examples/sample-portfolio.json` (anonymised, committed)
- [ ] Create `scripts/bucket-scenarios/scenarios.ts` with the 9 pre-built scenarios listed above
- [ ] Create `scripts/bucket-scenarios/run.ts` CLI with `--fixture`, `--scenario`, `--compare`, `--out` flags
- [ ] Create `scripts/bucket-scenarios/format.ts` — year-by-year table + comparison renderer
- [ ] Add an `npm run scenarios` script wrapping `tsx scripts/bucket-scenarios/run.ts`
- [ ] Create `tests/scenarios/bucketLadder.scenario.test.ts` with snapshot tests for example fixture × scenario combos
- [ ] Document in `scripts/bucket-scenarios/README.md`: fixture format, export-from-localStorage helper, running scenarios, interpreting output
- [ ] **🚦 DECISION GATE** — user exports their real portfolio to a fixture, runs `baseline`, `ladder-default`, and `sorr-shock-year2`, reviews the year-by-year tables and comparison summary. Proceed to Stage B only if:
  - Bucket aggregation matches expectations (spot-check 3+ pots)
  - `ladder-default` extends depletion age by ≥ 2 years vs `baseline` under SORR shock
  - Rebalance frequency is reasonable (≤ ~2 per year on average under `onWithdrawal`)
  - Mixed-fund splits look right
- [ ] If the gate fails: iterate on engine in Phases 2/3, rerun harness; do not start Phase 5

---

### Phase 5 — UI: pot holdings & allocation inputs (Stage B)

- [ ] Add collapsible "Asset mix" section to each pot in `Step3AssetsIncome.tsx`
- [ ] Show only when `bucketLadderEnabled` (or add a "Set up bucket strategy" toggle)
- [ ] Implement the two-tab mode toggle (Quick allocation / Itemise holdings)
- [ ] Quick mode: 5 percentage inputs; last one auto-calculates the remainder; validate sum = 100
- [ ] Holdings mode: editable rows (name, value, asset-type dropdown, mixed-allocation popover), add/remove, validate total = pot value
- [ ] Build the "Bucket strategy" settings accordion (enable toggle, buffer years, rebalance trigger radio, drift threshold, pause threshold)
- [ ] Wire to store actions
- [ ] Add UI tests in `tests/ui/` for both modes, mixed-fund popover, and the settings accordion

### Phase 6 — UI: bucket ladder dashboard panel

- [ ] Create `src/components/BucketLadderPanel.tsx` with four sections
- [ ] Bucket health cards (current vs target, status pills, income breakdown chip)
- [ ] Refilling schedule table (from `calculateRefillSchedule`)
- [ ] Rebalance log table (from `YearProjection.rebalanceActions[]`)
- [ ] SORR comparison (from `runSorrStressTest`)
- [ ] Mount `BucketLadderPanel` in `src/components/steps/Step4Dashboard.tsx`
- [ ] Add UI tests for panel render and data binding

### Phase 7 — QA & rollout

- [ ] Full test suite green: `npm run test`
- [ ] Re-run the scenario harness against the user's real portfolio — confirm UI output matches harness output for the same fixture
- [ ] Manual: enable bucket ladder, enter quick-mode allocations, verify health cards and refill schedule
- [ ] Manual: switch a pot to holdings mode, add a mixed fund, verify aggregation across all five asset types
- [ ] Manual: run SORR comparison in-app, confirm positive age-delta for ladder vs standard
- [ ] Manual: change rebalance trigger between `onWithdrawal` / `annual` / `threshold` / `off`; verify rebalance log changes accordingly
- [ ] Edge cases: single person plan, all pots with default fallback (no holdings / no allocation), 0% growth in all pots, mixed fund with all 5 sub-allocations non-zero, holdings total not matching pot value
- [ ] SonarCloud rules check: `htmlFor`/`id` pairs, no self-closing non-void JSX, no identical ternary branches
- [ ] `bucketLadderConfig.enabled` default stays `false`; users opt in via the Step 3 toggle
