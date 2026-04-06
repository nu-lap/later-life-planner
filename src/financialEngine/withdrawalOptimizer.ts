import { CURRENT_TAX_YEAR_START } from '@/config/financialConstants';
import { getSnapshotForYear } from '@/config/taxRuleSnapshot';
import type { PlannerState, YearlyProjection } from '@/models/types';
import { calculateProjections } from './projectionEngine';
import { calcCGT, calcIncomeTax, drawFromGIA, isHigherRateTaxpayer } from './taxCalculations';
import type {
  DCOrder,
  OptimizationResult,
  RuleProvenance,
  WaterfallConfig,
  WaterfallResult,
  YearRecord,
} from './types';

interface OptimizerBalances {
  p1Dc: number;
  p1Isa: number;
  p1GiaValue: number;
  p1GiaBaseCost: number;
  p1Cash: number;
  p2Dc: number;
  p2Isa: number;
  p2GiaValue: number;
  p2GiaBaseCost: number;
  p2Cash: number;
  jointGiaValue: number;
  jointGiaBaseCost: number;
  p1LifetimePcls: number;
  p2LifetimePcls: number;
}

interface FixedIncomeContext {
  p1StatePension: number;
  p1OtherTaxable: number;
  p2StatePension: number;
  p2OtherTaxable: number;
  total: number;
}

interface CandidateEvaluation {
  result: WaterfallResult;
  endBalances: OptimizerBalances;
}

export const OPTIMIZER_CANDIDATES: WaterfallConfig[] = [
  { label: '1-LLP-Baseline', dcOrder: 'paul-first', isaMode: 'now' },
  { label: '2-Couple-equal', dcOrder: 'equal', isaMode: 'now' },
  { label: '3-Proportional', dcOrder: 'proportional', isaMode: 'now' },
  { label: '4-Lisa-first', dcOrder: 'lisa-first', isaMode: 'now' },
  { label: '5-ISA-preserve', dcOrder: 'equal', isaMode: 'defer' },
];

export const BASELINE_STRATEGY = OPTIMIZER_CANDIDATES[0];

export function describeStrategyLabel(label: string): string {
  switch (label) {
    case '1-LLP-Baseline':
      return 'LLP baseline waterfall';
    case '2-Couple-equal':
      return 'Couple-equal DC drawdown';
    case '3-Proportional':
      return 'Proportional DC drawdown';
    case '4-Lisa-first':
      return 'Lisa-first DC drawdown';
    case '5-ISA-preserve':
      return 'ISA-preserve';
    default:
      return label;
  }
}

function cloneBalances(balances: OptimizerBalances): OptimizerBalances {
  return { ...balances };
}

function sumTerminalAssets(balances: OptimizerBalances): number {
  return balances.p1Dc + balances.p1Isa + balances.p1GiaValue + balances.p1Cash
    + balances.p2Dc + balances.p2Isa + balances.p2GiaValue + balances.p2Cash
    + balances.jointGiaValue;
}

function assetGrowthRates(state: PlannerState) {
  const fallback = state.assumptions.investmentGrowth / 100;

  return {
    p1Dc: (state.person1.incomeSources.dcPension.growthRate ?? state.assumptions.investmentGrowth) / 100,
    p1Isa: (state.person1.assets.isaInvestments.growthRate ?? state.assumptions.investmentGrowth) / 100,
    p1Gia:
      (state.person1.assets.generalInvestments.growthRate ?? state.assumptions.investmentGrowth) / 100,
    p2Dc: (state.person2.incomeSources.dcPension.growthRate ?? state.assumptions.investmentGrowth) / 100,
    p2Isa: (state.person2.assets.isaInvestments.growthRate ?? state.assumptions.investmentGrowth) / 100,
    p2Gia:
      (state.person2.assets.generalInvestments.growthRate ?? state.assumptions.investmentGrowth) / 100,
    jointGia: (state.jointGia.growthRate ?? state.assumptions.investmentGrowth) / 100,
    cash: fallback,
  };
}

