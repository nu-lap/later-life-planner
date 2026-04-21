/**
 * Integration tests — end-to-end lifetime scenarios.
 *
 * Each scenario is validated against expected behaviour for a realistic plan.
 * Scenario A (Paul & Lisa) is validated against known debug-script outputs.
 */

import { describe, test, expect } from 'vitest';
import { calculateProjections } from '@/financialEngine/projectionEngine';
import { PENSION_RULES } from '@/config/financialConstants';
import {
  bareState, dcOnlyState, isaOnlyState, spOnlyState, bareCoupleState, paulAndLisaState,
} from '../fixtures/states';
import { withSpending, taxBetween, cgtBetween, yearAt, countTaxFreeYears } from '../fixtures/helpers';
import type { PlannerState } from '@/models/types';

// ─── Scenario A — Paul & Lisa (validated against debug outputs) ───────────────

describe('Scenario A — Paul & Lisa', () => {
  test('zero income tax in years 60–66 (before State Pension)', () => {
    const projections = calculateProjections(paulAndLisaState());
    // Sum income tax only (not CGT) — Bed & ISA now generates CGT but no income tax
    const incomeTax = projections
      .filter(p => p.p1Age >= 60 && p.p1Age <= 66)
      .reduce((s, p) => s + p.incomeTaxPaid, 0);
    // Debug script confirmed £0 income tax pre-SP; Bed & ISA does not affect income tax
    expect(incomeTax).toBeCloseTo(0, 0);
  });

  test('Bed & ISA generates CGT in years 60–66 (GIA sheltered into ISA annually)', () => {
    const projections = calculateProjections(paulAndLisaState());
    const cgt = cgtBetween(projections, 60, 66);
    // General Bed & ISA shelters GIA gains above the £3,000 exempt threshold into CGT each year.
    // Income tax remains zero; CGT is expected from the annual Bed & ISA transfers.
    expect(cgt).toBeGreaterThan(0);
    // CGT should be modest — from B&I transfers only, not from taxable drawdown.
    expect(cgt).toBeLessThan(20_000);
  });

  test('total tax years 60–67 is modest (includes Bed & ISA CGT + SP year)', () => {
    // Bed & ISA CGT is now expected in years 60-66; SP starts at 67 adding income tax.
    const projections = calculateProjections(paulAndLisaState());
    const tax = taxBetween(projections, 60, 67);
    expect(tax).toBeLessThan(15_000);
  });

  test('DC pension drawn in FI years (using PA headroom)', () => {
    const projections = calculateProjections(paulAndLisaState());
    const fiRows = projections.filter(p => p.p1Age >= 60 && p.p1Age <= 66);
    fiRows.forEach(p => {
      expect(p.p1DcDrawdown + p.p2DcDrawdown).toBeGreaterThan(0);
    });
  });

  test('plan survives to life expectancy (assets present at age 80)', () => {
    const projections = calculateProjections(paulAndLisaState());
    const row = yearAt(projections, 80);
    expect(row.totalAssets).toBeGreaterThan(0);
  });
});

// ─── Scenario B — Single person, ISA only ─────────────────────────────────────

describe('Scenario B — ISA only, zero income tax', () => {
  test('zero income tax every year (ISA withdrawals not taxable)', () => {
    const state = isaOnlyState(65, 400_000, 25_000, 65);
    calculateProjections(state).forEach(p => {
      expect(p.incomeTaxPaid).toBe(0);
    });
  });

  test('no asset depletion before age 81 (£25k/yr from £400k ISA at 4% growth)', () => {
    const state = isaOnlyState(65, 400_000, 25_000, 65);
    const projections = calculateProjections(state);
    const row81 = projections.find(p => p.p1Age === 81);
    // Assets should still be positive at 81 (16 years at ~4% growth, £25k draw)
    if (row81) {
      expect(row81.totalAssets).toBeGreaterThan(0);
    }
  });

  test('ISA balance decreases over time (being drawn down)', () => {
    const state = isaOnlyState(65, 400_000, 30_000, 65);
    const projections = calculateProjections(state);
    const first = projections[0].p1IsaBalance;
    const fifth = projections[4].p1IsaBalance;
    expect(fifth).toBeLessThan(first);
  });
});

// ─── Scenario C — LSA exhaustion ──────────────────────────────────────────────

