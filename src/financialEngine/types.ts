import type { TaxJurisdiction, YearlyProjection } from '@/models/types';

export type DCOrder = 'p1-first' | 'equal' | 'proportional' | 'p2-first';
export type ISAMode = 'now' | 'defer';
export type ISAOrder = 'p1-first' | 'p2-first' | 'equal' | 'proportional';

export interface WaterfallConfig {
  dcOrder: DCOrder;
  isaMode: ISAMode;
  isaOrder?: ISAOrder;
  label: string;
}

export interface OptimizerPolicyOverride {
  dcOrder?: DCOrder;
  isaMode?: ISAMode;
  isaOrder?: ISAOrder;
  minAnnualIncome?: number;
  careReserveTarget?: number;
  bequestTarget?: number;
  inflationAdjustSpending?: boolean;
  rationale: string;
}

export interface DrawdownBreakdown {
  p1Dc: number;
  p1Isa: number;
  p1Gia: number;
  p1Cash: number;
  p2Dc: number;
  p2Isa: number;
  p2Gia: number;
  p2Cash: number;
  jointGia: number;
  p1CapitalGain: number;
  p2CapitalGain: number;
  jointCapitalGain: number;
  p1DcTaxFree: number;
  p2DcTaxFree: number;
}

export interface PensionWithdrawalBreakdown {
  grossAmount: number;
  pcls: number;
  taxableAmount: number;
  taxDue: number;
}

export interface TaxableWithdrawalBreakdown {
  grossAmount: number;
  taxableAmount: number;
  taxDue: number;
}

export interface TaxFreeWithdrawalBreakdown {
  grossAmount: number;
}

export interface PersonDrawdownBreakdown {
  pension?: PensionWithdrawalBreakdown;
  isa?: TaxFreeWithdrawalBreakdown;
  gia?: TaxableWithdrawalBreakdown;
  cash?: TaxFreeWithdrawalBreakdown;
}

export interface JointDrawdownBreakdown {
  gia?: TaxableWithdrawalBreakdown;
}

export interface YearDrawdownBreakdown {
  person1: PersonDrawdownBreakdown;
  person2?: PersonDrawdownBreakdown;
  joint?: JointDrawdownBreakdown;
}

export interface OptimizerEndingBalances {
  p1DcBalance: number;
  p1IsaBalance: number;
  p1GiaValue: number;
  p1GiaBaseCost: number;
  p1CashBalance: number;
  p2DcBalance: number;
  p2IsaBalance: number;
  p2GiaValue: number;
  p2GiaBaseCost: number;
  p2CashBalance: number;
  jointGiaValue: number;
  jointGiaBaseCost: number;
}

export interface WaterfallResult {
  strategy: WaterfallConfig;
  totalTax: number;
  incomeTax: number;
  cgtPaid: number;
  p1IncomeTax: number;
  p2IncomeTax: number;
  p1CgtPaid: number;
  p2CgtPaid: number;
  feasible: boolean;
  gap: number;
  spendingTarget: number;
  fixedIncome: number;
  totalIncome: number;
  netIncome: number;
  p1TaxableIncome: number;
  p2TaxableIncome: number;
  terminalAssets: number;
  drawdowns: DrawdownBreakdown;
  breakdown: YearDrawdownBreakdown;
  endingBalances: OptimizerEndingBalances;
  taxDominated?: boolean;
}

export interface RuleProvenance {
  rule_id: string;
  version: string;
  tax_year_requested: string;
  tax_year_used: string;
  jurisdiction: TaxJurisdiction;
  is_fallback: boolean;
}

export interface YearRecord {
  yearIndex: number;
  taxYear: string;
  p1Age: number;
  p2Age: number | null;
  spending: number;
  winner: WaterfallResult;
  topStrategies: WaterfallResult[];
  candidateResults: WaterfallResult[];
  baseline: WaterfallResult;
  terminalAssets: number;
  drawdownBreakdown: YearDrawdownBreakdown;
}

export interface OptimizationResult {
  recommendedStrategy: WaterfallConfig;
  baselineStrategy: WaterfallConfig;
  lifetimeTaxSaving: number;
  lifetimeTaxPaid: number;
  baselineLifetimeTaxPaid: number;
  assetDepletionAge: number | null;
  baselineAssetDepletionAge: number | null;
  terminalAssets: number;
  yearRecords: YearRecord[];
  ruleProvenance: RuleProvenance[];
  baselineProjections: YearlyProjection[];
}