function seedBalances(state: PlannerState, projections: YearlyProjection[]): OptimizerBalances {
  const preFi = projections.filter((row) => row.p1Age < state.fiAge);
  const lastPreFi = preFi.at(-1);

  if (lastPreFi) {
    return {
      p1Dc: lastPreFi.p1DcBalance,
      p1Isa: lastPreFi.p1IsaBalance,
      p1GiaValue: lastPreFi.p1GiaValue,
      p1GiaBaseCost: lastPreFi.p1GiaBaseCost,
      p1Cash: lastPreFi.p1CashBalance,
      p2Dc: lastPreFi.p2DcBalance,
      p2Isa: lastPreFi.p2IsaBalance,
      p2GiaValue: lastPreFi.p2GiaValue,
      p2GiaBaseCost: lastPreFi.p2GiaBaseCost,
      p2Cash: lastPreFi.p2CashBalance,
      jointGiaValue: lastPreFi.jointGiaValue,
      jointGiaBaseCost: lastPreFi.jointGiaBaseCost,
      p1LifetimePcls: 0,
      p2LifetimePcls: 0,
    };
  }

  return {
    p1Dc: state.person1.incomeSources.dcPension.enabled
      ? state.person1.incomeSources.dcPension.totalValue
      : 0,
    p1Isa: state.person1.assets.isaInvestments.enabled
      ? state.person1.assets.isaInvestments.totalValue
      : 0,
    p1GiaValue: state.person1.assets.generalInvestments.enabled
      ? state.person1.assets.generalInvestments.totalValue
      : 0,
    p1GiaBaseCost: state.person1.assets.generalInvestments.enabled
      ? state.person1.assets.generalInvestments.baseCost
      : 0,
    p1Cash: state.person1.assets.cashSavings.enabled ? state.person1.assets.cashSavings.totalValue : 0,
    p2Dc: state.mode === 'couple' && state.person2.incomeSources.dcPension.enabled
      ? state.person2.incomeSources.dcPension.totalValue
      : 0,
    p2Isa: state.mode === 'couple' && state.person2.assets.isaInvestments.enabled
      ? state.person2.assets.isaInvestments.totalValue
      : 0,
    p2GiaValue: state.mode === 'couple' && state.person2.assets.generalInvestments.enabled
      ? state.person2.assets.generalInvestments.totalValue
      : 0,
    p2GiaBaseCost: state.mode === 'couple' && state.person2.assets.generalInvestments.enabled
      ? state.person2.assets.generalInvestments.baseCost
      : 0,
    p2Cash: state.mode === 'couple' && state.person2.assets.cashSavings.enabled
      ? state.person2.assets.cashSavings.totalValue
      : 0,
    jointGiaValue: state.mode === 'couple' && state.jointGia.enabled ? state.jointGia.totalValue : 0,
    jointGiaBaseCost: state.mode === 'couple' && state.jointGia.enabled ? state.jointGia.baseCost : 0,
    p1LifetimePcls: 0,
    p2LifetimePcls: 0,
  };
}

function buildFixedIncomeContext(row: YearlyProjection): FixedIncomeContext {
  const p1OtherTaxable = row.p1DbPension + row.p1PartTimeWork + row.p1OtherIncome + row.p1PropertyRent;
  const p2OtherTaxable = row.p2DbPension + row.p2PartTimeWork + row.p2OtherIncome + row.p2PropertyRent;

  return {
    p1StatePension: row.p1StatePension,
    p1OtherTaxable,
    p2StatePension: row.p2StatePension,
    p2OtherTaxable,
    total: row.p1StatePension + p1OtherTaxable + row.p2StatePension + p2OtherTaxable,
  };
}

function applyGrowth(
  balances: OptimizerBalances,
  growth: ReturnType<typeof assetGrowthRates>,
): OptimizerBalances {
  return {
    ...balances,
    p1Dc: balances.p1Dc > 0 ? balances.p1Dc * (1 + growth.p1Dc) : 0,
    p1Isa: balances.p1Isa > 0 ? balances.p1Isa * (1 + growth.p1Isa) : 0,
    p1GiaValue: balances.p1GiaValue > 0 ? balances.p1GiaValue * (1 + growth.p1Gia) : 0,
    p1Cash: balances.p1Cash > 0 ? balances.p1Cash * (1 + growth.cash) : 0,
    p2Dc: balances.p2Dc > 0 ? balances.p2Dc * (1 + growth.p2Dc) : 0,
    p2Isa: balances.p2Isa > 0 ? balances.p2Isa * (1 + growth.p2Isa) : 0,
    p2GiaValue: balances.p2GiaValue > 0 ? balances.p2GiaValue * (1 + growth.p2Gia) : 0,
    p2Cash: balances.p2Cash > 0 ? balances.p2Cash * (1 + growth.cash) : 0,
    jointGiaValue: balances.jointGiaValue > 0
      ? balances.jointGiaValue * (1 + growth.jointGia)
      : 0,
  };
}

