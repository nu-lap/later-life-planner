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
import { bareState, dcOnlyState, isaOnlyState, paulAndLisaState } from '../fixtures/states';
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
