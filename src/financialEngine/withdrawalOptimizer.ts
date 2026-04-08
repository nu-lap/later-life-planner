import { CURRENT_TAX_YEAR_START } from '@/config/financialConstants';
import { getSnapshotForYear } from '@/config/taxRuleSnapshot';
import { getStrategyDisplayLabel } from '@/lib/strategyDefinitions';
import type { PlannerState, YearlyProjection } from '@/models/types';
import { calculateProjections } from './projectionEngine';
import { calcCGT, calcIncomeTax, drawFromGIA, isHigherRateTaxpayer } from './taxCalculations';
import type {
  DCOrder,
  DrawdownBreakdown,
  ISAOrder,
  OptimizationResult,
  OptimizerPolicyOverride,
  RuleProvenance,
  TaxableWithdrawalBreakdown,
  TaxFreeWithdrawalBreakdown,
  WaterfallConfig,
  WaterfallResult,
  YearDrawdownBreakdown,
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

interface OptimizerOptions {
  baselineOnly?: boolean;
  policyOverride?: OptimizerPolicyOverride;
}

export const OPTIMIZER_CANDIDATES: WaterfallConfig[] = [
  { label: '1-LLP-Baseline', dcOrder: 'paul-first', isaMode: 'now', isaOrder: 'equal' },
  { label: '2-Couple-equal', dcOrder: 'equal', isaMode: 'now', isaOrder: 'equal' },
  { label: '3-Proportional', dcOrder: 'proportional', isaMode: 'now', isaOrder: 'proportional' },
  { label: '4-Lisa-first', dcOrder: 'lisa-first', isaMode: 'now', isaOrder: 'p2-first' },
  { label: '5-ISA-preserve', dcOrder: 'equal', isaMode: 'defer', isaOrder: 'equal' },
];

export const BASELINE_STRATEGY = OPTIMIZER_CANDIDATES[0];

// £1 tolerance to absorb floating-point rounding in after-tax net income vs spending.
const FEASIBILITY_TOLERANCE_GBP = 1;
const GROSS_UP_MAX_ITERATIONS = 32;

export function describeStrategyLabel(label: string, mode: PlannerState['mode'] = 'couple'): string {
  return getStrategyDisplayLabel(mode, label);
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

function allocateIsaDrawdown(
  order: ISAOrder,
  remaining: number,
  p1Available: number,
  p2Available: number,
): { p1: number; p2: number } {
  if (remaining <= 0) return { p1: 0, p2: 0 };
  if (p2Available <= 0) {
    return {
      p1: Math.min(p1Available, remaining),
      p2: 0,
    };
  }

  switch (order) {
    case 'p2-first': {
      const p2 = Math.min(p2Available, remaining);
      const p1 = Math.min(p1Available, Math.max(0, remaining - p2));
      return { p1, p2 };
    }
    case 'equal': {
      let p1 = Math.min(p1Available, remaining / 2);
      let p2 = Math.min(p2Available, remaining / 2);
      let remainingBalance = remaining - p1 - p2;

      if (remainingBalance > 0 && p1Available > p1) {
        const extra = Math.min(p1Available - p1, remainingBalance);
        p1 += extra;
        remainingBalance -= extra;
      }

      if (remainingBalance > 0 && p2Available > p2) {
        const extra = Math.min(p2Available - p2, remainingBalance);
        p2 += extra;
      }

      return { p1, p2 };
    }
    case 'proportional': {
      const totalAvailable = p1Available + p2Available;
      if (totalAvailable <= 0) {
        return { p1: 0, p2: 0 };
      }

      let p1 = Math.min(p1Available, remaining * (p1Available / totalAvailable));
      let p2 = Math.min(p2Available, remaining * (p2Available / totalAvailable));
      let remainingBalance = remaining - p1 - p2;

      if (remainingBalance > 0 && p1Available > p1) {
        const extra = Math.min(p1Available - p1, remainingBalance);
        p1 += extra;
        remainingBalance -= extra;
      }

      if (remainingBalance > 0 && p2Available > p2) {
        const extra = Math.min(p2Available - p2, remainingBalance);
        p2 += extra;
      }

      return { p1, p2 };
    }
    case 'p1-first':
    default: {
      const p1 = Math.min(p1Available, remaining);
      const p2 = Math.min(p2Available, Math.max(0, remaining - p1));
      return { p1, p2 };
    }
  }
}

function selectTopStrategies(results: WaterfallResult[]): WaterfallResult[] {
  return [...results]
    .sort((left, right) => {
      if ((left.taxDominated ?? false) !== (right.taxDominated ?? false)) {
        return left.taxDominated ? 1 : -1;
      }
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
    if ((left.result.taxDominated ?? false) !== (right.result.taxDominated ?? false)) {
      return left.result.taxDominated ? 1 : -1;
    }
    if (left.result.feasible !== right.result.feasible) return left.result.feasible ? -1 : 1;
    if (left.result.totalTax !== right.result.totalTax) {
      return left.result.totalTax - right.result.totalTax;
    }
    return left.result.gap - right.result.gap;
  })[0];
}

function buildPolicyCandidate(policyOverride: OptimizerPolicyOverride): WaterfallConfig {
  return {
    label: 'goal-policy-override',
    dcOrder: policyOverride.dcOrder ?? BASELINE_STRATEGY.dcOrder,
    isaMode: policyOverride.isaMode ?? BASELINE_STRATEGY.isaMode,
    // Leave ISA ordering unset when the override does not specify it so
    // downstream policy resolution can derive an order consistent with dcOrder.
    ...(policyOverride.isaOrder !== undefined ? { isaOrder: policyOverride.isaOrder } : {}),
  };
}

function getCandidateStrategies(policyOverride?: OptimizerPolicyOverride): WaterfallConfig[] {
  if (!policyOverride) {
    return OPTIMIZER_CANDIDATES;
  }

  const filtered = OPTIMIZER_CANDIDATES.filter((candidate) => (
    (policyOverride.dcOrder === undefined || candidate.dcOrder === policyOverride.dcOrder)
    && (policyOverride.isaMode === undefined || candidate.isaMode === policyOverride.isaMode)
    && (policyOverride.isaOrder === undefined || candidate.isaOrder === policyOverride.isaOrder)
  ));

  if (filtered.length > 0) {
    return filtered;
  }

  return [buildPolicyCandidate(policyOverride)];
}

function inflateGoalTarget(todayMoneyValue: number, annualInflationPct: number, yearIndex: number): number {
  return todayMoneyValue * Math.pow(1 + annualInflationPct / 100, yearIndex);
}

function getSpendingTarget(
  state: PlannerState,
  row: YearlyProjection,
  policyOverride?: OptimizerPolicyOverride,
): number {
  const inflatedFloor = policyOverride?.minAnnualIncome
    ? inflateGoalTarget(policyOverride.minAnnualIncome, state.assumptions.inflation, row.yearIndex)
    : 0;
  return Math.max(row.spending, inflatedFloor);
}

function getCapitalFloor(
  state: PlannerState,
  row: YearlyProjection,
  policyOverride?: OptimizerPolicyOverride,
): number {
  // The care reserve is earmarked separately from spendable drawdown assets, so
  // it must not also be enforced as part of the spendable terminal capital floor.
  // Doing so would double-count the reserve and can incorrectly mark viable
  // plans as infeasible.
  return policyOverride?.bequestTarget
    ? inflateGoalTarget(policyOverride.bequestTarget, state.assumptions.inflation, row.yearIndex)
    : 0;
}

function getEffectiveIsaOrder(strategy: WaterfallConfig, mode: PlannerState['mode']): ISAOrder {
  if (mode !== 'couple') {
    return 'p1-first';
  }

  if (strategy.isaOrder) {
    return strategy.isaOrder;
  }

  switch (strategy.dcOrder) {
    case 'lisa-first':
      return 'p2-first';
    case 'equal':
      return 'equal';
    case 'proportional':
      return 'proportional';
    case 'paul-first':
    default:
      return 'p1-first';
  }
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

function buildTaxFreeWithdrawalBreakdown(grossAmount: number): TaxFreeWithdrawalBreakdown | undefined {
  if (grossAmount <= 0) return undefined;
  return { grossAmount };
}

function buildTaxableWithdrawalBreakdown(
  grossAmount: number,
  taxableAmount: number,
  taxDue: number,
): TaxableWithdrawalBreakdown | undefined {
  if (grossAmount <= 0) return undefined;
  return { grossAmount, taxableAmount, taxDue };
}

function attributeCapitalGainsTax(
  personalGain: number,
  jointGainShare: number,
  higherRate: boolean,
  calendarYear: number,
  exemptAmount: number,
): {
  personalTaxableGain: number;
  personalTaxDue: number;
  jointTaxableGain: number;
  jointTaxDue: number;
} {
  const personalTaxDue = personalGain > 0 ? calcCGT(personalGain, higherRate, calendarYear) : 0;
  const totalTaxDue = personalGain + jointGainShare > 0
    ? calcCGT(personalGain + jointGainShare, higherRate, calendarYear)
    : 0;
  const personalTaxableGain = Math.max(0, personalGain - exemptAmount);
  const jointTaxableGain = Math.max(0, jointGainShare - Math.max(0, exemptAmount - personalGain));

  return {
    personalTaxableGain,
    personalTaxDue,
    jointTaxableGain,
    jointTaxDue: Math.max(0, totalTaxDue - personalTaxDue),
  };
}

function buildYearDrawdownBreakdown(
  mode: PlannerState['mode'],
  drawdowns: DrawdownBreakdown,
  taxes: {
    p1PensionTaxDue: number;
    p2PensionTaxDue: number;
    p1GiaTaxableAmount: number;
    p1GiaTaxDue: number;
    p2GiaTaxableAmount: number;
    p2GiaTaxDue: number;
    jointGiaTaxableAmount: number;
    jointGiaTaxDue: number;
  },
): YearDrawdownBreakdown {
  const person1 = {
    pension: drawdowns.p1Dc > 0
      ? {
        grossAmount: drawdowns.p1Dc,
        pcls: drawdowns.p1DcTaxFree,
        taxableAmount: Math.max(0, drawdowns.p1Dc - drawdowns.p1DcTaxFree),
        taxDue: taxes.p1PensionTaxDue,
      }
      : undefined,
    isa: buildTaxFreeWithdrawalBreakdown(drawdowns.p1Isa),
    gia: buildTaxableWithdrawalBreakdown(drawdowns.p1Gia, taxes.p1GiaTaxableAmount, taxes.p1GiaTaxDue),
    cash: buildTaxFreeWithdrawalBreakdown(drawdowns.p1Cash),
  };

  const person2 = mode === 'couple'
    ? {
      pension: drawdowns.p2Dc > 0
        ? {
          grossAmount: drawdowns.p2Dc,
          pcls: drawdowns.p2DcTaxFree,
          taxableAmount: Math.max(0, drawdowns.p2Dc - drawdowns.p2DcTaxFree),
          taxDue: taxes.p2PensionTaxDue,
        }
        : undefined,
      isa: buildTaxFreeWithdrawalBreakdown(drawdowns.p2Isa),
      gia: buildTaxableWithdrawalBreakdown(drawdowns.p2Gia, taxes.p2GiaTaxableAmount, taxes.p2GiaTaxDue),
      cash: buildTaxFreeWithdrawalBreakdown(drawdowns.p2Cash),
    }
    : undefined;

  const joint = drawdowns.jointGia > 0
    ? {
      gia: buildTaxableWithdrawalBreakdown(drawdowns.jointGia, taxes.jointGiaTaxableAmount, taxes.jointGiaTaxDue),
    }
    : undefined;

  return {
    person1,
    person2,
    joint,
  };
}

function simulateCandidatePass(
  state: PlannerState,
  row: YearlyProjection,
  balances: OptimizerBalances,
  strategy: WaterfallConfig,
  grossTarget: number,
  policyOverride?: OptimizerPolicyOverride,
): CandidateEvaluation {
  const mode = state.mode;
  const working = cloneBalances(balances);
  const fixed = buildFixedIncomeContext(row);
  const calendarYear = CURRENT_TAX_YEAR_START + row.yearIndex;
  const snapshot = getSnapshotForYear(calendarYear);
  const spExempt = state.assumptions.statePensionSoleIncomeExempt ?? true;
  const isaOrder = getEffectiveIsaOrder(strategy, mode);

  const drawdowns: DrawdownBreakdown = {
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

  let remaining = Math.max(0, grossTarget - fixed.total);

  // Under UK UFPLS rules State Pension counts as taxable income, consuming personal
  // allowance headroom before any DC drawdown. Excluding it (as the original code did)
  // overstated how much DC could be drawn tax-free. Aligns with projectionEngine logic.
  const p1TaxableFixedIncome = fixed.p1OtherTaxable + fixed.p1StatePension;
  const p2TaxableFixedIncome = fixed.p2OtherTaxable + fixed.p2StatePension;
  const p1Headroom = Math.max(0, snapshot.incomeTaxBands.personalAllowance - p1TaxableFixedIncome);
  const p2Headroom = Math.max(0, snapshot.incomeTaxBands.personalAllowance - p2TaxableFixedIncome);
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
    const isaDrawdown = allocateIsaDrawdown(
      isaOrder,
      remaining,
      working.p1Isa,
      mode === 'couple' ? working.p2Isa : 0,
    );
    drawdowns.p1Isa += isaDrawdown.p1;
    working.p1Isa -= isaDrawdown.p1;
    remaining -= isaDrawdown.p1;

    if (mode === 'couple') {
      drawdowns.p2Isa += isaDrawdown.p2;
      working.p2Isa -= isaDrawdown.p2;
      remaining -= isaDrawdown.p2;
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
    const isaDrawdown = allocateIsaDrawdown(
      isaOrder,
      remaining,
      working.p1Isa,
      mode === 'couple' ? working.p2Isa : 0,
    );
    drawdowns.p1Isa += isaDrawdown.p1;
    working.p1Isa -= isaDrawdown.p1;
    remaining -= isaDrawdown.p1;

    if (mode === 'couple') {
      drawdowns.p2Isa += isaDrawdown.p2;
      working.p2Isa -= isaDrawdown.p2;
      remaining -= isaDrawdown.p2;
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

  const p1BaseStatePensionTaxable = spExempt && fixed.p1OtherTaxable === 0 ? 0 : fixed.p1StatePension;
  const p2BaseStatePensionTaxable = spExempt && fixed.p2OtherTaxable === 0 ? 0 : fixed.p2StatePension;
  const p1BaseTaxableIncome = p1BaseStatePensionTaxable + fixed.p1OtherTaxable;
  const p2BaseTaxableIncome = p2BaseStatePensionTaxable + fixed.p2OtherTaxable;

  const p1OtherTaxable = fixed.p1OtherTaxable + (drawdowns.p1Dc - drawdowns.p1DcTaxFree);
  const p2OtherTaxable = fixed.p2OtherTaxable + (drawdowns.p2Dc - drawdowns.p2DcTaxFree);
  const p1StatePensionTaxable = spExempt && p1OtherTaxable === 0 ? 0 : fixed.p1StatePension;
  const p2StatePensionTaxable = spExempt && p2OtherTaxable === 0 ? 0 : fixed.p2StatePension;
  const p1TaxableIncome = p1StatePensionTaxable + p1OtherTaxable;
  const p2TaxableIncome = p2StatePensionTaxable + p2OtherTaxable;

  const p1IncomeTax = calcIncomeTax(p1TaxableIncome, calendarYear);
  const p2IncomeTax = mode === 'couple' ? calcIncomeTax(p2TaxableIncome, calendarYear) : 0;
  const p1BaseIncomeTax = calcIncomeTax(p1BaseTaxableIncome, calendarYear);
  const p2BaseIncomeTax = mode === 'couple' ? calcIncomeTax(p2BaseTaxableIncome, calendarYear) : 0;
  const p1PensionTaxDue = drawdowns.p1Dc > 0 ? Math.max(0, p1IncomeTax - p1BaseIncomeTax) : 0;
  const p2PensionTaxDue = drawdowns.p2Dc > 0 ? Math.max(0, p2IncomeTax - p2BaseIncomeTax) : 0;

  const p1HigherRate = isHigherRateTaxpayer(p1TaxableIncome, calendarYear);
  const p2HigherRate = mode === 'couple' && isHigherRateTaxpayer(p2TaxableIncome, calendarYear);
  const p1Gains = attributeCapitalGainsTax(
    drawdowns.p1CapitalGain,
    jointGainEach,
    p1HigherRate,
    calendarYear,
    snapshot.cgt.exemptAmount,
  );
  const p2Gains = mode === 'couple'
    ? attributeCapitalGainsTax(
      drawdowns.p2CapitalGain,
      jointGainEach,
      p2HigherRate,
      calendarYear,
      snapshot.cgt.exemptAmount,
    )
    : { personalTaxableGain: 0, personalTaxDue: 0, jointTaxableGain: 0, jointTaxDue: 0 };

  const p1CgtPaid = p1Gains.personalTaxDue + p1Gains.jointTaxDue;
  const p2CgtPaid = p2Gains.personalTaxDue + p2Gains.jointTaxDue;
  const incomeTax = p1IncomeTax + p2IncomeTax;
  const cgtPaid = p1CgtPaid + p2CgtPaid;
  const totalTax = incomeTax + cgtPaid;
  const withdrawalTax = p1PensionTaxDue + p2PensionTaxDue + p1CgtPaid + p2CgtPaid;
  const remainingIsaCapacity = working.p1Isa + (mode === 'couple' ? working.p2Isa : 0);
  const totalDrawn = drawdowns.p1Dc + drawdowns.p1Isa + drawdowns.p1Gia + drawdowns.p1Cash
    + drawdowns.p2Dc + drawdowns.p2Isa + drawdowns.p2Gia + drawdowns.p2Cash + drawdowns.jointGia;
  const totalIncome = fixed.total + totalDrawn;
  const netIncome = totalIncome - totalTax;
  const spendingTarget = getSpendingTarget(state, row, policyOverride);
  const capitalFloor = getCapitalFloor(state, row, policyOverride);
  const terminalAssets = Math.max(0, sumTerminalAssets(working));
  const incomeGap = Math.max(0, spendingTarget - netIncome);
  const capitalGap = Math.max(0, capitalFloor - terminalAssets);

  const breakdown = buildYearDrawdownBreakdown(mode, drawdowns, {
    p1PensionTaxDue,
    p2PensionTaxDue,
    p1GiaTaxableAmount: p1Gains.personalTaxableGain,
    p1GiaTaxDue: p1Gains.personalTaxDue,
    p2GiaTaxableAmount: p2Gains.personalTaxableGain,
    p2GiaTaxDue: p2Gains.personalTaxDue,
    jointGiaTaxableAmount: p1Gains.jointTaxableGain + p2Gains.jointTaxableGain,
    jointGiaTaxDue: p1Gains.jointTaxDue + p2Gains.jointTaxDue,
  });

  return {
    result: {
      strategy,
      totalTax,
      incomeTax,
      cgtPaid,
      p1IncomeTax,
      p2IncomeTax,
      p1CgtPaid,
      p2CgtPaid,
      feasible: incomeGap <= FEASIBILITY_TOLERANCE_GBP && capitalGap <= FEASIBILITY_TOLERANCE_GBP,
      gap: Math.max(incomeGap, capitalGap),
      spendingTarget,
      fixedIncome: fixed.total,
      totalIncome,
      netIncome,
      p1TaxableIncome,
      p2TaxableIncome,
      terminalAssets,
      drawdowns,
      breakdown,
      endingBalances: {
        p1DcBalance: working.p1Dc,
        p1IsaBalance: working.p1Isa,
        p1GiaValue: working.p1GiaValue,
        p1GiaBaseCost: working.p1GiaBaseCost,
        p1CashBalance: working.p1Cash,
        p2DcBalance: working.p2Dc,
        p2IsaBalance: working.p2Isa,
        p2GiaValue: working.p2GiaValue,
        p2GiaBaseCost: working.p2GiaBaseCost,
        p2CashBalance: working.p2Cash,
        jointGiaValue: working.jointGiaValue,
        jointGiaBaseCost: working.jointGiaBaseCost,
      },
      // Only treat withdrawal-driven tax as dominated when the strategy is
      // intended to use ISA assets immediately. Deferred ISA strategies may
      // intentionally leave ISA balances untouched for later years.
      taxDominated: strategy.isaMode === 'now'
        && withdrawalTax > FEASIBILITY_TOLERANCE_GBP
        && remainingIsaCapacity > FEASIBILITY_TOLERANCE_GBP,
    },
    endBalances: working,
  };
}

function evaluateCandidate(
  state: PlannerState,
  row: YearlyProjection,
  balances: OptimizerBalances,
  strategy: WaterfallConfig,
  policyOverride?: OptimizerPolicyOverride,
): CandidateEvaluation {
  // Treat required spending as a net cash target. Gross withdrawals are
  // iteratively increased until the after-tax result matches the target or
  // the candidate runs out of assets.
  const spendingTarget = getSpendingTarget(state, row, policyOverride);
  let grossTarget = spendingTarget;
  let evaluation = simulateCandidatePass(state, row, balances, strategy, grossTarget, policyOverride);

  for (let grossIter = 0; grossIter < GROSS_UP_MAX_ITERATIONS; grossIter += 1) {
    if (evaluation.result.gap <= FEASIBILITY_TOLERANCE_GBP) {
      break;
    }

    const newTarget = spendingTarget + evaluation.result.totalTax;
    if (newTarget - grossTarget <= FEASIBILITY_TOLERANCE_GBP) {
      break;
    }

    const nextEvaluation = simulateCandidatePass(state, row, balances, strategy, newTarget, policyOverride);
    const noMeaningfulIncomeIncrease =
      nextEvaluation.result.totalIncome <= evaluation.result.totalIncome + FEASIBILITY_TOLERANCE_GBP;
    const noMeaningfulGapImprovement =
      nextEvaluation.result.gap >= evaluation.result.gap - FEASIBILITY_TOLERANCE_GBP;

    grossTarget = newTarget;
    evaluation = nextEvaluation;

    if (noMeaningfulIncomeIncrease && noMeaningfulGapImprovement) {
      break;
    }
  }

  return evaluation;
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
  precomputedProjections?: YearlyProjection[],
  policyOverride?: OptimizerPolicyOverride,
): {
  yearRecords: YearRecord[];
  lifetimeTaxPaid: number;
  assetDepletionAge: number | null;
  terminalAssets: number;
  ruleProvenance: RuleProvenance[];
  baseProjections: YearlyProjection[];
} {
  const baseProjections = precomputedProjections ?? calculateProjections(state);
  const postFiRows = baseProjections.filter((row) => row.p1Age >= state.fiAge);
  const growth = assetGrowthRates(state);
  let balances = seedBalances(state, baseProjections);
  const provenance = new Map<string, RuleProvenance>();
  const yearRecords: YearRecord[] = [];
  const strategies = strategySelector === 'optimized'
    ? getCandidateStrategies(policyOverride)
    : [BASELINE_STRATEGY];

  for (const row of postFiRows) {
    const calendarYear = CURRENT_TAX_YEAR_START + row.yearIndex;
    recordRuleProvenance(provenance, calendarYear);
    balances = applyGrowth(balances, growth);
    const startingBalances = cloneBalances(balances);

    const evaluated = strategies.map((strategy) =>
      evaluateCandidate(state, row, balances, strategy, strategySelector === 'optimized' ? policyOverride : undefined),
    );
    // Reuse the baseline candidate when it was already evaluated; only recompute
    // it when candidate filtering excluded the baseline strategy.
    const baselineStrategyIndex = strategies.indexOf(BASELINE_STRATEGY);
    const baselineResult = baselineStrategyIndex >= 0
      ? evaluated[baselineStrategyIndex].result
      : evaluateCandidate(state, row, startingBalances, BASELINE_STRATEGY).result;
    const winner = strategySelector === 'baseline'
      ? evaluated[0]
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
      baseline: baselineResult,
      terminalAssets: winner.result.terminalAssets,
      drawdownBreakdown: winner.result.breakdown,
    });
  }

  const depletionAge = yearRecords.find((record) => record.terminalAssets <= 0)?.p1Age ?? null;

  return {
    yearRecords,
    lifetimeTaxPaid: yearRecords.reduce((sum, record) => sum + record.winner.totalTax, 0),
    assetDepletionAge: depletionAge,
    terminalAssets: yearRecords.at(-1)?.terminalAssets ?? sumTerminalAssets(balances),
    ruleProvenance: [...provenance.values()],
    baseProjections,
  };
}

export function optimizeWithdrawals(
  state: PlannerState,
  options?: OptimizerOptions,
): OptimizationResult {
  // Compute projections once and share between both simulation passes to avoid
  // duplicate calculateProjections() calls.
  const sharedProjections = calculateProjections(state);
  const optimized = simulateStrategies(
    state,
    options?.baselineOnly ? 'baseline' : 'optimized',
    sharedProjections,
    options?.policyOverride,
  );
  const baseline = simulateStrategies(state, 'baseline', sharedProjections);
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
    baselineProjections: sharedProjections,
  };
}
