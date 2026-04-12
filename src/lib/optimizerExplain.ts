import { z } from 'zod';
import type { OptimizationResult, RuleProvenance, WaterfallConfig } from '@/financialEngine/types';
import type { PlannerState, TaxJurisdiction } from '@/models/types';

export const DEFAULT_EXPLAIN_SCHEMA_VERSION = '2';

export const CONSENT_SCOPE_VALUES = [
  'household-demographics',
  'financial-summary',
  'optimization-result',
  'rule-provenance',
  'mcp-citations',
  'rag-guidance',
] as const;

export type ConsentScope = typeof CONSENT_SCOPE_VALUES[number];

export const REQUIRED_EXPLAIN_CONSENT_SCOPES = [
  'household-demographics',
  'financial-summary',
  'optimization-result',
  'rule-provenance',
] as const satisfies readonly ConsentScope[];

export interface OptimizationSummary {
  recommendedStrategy: WaterfallConfig;
  baselineStrategy: WaterfallConfig;
  lifetimeTaxSaving: number;
  assetDepletionAge: number | null;
  terminalAssets: number;
  firstYearSpending: number;
  firstYearNetIncome: number;
  firstYearTax: number;
  laterYearTaxApplies: boolean;
  ruleProvenance: RuleProvenance[];
}

export interface TimelineFacts {
  planStartAges: number[];
  statePensionStartAges: number[];
  dbPensionStartAges: number[];
  annuityStartAges: number[];
}

export interface OptimizerExplainRequest {
  requestId: string;
  planRevision: string;
  schemaVersion: string;
  consent: {
    grantedAt: string;
    scope: ConsentScope[];
  };
  subject: {
    householdType: 'single' | 'couple';
    ages: number[];
    jurisdiction: TaxJurisdiction;
  };
  financialSummary: {
    guaranteedIncomeAnnual: number;
    dcTotal: number;
    isaTotal: number;
    giaTotal: number;
    targetSpendingAnnual: number;
  };
  timelineFacts: TimelineFacts;
  optimizationResult: OptimizationSummary;
}

export interface BuildOptimizerExplainRequestArgs {
  plannerState: PlannerState;
  optimizationResult: OptimizationResult;
  planRevision: string;
  consentScope: ConsentScope[];
  requestId: string;
  grantedAt?: string;
  schemaVersion?: string;
  jurisdiction?: TaxJurisdiction;
}

export interface RuleCitation {
  ruleId: string;
  version: string;
  taxYear: string;
  jurisdiction: TaxJurisdiction;
  title: string;
  url?: string;
  summary?: string;
}

export interface HmrcChunk {
  id: string;
  manual_ref: string;
  section_title: string;
  text: string;
  rule_ids: string[];
  source_url: string;
  applicable_tax_year: string;
  jurisdiction: TaxJurisdiction;
  title?: string;
  url?: string;
  taxYear?: string;
}

const WATERFALL_DC_ORDER_VALUES = ['p1-first', 'equal', 'proportional', 'p2-first'] as const;
const WATERFALL_ISA_MODE_VALUES = ['now', 'defer'] as const;

const waterfallConfigSchema = z.object({
  dcOrder: z.enum(WATERFALL_DC_ORDER_VALUES),
  isaMode: z.enum(WATERFALL_ISA_MODE_VALUES),
  label: z.string().min(1).max(64),
});

const ruleProvenanceSchema = z.object({
  rule_id: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
  tax_year_requested: z.string().regex(/^\d{4}-\d{2}$/),
  tax_year_used: z.string().regex(/^\d{4}-\d{2}$/),
  jurisdiction: z.enum(['rUK', 'scotland']),
  is_fallback: z.boolean(),
});

const optimizationSummarySchema = z.object({
  recommendedStrategy: waterfallConfigSchema,
  baselineStrategy: waterfallConfigSchema,
  lifetimeTaxSaving: z.number().finite(),
  assetDepletionAge: z.number().int().min(0).max(150).nullable(),
  terminalAssets: z.number().finite(),
  firstYearSpending: z.number().finite().min(0),
  firstYearNetIncome: z.number().finite().min(0),
  firstYearTax: z.number().finite().min(0),
  laterYearTaxApplies: z.boolean(),
  ruleProvenance: z.array(ruleProvenanceSchema).min(1),
});

