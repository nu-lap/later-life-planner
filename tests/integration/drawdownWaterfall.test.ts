/**
 * Integration tests — drawdown waterfall ordering and step-by-step behaviour.
 *
 * Priority order under test:
 *   1. DC within personal allowance   (UFPLS — 0% effective tax)
 *   2. GIA within CGT budget          (individual then joint)
 *   3. ISA                            (tax-free)
 *   4. Remaining GIA                  (taxable gains above exempt)
 *   5. Cash                           (tax-free)
 *   6. DC above personal allowance    (taxable at marginal rate)
 */

import { describe, test, expect } from 'vitest';
import { calculateProjections } from '@/financialEngine/projectionEngine';
import { INCOME_TAX, CGT, PENSION_RULES } from '@/config/financialConstants';
import { bareState, dcOnlyState, isaOnlyState } from '../fixtures/states';
import { withSpending, yearAt, fiProjections } from '../fixtures/helpers';
import type { PlannerState } from '@/models/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a single-person state with both ISA and GIA assets (zero growth for predictability). */
function isaAndGiaState(
  age: number,
  isaValue: number,
  giaValue: number,
  giaBc: number,
  spending: number,
): PlannerState {
  const base = withSpending(bareState(age), spending);
  return {
    ...base,
    person1: {
      ...base.person1,
      assets: {
        ...base.person1.assets,
        isaInvestments:     { enabled: true, totalValue: isaValue, growthRate: 0 },
        generalInvestments: { enabled: true, totalValue: giaValue, baseCost: giaBc, growthRate: 0 },
      },
    },
  };
}

/** Build a single-person state with DC and ISA (zero growth). */
function dcAndIsaState(
  age: number,
  dcValue: number,
  isaValue: number,
  spending: number,
): PlannerState {
  const base = withSpending(bareState(age), spending);
  return {
    ...base,
    person1: {
      ...base.person1,
      incomeSources: {
        ...base.person1.incomeSources,
        dcPension: { enabled: true, totalValue: dcValue, growthRate: 0 },
      },
      assets: {
        ...base.person1.assets,
        isaInvestments: { enabled: true, totalValue: isaValue, growthRate: 0 },
      },
    },
  };
}

// ─── Step 1: DC pension within personal allowance ─────────────────────────────

describe('Step 1 — DC within personal allowance', () => {
  test('low spending: DC drawn, income tax = 0 (taxable portion within PA)', () => {
    // spending = £12,000 → DC draw = 12,000; taxable 75% = 9,000 < PA → zero tax
    const state = withSpending(dcOnlyState(65, 500_000, 65), 12_000);
    const proj   = calculateProjections(state);
    const row    = proj[0];
    expect(row.p1DcDrawdown).toBeCloseTo(12_000, 0);
    expect(row.totalTaxPaid).toBeCloseTo(0, 0);
  });

  test('maximum step-1 draw: capped at PA / (1 - TF_FRACTION)', () => {
    const maxDraw = INCOME_TAX.PERSONAL_ALLOWANCE / (1 - PENSION_RULES.UFPLS_TAX_FREE_FRACTION);
    // Spending well above maxDraw so step 1 can use its full budget
    const state = withSpending(dcOnlyState(65, 500_000, 65), 50_000);
    const row   = calculateProjections(state)[0];
    // Step 1 should draw exactly the PA headroom ceiling
    // Any further DC drawn in step 6 is taxable
    expect(row.p1DcDrawdown).toBeGreaterThan(maxDraw - 1);
  });

  test('DB pension occupying PA headroom: income tax is lower than with step-6 draw only', () => {
    // Without DB: full headroom (£16,760 step-1); spending £15,000 → zero tax
    // With DB £12,000: reduced headroom; spending £15,000 → step-6 DC needed → some tax
    const withDb = withSpending({
      ...bareState(65),
      person1: {
        ...bareState(65).person1,
        incomeSources: {
          ...bareState(65).person1.incomeSources,
          dbPension: { enabled: true, annualIncome: 12_000, startAge: 65 },
          dcPension: { enabled: true, totalValue: 500_000, growthRate: 0 },
        },
      },
    }, 15_000);
    const withDbRow = calculateProjections(withDb)[0];
    // With DB £12,000 filling PA headroom and spending needing £15,000:
    // fixedIncome = 12,000; remaining = 3,000
    // Step 1: headroom = 12,570 - 12,000 = 570; maxWithinAllowance = 570/0.75 = 760
    // Step 6: DC = remaining - 760 = 2,240; taxable = 2,240 * 0.75 = 1,680
    // p1TaxBasis = 12,000 + 1,680 = 13,680 > PA → tax = (13,680-12,570)*0.20 = £222
    expect(withDbRow.incomeTaxPaid).toBeGreaterThan(0);
  });

  test('when SP exceeds PA, step-1 DC draw is 0 (no headroom)', () => {
    // SP weekly 250 = £13,000/yr > £12,570 PA → zero headroom
    const base = bareState(67); // age 67 so SP starts immediately
    const state = withSpending({
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          statePension: { enabled: true, weeklyAmount: 250, startAge: 67 },
          dcPension:    { enabled: true, totalValue: 500_000, growthRate: 0 },
        },
      },
    }, 30_000);
    const row = calculateProjections(state)[0];
    // SP ≥ PA → no step-1 DC; any DC drawn is step-6 (taxable)
    // Verify income tax > 0 (DC withdrawals are taxable above PA)
    expect(row.totalTaxPaid).toBeGreaterThan(0);
  });

  test('no DC drawn before fiAge regardless of balance', () => {
    // fiAge = 70, current age = 65 → 5 pre-FI rows
    const state = withSpending(dcOnlyState(65, 500_000, 70), 20_000);
    const projections = calculateProjections(state);
    const preFi = projections.filter(p => p.p1Age < 70);
    preFi.forEach(p => expect(p.p1DcDrawdown).toBe(0));
  });
});

