import { describe, expect, test } from 'vitest';
import { bareCoupleState, dcOnlyState, paulAndLisaState } from '../fixtures/states';
import { withSpending } from '../fixtures/helpers';
import {
  BASELINE_STRATEGY,
  optimizeWithdrawals,
} from '@/financialEngine/withdrawalOptimizer';
import paulLisaFixture from '../fixtures/withdrawal-optimizer-paul-lisa.json';

function candidateByLabel(
  result: ReturnType<typeof optimizeWithdrawals>,
  yearIndex: number,
  label: string,
) {
  return result.yearRecords[yearIndex].candidateResults.find(
    (candidate) => candidate.strategy.label === label,
  );
}

describe('optimizeWithdrawals', () => {
  test('returns the baseline strategy unchanged in baseline-only mode', () => {
    const result = optimizeWithdrawals(paulAndLisaState(), { baselineOnly: true });

    expect(result.recommendedStrategy.label).toBe(BASELINE_STRATEGY.label);
    expect(result.lifetimeTaxSaving).toBe(0);
    expect(result.lifetimeTaxPaid).toBe(result.baselineLifetimeTaxPaid);
    expect(result.yearRecords.every((record) =>
      record.winner.strategy.label === BASELINE_STRATEGY.label,
    )).toBe(true);
  });

  test('captures per-rule provenance, including fallback years', () => {
    const result = optimizeWithdrawals(paulAndLisaState());

    expect(result.ruleProvenance.some((entry) => entry.rule_id === 'income_tax_bands')).toBe(true);
    expect(result.ruleProvenance.some((entry) => entry.rule_id === 'cgt_due')).toBe(true);
    expect(result.ruleProvenance.some((entry) => entry.rule_id === 'pension_lsa')).toBe(true);
    expect(result.ruleProvenance.some((entry) => entry.rule_id === 'cgt_due' && entry.is_fallback))
      .toBe(true);
  });

  test('matches the locked Paul and Lisa optimizer fixture', () => {
    const result = optimizeWithdrawals(paulAndLisaState());
    const counts = Object.fromEntries(result.yearRecords.reduce((map, record) => {
      map.set(record.winner.strategy.label, (map.get(record.winner.strategy.label) ?? 0) + 1);
      return map;
    }, new Map<string, number>()));

    expect(result.recommendedStrategy.label).toBe(paulLisaFixture.recommended);
    expect(result.lifetimeTaxSaving).toBeCloseTo(paulLisaFixture.lifetimeTaxSaving, 6);
    expect(result.lifetimeTaxPaid).toBeCloseTo(paulLisaFixture.lifetimeTaxPaid, 6);
    expect(result.baselineLifetimeTaxPaid).toBeCloseTo(
      paulLisaFixture.baselineLifetimeTaxPaid,
      6,
    );
    expect(result.assetDepletionAge).toBe(paulLisaFixture.assetDepletionAge);
    expect(result.baselineAssetDepletionAge).toBe(paulLisaFixture.baselineAssetDepletionAge);
    expect(result.terminalAssets).toBeCloseTo(paulLisaFixture.terminalAssets, 6);
    expect(result.yearRecords).toHaveLength(paulLisaFixture.yearCount);
    expect(result.yearRecords[0].winner.strategy.label).toBe(paulLisaFixture.firstYear.label);
    expect(result.yearRecords[0].winner.totalTax).toBeCloseTo(paulLisaFixture.firstYear.totalTax, 6);
    expect(result.yearRecords[0].terminalAssets).toBeCloseTo(
      paulLisaFixture.firstYear.terminalAssets,
      6,
    );
    expect(result.yearRecords.at(-1)?.winner.strategy.label).toBe(paulLisaFixture.lastYear.label);
    expect(result.yearRecords.at(-1)?.winner.totalTax).toBeCloseTo(
      paulLisaFixture.lastYear.totalTax,
      6,
    );
    expect(result.yearRecords.at(-1)?.terminalAssets).toBeCloseTo(
      paulLisaFixture.lastYear.terminalAssets,
      6,
    );
    expect(counts).toEqual(paulLisaFixture.counts);
  });

  test('uses UFPLS tax-free split for a DC-only plan', () => {
    const result = optimizeWithdrawals(withSpending(dcOnlyState(60, 100_000), 12_000));
    const firstYear = result.yearRecords[0].winner;

    expect(firstYear.drawdowns.p1Dc).toBeGreaterThan(0);
    expect(firstYear.drawdowns.p1Isa).toBe(0);
    expect(firstYear.drawdowns.p1DcTaxFree).toBeCloseTo(firstYear.drawdowns.p1Dc * 0.25, 2);
  });

  test('harvests joint GIA within the annual exempt amount before touching ISA', () => {
    const base = bareCoupleState(60, 60);
    const state = withSpending({
      ...base,
      jointGia: { enabled: true, totalValue: 50_000, baseCost: 0, growthRate: 0 },
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 20_000, growthRate: 0 },
        },
      },
      person2: {
        ...base.person2,
        assets: {
          ...base.person2.assets,
          isaInvestments: { enabled: true, totalValue: 20_000, growthRate: 0 },
        },
      },
      assumptions: { ...base.assumptions, investmentGrowth: 0 },
    }, 5_000);

    const firstYear = optimizeWithdrawals(state).yearRecords[0].winner;

    expect(firstYear.drawdowns.jointGia).toBeCloseTo(5_000, 2);
    expect(firstYear.drawdowns.p1Isa + firstYear.drawdowns.p2Isa).toBe(0);
    expect(firstYear.cgtPaid).toBe(0);
  });

  test('keeps ISA untouched for the ISA-preserve candidate until the last step', () => {
    const base = bareCoupleState(60, 60);
    const state = withSpending({
      ...base,
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { enabled: true, totalValue: 60_000, growthRate: 0 },
        },
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 20_000, growthRate: 0 },
        },
      },
      person2: {
        ...base.person2,
        incomeSources: {
          ...base.person2.incomeSources,
          dcPension: { enabled: true, totalValue: 60_000, growthRate: 0 },
        },
        assets: {
          ...base.person2.assets,
          isaInvestments: { enabled: true, totalValue: 20_000, growthRate: 0 },
        },
      },
      assumptions: { ...base.assumptions, investmentGrowth: 0 },
    }, 40_000);

    const result = optimizeWithdrawals(state);
    const baseline = candidateByLabel(result, 0, '1-LLP-Baseline');
    const isaPreserve = candidateByLabel(result, 0, '5-ISA-preserve');

    expect(baseline).toBeDefined();
    expect(isaPreserve).toBeDefined();
    expect((baseline?.drawdowns.p1Isa ?? 0) + (baseline?.drawdowns.p2Isa ?? 0)).toBeGreaterThan(0);
    expect((isaPreserve?.drawdowns.p1Isa ?? 0) + (isaPreserve?.drawdowns.p2Isa ?? 0)).toBe(0);
    expect((isaPreserve?.drawdowns.p1Dc ?? 0) + (isaPreserve?.drawdowns.p2Dc ?? 0))
      .toBeGreaterThan((baseline?.drawdowns.p1Dc ?? 0) + (baseline?.drawdowns.p2Dc ?? 0));
  });
});
