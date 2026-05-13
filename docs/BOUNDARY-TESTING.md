# Boundary Testing

Standalone test suite that exercises cross-field UI constraints and numeric
boundary conditions in the financial engine.

## Why a separate suite?

| Layer | Purpose | Runs in CI |
|-------|---------|------------|
| Unit (`tests/unit/`) | Financial engine correctness | Yes |
| UI component (`tests/ui/`) | Component rendering and interactions | Yes |
| E2E (`tests/e2e/`) | End-to-end wizard and sync flows | Yes (subset) |
| **Boundary (`tests/boundaries/`)** | **Cross-field constraints and input limits** | **No — run locally** |

The boundary tests run against real components and real engine code, but are
excluded from the CI `npm run test` command. They take longer and target
scenarios that would slow down the PR gate without adding new signal.

Run them before merging changes to the wizard steps, planning bounds,
financial constants, or the projection / tax engine.

## Running the tests

```bash
# Run the full boundary suite
npm run test:boundaries

# Run a single test file
npx vitest run --config tests/boundaries/vitest.boundaries.config.mjs \
  tests/boundaries/ui/step1.boundaries.test.tsx

# Run in watch mode while developing
npx vitest --config tests/boundaries/vitest.boundaries.config.mjs
```

## What each file covers

### UI tests (jsdom + React Testing Library)

| File | What is tested |
|------|---------------|
| `ui/step1.boundaries.test.tsx` | FI age slider min = currentAge; FI age slider max = lifeExpectancy − 2; life expectancy slider min = max(80, age + 2); P2 fields absent in single mode, present in couple mode; couple life expectancy slider min accounts for both ages |
| `ui/step2.boundaries.test.tsx` | Pre-seeded RLSS categories produce correct displayed totals (£13.4k, £31.7k, £43.9k); all three RLSS buttons rendered; `applyRlssTemplate` called on click; gap spending section visible when p2FiAge > fiAge |
| `ui/step3.boundaries.test.tsx` | Income/assets tab switching; `otherIncome.startAge` increment pushes `stopAge` forward when it would become ≤ new startAge |

### Engine tests (Node, pure functions)

| File | What is tested |
|------|---------------|
| `engine/taxBoundaries.test.ts` | `calcIncomeTax` at basic/higher/additional rate boundaries; 60% effective marginal rate in PA taper zone (£100k–£125,140); `calcCGT` boundary at £3,000 annual exempt amount; `drawFromGIA` proportional gain fraction |
| `engine/projectionBoundaries.test.ts` | State pension income is zero before `startAge` and non-zero from it; LSA exhaustion (`dcTaxFreeDrawdown = 0` after £268,275 lifetime tax-free drawn); joint GIA gains split 50/50 between spouses; DC drawn when it is the only asset source |

## When to run

Run `npm run test:boundaries` before merging changes to:

- `src/components/steps/Step1HouseholdSetup.tsx`
- `src/components/steps/Step2SpendingGoals.tsx`
- `src/components/steps/Step3IncomeSources.tsx`
- `src/lib/planningBounds.ts`
- `src/config/financialConstants.ts`
- `src/config/taxRuleSnapshot.ts`
- `src/financialEngine/projectionEngine.ts`
- `src/financialEngine/taxCalculations.ts`

## Adding new boundary tests

1. Add a new `*.boundaries.test.{ts,tsx}` file under `tests/boundaries/ui/` or `tests/boundaries/engine/`.
2. Use `jsdom` for UI component tests and `node` for pure engine tests (the config routes them automatically via `environmentMatchGlobs`).
3. Follow the existing mock store pattern for Step1/Step2 (vi.mock) or the real store pattern for Step3 (usePlannerStore directly).
4. Update this document to list the new scenario in the table above.