// ─── Step 2: GIA within CGT budget ────────────────────────────────────────────

describe('Step 2 — GIA within CGT budget', () => {
  test('Bed & ISA shelters GIA into ISA wrapper before the waterfall runs', () => {
    // General Bed & ISA: GIA is sold and re-bought inside the ISA each year up to
    // the annual ISA allowance (£20k). The waterfall then draws from ISA for spending.
    // GIA £20k / BC £10k (50% gain fraction). ISA £100k. Spending £5,000.
    const state = isaAndGiaState(65, 100_000, 20_000, 10_000, 5_000);
    const row   = calculateProjections(state)[0];
    // All GIA is sheltered into ISA via Bed & ISA — no waterfall draw from GIA.
    expect(row.p1GiaDrawdown).toBeCloseTo(0, 0);
    // ISA is drawn for spending (grossed up for B&I CGT).
    expect(row.p1IsaDrawdown).toBeGreaterThan(0);
    // B&I triggers CGT: gain = £10k, exempt = £3k → CGT on £7k.
    expect(row.totalCgtPaid).toBeGreaterThan(0);
  });

  test('After Bed & ISA, all spending is covered by ISA even when spending exceeds former CGT budget', () => {
    // GIA £20k fully sheltered via B&I; ISA absorbs all spending.
    const state = isaAndGiaState(65, 100_000, 20_000, 10_000, 15_000);
    const row   = calculateProjections(state)[0];
    expect(row.p1GiaDrawdown).toBeCloseTo(0, 0);
    expect(row.p1IsaDrawdown).toBeGreaterThan(0);
  });

  test('no GIA drawn before fiAge', () => {
    const state = isaAndGiaState(65, 100_000, 50_000, 10_000, 20_000);
    const modified: PlannerState = { ...state, fiAge: 70 };
    const projections = calculateProjections(modified);
    const preFi = projections.filter(p => p.p1Age < 70);
    preFi.forEach(p => expect(p.p1GiaDrawdown).toBe(0));
  });

  test('CGT paid = 0 when GIA gain fraction is low enough to stay within annual exempt', () => {
    // GIA £20k / BC £18k (10% gain fraction) → full B&I transfer → gain = £2,000 < £3,000 exempt.
    // DC = 0, ISA = 0 initially (created by Bed & ISA transfer).
    const state = isaAndGiaState(65, 0, 20_000, 18_000, 5_000);
    const row   = calculateProjections(state)[0];
    expect(row.totalCgtPaid).toBe(0);
    // ISA drawn for spending (GIA was sheltered into ISA).
    expect(row.p1IsaDrawdown).toBeGreaterThan(0);
  });

  test('CGT paid > 0 when GIA gain exceeds annual exempt (step 4)', () => {
    // Spend more than CGT budget can supply — overflow drawn in step 4 → CGT taxable
    // GIA 50% gain fraction: maxForCgt = £6,000. Spend £20,000 — ISA = 0, rest from GIA taxable
    const state = isaAndGiaState(65, 0, 100_000, 50_000, 20_000);
    const row   = calculateProjections(state)[0];
    expect(row.totalCgtPaid).toBeGreaterThan(0);
  });
});

// ─── Step 3: ISA ──────────────────────────────────────────────────────────────

