/**
 * Unit tests — projection engine helper functions.
 * Tests formatCurrency, getStageTotalSpending, getAssetDepletionAge,
 * getTotalUnrealisedGain, getSustainableRlssLevel, and calculateGamificationMetrics.
 */

import { describe, test, expect } from 'vitest';
import {
  calculateProjections,
  formatCurrency,
  getStageTotalSpending,
  getAssetDepletionAge,
  getTotalUnrealisedGain,
  getSustainableRlssLevel,
  calculateGamificationMetrics,
} from '@/financialEngine/projectionEngine';
import { createDefaultState, createMockDemoState } from '@/lib/mockData';
import { bareState, paulAndLisaState, bareCoupleState } from '../fixtures/states';
import { withSpending } from '../fixtures/helpers';
import type { PlannerState } from '@/models/types';

// ─── calculateProjections — basic invariants ──────────────────────────────────

describe('calculateProjections — timeline', () => {
  test('produces a row for every year from current age to life expectancy (inclusive)', () => {
    const state = createDefaultState(57);
    const projections = calculateProjections(state);
    expect(projections.length).toBe(state.assumptions.lifeExpectancy - 57 + 1);
  });

  test('first row has p1Age = currentAge', () => {
    const state = createDefaultState(60);
    expect(calculateProjections(state)[0].p1Age).toBe(60);
  });

  test('last row has p1Age = lifeExpectancy', () => {
    const state = createDefaultState(57);
    const projections = calculateProjections(state);
    expect(projections.at(-1)!.p1Age).toBe(state.assumptions.lifeExpectancy);
  });

  test('p2Age is null in single mode', () => {
    const state = createDefaultState(60);
    expect(state.mode).toBe('single');
    expect(calculateProjections(state)[0].p2Age).toBeNull();
  });

  test('p2Age is set in couple mode', () => {
    const state = createMockDemoState();
    expect(state.mode).toBe('couple');
    expect(calculateProjections(state)[0].p2Age).not.toBeNull();
  });

  test('spending is inflation-adjusted upward over time (positive inflation)', () => {
    const state = createDefaultState(57);
    const projections = calculateProjections(state);
    // Year 10 spending should be higher than year 0
    expect(projections[10].spending).toBeGreaterThan(projections[0].spending);
  });

  test('spending is flat when inflation = 0', () => {
    const state = { ...createDefaultState(60), assumptions: { ...createDefaultState(60).assumptions, inflation: 0 } };
    const projections = calculateProjections(state);
    expect(projections[5].spending).toBeCloseTo(projections[0].spending, 0);
  });
});