function allocateDcWithinAllowance(
  order: DCOrder,
  remaining: number,
  p1Cap: number,
  p2Cap: number,
  p1Available: number,
  p2Available: number,
): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;

  if (remaining <= 0) return { p1, p2 };

  switch (order) {
    case 'paul-first':
      p1 = Math.min(p1Cap, p1Available, remaining);
      p2 = Math.min(p2Cap, p2Available, Math.max(0, remaining - p1));
      return { p1, p2 };
    case 'lisa-first':
      p2 = Math.min(p2Cap, p2Available, remaining);
      p1 = Math.min(p1Cap, p1Available, Math.max(0, remaining - p2));
      return { p1, p2 };
    case 'equal': {
      const half = remaining / 2;
      p1 = Math.min(p1Cap, p1Available, half);
      p2 = Math.min(p2Cap, p2Available, half);
      const shortfall = Math.max(0, remaining - p1 - p2);
      if (shortfall > 0) {
        const p1Extra = Math.min(p1Cap - p1, p1Available - p1, shortfall);
        p1 += Math.max(0, p1Extra);
        const p2Extra = Math.min(p2Cap - p2, p2Available - p2, shortfall - p1Extra);
        p2 += Math.max(0, p2Extra);
      }
      return { p1, p2 };
    }
    case 'proportional': {
      const totalAvailable = p1Available + p2Available;
      if (totalAvailable <= 0) return { p1, p2 };
      const p1Share = p1Available / totalAvailable;
      p1 = Math.min(p1Cap, p1Available, remaining * p1Share);
      p2 = Math.min(p2Cap, p2Available, remaining * (1 - p1Share));
      const shortfall = Math.max(0, remaining - p1 - p2);
      if (shortfall > 0) {
        const p1Extra = Math.min(p1Cap - p1, p1Available - p1, shortfall);
        p1 += Math.max(0, p1Extra);
        const p2Extra = Math.min(p2Cap - p2, p2Available - p2, shortfall - p1Extra);
        p2 += Math.max(0, p2Extra);
      }
      return { p1, p2 };
    }
  }
}

function allocateDcAboveAllowance(
  order: DCOrder,
  remaining: number,
  p1Available: number,
  p2Available: number,
): { p1: number; p2: number } {
  return allocateDcWithinAllowance(order, remaining, p1Available, p2Available, p1Available, p2Available);
}

function selectTopStrategies(results: WaterfallResult[]): WaterfallResult[] {
  return [...results]
    .sort((left, right) => {
      if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
      if (left.totalTax !== right.totalTax) return left.totalTax - right.totalTax;
      return left.gap - right.gap;
    })
    .slice(0, 2);
}

function selectWinner(results: CandidateEvaluation[]): CandidateEvaluation {
  const feasible = results.filter((candidate) => candidate.result.feasible);
  const pool = feasible.length > 0 ? feasible : results;

  return [...pool].sort((left, right) => {
    if (left.result.feasible !== right.result.feasible) return left.result.feasible ? -1 : 1;
    if (left.result.totalTax !== right.result.totalTax) {
      return left.result.totalTax - right.result.totalTax;
    }
    return left.result.gap - right.result.gap;
  })[0];
}

