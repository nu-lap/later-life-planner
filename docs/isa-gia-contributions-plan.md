# ISA & GIA Annual Contributions

## Problem

Users currently have no way to model ongoing saving into an ISA or GIA before they reach their FI age. Only the DC pension has pre-FI contribution fields (`workplaceContributionPercent`, `sippContributionAnnualGross`). This means the projection understates wealth accumulation for users who are still actively building their investment portfolios.

## Goal

Add a simple, optional yearly contribution field to ISA and GIA assets. The field represents the amount the user plans to deposit each year until they stop work (FI age). The projection engine applies these contributions in pre-FI years, growing the opening balance before drawdown begins.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inflation-linking | No — today's £ | Simplest; matches how users think about regular savings amounts |
| Contribution end point | Stops automatically at FI age | Natural boundary; no extra UI field needed |
| ISA allowance enforcement | Not enforced in engine; UI hint shown | Avoids complexity; users enter realistic values |
| GIA cost basis | Contribution added to both value **and** baseCost each year | Each year's deposit has a cost basis equal to the amount paid |
| Joint GIA | Supported — single contribution field for the jointly-held account | Consistent with how joint GIA is modelled elsewhere |
| Missing/zero field | `undefined` treated as 0 | No data migration required; backwards-compatible |

## Implementation

### 1. Types (`src/models/types.ts`)

Add `annualContribution?: number` to `ISAAsset` and `GIAAsset`:

```ts
export interface ISAAsset {
  enabled: boolean;
  totalValue: number;
  growthRate: number;
  annualContribution?: number;   // yearly deposit before FI age, today's £
}

export interface GIAAsset {
  enabled: boolean;
  totalValue: number;
  baseCost: number;
  growthRate: number;
  annualContribution?: number;   // yearly deposit before FI age, today's £
}
```

### 2. Projection Engine (`src/financialEngine/projectionEngine.ts`)

In the per-year loop, after asset growth and before the drawdown waterfall, apply contributions for pre-FI years only:

```ts
// Pre-FI annual contributions — ISA
if (!householdFiStarted) {
  p1Isa += person1.assets.isaInvestments.annualContribution ?? 0;
}
if (mode === 'couple' && !p2FiStarted) {
  p2Isa += person2.assets.isaInvestments.annualContribution ?? 0;
}

// Pre-FI annual contributions — individual GIA
// Cost basis increases by the contribution amount (each deposit has basis = amount paid)
if (!householdFiStarted) {
  const p1GiaAdd = person1.assets.generalInvestments.annualContribution ?? 0;
  p1GiaV  += p1GiaAdd;
  p1GiaBC += p1GiaAdd;
}
if (mode === 'couple' && !p2FiStarted) {
  const p2GiaAdd = person2.assets.generalInvestments.annualContribution ?? 0;
  p2GiaV  += p2GiaAdd;
  p2GiaBC += p2GiaAdd;
}

// Pre-FI annual contributions — joint GIA
if (mode === 'couple' && !householdFiStarted) {
  const jointAdd = jointGia.annualContribution ?? 0;
  jointGiaV  += jointAdd;
  jointGiaBC += jointAdd;
}
```

> The "pre-FI" guard mirrors the existing DC pension contribution pattern (`!householdFiStarted` / `!p2FiStarted`).

### 3. UI (`src/components/steps/Step3IncomeSources.tsx`)

Add a `FieldRow` with `CurrencyInput` to each affected asset card:

- **ISA card** — label: `Yearly contribution (pre-FI)`, hint: ISA annual allowance is £20,000/yr per person
- **Individual GIA card** — label: `Yearly contribution (pre-FI)`
- **Joint GIA card** — label: `Yearly contribution (pre-FI)`

### 4. Tests (`tests/unit/projectionEngine.test.ts`)

Three new tests:

1. **ISA contribution applied** — balance in year 1 reflects `totalValue * growth + annualContribution`; contribution stops at FI age
2. **GIA contribution applied** — value and baseCost both increase by `annualContribution` in pre-FI years; stops at FI age
3. **Zero / undefined contribution** — projection is unchanged from baseline with no contribution set

## Files Changed

| File | Change |
|------|--------|
| `src/models/types.ts` | Add `annualContribution?: number` to `ISAAsset`, `GIAAsset` |
| `src/financialEngine/projectionEngine.ts` | Apply pre-FI contributions in projection loop |
| `src/components/steps/Step3IncomeSources.tsx` | Add contribution inputs to ISA, GIA, and joint GIA cards |
| `tests/unit/projectionEngine.test.ts` | Unit tests for contribution behaviour |

## Out of Scope

- Inflation-linked contributions
- Contributions continuing past FI age
- Per-account contribution end date
- Enforcing the ISA annual allowance in the engine
- Cash savings contributions (handled separately via the gap/surplus flow)