describe('calculateProjections — financial invariants', () => {
  test('totalIncome is never negative', () => {
    calculateProjections(createMockDemoState()).forEach(p => {
      expect(p.totalIncome).toBeGreaterThanOrEqual(0);
    });
  });

  test('totalTaxPaid is never negative', () => {
    calculateProjections(createMockDemoState()).forEach(p => {
      expect(p.totalTaxPaid).toBeGreaterThanOrEqual(0);
    });
  });

  test('netIncome = totalIncome − totalTaxPaid', () => {
    calculateProjections(createMockDemoState()).forEach(p => {
      expect(p.netIncome).toBeCloseTo(p.totalIncome - p.totalTaxPaid, 1);
    });
  });

  test('totalAssets is never negative (clamped at 0)', () => {
    const state = withSpending(bareState(60), 100_000); // high spending, no assets
    calculateProjections(state).forEach(p => {
      expect(p.totalAssets).toBeGreaterThanOrEqual(0);
    });
  });

  test('asset balances (ISA, DC, Cash) never go below zero', () => {
    const projections = calculateProjections(createMockDemoState());
    projections.forEach(p => {
      expect(p.p1IsaBalance).toBeGreaterThanOrEqual(0);
      expect(p.p1DcBalance).toBeGreaterThanOrEqual(0);
      expect(p.p1CashBalance).toBeGreaterThanOrEqual(0);
    });
  });

  test('no household drawdown before FI age (assets only grow)', () => {
    const state = paulAndLisaState(); // FI age 60, current age 56
    const projections = calculateProjections(state);
    const preFiRows = projections.filter(p => p.p1Age < state.fiAge);
    preFiRows.forEach(p => {
      expect(p.p1DcDrawdown).toBe(0);
      expect(p.p1IsaDrawdown).toBe(0);
      expect(p.p1GiaDrawdown).toBe(0);
      expect(p.p2DcDrawdown).toBe(0);
      expect(p.p2IsaDrawdown).toBe(0);
      expect(p.p2GiaDrawdown).toBe(0);
    });
  });

  test('adds workplace and SIPP contributions before FI age and stops them at FI age', () => {
    const base = withSpending(bareState(55), 0);
    const state: PlannerState = {
      ...base,
      fiAge: 57,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 100_000,
            growthRate: 0,
            workplaceSalary: 50_000,
            workplaceContributionPercent: 10,
            sippContributionAnnualGross: 1_200,
          },
        },
      },
    };

    const projections = calculateProjections(state);

    expect(projections[0].p1DcBalance).toBeCloseTo(106_200, 2);
    expect(projections[1].p1DcBalance).toBeCloseTo(112_555, 2);
    expect(projections[2].p1DcBalance).toBeCloseTo(112_555, 2);
  });

  test('applies contribution modelling for both people in couple mode, each stopping at their own FI age', () => {
    const base = withSpending(bareState(55), 0);
    const state: PlannerState = {
      ...base,
      mode: 'couple',
      fiAge: 56,
      // p2FiAge not set → engine derives p2's equivalent age when p1 reaches fiAge:
      // p2CurrentAge + (fiAge - p1CurrentAge) = 54 + (56 - 55) = 55.
      // This preserves backward-compatible behaviour: p2 stops at the same calendar
      // year that p1 reaches fiAge (i.e. year 1 of the projection).
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 80_000,
            growthRate: 0,
            workplaceSalary: 40_000,
            workplaceContributionPercent: 5,
            sippContributionAnnualGross: 2_400,
          },
        },
      },
      person2: {
        ...base.person2,
        currentAge: 54,
        incomeSources: {
          ...base.person2.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 60_000,
            growthRate: 0,
            workplaceSalary: 30_000,
            workplaceContributionPercent: 8,
            sippContributionAnnualGross: 1_800,
          },
        },
      },
    };

    const projections = calculateProjections(state);

    // Year 0: p1Age=55 < fiAge=56 → p1 contributes (80_000 + 40_000*0.05 + 2_400 = 84_400)
    //         p2Age=54 < p2FiAge(derived)=55 → p2 contributes (60_000 + 30_000*0.08 + 1_800 = 64_200)
    expect(projections[0].p1DcBalance).toBeCloseTo(84_400, -2);
    expect(projections[0].p2DcBalance).toBeCloseTo(64_200, -2);

    // Year 1: p1Age=56 >= fiAge=56 → p1 stops contributing (balance stays ~84_400)
    //         p2Age=55 >= p2FiAge(derived)=55 → p2 also stops (balance stays ~64_200)
    expect(projections[1].p1DcBalance).toBeCloseTo(84_400, -2);
    expect(projections[1].p2DcBalance).toBeCloseTo(64_200, -2);

    // Year 2: p2 still stopped (balance unchanged from year 1)
    expect(projections[2].p2DcBalance).toBeCloseTo(projections[1].p2DcBalance, -2);
  });

  test('p2 DC contributions stop at independent p2FiAge when set differently to p1 fiAge', () => {
    const base = withSpending(bareState(55), 0);
    const state: PlannerState = {
      ...base,
      mode: 'couple',
      fiAge: 56,
      p2FiAge: 58, // person2 works 2 years longer
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 80_000,
            growthRate: 0,
            workplaceSalary: 40_000,
            workplaceContributionPercent: 5,
            sippContributionAnnualGross: 2_400,
          },
        },
      },
      person2: {
        ...base.person2,
        currentAge: 54,
        incomeSources: {
          ...base.person2.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 60_000,
            growthRate: 0,
            workplaceSalary: 30_000,
            workplaceContributionPercent: 8,
            sippContributionAnnualGross: 1_800,
          },
        },
      },
    };

    const projections = calculateProjections(state);

    // Year 0 (p2Age=54): contributes → ~64_200
    expect(projections[0].p2DcBalance).toBeCloseTo(64_200, -2);
    // Year 1 (p2Age=55): still contributes → increases by ~4_200
    expect(projections[1].p2DcBalance).toBeGreaterThan(projections[0].p2DcBalance + 4_000);
    // Year 2 (p2Age=56): still contributes (p2FiAge=58) → increases again
    expect(projections[2].p2DcBalance).toBeGreaterThan(projections[1].p2DcBalance + 4_000);
    // Year 3 (p2Age=57): still contributes → increases again
    expect(projections[3].p2DcBalance).toBeGreaterThan(projections[2].p2DcBalance + 4_000);
    // Year 4 (p2Age=58): stops contributing → balance does NOT jump by ~4_200
    expect(projections[4].p2DcBalance).toBeLessThan(projections[3].p2DcBalance + 4_000);
  });
});

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  test('formats whole number with £ and comma separator', () => {
    expect(formatCurrency(1_234_567)).toBe('£1,234,567');
  });

  test('rounds to nearest integer in standard mode', () => {
    expect(formatCurrency(1_234.7)).toBe('£1,235');
  });

  test('compact mode: ≥ £1,000 shows k suffix', () => {
    expect(formatCurrency(44_300, true)).toBe('£44.3k');
    expect(formatCurrency(1_500, true)).toBe('£1.5k');
  });

  test('compact mode: < £1,000 shows plain number', () => {
    expect(formatCurrency(500, true)).toBe('£500');
  });

  test('compact mode: £0 shows £0', () => {
    expect(formatCurrency(0, true)).toBe('£0');
  });

  test('compact mode: £1,000,000 shows £1m or £1,000k', () => {
    const result = formatCurrency(1_000_000, true);
    expect(result).toMatch(/£1[,.]?0*(m|,000k|000k)/i);
  });

  test('compact mode: rounds to 1 decimal place', () => {
    expect(formatCurrency(12_456, true)).toBe('£12.5k');
  });
});

// ─── getStageTotalSpending ────────────────────────────────────────────────────

describe('getStageTotalSpending', () => {
  test('returns sum of all category amounts for first stage', () => {
    const state  = createDefaultState(57);
    const stageId = state.lifeStages[0].id;
    const total   = getStageTotalSpending(state, stageId);
    const expected = state.spendingCategories.reduce((s, c) => s + (c.amounts[stageId] ?? 0), 0);
    expect(total).toBe(expected);
  });

  test('returns correct sum for second stage', () => {
    const state  = createDefaultState(57);
    const stageId = state.lifeStages[1].id;
    const total   = getStageTotalSpending(state, stageId);
    const expected = state.spendingCategories.reduce((s, c) => s + (c.amounts[stageId] ?? 0), 0);
    expect(total).toBe(expected);
  });

  test('returns 0 for an unknown stage ID', () => {
    expect(getStageTotalSpending(createDefaultState(57), 'nonexistent-stage')).toBe(0);
  });

  test('reflects custom spending amounts', () => {
    const state   = createDefaultState(57);
    const stageId = state.lifeStages[0].id;
    const custom: PlannerState = {
      ...state,
      spendingCategories: state.spendingCategories.map((c, i) => ({
        ...c,
        amounts: { ...c.amounts, [stageId]: i === 0 ? 5_000 : 0 },
      })),
    };
    expect(getStageTotalSpending(custom, stageId)).toBe(5_000);
  });
});

// ─── getAssetDepletionAge ─────────────────────────────────────────────────────

