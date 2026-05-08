import { describe, test, expect } from 'vitest';
import { calculateProjections } from '@/financialEngine/projectionEngine';
import { bareCoupleState } from '../fixtures/states';
import type { PlannerState } from '@/models/types';

function zeroSpending(state: PlannerState): PlannerState {
  return {
    ...state,
    spendingCategories: state.spendingCategories.map(c => ({
      ...c, amounts: Object.fromEntries(Object.keys(c.amounts).map(k => [k, 0])),
    })),
  };
}

describe('debug gap period', () => {
  test('joint GIA gap', () => {
    const base = bareCoupleState(55, 52);
    const state = zeroSpending({
      ...base,
      fiAge: 57,
      p2FiAge: 60,
      jointGia: { enabled: true, totalValue: 0, baseCost: 0, growthRate: 0, annualContribution: 6_000 },
    });
    const proj = calculateProjections(state);
    const rows = proj.slice(0, 6).map(p => ({
      p1Age: p.p1Age, p2Age: p.p2Age, jGia: p.jointGiaValue, jBC: p.jointGiaBaseCost
    }));
    console.log('State jointGia:', JSON.stringify(state.jointGia));
    console.log('State mode:', state.mode);
    console.log(JSON.stringify(rows, null, 2));
    expect(true).toBe(true);
  });
});