function recordRuleProvenance(
  provenance: Map<string, RuleProvenance>,
  calendarYear: number,
): void {
  const snapshot = getSnapshotForYear(calendarYear);
  const requestedYear = snapshot.taxYear;

  const entries: RuleProvenance[] = [
    {
      rule_id: snapshot.incomeTaxBands.ruleId,
      version: snapshot.incomeTaxBands.ruleVersion,
      tax_year_requested: requestedYear,
      tax_year_used: snapshot.incomeTaxBands.taxYear,
      jurisdiction: snapshot.incomeTaxBands.jurisdiction,
      is_fallback: snapshot.incomeTaxBands.taxYear !== requestedYear,
    },
    {
      rule_id: snapshot.cgt.ruleId,
      version: snapshot.cgt.ruleVersion,
      tax_year_requested: requestedYear,
      tax_year_used: snapshot.cgt.taxYear,
      jurisdiction: snapshot.cgt.jurisdiction,
      is_fallback: snapshot.cgtFallback,
    },
    {
      rule_id: 'pension_lsa',
      version: '1.0.0',
      tax_year_requested: requestedYear,
      tax_year_used: snapshot.pension.taxYear,
      jurisdiction: snapshot.pension.jurisdiction,
      is_fallback: snapshot.pensionFallback,
    },
  ];

  for (const entry of entries) {
    const key = [entry.rule_id, entry.version, entry.tax_year_requested, entry.tax_year_used].join(':');
    if (!provenance.has(key)) provenance.set(key, entry);
  }
}