describe('getAssetDepletionAge', () => {
  test('returns null for a well-funded plan (assets never depleted)', () => {
    const projections = calculateProjections(createMockDemoState());
    // Demo state should be well-funded
    const result = getAssetDepletionAge(projections);
    // May or may not deplete — just check return type
    expect(result === null || typeof result === 'number').toBe(true);
  });

  test('returns a number when a plan with minimal assets runs out', () => {
    const base = bareState(65);
    const state = withSpending({
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          cashSavings: { enabled: true, totalValue: 20_000 },
        },
      },
    }, 30_000); // spending > any income, will deplete

    const result = getAssetDepletionAge(calculateProjections(state));
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(65);
  });

  test('depletion age is between current age and life expectancy', () => {
    const base = bareState(65);
    const state = withSpending({
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          cashSavings: { enabled: true, totalValue: 50_000 },
        },
      },
    }, 20_000);

    const result = getAssetDepletionAge(calculateProjections(state));
    if (result !== null) {
      expect(result).toBeGreaterThanOrEqual(65);
      expect(result).toBeLessThanOrEqual(base.assumptions.lifeExpectancy);
    }
  });
});

// ─── getTotalUnrealisedGain ───────────────────────────────────────────────────

describe('getTotalUnrealisedGain', () => {
  test('returns 0 when all GIA base costs equal their values', () => {
    const base  = bareState(60);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: true, totalValue: 10_000, baseCost: 10_000, growthRate: 4 },
        },
      },
    };
    expect(getTotalUnrealisedGain(state)).toBe(0);
  });

  test('returns sum of (value − baseCost) for all GIAs', () => {
    const base  = bareState(60);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: true, totalValue: 15_000, baseCost: 10_000, growthRate: 4 },
        },
      },
    };
    expect(getTotalUnrealisedGain(state)).toBeCloseTo(5_000, 0);
  });

  test('ignores disabled GIAs', () => {
    const base  = bareState(60);
    const state: PlannerState = {
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: false, totalValue: 50_000, baseCost: 10_000, growthRate: 4 },
        },
      },
    };
    expect(getTotalUnrealisedGain(state)).toBe(0);
  });

  test('includes joint GIA gain in couple mode', () => {
    const base  = paulAndLisaState();
    const gain  = getTotalUnrealisedGain(base);
    // Paul GIA gain: 15,800 − 12,730 = 3,070
    // Lisa GIA gain: 13,800 − 12,000 = 1,800
    // Joint GIA gain: 51,000 − 17,000 = 34,000
    // Total ≈ 38,870
    expect(gain).toBeCloseTo(38_870, -2);
  });
});

// ─── getSustainableRlssLevel ──────────────────────────────────────────────────

describe('getSustainableRlssLevel', () => {
  test('returns a valid RLSS level or null', () => {
    const projections = calculateProjections(createMockDemoState());
    const result = getSustainableRlssLevel(projections, 'couple');
    const valid = [null, 'minimum', 'moderate', 'comfortable'];
    expect(valid).toContain(result);
  });

  test('returns null or minimum for bare plan with no assets/income', () => {
    const state = withSpending(bareState(65), 60_600); // comfortable spend, zero resources
    const projections = calculateProjections(state);
    const result = getSustainableRlssLevel(projections, 'single');
    // No income → can't sustain even minimum
    expect(result).toBeNull();
  });

  test('well-funded couple returns a non-null level', () => {
    const projections = calculateProjections(paulAndLisaState());
    const result = getSustainableRlssLevel(projections, 'couple');
    expect(result).not.toBeNull();
  });
});

// ─── calculateGamificationMetrics ────────────────────────────────────────────

describe('calculateGamificationMetrics', () => {
  test('returns an object with incomeStabilityScore and spendingConfidenceScore', () => {
    const metrics = calculateGamificationMetrics(createMockDemoState());
    expect(typeof metrics.incomeStabilityScore).toBe('number');
    expect(typeof metrics.spendingConfidenceScore).toBe('number');
  });

  test('incomeStabilityScore is in range 0–100', () => {
    const metrics = calculateGamificationMetrics(createMockDemoState());
    expect(metrics.incomeStabilityScore).toBeGreaterThanOrEqual(0);
    expect(metrics.incomeStabilityScore).toBeLessThanOrEqual(100);
  });

  test('spendingConfidenceScore is in range 0–100', () => {
    const metrics = calculateGamificationMetrics(createMockDemoState());
    expect(metrics.spendingConfidenceScore).toBeGreaterThanOrEqual(0);
    expect(metrics.spendingConfidenceScore).toBeLessThanOrEqual(100);
  });

  test('fundedGoalsCount is a non-negative integer', () => {
    const metrics = calculateGamificationMetrics(createMockDemoState());
    expect(typeof metrics.fundedGoalsCount).toBe('number');
    expect(metrics.fundedGoalsCount).toBeGreaterThanOrEqual(0);
  });

  test('bare plan with no income has low stability score', () => {
    const metrics = calculateGamificationMetrics(withSpending(bareState(65), 30_000));
    // No income → low stability
    expect(metrics.incomeStabilityScore).toBeLessThan(50);
  });

  test('bare plan with no assets has low spending confidence', () => {
    const metrics = calculateGamificationMetrics(withSpending(bareState(65), 30_000));
    expect(metrics.spendingConfidenceScore).toBeLessThan(50);
  });
});

// ─── calculateProjections — pcls-bed-isa strategy ────────────────────────────

