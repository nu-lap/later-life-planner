import { z } from 'zod';
import type { CareReserve, GoalConfig, GoalId, GoalRegistry, PlannerState, TaxJurisdiction } from '@/models/types';
import type { OptimizerPolicyOverride } from '@/financialEngine/types';

export const DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION = '1';

const GOAL_ID_VALUES = [
  'longevity_protection',
  'spending_floor',
  'aspirational_spending',
  'tax_efficiency',
  'liquidity_preservation',
  'survivorship',
  'care_reserve',
  'bequest',
  'inflation_resilience',
] as const satisfies readonly GoalId[];

export interface GoalPlanSummary {
  householdType: 'single' | 'couple';
  ages: number[];
  jurisdiction: TaxJurisdiction;
  targetSpendingAnnual: number;
  guaranteedIncomeAnnual: number;
  dcTotal: number;
  isaTotal: number;
  giaTotal: number;
  careReserveAmount: number;
}

export interface GoalOrchestrateRequest {
  requestId: string;
  schemaVersion: string;
  planSummary: GoalPlanSummary;
  goalRegistry: GoalRegistry;
  naturalLanguageInput?: string;
}

const goalConfigSchema = z.object({
  id: z.enum(GOAL_ID_VALUES),
  priority: z.number().int().min(1).max(20),
  userWeight: z.number().min(0).max(1).optional(),
  enabled: z.boolean(),
  targetValue: z.number().finite().min(0).optional(),
});

const goalPlanSummarySchema = z.object({
  householdType: z.enum(['single', 'couple']),
  ages: z.array(z.number().int().min(18).max(120)).min(1).max(2),
  jurisdiction: z.enum(['rUK', 'scotland']),
  targetSpendingAnnual: z.number().finite().min(0),
  guaranteedIncomeAnnual: z.number().finite().min(0),
  dcTotal: z.number().finite().min(0),
  isaTotal: z.number().finite().min(0),
  giaTotal: z.number().finite().min(0),
  careReserveAmount: z.number().finite().min(0),
});

export const GoalOrchestrateRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  schemaVersion: z.string().min(1).max(32),
  planSummary: goalPlanSummarySchema,
  goalRegistry: z.array(goalConfigSchema).min(1),
  naturalLanguageInput: z.string().trim().max(4000).optional(),
}).superRefine((value, ctx) => {
  const enabled = value.goalRegistry.filter((goal) => goal.enabled);
  if (enabled.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one enabled goal is required.',
      path: ['goalRegistry'],
    });
  }

  const uniqueIds = new Set(enabled.map((goal) => goal.id));
  if (uniqueIds.size !== enabled.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enabled goals must not contain duplicates.',
      path: ['goalRegistry'],
    });
  }
});

const DEFAULT_GOAL_STACK: GoalId[] = [
  'longevity_protection',
  'spending_floor',
  'tax_efficiency',
  'liquidity_preservation',
  'survivorship',
  'care_reserve',
  'bequest',
  'inflation_resilience',
  'aspirational_spending',
];

export function buildDefaultGoalRegistry(): GoalRegistry {
  return DEFAULT_GOAL_STACK.map((id, index) => ({
    id,
    priority: index + 1,
    enabled: true,
  }));
}

function totalGuaranteedIncome(plannerState: PlannerState): number {
  const people = plannerState.mode === 'couple'
    ? [plannerState.person1, plannerState.person2]
    : [plannerState.person1];

  return people.reduce((sum, person) => {
    const { statePension, dbPension, annuity } = person.incomeSources;
    return sum
      + (statePension.enabled ? statePension.weeklyAmount * 52 : 0)
      + (dbPension.enabled ? dbPension.annualIncome : 0)
      + (annuity.enabled ? annuity.annualIncome : 0);
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

  const jointGia = plannerState.mode === 'couple' && plannerState.jointGia.enabled
    ? plannerState.jointGia.totalValue
    : 0;

  return personalGia + jointGia;
}

export function buildGoalPlanSummary(plannerState: PlannerState): GoalPlanSummary {
  const goGoStageId = plannerState.lifeStages[0]?.id ?? 'go-go';
  const targetSpendingAnnual = plannerState.spendingCategories.reduce((sum, category) => (
    sum + (category.amounts[goGoStageId] ?? 0)
  ), 0);

  return {
    householdType: plannerState.mode,
    ages: plannerState.mode === 'couple'
      ? [plannerState.person1.currentAge, plannerState.person2.currentAge]
      : [plannerState.person1.currentAge],
    jurisdiction: 'rUK',
    targetSpendingAnnual,
    guaranteedIncomeAnnual: totalGuaranteedIncome(plannerState),
    dcTotal: totalDc(plannerState),
    isaTotal: totalIsa(plannerState),
    giaTotal: totalGia(plannerState),
    careReserveAmount: plannerState.careReserve.enabled ? plannerState.careReserve.amount : 0,
  };
}

export function normalizeGoalRegistry(goalRegistry: GoalRegistry | undefined | null): GoalRegistry {
  if (!goalRegistry || goalRegistry.length === 0) {
    return buildDefaultGoalRegistry();
  }

  return goalRegistry
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .map((goal, index) => ({
      id: goal.id,
      priority: index + 1,
      userWeight: goal.userWeight,
      enabled: goal.enabled,
      targetValue: goal.targetValue,
    }));
}

export interface BuildGoalOrchestrateRequestArgs {
  plannerState: PlannerState;
  goalRegistry: GoalRegistry;
  requestId: string;
  naturalLanguageInput?: string;
  schemaVersion?: string;
}

export function buildGoalOrchestrateRequest(
  args: BuildGoalOrchestrateRequestArgs,
): GoalOrchestrateRequest {
  return GoalOrchestrateRequestSchema.parse({
    requestId: args.requestId,
    schemaVersion: args.schemaVersion ?? DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
    planSummary: buildGoalPlanSummary(args.plannerState),
    goalRegistry: normalizeGoalRegistry(args.goalRegistry),
    naturalLanguageInput: args.naturalLanguageInput?.trim() || undefined,
  });
}

export async function orchestrateGoals(
  request: GoalOrchestrateRequest,
): Promise<OptimizerPolicyOverride> {
  const response = await fetch('/api/goal-orchestrate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail?.error === 'string' ? detail.error : 'Goal orchestration failed.');
  }

  const body = await response.json() as { policyOverride: OptimizerPolicyOverride };
  return body.policyOverride;
}

export function syncGoalTarget(
  goalRegistry: GoalRegistry,
  goalId: GoalId,
  options: { enabled?: boolean; targetValue?: number },
): GoalRegistry {
  return normalizeGoalRegistry(goalRegistry).map((goal) => {
    if (goal.id !== goalId) return goal;

    return {
      ...goal,
      enabled: options.enabled ?? goal.enabled,
      ...(Object.prototype.hasOwnProperty.call(options, 'targetValue')
        ? { targetValue: options.targetValue }
        : {}),
    };
  });
}

export function syncCareReserveGoal(
  goalRegistry: GoalRegistry,
  careReserve: CareReserve | undefined | null,
): GoalRegistry {
  const enabled = Boolean(careReserve?.enabled);
  const targetValue = enabled ? Math.max(0, careReserve?.amount ?? 0) : undefined;

  return syncGoalTarget(goalRegistry, 'care_reserve', {
    enabled,
    targetValue,
  });
}