function evaluateCandidate(
  state: PlannerState,
  row: YearlyProjection,
  balances: OptimizerBalances,
  strategy: WaterfallConfig,
): CandidateEvaluation {
  const mode = state.mode;
  const working = cloneBalances(balances);
  const fixed = buildFixedIncomeContext(row);
  const calendarYear = CURRENT_TAX_YEAR_START + row.yearIndex;
  const snapshot = getSnapshotForYear(calendarYear);
  const spExempt = state.assumptions.statePensionSoleIncomeExempt ?? true;

  const drawdowns = {
    p1Dc: 0,
    p1Isa: 0,
    p1Gia: 0,
    p1Cash: 0,
    p2Dc: 0,
    p2Isa: 0,
    p2Gia: 0,
    p2Cash: 0,
    jointGia: 0,
    p1CapitalGain: 0,
    p2CapitalGain: 0,
    jointCapitalGain: 0,
    p1DcTaxFree: 0,
    p2DcTaxFree: 0,
  };

  let remaining = Math.max(0, row.spending - fixed.total);

  const p1Headroom = Math.max(0, snapshot.incomeTaxBands.personalAllowance - fixed.p1OtherTaxable);
  const p2Headroom = Math.max(0, snapshot.incomeTaxBands.personalAllowance - fixed.p2OtherTaxable);
  const p1WithinAllowance = p1Headroom / snapshot.pension.ufplsTaxableFraction;
  const p2WithinAllowance = p2Headroom / snapshot.pension.ufplsTaxableFraction;

  const withinPa = allocateDcWithinAllowance(
    strategy.dcOrder,
    remaining,
    p1WithinAllowance,
    mode === 'couple' ? p2WithinAllowance : 0,
    working.p1Dc,
    mode === 'couple' ? working.p2Dc : 0,
  );
  if (withinPa.p1 > 0) {
    drawdowns.p1Dc += withinPa.p1;
    working.p1Dc -= withinPa.p1;
    remaining -= withinPa.p1;
  }
  if (withinPa.p2 > 0) {
    drawdowns.p2Dc += withinPa.p2;
    working.p2Dc -= withinPa.p2;
    remaining -= withinPa.p2;
  }

  let p1CgtBudget = snapshot.cgt.exemptAmount;
  let p2CgtBudget = mode === 'couple' ? snapshot.cgt.exemptAmount : 0;

  if (remaining > 0 && working.p1GiaValue > 0) {
    const gainFrac = working.p1GiaValue > 0
      ? Math.max(0, (working.p1GiaValue - working.p1GiaBaseCost) / working.p1GiaValue)
      : 0;
    const maxDraw = gainFrac > 0 ? p1CgtBudget / gainFrac : working.p1GiaValue;
    const disposal = drawFromGIA(working.p1GiaValue, working.p1GiaBaseCost, Math.min(maxDraw, remaining));
    if (disposal.drawn > 0) {
      working.p1GiaValue = disposal.newValue;
      working.p1GiaBaseCost = disposal.newBaseCost;
      drawdowns.p1Gia += disposal.drawn;
      drawdowns.p1CapitalGain += disposal.capitalGain;
      p1CgtBudget = Math.max(0, p1CgtBudget - disposal.capitalGain);
      remaining -= disposal.drawn;
    }
  }

  if (remaining > 0 && mode === 'couple' && working.p2GiaValue > 0) {
    const gainFrac = working.p2GiaValue > 0
      ? Math.max(0, (working.p2GiaValue - working.p2GiaBaseCost) / working.p2GiaValue)
      : 0;
    const maxDraw = gainFrac > 0 ? p2CgtBudget / gainFrac : working.p2GiaValue;
    const disposal = drawFromGIA(working.p2GiaValue, working.p2GiaBaseCost, Math.min(maxDraw, remaining));
    if (disposal.drawn > 0) {
      working.p2GiaValue = disposal.newValue;
      working.p2GiaBaseCost = disposal.newBaseCost;
      drawdowns.p2Gia += disposal.drawn;
      drawdowns.p2CapitalGain += disposal.capitalGain;
      p2CgtBudget = Math.max(0, p2CgtBudget - disposal.capitalGain);
      remaining -= disposal.drawn;
    }
  }

  if (remaining > 0 && working.jointGiaValue > 0) {
    const gainFrac = working.jointGiaValue > 0
      ? Math.max(0, (working.jointGiaValue - working.jointGiaBaseCost) / working.jointGiaValue)
      : 0;
    const effectiveBudget = mode === 'couple'
      ? Math.min(p1CgtBudget, p2CgtBudget) * 2
      : p1CgtBudget;
    const maxDraw = gainFrac > 0 ? effectiveBudget / gainFrac : working.jointGiaValue;
    const disposal = drawFromGIA(
      working.jointGiaValue,
      working.jointGiaBaseCost,
      Math.min(maxDraw, remaining),
    );
    if (disposal.drawn > 0) {
      working.jointGiaValue = disposal.newValue;
      working.jointGiaBaseCost = disposal.newBaseCost;
      drawdowns.jointGia += disposal.drawn;
      drawdowns.jointCapitalGain += disposal.capitalGain;
      remaining -= disposal.drawn;
    }
  }

  if (strategy.isaMode === 'now' && remaining > 0) {
    const p1Isa = Math.min(working.p1Isa, remaining);
    drawdowns.p1Isa += p1Isa;
    working.p1Isa -= p1Isa;
    remaining -= p1Isa;

    if (remaining > 0 && mode === 'couple') {
      const p2Isa = Math.min(working.p2Isa, remaining);
      drawdowns.p2Isa += p2Isa;
      working.p2Isa -= p2Isa;
      remaining -= p2Isa;
    }
  }

  if (remaining > 0 && working.p1GiaValue > 0) {
    const disposal = drawFromGIA(working.p1GiaValue, working.p1GiaBaseCost, remaining);
    if (disposal.drawn > 0) {
      working.p1GiaValue = disposal.newValue;
      working.p1GiaBaseCost = disposal.newBaseCost;
      drawdowns.p1Gia += disposal.drawn;
      drawdowns.p1CapitalGain += disposal.capitalGain;
      remaining -= disposal.drawn;
    }
  }

  if (remaining > 0 && mode === 'couple' && working.p2GiaValue > 0) {
    const disposal = drawFromGIA(working.p2GiaValue, working.p2GiaBaseCost, remaining);
    if (disposal.drawn > 0) {
      working.p2GiaValue = disposal.newValue;
      working.p2GiaBaseCost = disposal.newBaseCost;
      drawdowns.p2Gia += disposal.drawn;
      drawdowns.p2CapitalGain += disposal.capitalGain;
      remaining -= disposal.drawn;
    }
  }

  if (remaining > 0 && working.jointGiaValue > 0) {
    const disposal = drawFromGIA(working.jointGiaValue, working.jointGiaBaseCost, remaining);
    if (disposal.drawn > 0) {
      working.jointGiaValue = disposal.newValue;
      working.jointGiaBaseCost = disposal.newBaseCost;
      drawdowns.jointGia += disposal.drawn;
      drawdowns.jointCapitalGain += disposal.capitalGain;
      remaining -= disposal.drawn;
    }
  }

  if (remaining > 0 && working.p1Cash > 0) {
    const p1Cash = Math.min(working.p1Cash, remaining);
    drawdowns.p1Cash += p1Cash;
    working.p1Cash -= p1Cash;
    remaining -= p1Cash;
  }

  if (remaining > 0 && mode === 'couple' && working.p2Cash > 0) {
    const p2Cash = Math.min(working.p2Cash, remaining);
    drawdowns.p2Cash += p2Cash;
    working.p2Cash -= p2Cash;
    remaining -= p2Cash;
  }

  if (remaining > 0) {
    const abovePa = allocateDcAboveAllowance(
      strategy.dcOrder,
      remaining,
      working.p1Dc,
      mode === 'couple' ? working.p2Dc : 0,
    );
    if (abovePa.p1 > 0) {
      drawdowns.p1Dc += abovePa.p1;
      working.p1Dc -= abovePa.p1;
      remaining -= abovePa.p1;
    }
    if (abovePa.p2 > 0) {
      drawdowns.p2Dc += abovePa.p2;
      working.p2Dc -= abovePa.p2;
      remaining -= abovePa.p2;
    }
  }

  if (strategy.isaMode === 'defer' && remaining > 0) {
    const p1Isa = Math.min(working.p1Isa, remaining);
    drawdowns.p1Isa += p1Isa;
    working.p1Isa -= p1Isa;
    remaining -= p1Isa;

    if (remaining > 0 && mode === 'couple') {
      const p2Isa = Math.min(working.p2Isa, remaining);
      drawdowns.p2Isa += p2Isa;
      working.p2Isa -= p2Isa;
      remaining -= p2Isa;
    }
  }

  const p1RemainingLsa = Math.max(0, snapshot.pension.lsa - working.p1LifetimePcls);
  drawdowns.p1DcTaxFree = Math.min(
    drawdowns.p1Dc * snapshot.pension.ufplsTaxFreeFraction,
    p1RemainingLsa,
  );
  working.p1LifetimePcls += drawdowns.p1DcTaxFree;

  const p2RemainingLsa = Math.max(0, snapshot.pension.lsa - working.p2LifetimePcls);
  drawdowns.p2DcTaxFree = Math.min(
    drawdowns.p2Dc * snapshot.pension.ufplsTaxFreeFraction,
    p2RemainingLsa,
  );
  working.p2LifetimePcls += drawdowns.p2DcTaxFree;

  const jointGainEach = mode === 'couple'
    ? drawdowns.jointCapitalGain / 2
    : drawdowns.jointCapitalGain;

  const p1OtherTaxable = fixed.p1OtherTaxable + (drawdowns.p1Dc - drawdowns.p1DcTaxFree);
  const p2OtherTaxable = fixed.p2OtherTaxable + (drawdowns.p2Dc - drawdowns.p2DcTaxFree);
  const p1StatePensionTaxable = spExempt && p1OtherTaxable === 0 ? 0 : fixed.p1StatePension;
  const p2StatePensionTaxable = spExempt && p2OtherTaxable === 0 ? 0 : fixed.p2StatePension;
  const p1TaxableIncome = p1StatePensionTaxable + p1OtherTaxable;
  const p2TaxableIncome = p2StatePensionTaxable + p2OtherTaxable;

  const p1IncomeTax = calcIncomeTax(p1TaxableIncome, calendarYear);
  const p2IncomeTax = mode === 'couple' ? calcIncomeTax(p2TaxableIncome, calendarYear) : 0;
  const p1CgtPaid = calcCGT(
    drawdowns.p1CapitalGain + jointGainEach,
    isHigherRateTaxpayer(p1TaxableIncome, calendarYear),
    calendarYear,
  );
  const p2CgtPaid = mode === 'couple'
    ? calcCGT(
      drawdowns.p2CapitalGain + jointGainEach,
      isHigherRateTaxpayer(p2TaxableIncome, calendarYear),
      calendarYear,
    )
    : 0;

  const incomeTax = p1IncomeTax + p2IncomeTax;
  const cgtPaid = p1CgtPaid + p2CgtPaid;
  const totalTax = incomeTax + cgtPaid;
  const totalDrawn = drawdowns.p1Dc + drawdowns.p1Isa + drawdowns.p1Gia + drawdowns.p1Cash
    + drawdowns.p2Dc + drawdowns.p2Isa + drawdowns.p2Gia + drawdowns.p2Cash + drawdowns.jointGia;
  const totalIncome = fixed.total + totalDrawn;
  const netIncome = totalIncome - totalTax;

  return {
    result: {
      strategy,
      totalTax,
      incomeTax,
      cgtPaid,
      feasible: remaining <= 1,
      gap: Math.max(0, remaining),
      spendingTarget: row.spending,
      fixedIncome: fixed.total,
      totalIncome,
      netIncome,
      p1TaxableIncome,
      p2TaxableIncome,
      terminalAssets: Math.max(0, sumTerminalAssets(working)),
      drawdowns,
    },
    endBalances: working,
  };
}