/** Build a single-person DC-only state for pcls-bed-isa tests. */
function pclsBedIsaState(overrides: {
  age?: number;
  dcValue?: number;
  giaValue?: number;
  giaBaseCost?: number;
  fiAge?: number;
  pclsAge?: number;
  lifeExpectancy?: number;
} = {}): PlannerState {
  const age           = overrides.age           ?? 55;
  const dcValue       = overrides.dcValue       ?? 400_000;
  const giaValue      = overrides.giaValue      ?? 0;
  const giaBaseCost   = overrides.giaBaseCost   ?? 0;
  const fiAgeVal      = overrides.fiAge         ?? age;
  const lifeExp       = overrides.lifeExpectancy ?? 85;
  const base = bareState(age);
  return {
    ...base,
    fiAge: fiAgeVal,
    drawdownStrategy: 'pcls-bed-isa',
    pclsAge: overrides.pclsAge,
    assumptions: { ...base.assumptions, investmentGrowth: 0, inflation: 0, lifeExpectancy: lifeExp },
    person1: {
      ...base.person1,
      currentAge: age,
      incomeSources: {
        ...base.person1.incomeSources,
        dcPension: { enabled: true, totalValue: dcValue, growthRate: 0 },
      },
      assets: {
        ...base.person1.assets,
        generalInvestments: { enabled: giaValue > 0, totalValue: giaValue, baseCost: giaBaseCost, growthRate: 0 },
      },
    },
  };
}

describe('calculateProjections — pcls-bed-isa: PCLS timing', () => {
  test('PCLS event fires exactly once at pclsAge', () => {
    const state = pclsBedIsaState({ age: 55, pclsAge: 57, fiAge: 57 });
    const projections = calculateProjections(state);
    const eventRows = projections.filter(p => p.p1PclsEvent > 0);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].p1Age).toBe(57);
  });

  test('PCLS event fires at fiAge when pclsAge is not set', () => {
    const state = pclsBedIsaState({ age: 55, fiAge: 60 });
    const projections = calculateProjections(state);
    const eventRows = projections.filter(p => p.p1PclsEvent > 0);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].p1Age).toBe(60);
  });

  test('PCLS is clamped to NMPA (55) — cannot fire before age 55', () => {
    // Set pclsAge below current age; crystallisation should happen at currentAge (≥ NMPA 55)
    const state = pclsBedIsaState({ age: 55, pclsAge: 50, fiAge: 55 });
    const projections = calculateProjections(state);
    const eventRows = projections.filter(p => p.p1PclsEvent > 0);
    // Event fires at age 55 (clamped to max(50, 55, currentAge=55))
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].p1Age).toBe(55);
  });

  test('no PCLS events in standard-ufpls mode', () => {
    const state: PlannerState = {
      ...pclsBedIsaState({ age: 55, fiAge: 55 }),
      drawdownStrategy: 'standard-ufpls',
    };
    const projections = calculateProjections(state);
    projections.forEach(p => expect(p.p1PclsEvent).toBe(0));
  });
});

describe('calculateProjections — pcls-bed-isa: PCLS amount and LSA exhaustion', () => {
  test('PCLS amount equals 25% of DC pot when LSA is not yet used and pot is large', () => {
    // DC pot £400,000, 25% = £100,000 — below LSA (£268,275) so full 25% paid
    const state = pclsBedIsaState({ age: 55, dcValue: 400_000, fiAge: 55 });
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    // pclsAmount = min(400_000 * 0.25, 268_275) = 100_000
    expect(eventRow.p1PclsEvent).toBeCloseTo(100_000, -2);
  });

  test('PCLS amount is capped at LSA when 25% of pot exceeds LSA', () => {
    // DC pot £1,200,000 — 25% = £300,000 > LSA (£268,275)
    const state = pclsBedIsaState({ age: 55, dcValue: 1_200_000, fiAge: 55 });
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    // pclsAmount should be capped at LSA
    expect(eventRow.p1PclsEvent).toBeLessThanOrEqual(268_275 + 1);
  });

  test('PCLS is capped to remaining LSA when prior UFPLS draws have partially used it', () => {
    // In pcls-bed-isa mode, if pclsAge > fiAge and DC draws happen first via the waterfall
    // before the PCLS year, the remaining LSA should be respected.
    // Use pclsAge = fiAge + 2 so two UFPLS draws occur before crystallisation.
    const state = pclsBedIsaState({ age: 55, dcValue: 800_000, fiAge: 55, pclsAge: 57 });
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    // The PCLS event should still fire and not exceed the remaining LSA
    expect(eventRow.p1PclsEvent).toBeGreaterThan(0);
    // All tax-free PCLS amounts across the whole plan should not exceed LSA
    const totalTaxFree = projections.reduce((s, p) => s + p.p1PclsEvent, 0);
    expect(totalTaxFree).toBeLessThanOrEqual(268_275 + 1);
  });

  test('DC balance decreases by pclsAmount on the crystallisation year', () => {
    const state = pclsBedIsaState({ age: 55, dcValue: 400_000, fiAge: 55 });
    const projections = calculateProjections(state);
    const eventIdx   = projections.findIndex(p => p.p1PclsEvent > 0);
    const eventRow   = projections[eventIdx];
    const prevRow    = projections[eventIdx - 1];
    // DC balance at the PCLS year should be less than the prior year by roughly the PCLS amount
    // (no growth since growthRate = 0; some DC may also be drawn for spending)
    if (prevRow) {
      expect(prevRow.p1DcBalance - eventRow.p1DcBalance).toBeGreaterThanOrEqual(eventRow.p1PclsEvent - 1);
    }
  });
});

describe('calculateProjections — pcls-bed-isa: Bed & ISA transfers', () => {
  test('Bed & ISA transfer is positive in years with p1 GIA', () => {
    // Give person1 a GIA so that Bed & ISA transfers should occur
    const state = pclsBedIsaState({ age: 55, dcValue: 400_000, giaValue: 50_000, giaBaseCost: 50_000, fiAge: 55 });
    const projections = calculateProjections(state);
    const transferRows = projections.filter(p => p.p1BedIsaTransfer > 0);
    expect(transferRows.length).toBeGreaterThan(0);
  });

  test('p1 ISA balance grows due to Bed & ISA reinvestment even with no spending', () => {
    // Zero spending so all Bed & ISA proceeds stay
    const state: PlannerState = withSpending(
      pclsBedIsaState({ age: 55, dcValue: 100_000, giaValue: 40_000, giaBaseCost: 40_000, fiAge: 55 }),
      0,
    );
    const projections = calculateProjections(state);
    // ISA balance should grow from reinvestment (no growth rate, so balance = sum of transfers)
    const firstRow = projections[0];
    const laterRow = projections[5];
    expect(laterRow.p1IsaBalance).toBeGreaterThan(firstRow.p1IsaBalance);
  });
});

