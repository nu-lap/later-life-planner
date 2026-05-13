import { describe, test, expect } from 'vitest';
import { calculateProjections } from '@/financialEngine/projectionEngine';
import { bareState, dcOnlyState, spOnlyState, bareCoupleState } from '../../fixtures/states';
import { yearAt, withSpending } from '../../fixtures/helpers';

describe('state pension — deferred accrual', () => {
  test('state pension income is zero before startAge', () => {
    const state = spOnlyState(60, 67);
    const projections = calculateProjections(state);

    for (let age = 60; age < 67; age++) {
      const row = yearAt(projections, age);
      expect(row.p1StatePension).toBe(0);
    }
  });

  test('state pension income becomes non-zero from startAge onwards', () => {
    const state = spOnlyState(60, 67);
    const projections = calculateProjections(state);

    // At state pension age (age 67), annual income should be non-zero
    const startRow = projections.find(r => r.p1Age === 67);
    expect(startRow).toBeDefined();
    expect(startRow!.p1StatePension).toBeGreaterThan(0);
  });

  test('state pension at age 67 is approximately 52 × weekly amount', () => {
    const weeklyAmount = 221.20;
    const state = {
      ...spOnlyState(67, 67),
      // Set fiAge = 67 so we start at exactly the state pension age
    };
    const projections = calculateProjections(state);
    const row = yearAt(projections, 67);
    // Year 0: inflFactor = 1.0, so annual ≈ 221.20 × 52
    expect(row.p1StatePension).toBeCloseTo(weeklyAmount * 52, -1);
  });
});

describe('Lump Sum Allowance (LSA) exhaustion', () => {
  test('dcTaxFreeDrawdown becomes zero once LSA is exhausted', () => {
    // Build a state where DC is the only asset and spending forces large annual draws.
    // With 0% growth/inflation and £300k/year spending, the LSA (£268,275) is
    // exhausted after ~4 years (3 × £75k + 1 partial year).
    const base = bareState(60);
    const state = withSpending(
      {
        ...base,
        fiAge: 60,
        assumptions: { ...base.assumptions, lifeExpectancy: 70, inflation: 0, investmentGrowth: 0 },
        person1: {
          ...base.person1,
          incomeSources: {
            ...base.person1.incomeSources,
            dcPension: { enabled: true, totalValue: 4_000_000, growthRate: 0 },
          },
        },
      },
      300_000,
    );

    const projections = calculateProjections(state);

    // Early years: tax-free DC withdrawal should be positive
    const year0 = yearAt(projections, 60);
    expect(year0.dcTaxFreeDrawdown).toBeGreaterThan(0);

    // After LSA is exhausted (around age 64+), dcTaxFreeDrawdown must be 0
    // LSA = £268,275, each year uses 300k × 0.25 = £75k; exhausted after ~3.6 years
    const lateYear = yearAt(projections, 65);
    expect(lateYear.dcTaxFreeDrawdown).toBe(0);
  });

  test('income tax is higher after LSA exhaustion (full DC amount taxable)', () => {
    const base = bareState(60);
    const state = withSpending(
      {
        ...base,
        fiAge: 60,
        assumptions: { ...base.assumptions, lifeExpectancy: 75, inflation: 0, investmentGrowth: 0 },
        person1: {
          ...base.person1,
          incomeSources: {
            ...base.person1.incomeSources,
            dcPension: { enabled: true, totalValue: 5_000_000, growthRate: 0 },
          },
        },
      },
      300_000,
    );

    const projections = calculateProjections(state);

    // After LSA exhaustion, each DC draw is 100% taxable → higher income tax
    const earlyTax = yearAt(projections, 61).p1IncomeTax;
    const lateTax  = yearAt(projections, 68).p1IncomeTax;
    expect(lateTax).toBeGreaterThan(earlyTax);
  });
});

describe('joint GIA — CGT split between spouses', () => {
  test('joint GIA gains result in equal CGT paid by each person (50/50 split)', () => {
    // Note: p1CapitalGain / p2CapitalGain only reflect individual GIA gains.
    // Joint GIA gains are split via jointGainEach = jointGiaCG / 2 internally, which
    // feeds p1TotalCG and p2TotalCG for CGT calculation. We assert via p1CgtPaid ≈ p2CgtPaid.
    const base = bareCoupleState(60, 60);
    const state = withSpending(
      {
        ...base,
        fiAge: 60,
        assumptions: { ...base.assumptions, lifeExpectancy: 65, inflation: 0, investmentGrowth: 0 },
        jointGia: {
          enabled: true,
          totalValue: 200_000,
          baseCost: 0,   // 100% gain so CGT is definitely owed after exempt amount
          growthRate: 0,
        },
      },
      100_000,
    );

    const projections = calculateProjections(state);
    const year0 = yearAt(projections, 60);

    // Each person should owe CGT (gain per person > £3,000 annual exempt)
    expect(year0.p1CgtPaid).toBeGreaterThan(0);
    expect(year0.p2CgtPaid).toBeGreaterThan(0);

    // CGT should be symmetric — same gain and same income for both persons
    expect(year0.p1CgtPaid).toBeCloseTo(year0.p2CgtPaid, 0);
  });
});

describe('drawdown waterfall — DC drawn when no other assets', () => {
  test('DC pension is drawn when it is the only asset source', () => {
    const state = withSpending(
      dcOnlyState(65, 500_000, 65),
      20_000,
    );
    const projections = calculateProjections(state);
    const row = yearAt(projections, 65);

    // DC drawdown should be positive — no other assets to cover spending
    expect(row.p1DcDrawdown).toBeGreaterThan(0);

    // ISA and GIA drawdowns should be zero (no ISA/GIA in this state)
    expect(row.p1IsaDrawdown).toBe(0);
    expect(row.p1GiaDrawdown).toBe(0);
  });
});