function dominantStrategy(records: YearRecord[]): WaterfallConfig {
  const totals = new Map<string, { config: WaterfallConfig; count: number; tax: number }>();

  for (const record of records) {
    const existing = totals.get(record.winner.strategy.label);
    if (existing) {
      existing.count += 1;
      existing.tax += record.winner.totalTax;
    } else {
      totals.set(record.winner.strategy.label, {
        config: record.winner.strategy,
        count: 1,
        tax: record.winner.totalTax,
      });
    }
  }

  return [...totals.values()].sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count;
    return left.tax - right.tax;
  })[0]?.config ?? BASELINE_STRATEGY;
}

function simulateStrategies(
  state: PlannerState,
  strategySelector: 'optimized' | 'baseline',
): {
  yearRecords: YearRecord[];
  lifetimeTaxPaid: number;
  assetDepletionAge: number | null;
  terminalAssets: number;
  ruleProvenance: RuleProvenance[];
} {
  const baseProjections = calculateProjections(state);
  const postFiRows = baseProjections.filter((row) => row.p1Age >= state.fiAge);
  const growth = assetGrowthRates(state);
  let balances = seedBalances(state, baseProjections);
  const provenance = new Map<string, RuleProvenance>();
  const yearRecords: YearRecord[] = [];

  for (const row of postFiRows) {
    const calendarYear = CURRENT_TAX_YEAR_START + row.yearIndex;
    recordRuleProvenance(provenance, calendarYear);
    balances = applyGrowth(balances, growth);

    const evaluated = OPTIMIZER_CANDIDATES.map((strategy) =>
      evaluateCandidate(state, row, balances, strategy),
    );
    const winner = strategySelector === 'baseline'
      ? evaluated.find((candidate) => candidate.result.strategy.label === BASELINE_STRATEGY.label) ?? evaluated[0]
      : selectWinner(evaluated);
    balances = winner.endBalances;

    yearRecords.push({
      yearIndex: row.yearIndex,
      taxYear: `${calendarYear}-${String(calendarYear + 1).slice(-2)}`,
      p1Age: row.p1Age,
      p2Age: row.p2Age,
      spending: row.spending,
      winner: winner.result,
      topStrategies: selectTopStrategies(evaluated.map((candidate) => candidate.result)),
      candidateResults: evaluated.map((candidate) => candidate.result),
      baseline:
        evaluated.find((candidate) => candidate.result.strategy.label === BASELINE_STRATEGY.label)?.result
        ?? evaluated[0].result,
      terminalAssets: winner.result.terminalAssets,
    });
  }

  const depletionAge = yearRecords.find((record) => record.terminalAssets <= 0)?.p1Age ?? null;

  return {
    yearRecords,
    lifetimeTaxPaid: yearRecords.reduce((sum, record) => sum + record.winner.totalTax, 0),
    assetDepletionAge: depletionAge,
    terminalAssets: yearRecords.at(-1)?.terminalAssets ?? sumTerminalAssets(balances),
    ruleProvenance: [...provenance.values()],
  };
}

export function optimizeWithdrawals(
  state: PlannerState,
  options?: { baselineOnly?: boolean },
): OptimizationResult {
  const optimized = simulateStrategies(state, options?.baselineOnly ? 'baseline' : 'optimized');
  const baseline = simulateStrategies(state, 'baseline');
  const records = optimized.yearRecords;
  const recommendedStrategy = dominantStrategy(records);

  return {
    recommendedStrategy,
    baselineStrategy: BASELINE_STRATEGY,
    lifetimeTaxSaving: baseline.lifetimeTaxPaid - optimized.lifetimeTaxPaid,
    lifetimeTaxPaid: optimized.lifetimeTaxPaid,
    baselineLifetimeTaxPaid: baseline.lifetimeTaxPaid,
    assetDepletionAge: optimized.assetDepletionAge,
    baselineAssetDepletionAge: baseline.assetDepletionAge,
    terminalAssets: optimized.terminalAssets,
    yearRecords: records,
    ruleProvenance: optimized.ruleProvenance,
  };
}