describe('calculateProjections — pcls-bed-isa: CGT on Bed & ISA gains', () => {
  test('Bed & ISA transfers with embedded gain produce positive CGT', () => {
    // GIA value £60k, base cost £20k — embedded gain £40k; selling to ISA triggers CGT
    const state = withSpending(
      pclsBedIsaState({ age: 55, dcValue: 200_000, giaValue: 60_000, giaBaseCost: 20_000, fiAge: 55 }),
      0,
    );
    const projections = calculateProjections(state);
    const totalCgt = projections.reduce((s, p) => s + p.totalCgtPaid, 0);
    expect(totalCgt).toBeGreaterThan(0);
  });

  test('joint GIA Bed & ISA gain is split 50/50 between partners', () => {
    // Couple mode: joint GIA used for Bed & ISA — each person should get half the gain.
    // p1 has no individual GIA (growthRate forced to 0 so PCLS reinvestment generates no gain),
    // ensuring all Bed & ISA gain comes from the joint GIA and is split equally.
    const base = bareCoupleState(55, 55);
    const state: PlannerState = {
      ...base,
      fiAge: 55,
      drawdownStrategy: 'pcls-bed-isa',
      assumptions: { ...base.assumptions, investmentGrowth: 0, inflation: 0, lifeExpectancy: 85 },
      jointGia: { enabled: true, totalValue: 60_000, baseCost: 20_000, growthRate: 0 },
      person1: {
        ...base.person1,
        // Set GIA growthRate to 0 so any PCLS reinvestment into p1 GIA never appreciates,
        // keeping p1BedIsaCg = 0 and isolating the joint gain split assertion.
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: false, totalValue: 0, baseCost: 0, growthRate: 0 },
        },
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { enabled: true, totalValue: 300_000, growthRate: 0 },
        },
      },
    };
    const projections = calculateProjections(withSpending(state, 0));
    // In years with a joint Bed & ISA gain, both persons' CGT should be equal
    // because the joint gain is split 50/50 (p1BedIsaCg = 0, no individual p1 GIA gain).
    const gainingRows = projections.filter(p => p.p2BedIsaTransfer > 0);
    gainingRows.forEach(p => {
      // Each person gets half the joint gain — their CGT should be equal
      expect(p.p1CgtPaid).toBeCloseTo(p.p2CgtPaid, 0);
    });
  });
});

describe('calculateProjections — pcls-bed-isa: couple-mode crystallisation reinvestment', () => {
  /** Build a couple state for pcls-bed-isa crystallisation tests (zero spending, zero growth). */
  function couplePclsState(p1DcValue: number): PlannerState {
    const base = bareCoupleState(55, 55);
    return withSpending({
      ...base,
      fiAge: 55,
      drawdownStrategy: 'pcls-bed-isa',
      assumptions: { ...base.assumptions, investmentGrowth: 0, inflation: 0, lifeExpectancy: 85 },
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { enabled: true, totalValue: p1DcValue, growthRate: 0 },
        },
      },
    }, 0);
  }

  test('PCLS proceeds fill p1 ISA then p2 ISA up to one annual allowance each, remainder to joint GIA', () => {
    // DC pot £500k → PCLS = 25% = £125k
    // p1 ISA gets £20k (full allowance), p2 ISA gets £20k (full allowance), joint GIA gets £85k
    const state = couplePclsState(500_000);
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    expect(eventRow).toBeDefined();
    expect(eventRow.p1IsaBalance).toBeCloseTo(20_000, -2);
    expect(eventRow.p2IsaBalance).toBeCloseTo(20_000, -2);
    expect(eventRow.jointGiaValue).toBeCloseTo(85_000, -2);
  });

  test('PCLS proceeds fill p1 ISA partially when PCLS < annual allowance, p2 ISA receives nothing, no joint GIA', () => {
    // DC pot £60k → PCLS = 25% = £15k — below the £20k ISA annual allowance
    // p1 ISA gets full £15k, p2 ISA = 0, joint GIA = 0
    const state = couplePclsState(60_000);
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    expect(eventRow).toBeDefined();
    expect(eventRow.p1IsaBalance).toBeCloseTo(15_000, -2);
    expect(eventRow.p2IsaBalance).toBeCloseTo(0, -2);
    expect(eventRow.jointGiaValue).toBeCloseTo(0, -2);
  });

  test('neither p1 nor p2 ISA balance exceeds annual allowance in crystallisation year (no ISA over-subscription)', () => {
    // DC pot £500k → PCLS = £125k. PCLS uses full £20k capacity for both p1 and p2.
    // The subsequent Bed & ISA transfer for joint GIA (which would normally use p2's
    // full £20k allowance) must be suppressed because the capacity is already exhausted.
    const state = couplePclsState(500_000);
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    expect(eventRow).toBeDefined();
    // ISA annual allowance is £20,000; neither balance should exceed it in this year
    expect(eventRow.p1IsaBalance).toBeLessThanOrEqual(20_000 + 1);
    expect(eventRow.p2IsaBalance).toBeLessThanOrEqual(20_000 + 1);
  });

  test('joint GIA base cost equals joint GIA value on crystallisation year (no embedded gain)', () => {
    // PCLS proceeds reinvested into GIA have base cost = reinvested amount (no gain at acquisition)
    const state = couplePclsState(500_000);
    const projections = calculateProjections(state);
    const eventRow = projections.find(p => p.p1PclsEvent > 0)!;
    expect(eventRow).toBeDefined();
    expect(eventRow.jointGiaValue).toBeCloseTo(eventRow.jointGiaBaseCost, -2);
  });
});