const timelineFactsSchema = z.object({
  planStartAges: z.array(z.number().int().min(18).max(120)).min(1).max(2),
  statePensionStartAges: z.array(z.number().int().min(18).max(120)).max(2),
  dbPensionStartAges: z.array(z.number().int().min(18).max(120)).max(2),
  annuityStartAges: z.array(z.number().int().min(18).max(120)).max(2),
});

const consentSchema = z.object({
  grantedAt: z.string().datetime({ offset: true }),
  scope: z.array(z.enum(CONSENT_SCOPE_VALUES)).min(1),
});

export const OptimizerExplainRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  planRevision: z.string().regex(/^(etag:[^\s]{1,240}|sha256:[0-9a-f]{64})$/),
  schemaVersion: z.string().min(1).max(32),
  consent: consentSchema,
  subject: z.object({
    householdType: z.enum(['single', 'couple']),
    ages: z.array(z.number().int().min(18).max(120)).min(1).max(2),
    jurisdiction: z.enum(['rUK', 'scotland']),
  }),
  financialSummary: z.object({
    guaranteedIncomeAnnual: z.number().finite().min(0),
    dcTotal: z.number().finite().min(0),
    isaTotal: z.number().finite().min(0),
    giaTotal: z.number().finite().min(0),
    targetSpendingAnnual: z.number().finite().min(0),
  }),
  timelineFacts: timelineFactsSchema,
  optimizationResult: optimizationSummarySchema,
}).superRefine((value, ctx) => {
  for (const scope of REQUIRED_EXPLAIN_CONSENT_SCOPES) {
    if (!value.consent.scope.includes(scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing required consent scope: ${scope}`,
        path: ['consent', 'scope'],
      });
    }
  }

  if (value.subject.householdType === 'single' && value.subject.ages.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Single-household requests must include exactly one age.',
      path: ['subject', 'ages'],
    });
  }

  if (value.subject.householdType === 'couple' && value.subject.ages.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Couple requests must include exactly two ages.',
      path: ['subject', 'ages'],
    });
  }

  if (value.subject.householdType === 'single' && value.timelineFacts.planStartAges.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Single-household timeline facts must include exactly one plan start age.',
      path: ['timelineFacts', 'planStartAges'],
    });
  }

  if (value.subject.householdType === 'couple' && value.timelineFacts.planStartAges.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Couple timeline facts must include exactly two plan start ages.',
      path: ['timelineFacts', 'planStartAges'],
    });
  }
});

function sumGuaranteedIncomeAnnual(plannerState: PlannerState): number {
  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  return people.reduce((sum, person) => {
    const incomeSources = person.incomeSources;
    const statePension = incomeSources.statePension.enabled
      ? incomeSources.statePension.weeklyAmount * 52
      : 0;
    const dbPension = incomeSources.dbPension.enabled ? incomeSources.dbPension.annualIncome : 0;
    const annuity = incomeSources.annuity.enabled ? incomeSources.annuity.annualIncome : 0;

    return sum + statePension + dbPension + annuity;
  }, 0);
}

function totalDc(plannerState: PlannerState): number {
  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  return people.reduce((sum, person) => (
    sum + (person.incomeSources.dcPension.enabled ? person.incomeSources.dcPension.totalValue : 0)
  ), 0);
}

function totalIsa(plannerState: PlannerState): number {
  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  return people.reduce((sum, person) => (
    sum + (person.assets.isaInvestments.enabled ? person.assets.isaInvestments.totalValue : 0)
  ), 0);
}

function totalGia(plannerState: PlannerState): number {
  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  const personalGia = people.reduce((sum, person) => (
    sum + (person.assets.generalInvestments.enabled ? person.assets.generalInvestments.totalValue : 0)
  ), 0);

  return personalGia + (plannerState.jointGia.enabled ? plannerState.jointGia.totalValue : 0);
}

function uniqSorted(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => Number.isFinite(value)))].sort((left, right) => left - right);
}

function buildTimelineFacts(
  plannerState: PlannerState,
  optimizationResult: OptimizationResult,
): TimelineFacts {
  const firstYear = optimizationResult.yearRecords[0];
  const planStartAges = (() => {
    if (plannerState.mode !== 'couple') {
      return [firstYear?.p1Age ?? plannerState.fiAge];
    }

    // Couple timelines must always include both household members' start ages.
    // Failing fast here avoids emitting ambiguous facts that contradict the household type.
    if (firstYear?.p1Age == null || firstYear.p2Age == null) {
      throw new Error('Expected optimization result to include both p1Age and p2Age for couple timeline facts');
    }

    return [firstYear.p1Age, firstYear.p2Age];
  })();

  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  return {
    planStartAges,
    statePensionStartAges: uniqSorted(people.map((person) => (
      person.incomeSources.statePension.enabled ? person.incomeSources.statePension.startAge : null
    ))),
    dbPensionStartAges: uniqSorted(people.map((person) => (
      person.incomeSources.dbPension.enabled ? person.incomeSources.dbPension.startAge : null
    ))),
    annuityStartAges: uniqSorted(people.map((person) => (
      person.incomeSources.annuity.enabled ? person.incomeSources.annuity.startAge : null
    ))),
  };
}

export function buildOptimizationSummary(result: OptimizationResult): OptimizationSummary {
  const firstYear = result.yearRecords[0]?.winner;
  const firstYearSpending = result.yearRecords[0]?.spending ?? 0;
  const laterYearTaxApplies = result.yearRecords.slice(1).some((record) => record.winner.totalTax > 0);
  const roundMoney = (value: number): number => Math.round(value * 100) / 100;

  return {
    recommendedStrategy: { ...result.recommendedStrategy },
    baselineStrategy: { ...result.baselineStrategy },
    lifetimeTaxSaving: result.lifetimeTaxSaving,
    assetDepletionAge: result.assetDepletionAge,
    terminalAssets: result.terminalAssets,
    firstYearSpending: roundMoney(firstYearSpending),
    firstYearNetIncome: roundMoney(firstYear?.netIncome ?? 0),
    firstYearTax: roundMoney(firstYear?.totalTax ?? 0),
    laterYearTaxApplies,
    ruleProvenance: result.ruleProvenance.map((entry) => ({ ...entry })),
  };
}

export function buildOptimizerExplainRequest(
  args: BuildOptimizerExplainRequestArgs,
): OptimizerExplainRequest {
  const { plannerState, optimizationResult, planRevision, consentScope, requestId } = args;
  const ages = plannerState.mode === 'couple'
    ? [plannerState.person1.currentAge, plannerState.person2.currentAge]
    : [plannerState.person1.currentAge];

  const request: OptimizerExplainRequest = {
    requestId,
    planRevision,
    schemaVersion: args.schemaVersion ?? DEFAULT_EXPLAIN_SCHEMA_VERSION,
    consent: {
      grantedAt: args.grantedAt ?? new Date().toISOString(),
      scope: [...new Set(consentScope)],
    },
    subject: {
      householdType: plannerState.mode,
      ages,
      jurisdiction: args.jurisdiction ?? 'rUK',
    },
    financialSummary: {
      guaranteedIncomeAnnual: sumGuaranteedIncomeAnnual(plannerState),
      dcTotal: totalDc(plannerState),
      isaTotal: totalIsa(plannerState),
      giaTotal: totalGia(plannerState),
      targetSpendingAnnual: optimizationResult.yearRecords[0]?.spending ?? 0,
    },
    timelineFacts: buildTimelineFacts(plannerState, optimizationResult),
    optimizationResult: buildOptimizationSummary(optimizationResult),
  };

  return OptimizerExplainRequestSchema.parse(request);
}
