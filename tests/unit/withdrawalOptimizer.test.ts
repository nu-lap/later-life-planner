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

  test('grosses up taxable withdrawals so net income meets the required spending target', () => {
    const result = optimizeWithdrawals(withSpending(dcOnlyState(60, 100_000), 20_000));
    const firstYear = result.yearRecords[0].winner;

    expect(firstYear.feasible).toBe(true);
    expect(firstYear.totalIncome).toBeGreaterThan(firstYear.spendingTarget);
    expect(Math.abs(firstYear.netIncome - firstYear.spendingTarget)).toBeLessThan(1);
  });

  test('continues grossing up late-year taxable withdrawals until the residual gap is within tolerance', () => {
    const base = paulAndLisaState();
    const result = optimizeWithdrawals({
      ...base,
      assumptions: {
        ...base.assumptions,
        lifeExpectancy: 100,
      },
    });
    const lastYear = result.yearRecords.at(-1)?.winner;

    expect(lastYear).toBeDefined();
    expect(lastYear?.terminalAssets).toBeGreaterThan(0);
    expect(lastYear?.feasible).toBe(true);
    expect(lastYear?.gap).toBeLessThan(1);
    expect(Math.abs((lastYear?.netIncome ?? 0) - (lastYear?.spendingTarget ?? 0))).toBeLessThan(1);
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

  test('uses spouse-aware ISA ordering for couple strategies', () => {
    const base = bareCoupleState(60, 60);
    const state = withSpending({
      ...base,
      person1: {
        ...base.person1,
        assets: {
          ...base.person1.assets,
          isaInvestments: { enabled: true, totalValue: 30_000, growthRate: 0 },
        },
      },
      person2: {
        ...base.person2,
        assets: {
          ...base.person2.assets,
          isaInvestments: { enabled: true, totalValue: 90_000, growthRate: 0 },
        },
      },
      assumptions: { ...base.assumptions, investmentGrowth: 0 },
    }, 60_000);

    const result = optimizeWithdrawals(state);
    const baseline = candidateByLabel(result, 0, '1-LLP-Baseline');
    const paulFirst = candidateByLabel(result, 0, '2-Partner-1-first');
    const proportional = candidateByLabel(result, 0, '3-Proportional');
    const lisaFirst = candidateByLabel(result, 0, '4-Partner-2-first');

    // Baseline is now equal-split, so both ISA pots should be drawn evenly
    expect(baseline?.drawdowns.p1Isa).toBeCloseTo(30_000, 2);
    expect(baseline?.drawdowns.p2Isa).toBeCloseTo(30_000, 2);

    // Partner 1-first draws p1 ISA exhausted first, then p2
    expect(paulFirst?.drawdowns.p1Isa).toBeCloseTo(30_000, 2);
    expect(paulFirst?.drawdowns.p2Isa).toBeCloseTo(30_000, 2);

    expect(proportional?.drawdowns.p1Isa).toBeCloseTo(15_000, 2);
    expect(proportional?.drawdowns.p2Isa).toBeCloseTo(45_000, 2);

    expect(lisaFirst?.drawdowns.p1Isa).toBeCloseTo(0, 2);
    expect(lisaFirst?.drawdowns.p2Isa).toBeCloseTo(60_000, 2);
  });


  test('captures pension UFPLS breakdown and attributable tax by year', () => {
    const result = optimizeWithdrawals(withSpending(dcOnlyState(60, 100_000), 20_000));
    const firstYear = result.yearRecords[0];
    const pension = firstYear.drawdownBreakdown.person1.pension;

    expect(pension).toBeDefined();
    expect(pension?.grossAmount).toBeCloseTo(firstYear.winner.drawdowns.p1Dc, 2);
    expect(pension?.pcls).toBeCloseTo(firstYear.winner.drawdowns.p1DcTaxFree, 2);
    expect((pension?.pcls ?? 0) + (pension?.taxableAmount ?? 0)).toBeCloseTo(pension?.grossAmount ?? 0, 2);
    expect(pension?.taxDue).toBeCloseTo(firstYear.winner.incomeTax, 2);
    expect(firstYear.drawdownBreakdown).toEqual(firstYear.winner.breakdown);
  });

  test('captures joint GIA taxable gains and attributable tax in the yearly breakdown', () => {
    const base = bareCoupleState(60, 60);
    const state = withSpending({
      ...base,
      jointGia: { enabled: true, totalValue: 50_000, baseCost: 0, growthRate: 0 },
      assumptions: { ...base.assumptions, investmentGrowth: 0 },
    }, 10_000);

    const firstYear = optimizeWithdrawals(state).yearRecords[0];
    const jointGia = firstYear.drawdownBreakdown.joint?.gia;

    expect(jointGia).toBeDefined();
    expect(jointGia?.grossAmount).toBeCloseTo(firstYear.winner.drawdowns.jointGia, 2);
    expect(jointGia?.taxableAmount).toBeGreaterThan(0);
    expect(jointGia?.taxDue).toBeGreaterThan(0);
    expect(jointGia?.taxDue).toBeCloseTo(firstYear.winner.cgtPaid, 2);
  });

  test('inflates spending-floor targets from today money each year', () => {
    const base = withSpending(dcOnlyState(60, 500_000, 60), 10_000);
    const state = {
      ...base,
      assumptions: {
        ...base.assumptions,
        inflation: 10,
        investmentGrowth: 0,
      },
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { ...base.person1.incomeSources.dcPension, growthRate: 0 },
        },
      },
    };

    const result = optimizeWithdrawals(state, {
      policyOverride: {
        rationale: 'Protect a minimum annual income floor in today money.',
        minAnnualIncome: 20_000,
      },
    });

    expect(result.yearRecords[0].winner.spendingTarget).toBeCloseTo(20_000, 2);
    expect(result.yearRecords[1].winner.spendingTarget).toBeCloseTo(22_000, 2);
  });

  test('inflates bequest targets from today money each year', () => {
    const base = withSpending(dcOnlyState(60, 105_000, 60), 0);
    const state = {
      ...base,
      assumptions: {
        ...base.assumptions,
        inflation: 10,
        investmentGrowth: 0,
      },
      person1: {
        ...base.person1,
        incomeSources: {
          ...base.person1.incomeSources,
          dcPension: { ...base.person1.incomeSources.dcPension, growthRate: 0 },
        },
      },
    };

    const result = optimizeWithdrawals(state, {
      policyOverride: {
        rationale: 'Protect a bequest target in today money.',
        bequestTarget: 100_000,
      },
    });

    expect(result.yearRecords[0].winner.feasible).toBe(true);
    expect(result.yearRecords[1].winner.feasible).toBe(false);
    expect(result.yearRecords[1].winner.gap).toBeGreaterThan(0);
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
    // isaMode:'defer' strategies are never taxDominated – deferring ISA is intentional
    expect(isaPreserve?.taxDominated).toBe(false);
    expect(baseline?.taxDominated ?? false).toBe(false);
  });

  test('treats a bequest floor as a feasibility constraint', () => {
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

    const result = optimizeWithdrawals(state, {
      policyOverride: {
        bequestTarget: 119_000,
        rationale: 'Protect a minimum bequest floor.',
      },
    });
    const firstYear = result.yearRecords[0];
    const isaPreserve = firstYear.candidateResults.find((candidate) => candidate.strategy.label === '5-ISA-preserve');
    const baseline = firstYear.candidateResults.find((candidate) => candidate.strategy.label === '1-LLP-Baseline');

    expect(isaPreserve).toBeDefined();
    expect(baseline).toBeDefined();
    expect(isaPreserve?.terminalAssets).toBeLessThan(119_000);
    expect(isaPreserve?.feasible).toBe(false);
    expect(baseline?.terminalAssets).toBeGreaterThanOrEqual(119_000);
    expect(baseline?.feasible).toBe(true);
  });

  test('pcls-bed-isa: pre-FI crystallisation seeds LSA exhaustion so all FI-year DC draws are 100% taxable', () => {
    // pclsAge (57) is before fiAge (60): the projection engine fires the PCLS in
    // the pre-FI phase and the optimizer must seed p1LifetimePcls = LSA so that
    // every post-FI DC withdrawal is treated as fully taxable.
    const base = dcOnlyState(55, 300_000, 60);
    const state = withSpending(
      {
        ...base,
        drawdownStrategy: 'pcls-bed-isa',
        pclsAge: 57,
      },
      20_000,
    );

    const result = optimizeWithdrawals(state);

    // Every year where DC is actually drawn must have zero tax-free component.
    const dcYears = result.yearRecords.filter((r) => r.winner.drawdowns.p1Dc > 0);
    expect(dcYears.length).toBeGreaterThan(0);
    for (const record of dcYears) {
      expect(record.winner.drawdowns.p1DcTaxFree).toBe(0);
      // Pension breakdown must show pcls = 0, which means the UI suppresses the
      // "25% Tax Free" breakdown field (breakdown.pcls > 0 guard in OptimizerPanel).
      expect(record.winner.breakdown.person1.pension?.pcls).toBe(0);
    }
  });

  test('pcls-bed-isa: at-FI crystallisation exhausts LSA in-loop so all subsequent DC draws are 100% taxable', () => {
    // pclsAge defaults to fiAge (60): the PCLS fires inside the optimizer loop at
    // age 60 (after growth, before drawdown). From that point on, p1LifetimePcls
    // equals the LSA so all DC draws must have zero tax-free fraction.
    const base = dcOnlyState(60, 300_000);
    const state = withSpending(
      {
        ...base,
        drawdownStrategy: 'pcls-bed-isa',
        // pclsAge intentionally omitted — defaults to fiAge inside the engine.
      },
      20_000,
    );

    const result = optimizeWithdrawals(state);

    // Every year where DC is drawn must be fully taxable.
    const dcYears = result.yearRecords.filter((r) => r.winner.drawdowns.p1Dc > 0);
    expect(dcYears.length).toBeGreaterThan(0);
    for (const record of dcYears) {
      expect(record.winner.drawdowns.p1DcTaxFree).toBe(0);
      expect(record.winner.breakdown.person1.pension?.pcls).toBe(0);
    }
  });
});