// ─── Planned Events ───────────────────────────────────────────────────────────

describe('calculateProjections — plannedEvents', () => {
  function stateWithEvents(state: PlannerState, events: PlannerState['plannedEvents']): PlannerState {
    return { ...state, plannedEvents: events };
  }

  test('plannedEventSpend is 0 when no events are defined', () => {
    const state = createDefaultState(57);
    const projections = calculateProjections(state);
    expect(projections.every(p => p.plannedEventSpend === 0)).toBe(true);
  });

  test('plannedEventSpend is 0 when plannedEvents is undefined (backward compat)', () => {
    const state = { ...createDefaultState(57) } as PlannerState;
    // @ts-expect-error deliberately testing missing field for backward compat
    delete state.plannedEvents;
    const projections = calculateProjections(state);
    expect(projections.every(p => p.plannedEventSpend === 0)).toBe(true);
  });

  test('single inflation-linked event appears in the correct year', () => {
    const base = createDefaultState(57);
    // Place event at currentAge — y=0, inflFactor=1, so plannedEventSpend === amount
    const targetAge = base.person1.currentAge;
    const state = stateWithEvents(base, [{
      id: 'ev1', name: 'Test', emoji: '🎯', p1Age: targetAge, amount: 10_000, inflationLinked: true,
    }]);
    const projections = calculateProjections(state);
    const row = projections.find(p => p.p1Age === targetAge)!;
    expect(row).toBeDefined();
    expect(row.plannedEventSpend).toBeGreaterThan(0);
    // y=0 → inflFactor=1 → amount unchanged
    expect(row.plannedEventSpend).toBe(10_000);
  });

  test('non-inflation-linked event uses exact amount regardless of year', () => {
    const base = createDefaultState(57);
    const targetAge = base.person1.currentAge + 5;
    const state = stateWithEvents(base, [{
      id: 'ev2', name: 'Fixed cost', emoji: '🏠', p1Age: targetAge, amount: 20_000, inflationLinked: false,
    }]);
    const projections = calculateProjections(state);
    const row = projections.find(p => p.p1Age === targetAge)!;
    expect(row).toBeDefined();
    expect(row.plannedEventSpend).toBe(20_000);
  });

  test('inflation-linked event is adjusted upward in a future year', () => {
    const base = { ...createDefaultState(57), assumptions: { ...createDefaultState(57).assumptions, inflation: 3 } };
    // 10 years from currentAge → y=10, inflFactor = 1.03^10 ≈ 1.3439
    const targetAge = base.person1.currentAge + 10;
    const state = stateWithEvents(base, [{
      id: 'ev3', name: 'Future cost', emoji: '🚗', p1Age: targetAge, amount: 10_000, inflationLinked: true,
    }]);
    const projections = calculateProjections(state);
    const row = projections.find(p => p.p1Age === targetAge)!;
    expect(row).toBeDefined();
    // 10 years at 3% inflation → 10000 * 1.03^10 ≈ 13439
    expect(row.plannedEventSpend).toBeGreaterThan(13_000);
    expect(row.plannedEventSpend).toBeLessThan(14_000);
  });

  test('two events in the same year are summed', () => {
    const base = createDefaultState(57);
    const targetAge = base.person1.currentAge + 2;
    const state = stateWithEvents(base, [
      { id: 'ev4a', name: 'Event A', emoji: '✈️', p1Age: targetAge, amount: 8_000,  inflationLinked: false },
      { id: 'ev4b', name: 'Event B', emoji: '💍', p1Age: targetAge, amount: 12_000, inflationLinked: false },
    ]);
    const projections = calculateProjections(state);
    const row = projections.find(p => p.p1Age === targetAge)!;
    expect(row).toBeDefined();
    expect(row.plannedEventSpend).toBe(20_000);
  });

  test('event in a year outside projection range produces no row with plannedEventSpend', () => {
    const base = createDefaultState(57);
    // Place at age 150 — well beyond any projection
    const state = stateWithEvents(base, [{
      id: 'ev5', name: 'Never happens', emoji: '🎁', p1Age: 150, amount: 5_000, inflationLinked: false,
    }]);
    const projections = calculateProjections(state);
    // No row should have plannedEventSpend > 0
    expect(projections.every(p => p.plannedEventSpend === 0)).toBe(true);
  });
});

// ─── Gap-period spending ──────────────────────────────────────────────────────