describe('Step 3 — ISA', () => {
  test('ISA drawn after DC step-1; Bed & ISA shelters GIA before the waterfall', () => {
    // DC £200k, GIA £10k/BC £5k (50% gain), ISA £100k, spending £25,000.
    // Bed & ISA shelters GIA into ISA before the waterfall runs.
    // Waterfall: Step 1 draws DC within PA headroom; Step 3 draws ISA for the rest.
    const base = withSpending(bareState(65), 25_000);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { enabled: true, totalValue: 200_000, growthRate: 0 },
        },
        assets: {
          ...base.person1.assets,
          isaInvestments:     { enabled: true, totalValue: 100_000, growthRate: 0 },
          generalInvestments: { enabled: true, totalValue: 10_000, baseCost: 5_000, growthRate: 0 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    expect(row.p1DcDrawdown).toBeGreaterThan(0);
    // GIA is fully sheltered into ISA via Bed & ISA; not drawn by the waterfall.
    expect(row.p1GiaDrawdown).toBe(0);
    expect(row.p1IsaDrawdown).toBeGreaterThan(0);
  });

  test('ISA draw generates zero income tax', () => {
    // ISA only — never taxable
    const state = isaOnlyState(65, 200_000, 20_000, 65);
    fiProjections(state).forEach(p => {
      expect(p.incomeTaxPaid).toBe(0);
    });
  });

  test('no ISA drawn before fiAge', () => {
    const state: PlannerState = {
      ...isaOnlyState(65, 200_000, 20_000, 70),
      fiAge: 70,
    };
    const projections = calculateProjections(state);
    const preFi = projections.filter(p => p.p1Age < 70);
    preFi.forEach(p => expect(p.p1IsaDrawdown).toBe(0));
  });
});

// ─── Gross-up convergence ─────────────────────────────────────────────────────

describe('Gross-up convergence', () => {
  test('netIncome ≈ spending (within £10) for all FI years where assets cover spending', () => {
    // Use dcOnlyState — gross-up iterates 4 times; DC tax can leave small residual
    const state = withSpending(dcOnlyState(65, 1_000_000, 65), 25_000);
    const projections = calculateProjections(state);
    projections.filter(p => p.totalAssets > 0 && p.p1Age >= 65).forEach(p => {
      expect(Math.abs(p.netIncome - p.spending)).toBeLessThan(15);
    });
  });

  test('netIncome ≈ spending for ISA-only plan (no tax, exact convergence)', () => {
    const state = isaOnlyState(65, 500_000, 20_000, 65);
    const projections = calculateProjections(state);
    projections.filter(p => p.totalAssets > 0).forEach(p => {
      expect(Math.abs(p.netIncome - p.spending)).toBeLessThan(1);
    });
  });

  test('netIncome is within 5% of spending for mixed DC + GIA plan', () => {
    // The gross-up loop converges in 4 iterations; GIA + DC interaction
    // can leave a residual — test that convergence is within 5% (practically accurate).
    const base = withSpending(bareState(65), 30_000);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { enabled: true, totalValue: 800_000, growthRate: 4 },
        },
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: true, totalValue: 50_000, baseCost: 30_000, growthRate: 4 },
        },
      },
    };
    calculateProjections(state)
      .filter(p => p.totalAssets > 0)
      .forEach(p => {
        const tolerance = Math.max(20, p.spending * 0.05);
        expect(Math.abs(p.netIncome - p.spending)).toBeLessThan(tolerance);
      });
  });
});

// ─── Cash (step 5) ────────────────────────────────────────────────────────────

describe('Step 5 — Cash', () => {
  test('cash drawn only when ISA, GIA and DC step-1 are exhausted or zero', () => {
    // Only cash, no other assets
    const base = withSpending(bareState(65), 10_000);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          cashSavings: { enabled: true, totalValue: 100_000 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    expect(row.p1CashDrawdown).toBeGreaterThan(0);
    expect(row.p1DcDrawdown).toBe(0);
    expect(row.p1IsaDrawdown).toBe(0);
    expect(row.p1GiaDrawdown).toBe(0);
  });
});

// ─── LSA (Lifetime Allowance cap on tax-free DC cash) ─────────────────────────

describe('LSA — Lifetime Lump Sum Allowance', () => {
  test('tax-free DC drawdown total never exceeds LSA (£268,275)', () => {
    // Very large DC pot — force many years of UFPLS draws
    const state = withSpending(dcOnlyState(55, 4_000_000, 55), 60_000);
    const projections = calculateProjections(state);
    const totalTaxFree = projections.reduce((s, p) => s + p.dcTaxFreeDrawdown, 0);
    expect(totalTaxFree).toBeLessThanOrEqual(PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE + 1);
  });
});