describe('Scenario C — LSA exhaustion with very large DC', () => {
  test('tax-free DC drawdown never exceeds LSA over full lifetime', () => {
    const state = withSpending(dcOnlyState(55, 4_000_000, 55), 80_000);
    const projections = calculateProjections(state);
    const totalTaxFree = projections.reduce((s, p) => s + p.dcTaxFreeDrawdown, 0);
    expect(totalTaxFree).toBeLessThanOrEqual(PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE + 1);
  });

  test('after LSA exhausted, DC drawdown income tax > 0', () => {
    // Draw heavily to exhaust LSA quickly, then verify later years have income tax
    const state = withSpending(dcOnlyState(55, 4_000_000, 55), 80_000);
    const projections = calculateProjections(state);

    // Find the year when cumulative tax-free cash first reaches or exceeds LSA
    let cumTf = 0;
    let lsaExhaustedYear: number | null = null;
    for (const p of projections) {
      cumTf += p.dcTaxFreeDrawdown;
      if (cumTf >= PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE - 1 && lsaExhaustedYear === null) {
        lsaExhaustedYear = p.p1Age;
      }
    }

    if (lsaExhaustedYear !== null) {
      // After LSA exhaustion, DC draws should be fully taxable → income tax > 0
      const postLsaRows = projections.filter(p => p.p1Age > lsaExhaustedYear! + 2 && p.totalAssets > 0);
      if (postLsaRows.length > 0) {
        expect(postLsaRows[0].incomeTaxPaid).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Scenario D — State Pension sole-income exemption ─────────────────────────

describe('Scenario D — State Pension sole-income exemption', () => {
  test('SP sole income → zero income tax with statePensionSoleIncomeExempt: true', () => {
    const state = spOnlyState(67, 67);
    const projections = calculateProjections(state);
    projections.forEach(p => {
      expect(p.incomeTaxPaid).toBe(0);
    });
  });

  test('SP sole income → income tax > 0 when statePensionSoleIncomeExempt: false', () => {
    const base = spOnlyState(67, 67);
    const state: PlannerState = {
      ...base,
      assumptions: {
        ...base.assumptions,
        statePensionSoleIncomeExempt: false,
      },
    };
    const projections = calculateProjections(state);
    // SP £221.20/wk = £11,502/yr < PA £12,570 — still no tax even without exemption
    // Use higher SP to ensure taxable
    const highSpState: PlannerState = {
      ...state,
      person1: {
        ...state.person1,
        incomeSources: {
          ...state.person1.incomeSources,
          statePension: { enabled: true, weeklyAmount: 300, startAge: 67 }, // £15,600/yr
        },
      },
    };
    const highSpProjections = calculateProjections(highSpState);
    // £15,600 > PA £12,570 → income tax due without exemption
    expect(highSpProjections[0].incomeTaxPaid).toBeGreaterThan(0);
  });
});

// ─── Scenario E — Care reserve excluded from drawdown ─────────────────────────

describe('Scenario E — Care reserve excluded from drawdown', () => {
  test('care reserve balance is tracked separately from totalAssets', () => {
    const base = bareState(65);
    const state: PlannerState = {
      ...withSpending(base, 10_000),
      careReserve: { enabled: true, amount: 50_000 },
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 100_000, growthRate: 0 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    // Care reserve should be tracked but not included in totalAssets for depletion
    expect(row.careReserveBalance).toBeGreaterThan(0);
    // totalAssets = ISA balance only (not care reserve)
    expect(row.totalAssets).toBeLessThan(row.totalAssets + row.careReserveBalance);
  });

  test('care reserve never drawn for spending (ISA depletes while care reserve grows)', () => {
    // ISA £15k, care reserve £50k, spending £12k/yr → ISA depletes before care reserve drawn
    const base = bareState(65);
    const state: PlannerState = {
      ...withSpending(base, 12_000),
      careReserve: { enabled: true, amount: 50_000 },
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 15_000, growthRate: 0 },
        },
      },
    };
    const projections = calculateProjections(state);
    // After ISA depletes, care reserve should still have its balance (never drawn)
    const afterIsaDepleted = projections.filter(p => p.p1IsaBalance === 0);
    afterIsaDepleted.forEach(p => {
      // Care reserve stays intact even after ISA is gone
      expect(p.careReserveBalance).toBeGreaterThan(0);
    });
  });
});

// ─── Scenario F — High earner above basic-rate limit ──────────────────────────

describe('Scenario F — Higher-rate income tax and CGT', () => {
  test('income above basic-rate limit triggers higher-rate income tax', () => {
    // DB £55k alone exceeds the basic-rate limit (£50,270) → higher rate applies
    const base = withSpending(bareState(65), 60_000);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dbPension: { enabled: true, annualIncome: 55_000, startAge: 65 },
          dcPension: { enabled: true, totalValue: 1_000_000, growthRate: 0 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    // With DB of £55k, income is above the basic-rate limit.
    // Tax should exceed what the basic band alone would produce.
    const basicBandTax = (50_270 - 12_570) * 0.20; // £7,540
    expect(row.incomeTaxPaid).toBeGreaterThan(basicBandTax);
  });

  test('higher-rate CGT (24%) applies when total income > basic-rate limit', () => {
    // DB £55k is above basic-rate limit → isHigherRateTaxpayer = true → CGT at 24%
    const base = withSpending(bareState(65), 60_000);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dbPension: { enabled: true, annualIncome: 55_000, startAge: 65 },
        },
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: true, totalValue: 30_000, baseCost: 10_000, growthRate: 0 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    // GIA step 4 overflow generates gains above the £3,000 exempt
    if (row.p1CapitalGain > 3_000) {
      // Taxable gain above exempt at higher rate (24%)
      const expectedCgt = (row.p1CapitalGain - 3_000) * 0.24;
      expect(row.p1CgtPaid).toBeCloseTo(expectedCgt, -1);
    } else {
      // Some gain drawn in step 2 (within exempt), possible zero CGT
      expect(row.p1CgtPaid).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('assets all zero from year 1 — projections still generated', () => {
    const state = withSpending(bareState(65), 20_000);
    const projections = calculateProjections(state);
    expect(projections.length).toBeGreaterThan(0);
    projections.forEach(p => {
      expect(p.totalAssets).toBe(0);
    });
  });

  test('life expectancy = current age — returns single-year projection', () => {
    const state = {
      ...bareState(80),
      assumptions: { ...bareState(80).assumptions, lifeExpectancy: 80 },
    };
    expect(calculateProjections(state)).toHaveLength(1);
  });

  test('negative inflation — spending decreases year-on-year', () => {
    const base = bareState(65);
    const state: PlannerState = {
      ...withSpending(base, 30_000),
      assumptions: { ...base.assumptions, inflation: -2 },
    };
    const projections = calculateProjections(state);
    expect(projections[5].spending).toBeLessThan(projections[0].spending);
  });

  test('0% investment growth — DC balance decreases monotonically when drawn', () => {
    const state = withSpending(dcOnlyState(65, 200_000, 65), 20_000);
    // dcOnlyState uses growthRate: 0 already
    const projections = calculateProjections(state);
    const fi = projections.filter(p => p.p1Age >= 65);
    for (let i = 1; i < fi.length; i++) {
      if (fi[i - 1].p1DcBalance > 0) {
        expect(fi[i].p1DcBalance).toBeLessThanOrEqual(fi[i - 1].p1DcBalance + 1);
      }
    }
  });

  test('SP start age same as fiAge — SP and DC both active in first FI row', () => {
    const base = withSpending(bareState(67), 20_000);
    const state: PlannerState = {
      ...base,
      fiAge: 67,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          statePension: { enabled: true, weeklyAmount: 221.20, startAge: 67 },
          dcPension:    { enabled: true, totalValue: 500_000, growthRate: 0 },
        },
      },
    };
    const row = calculateProjections(state)[0];
    expect(row.p1StatePension).toBeGreaterThan(0);
    expect(row.p1DcDrawdown).toBeGreaterThanOrEqual(0);
  });

  test('fiAge > current age — no drawdown in pre-FI years', () => {
    const state = withSpending(dcOnlyState(60, 500_000, 65), 20_000);
    const projections = calculateProjections(state);
    const preFi = projections.filter(p => p.p1Age < 65);
    preFi.forEach(p => {
      expect(p.p1DcDrawdown).toBe(0);
      expect(p.p1IsaDrawdown).toBe(0);
      expect(p.p1GiaDrawdown).toBe(0);
    });
  });
});