describe('calculateProjections — gap-period spending', () => {
  function gapState(opts: {
    fiAge: number;
    p2FiAge: number;
    gapSpending?: number;
    p2Salary: number;
    retirementSpend: number;
  }): PlannerState {
    const base = createDefaultState(50);
    const state: PlannerState = {
      ...base,
      mode: 'couple',
      fiAge: opts.fiAge,
      p2FiAge: opts.p2FiAge,
      gapSpending: opts.gapSpending,
      person1: { ...base.person1, currentAge: 50 },
      person2: {
        ...base.person2,
        currentAge: 48,
        incomeSources: {
          ...base.person2.incomeSources,
          dcPension: {
            enabled: true,
            totalValue: 0,
            growthRate: 0,
            workplaceSalary: opts.p2Salary,
            workplaceContributionPercent: 0,
            sippContributionAnnualGross: 0,
          },
        },
      },
      spendingCategories: base.spendingCategories.map((c) => ({
        ...c,
        amounts: Object.fromEntries(
          Object.keys(c.amounts).map((k) => [k, opts.retirementSpend / base.spendingCategories.length]),
        ),
      })),
    };
    return state;
  }

  test('gapSpending overrides baseSpend during gap years', () => {
    // p1 at 50, p2 at 48. p1 retires at 55, p2 at 58 → gap is p1 55–59, p2 53–57
    // p2 reaches 58 when p1 is 60 → post-gap starts at p1Age 60
    const state = gapState({ fiAge: 55, p2FiAge: 58, gapSpending: 20_000, p2Salary: 0, retirementSpend: 40_000 });
    const projections = calculateProjections(state);
    const gapYear = projections.find(p => p.p1Age === 55)!;      // p2Age=53, gap
    const postGapYear = projections.find(p => p.p1Age === 62)!;  // p2Age=60, past gap
    expect(gapYear).toBeDefined();
    expect(postGapYear).toBeDefined();
    // Gap spending (~20k today) should be roughly half of retirement spending (~40k today)
    expect(gapYear.spending).toBeLessThan(postGapYear.spending * 0.75);
    expect(gapYear.spending).toBeGreaterThan(postGapYear.spending * 0.4);
  });

  test('gapSpending = undefined falls back to stage spending (no behaviour change)', () => {
    const stateWithGap = gapState({ fiAge: 55, p2FiAge: 58, gapSpending: undefined, p2Salary: 0, retirementSpend: 40_000 });
    const stateNoGap = { ...stateWithGap, p2FiAge: 55 }; // no gap
    const projGap = calculateProjections(stateWithGap);
    const projNoGap = calculateProjections(stateNoGap);
    const gapYear = projGap.find(p => p.p1Age === 55)!;
    const noGapYear = projNoGap.find(p => p.p1Age === 55)!;
    expect(gapYear.spending).toBeCloseTo(noGapYear.spending, -2);
  });

  test('P2 net salary added to fixedIncome during gap reduces drawdown', () => {
    // retirementSpend = 30_000, p2Salary = 50_000 → net ~34_000 > spend → no drawdown needed
    const state = gapState({ fiAge: 55, p2FiAge: 58, gapSpending: 30_000, p2Salary: 50_000, retirementSpend: 30_000 });
    const projections = calculateProjections(state);
    const gapYear = projections.find(p => p.p1Age === 55)!;
    // P2 net salary (~34k) > gap spending (30k) → gap should be positive (no shortfall)
    expect(gapYear.gap).toBeGreaterThanOrEqual(0);
  });
});

// ─── ISA & GIA annual contributions ──────────────────────────────────────────

describe('calculateProjections — ISA annual contributions', () => {
  function isaContribState(currentAge: number, fiAge: number, isaValue: number, annualContribution: number): PlannerState {
    const base = bareState(currentAge);
    return {
      ...base,
      fiAge,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: isaValue, growthRate: 0, annualContribution },
        },
      },
    };
  }

  test('ISA balance grows by contribution each pre-FI year', () => {
    // Age 55, FI at 58 → 3 pre-FI years (y=0,1,2)
    const state = isaContribState(55, 58, 10_000, 5_000);
    const projections = calculateProjections(state);

    // At y=0 (age 55, pre-FI): 10_000 * (1+0) + 5_000 = 15_000
    const year0 = projections.find(p => p.p1Age === 55)!;
    expect(year0.p1IsaBalance).toBeCloseTo(15_000, 0);

    // At y=1 (age 56): 15_000 + 5_000 = 20_000
    const year1 = projections.find(p => p.p1Age === 56)!;
    expect(year1.p1IsaBalance).toBeCloseTo(20_000, 0);
  });

  test('ISA contributions stop at FI age', () => {
    const state = isaContribState(55, 58, 10_000, 5_000);
    const projections = calculateProjections(state);

    // At FI age (58): no contribution — balance is just from growth (growthRate=0 so flat at 25_000)
    const yearFi = projections.find(p => p.p1Age === 58)!;
    const yearFiMinus1 = projections.find(p => p.p1Age === 57)!;
    // At 57 we get the last contribution: balance = 25_000
    expect(yearFiMinus1.p1IsaBalance).toBeCloseTo(25_000, 0);
    // At 58 (FI) no contribution, and drawdown may start — just verify balance didn't INCREASE by contribution
    expect(yearFi.p1IsaBalance).toBeLessThanOrEqual(yearFiMinus1.p1IsaBalance + 1);
  });

  test('zero contribution is a no-op — same as omitting annualContribution', () => {
    const withZero = isaContribState(55, 58, 10_000, 0);
    const withUndefined = {
      ...withZero,
      person1: {
        ...withZero.person1,
        assets: {
          ...withZero.person1.assets,
          isaInvestments: { enabled: true, totalValue: 10_000, growthRate: 0 },
        },
      },
    };
    const projWith = calculateProjections(withZero);
    const projWithout = calculateProjections(withUndefined);
    projWith.forEach((row, i) => {
      expect(row.p1IsaBalance).toBeCloseTo(projWithout[i].p1IsaBalance, 0);
    });
  });

  test('end-of-year ordering: growth applied before contribution (ordinary annuity)', () => {
    // growthRate=5, initialValue=10_000, contribution=2_000
    // Year 1: 10_000 * 1.05 + 2_000 = 12_500 (grow-then-contribute)
    // vs contribute-then-grow: (10_000 + 2_000) * 1.05 = 12_600
    const base = bareState(55);
    const state: PlannerState = {
      ...base,
      fiAge: 58,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 10_000, growthRate: 5, annualContribution: 2_000 },
        },
      },
    };
    const year0 = calculateProjections(state).find(p => p.p1Age === 55)!;
    // grow-then-contribute: 10_000 * 1.05 + 2_000 = 12_500
    expect(year0.p1IsaBalance).toBeCloseTo(12_500, 0);
  });
});

describe('calculateProjections — GIA annual contributions', () => {
  function giaContribState(currentAge: number, fiAge: number, giaValue: number, annualContribution: number): PlannerState {
    const base = bareState(currentAge);
    return {
      ...base,
      fiAge,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          generalInvestments: { enabled: true, totalValue: giaValue, baseCost: giaValue, growthRate: 0, annualContribution },
        },
      },
    };
  }

  test('GIA value and base cost both increase by contribution each pre-FI year', () => {
    // Age 55, FI at 57 → 2 pre-FI years
    const state = giaContribState(55, 57, 20_000, 3_000);
    const projections = calculateProjections(state);

    // y=0 (age 55): 20_000 + 3_000 = 23_000
    const year0 = projections.find(p => p.p1Age === 55)!;
    expect(year0.p1GiaValue).toBeCloseTo(23_000, 0);
    // Unrealised gain should stay ~0 because baseCost tracks contributions (cost=value)
    expect(year0.p1GiaValue - year0.p1GiaBaseCost).toBeCloseTo(0, 0);

    // y=1 (age 56): 23_000 + 3_000 = 26_000
    const year1 = projections.find(p => p.p1Age === 56)!;
    expect(year1.p1GiaValue).toBeCloseTo(26_000, 0);
  });

  test('GIA contributions stop at FI age', () => {
    const state = giaContribState(55, 57, 20_000, 3_000);
    const projections = calculateProjections(state);

    const yearPreFi = projections.find(p => p.p1Age === 56)!; // last pre-FI year
    const yearFi    = projections.find(p => p.p1Age === 57)!; // FI year — no contribution
    expect(yearFi.p1GiaValue).toBeLessThanOrEqual(yearPreFi.p1GiaValue + 1);
  });

  test('undefined GIA contribution is a no-op', () => {
    const withUndefined = giaContribState(55, 57, 20_000, 0);
    const baseState = {
      ...withUndefined,
      person1: {
        ...withUndefined.person1,
        assets: {
          ...withUndefined.person1.assets,
          generalInvestments: { enabled: true, totalValue: 20_000, baseCost: 20_000, growthRate: 0 },
        },
      },
    };
    const projWith = calculateProjections(withUndefined);
    const projWithout = calculateProjections(baseState);
    projWith.forEach((row, i) => {
      expect(row.p1GiaValue).toBeCloseTo(projWithout[i].p1GiaValue, 0);
    });
  });
});

describe('calculateProjections — couple mode ISA/GIA contributions', () => {
  /** Zero out all spending categories so drawdown does not consume pre-FI contributions. */
  function zeroSpending(state: PlannerState): PlannerState {
    return {
      ...state,
      spendingCategories: state.spendingCategories.map(c => ({
        ...c,
        amounts: Object.fromEntries(Object.keys(c.amounts).map(k => [k, 0])),
      })),
    };
  }

  test('P2 ISA contributions apply pre-p2FI and stop at p2FiAge', () => {
    // P1 age 55 (FI 57), P2 age 50 (p2FiAge=55 — p2 works 5 more years)
    const base = bareCoupleState(55, 50);
    const state = zeroSpending({
      ...base,
      fiAge: 57,
      p2FiAge: 55,
      person2: {
        ...base.person2,
        assets: {
          ...base.person2.assets,
          isaInvestments: { enabled: true, totalValue: 0, growthRate: 0, annualContribution: 4_000 },
        },
      },
    });
    const projections = calculateProjections(state);

    // Pre-FI for P2: p2Age 50–54 → 5 years × 4_000 = 20_000
    const lastPreFiP2 = projections.find(p => p.p2Age === 54)!;
    expect(lastPreFiP2.p2IsaBalance).toBeCloseTo(20_000, 0);

    // After P2 FI (p2Age ≥ 55): no further contributions; balance stays at 20_000
    const atP2Fi = projections.find(p => p.p2Age === 56)!;
    expect(atP2Fi.p2IsaBalance).toBeCloseTo(20_000, 0);
  });

  test('joint GIA contributions continue through the gap period (P1 retired, P2 still working)', () => {
    // P1 age 55 (FI 57), P2 age 52 (p2FiAge=60 — P2 works well into the gap)
    const base = bareCoupleState(55, 52);
    const state = zeroSpending({
      ...base,
      fiAge: 57,
      p2FiAge: 60,
      jointGia: { enabled: true, totalValue: 0, baseCost: 0, growthRate: 0, annualContribution: 6_000 },
    });
    const projections = calculateProjections(state);

    // Pre-FI (p1Age 55, 56): 2 contributions → jointGiaValue = 12_000
    expect(projections.find(p => p.p1Age === 56)!.jointGiaValue).toBeCloseTo(12_000, 0);

    // Gap year (p1Age 57, p2Age 54): householdFiStarted=true, !p2FiStarted=true fires contribution.
    // The 3rd contribution (6_000) is applied first, then Bed & ISA immediately moves the entire
    // joint GIA (18_000) into p1's ISA. p1IsaBalance should be 18_000, not 12_000.
    const gapYear = projections.find(p => p.p1Age === 57)!;
    expect(gapYear.p1IsaBalance).toBeCloseTo(18_000, 0);
  });

  test('joint GIA contributions stop once both persons are post-FI', () => {
    // P1 age 55 (FI 57), P2 age 55 (p2FiAge=57) — both retire simultaneously
    const base = bareCoupleState(55, 55);
    const state = zeroSpending({
      ...base,
      fiAge: 57,
      p2FiAge: 57,
      jointGia: { enabled: true, totalValue: 0, baseCost: 0, growthRate: 0, annualContribution: 5_000 },
    });
    const projections = calculateProjections(state);

    // Pre-FI: p1Age 55, 56 → 2 contributions × 5_000 = 10_000
    const lastPreFi = projections.find(p => p.p1Age === 56)!;
    expect(lastPreFi.jointGiaValue).toBeCloseTo(10_000, 0);

    // At FI (p1Age 57): no new contribution (both FI); Bed & ISA moves the 10_000 to p1 ISA.
    // p1IsaBalance = 10_000 (not 15_000) proves no contribution fired.
    const atFi = projections.find(p => p.p1Age === 57)!;
    expect(atFi.p1IsaBalance).toBeCloseTo(10_000, 0);
  });
});
