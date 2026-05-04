'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useOptionalGetToken } from '@/hooks/useOptionalGetToken';
import { newId } from '@/lib/ids';
import {
  calculateProjections,
  getAssetDepletionAge,
  formatCurrency,
  getStageTotalSpending,
} from '@/lib/calculations';
import ProInterestModal from '@/components/ProInterestModal';
import DashboardMain from '@/components/DashboardMain';
// DashboardSidebar is no longer rendered — kept as a file reference to avoid breaking any test imports
// import DashboardSidebar from '@/components/DashboardSidebar';
import IHTOutlookPanel from '@/components/IHTOutlookPanel';
import ProFeatureBanner from '@/components/ProFeatureBanner';
import { CARE_RESERVE, CURRENT_TAX_YEAR_START, GOAL_PANEL, PENSION_RULES, CGT, INCOME_TAX } from '@/config/financialConstants';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import {
  buildGoalOrchestrateRequest,
  DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
  orchestrateGoals,
  sortGoalRegistry,
  syncCareReserveGoal,
} from '@/lib/goalOrchestration';
import type { YearlyProjection } from '@/lib/types';
import type { OptimizationResult, OptimizerPolicyOverride } from '@/financialEngine/types';
import type { CareReserve, DrawdownStrategy, GoalConfig, GoalId } from '@/models/types';
import InfoIcon from '@/components/ui/InfoIcon';
import { GLOSSARY } from '@/lib/glossary';
import clsx from 'clsx';

interface Props { onBack: () => void }

type ActiveTab = 'overview' | 'strategy' | 'goals' | 'iht' | 'care';

// ─── Goal priority panel helpers ───────────────────────────────────────────────

const GOAL_TARGET_FORMATTER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

interface GoalTargetControlConfig {
  max: number;
  step: number;
  suggested?: number;
}

const GOAL_COPY: Record<GoalId, {
  label: string;
  description: string;
  targetLabel?: string;
  icon: string;
  accent: string;
  badge: string;
}> = {
  longevity_protection: {
    label: 'Longevity protection',
    description: 'Keep enough income and assets in place so the plan is less likely to run short later in life.',
    targetLabel: 'Minimum annual income',
    icon: '⏳',
    accent: 'border-amber-100 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
  },
  spending_floor: {
    label: 'Spending floor',
    description: 'Protect a minimum level of yearly spending before other priorities.',
    targetLabel: 'Minimum annual income',
    icon: '🧱',
    accent: 'border-orange-100 bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
  },
  aspirational_spending: {
    label: 'Aspirational spending',
    description: 'Leave room for discretionary spending once the core plan is secure.',
    icon: '✨',
    accent: 'border-violet-100 bg-violet-50',
    badge: 'bg-violet-100 text-violet-700',
  },
  tax_efficiency: {
    label: 'Tax efficiency',
    description: 'Prefer lower-tax withdrawal paths when they do not break higher-priority goals.',
    icon: '📉',
    accent: 'border-emerald-100 bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  liquidity_preservation: {
    label: 'Liquidity preservation',
    description: 'Keep flexible wrappers such as ISAs available for later years where possible.',
    icon: '💧',
    accent: 'border-sky-100 bg-sky-50',
    badge: 'bg-sky-100 text-sky-700',
  },
  survivorship: {
    label: 'Survivorship',
    description: 'Balance withdrawals across both partners where that supports a stronger survivor position.',
    icon: '🤝',
    accent: 'border-blue-100 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  care_reserve: {
    label: 'Care reserve',
    description: 'Protect capital that should stay available for later-life care costs.',
    targetLabel: 'Protected capital',
    icon: '🛡️',
    accent: 'border-teal-100 bg-teal-50',
    badge: 'bg-teal-100 text-teal-700',
  },
  bequest: {
    label: 'Bequest',
    description: 'Protect a minimum estate value that should still remain at the end of the plan.',
    targetLabel: 'Bequest floor',
    icon: '🎁',
    accent: 'border-fuchsia-100 bg-fuchsia-50',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
  },
  inflation_resilience: {
    label: 'Inflation resilience',
    description: 'Keep the plan better able to absorb rising costs over time.',
    icon: '📈',
    accent: 'border-rose-100 bg-rose-50',
    badge: 'bg-rose-100 text-rose-700',
  },
};

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function clampGoalTargetValue(value: number | undefined, max: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.min(max, Math.max(0, value));
}

function parseGoalTargetDraft(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^[+-]?[\d,\s]+$/.test(trimmed)) return undefined;
  const normalized = trimmed.replace(/[\s,]/g, '');
  if (!/^[+-]?\d+$/.test(normalized)) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, parsed);
}

function formatGoalTargetInput(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '';
  return GOAL_TARGET_FORMATTER.format(value);
}

function moveGoal(goalRegistry: GoalConfig[], index: number, direction: -1 | 1): GoalConfig[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= goalRegistry.length) return goalRegistry;
  const next = goalRegistry.slice();
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((goal, nextIndex) => ({ ...goal, priority: nextIndex + 1 }));
}

function updateOrderedGoals(
  orderedGoals: GoalConfig[],
  updater: (goal: GoalConfig, index: number) => GoalConfig,
): GoalConfig[] {
  return sortGoalRegistry(orderedGoals.map(updater));
}

function canMoveGoal(orderedGoals: GoalConfig[], index: number, direction: -1 | 1): boolean {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= orderedGoals.length) return false;
  return orderedGoals[targetIndex].enabled === orderedGoals[index].enabled;
}

function GoalPriorityPanel({
  goalRegistry,
  onChange,
  careReserve,
  onCareReserveChange,
  isApplying,
  targetControlConfig,
}: {
  goalRegistry: GoalConfig[];
  onChange: (goalRegistry: GoalConfig[]) => void;
  careReserve: CareReserve;
  onCareReserveChange: (updates: Partial<CareReserve>) => void;
  isApplying: boolean;
  targetControlConfig: Partial<Record<GoalId, GoalTargetControlConfig>>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const isGoalEnabled = (goal: GoalConfig) => (
    goal.id === 'care_reserve' ? careReserve.enabled : goal.enabled
  );
  const orderedGoals = useMemo(() => sortGoalRegistry(goalRegistry), [goalRegistry]);
  const visibleGoals = isExpanded ? orderedGoals : [];

  const commitGoalTarget = (goal: GoalConfig, nextTarget: number | undefined) => {
    const clampedTarget = clampGoalTargetValue(nextTarget, targetControlConfig[goal.id]?.max ?? Number.MAX_SAFE_INTEGER);
    if (goal.id === 'care_reserve') {
      onCareReserveChange({ amount: clampedTarget ?? 0 });
      return;
    }
    onChange(updateOrderedGoals(orderedGoals, (entry) => (
      entry.id === goal.id ? { ...entry, targetValue: clampedTarget } : entry
    )));
  };

  return (
    <div className="game-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="section-heading">Goal priorities</h3>
          <p className="text-xs text-slate-500">
            Rank the goals that should shape the optimizer. Higher goals are treated as harder constraints before lower-priority trade-offs.
          </p>
        </div>
        <button
          className="text-sm font-semibold text-orange-600 hover:text-orange-700 self-start sm:self-auto"
          onClick={() => setIsExpanded((value) => !value)}
          type="button"
          aria-expanded={isExpanded}
        >
          {isExpanded ? '▲ Hide goals' : '▼ Show goals'}
        </button>
      </div>

      {isExpanded && orderedGoals.filter((goal) => isGoalEnabled(goal)).length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No goals selected. Enable goals below to shape the optimizer.
        </div>
      )}

      {isExpanded && (
        <div className="mt-4 space-y-3">
          {visibleGoals.map((goal, index) => {
            const goalCopy = GOAL_COPY[goal.id];
            const targetLabel = goalCopy.targetLabel;
            const controlConfig = targetControlConfig[goal.id];
            const isCareReserveGoal = goal.id === 'care_reserve';
            const effectiveEnabled = isGoalEnabled(goal);
            const effectiveTargetValue = isCareReserveGoal ? careReserve.amount : goal.targetValue;
            const clampedTargetValue = clampGoalTargetValue(effectiveTargetValue, controlConfig?.max ?? Number.MAX_SAFE_INTEGER);
            const draftValue = targetDrafts[goal.id];
            const inputValue = draftValue !== undefined
              ? formatGoalTargetInput(clampGoalTargetValue(parseGoalTargetDraft(draftValue), controlConfig?.max ?? Number.MAX_SAFE_INTEGER))
              : formatGoalTargetInput(clampedTargetValue);
            const sliderProgress = controlConfig
              ? Math.min(100, Math.max(0, ((clampedTargetValue ?? 0) / controlConfig.max) * 100))
              : 0;
            const currentIndex = orderedGoals.findIndex((entry) => entry.id === goal.id);
            const moveUpAllowed = canMoveGoal(orderedGoals, currentIndex, -1);
            const moveDownAllowed = canMoveGoal(orderedGoals, currentIndex, 1);

            return (
              <div key={goal.id} className={clsx('rounded-2xl border p-4', goalCopy.accent)} data-testid={`goal-card-${goal.id}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className={clsx('flex h-8 min-w-8 items-center justify-center rounded-full text-sm font-black shadow-sm', goalCopy.badge)}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{goalCopy.icon} {goalCopy.label}</p>
                        <p className="text-xs text-slate-500">{goalCopy.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input
                        checked={effectiveEnabled}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        disabled={isApplying}
                        onChange={(event) => {
                          if (isCareReserveGoal) {
                            onCareReserveChange({ enabled: event.target.checked });
                            return;
                          }
                          onChange(updateOrderedGoals(orderedGoals, (entry) => (
                            entry.id === goal.id ? { ...entry, enabled: event.target.checked } : entry
                          )));
                        }}
                        type="checkbox"
                      />
                      Enabled
                    </label>
                    <button
                      aria-label={`Move ${goalCopy.label} up`}
                      className="btn-secondary text-xs"
                      disabled={!moveUpAllowed || isApplying}
                      onClick={() => onChange(sortGoalRegistry(moveGoal(orderedGoals, currentIndex, -1)))}
                      type="button"
                    >↑</button>
                    <button
                      aria-label={`Move ${goalCopy.label} down`}
                      className="btn-secondary text-xs"
                      disabled={!moveDownAllowed || isApplying}
                      onClick={() => onChange(sortGoalRegistry(moveGoal(orderedGoals, currentIndex, 1)))}
                      type="button"
                    >↓</button>
                  </div>
                </div>

                {targetLabel && (
                  <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`goal-target-${goal.id}`}>
                          {targetLabel}
                        </label>
                        {controlConfig?.suggested !== undefined && (
                          <p className="text-xs text-slate-400">Suggested: {formatCurrency(controlConfig.suggested, true)}</p>
                        )}
                      </div>
                      <span className="text-base font-black text-slate-800">
                        {clampedTargetValue !== undefined
                          ? formatCurrency(clampedTargetValue, true)
                          : <span className="text-sm font-semibold italic text-slate-400">Unset</span>}
                      </span>
                    </div>
                    <div className="mb-3 max-w-xs">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                        <input
                          aria-label={`${goalCopy.label} amount`}
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-7 pr-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          disabled={isApplying}
                          id={`goal-target-${goal.id}`}
                          inputMode="numeric"
                          max={controlConfig?.max}
                          onChange={(event) => setTargetDrafts((current) => ({ ...current, [goal.id]: event.target.value }))}
                          onBlur={() => {
                            const hasDraft = goal.id in targetDrafts;
                            if (hasDraft) {
                              const nextTarget = parseGoalTargetDraft(targetDrafts[goal.id]);
                              const clampedNext = clampGoalTargetValue(nextTarget, controlConfig?.max ?? Number.MAX_SAFE_INTEGER);
                              if (clampedNext !== clampedTargetValue) commitGoalTarget(goal, clampedNext);
                              setTargetDrafts((current) => {
                                const { [goal.id]: _ignored, ...rest } = current;
                                return rest;
                              });
                            }
                          }}
                          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          placeholder="0"
                          step={controlConfig?.step ?? 1000}
                          type="text"
                          value={inputValue}
                        />
                      </div>
                    </div>
                    {controlConfig && (
                      <>
                        <input
                          aria-label={`${goalCopy.label} slider`}
                          className="w-full"
                          disabled={isApplying}
                          max={controlConfig.max}
                          min={0}
                          onChange={(event) => {
                            const nextTarget = clampGoalTargetValue(event.target.valueAsNumber, controlConfig.max);
                            commitGoalTarget(goal, nextTarget);
                            setTargetDrafts((current) => { const { [goal.id]: _ignored, ...rest } = current; return rest; });
                          }}
                          step={controlConfig.step}
                          style={{ background: `linear-gradient(to right, #f97316 ${sliderProgress}%, #e2e8f0 ${sliderProgress}%)` }}
                          type="range"
                          value={clampedTargetValue ?? 0}
                        />
                        <div className="mt-1 flex justify-between text-xs text-slate-400">
                          <span>£0</span>
                          {controlConfig.suggested !== undefined
                            ? <span>{formatCurrency(controlConfig.suggested, true)} suggested</span>
                            : <span />}
                          <span>{formatCurrency(controlConfig.max, true)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Resolves a PCLS age candidate against NMPA rules and the person's current age. */
function resolvePclsAge(candidate: number, currentAge: number): number {
  const calYear = CURRENT_TAX_YEAR_START + (candidate - currentAge);
  const nmpaForAge = calYear >= PENSION_RULES.NMPA_RISE_YEAR
    ? PENSION_RULES.MIN_ACCESS_AGE_POST_2028
    : PENSION_RULES.MIN_ACCESS_AGE;
  return Math.max(candidate, nmpaForAge, currentAge);
}

export function buildOptimizerViewProjections(
  displayRows: YearlyProjection[],
  optimizerResult: NonNullable<ReturnType<typeof optimizeWithdrawals> | null>,
): YearlyProjection[] {
  const recordsByYearIndex = new Map(
    optimizerResult.yearRecords.map((record) => [record.yearIndex, record]),
  );

  return displayRows.map((baseRow) => {
    const record = recordsByYearIndex.get(baseRow.yearIndex);
    if (!record) return baseRow;

    const winner = record.winner;

    return {
      ...baseRow,
      p1IsaDrawdown: winner.drawdowns.p1Isa,
      p1GiaDrawdown: winner.drawdowns.p1Gia,
      p1CashDrawdown: winner.drawdowns.p1Cash,
      p1DcDrawdown: winner.drawdowns.p1Dc,
      p2IsaDrawdown: winner.drawdowns.p2Isa,
      p2GiaDrawdown: winner.drawdowns.p2Gia,
      p2CashDrawdown: winner.drawdowns.p2Cash,
      p2DcDrawdown: winner.drawdowns.p2Dc,
      isaDrawdown: winner.drawdowns.p1Isa + winner.drawdowns.p2Isa,
      giaDrawdown: winner.drawdowns.p1Gia + winner.drawdowns.p2Gia + winner.drawdowns.jointGia,
      cashDrawdown: winner.drawdowns.p1Cash + winner.drawdowns.p2Cash,
      dcDrawdown: winner.drawdowns.p1Dc + winner.drawdowns.p2Dc,
      dcTaxFreeDrawdown: winner.drawdowns.p1DcTaxFree + winner.drawdowns.p2DcTaxFree,
      p1CapitalGain: winner.drawdowns.p1CapitalGain,
      p2CapitalGain: winner.drawdowns.p2CapitalGain,
      p1CgtPaid: winner.p1CgtPaid,
      p2CgtPaid: winner.p2CgtPaid,
      totalCgtPaid: winner.cgtPaid,
      p1IncomeTax: winner.p1IncomeTax,
      p2IncomeTax: winner.p2IncomeTax,
      incomeTaxPaid: winner.incomeTax,
      totalIncome: winner.totalIncome,
      totalTaxPaid: winner.totalTax,
      netIncome: winner.netIncome,
      gap: winner.gap,
      p1DcBalance: winner.endingBalances.p1DcBalance,
      p1IsaBalance: winner.endingBalances.p1IsaBalance,
      p1GiaValue: winner.endingBalances.p1GiaValue,
      p1GiaBaseCost: winner.endingBalances.p1GiaBaseCost,
      p1CashBalance: winner.endingBalances.p1CashBalance,
      p2DcBalance: winner.endingBalances.p2DcBalance,
      p2IsaBalance: winner.endingBalances.p2IsaBalance,
      p2GiaValue: winner.endingBalances.p2GiaValue,
      p2GiaBaseCost: winner.endingBalances.p2GiaBaseCost,
      p2CashBalance: winner.endingBalances.p2CashBalance,
      jointGiaValue: winner.endingBalances.jointGiaValue,
      jointGiaBaseCost: winner.endingBalances.jointGiaBaseCost,
      totalAssets: winner.terminalAssets,
    };
  });
}

export default function Step4Dashboard({ onBack }: Props) {
  const getToken = useOptionalGetToken();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const state = usePlannerStore();
  const deferredState = useDeferredValue(state);
  const optimizerEnabled = process.env.NEXT_PUBLIC_OPTIMIZER_ENABLED === 'true';
  const proEnabled = process.env.NEXT_PUBLIC_PRO_ENABLED === 'true';

  const {
    mode,
    person1,
    person2,
    lifeStages,
    rlssStandard,
    fiAge,
    goalRegistry,
    setGoalRegistry,
    careReserve,
    setCareReserve,
    drawdownStrategy,
    setDrawdownStrategy,
    pclsAge,
    setPclsAge,
  } = state;

  const [policyOverride, setPolicyOverride] = useState<OptimizerPolicyOverride | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [proModalSource, setProModalSource] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const rawAge = pclsAge ?? fiAge;
  const effectivePclsAge = resolvePclsAge(rawAge, person1.currentAge);

  // Goal registry sync effect
  useEffect(() => {
    const syncedGoalRegistry = sortGoalRegistry(syncCareReserveGoal(goalRegistry, careReserve));

    if (syncedGoalRegistry.some((goal, index) => (
      goal.id !== goalRegistry[index]?.id
      || goal.priority !== goalRegistry[index]?.priority
      || goal.enabled !== goalRegistry[index]?.enabled
      || goal.targetValue !== goalRegistry[index]?.targetValue
    ))) {
      setGoalRegistry(syncedGoalRegistry);
    }
  }, [careReserve, goalRegistry, setGoalRegistry]);

  // Optimizer effect
  const GOAL_ORCHESTRATION_DEBOUNCE_MS = 300;

  useEffect(() => {
    if (!optimizerEnabled || !proEnabled) {
      setPolicyOverride(null);
      setPolicyLoading(false);
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;

      let request;
      try {
        request = buildGoalOrchestrateRequest({
          plannerState: deferredState,
          goalRegistry,
          requestId: `goal-ui:${newId()}`,
          schemaVersion: DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
        });
      } catch {
        setPolicyOverride(null);
        setPolicyLoading(false);
        return;
      }

      activeController = new AbortController();
      setPolicyLoading(true);
      orchestrateGoals(request, { signal: activeController.signal, getToken: () => getTokenRef.current() })
        .then((nextPolicyOverride) => {
          if (!cancelled) setPolicyOverride(nextPolicyOverride);
        })
        .catch(() => {
          if (!cancelled) setPolicyOverride(null);
        })
        .finally(() => {
          if (!cancelled) setPolicyLoading(false);
        });
    }, GOAL_ORCHESTRATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      activeController?.abort();
    };
  }, [deferredState, optimizerEnabled, proEnabled, goalRegistry]);

  // Calculate projections
  const { projections, optimizerResult } = useMemo(() => {
    const effectiveState = !proEnabled && deferredState.drawdownStrategy === 'pcls-bed-isa'
      ? { ...deferredState, drawdownStrategy: 'standard-ufpls' as const }
      : deferredState;

    if (!optimizerEnabled) {
      return {
        projections: calculateProjections(effectiveState),
        optimizerResult: undefined,
      };
    }

    const result = optimizeWithdrawals(effectiveState, {
      policyOverride: policyOverride ?? undefined,
    });
    return {
      projections: result.baselineProjections,
      optimizerResult: result,
    };
  }, [deferredState, optimizerEnabled, proEnabled, policyOverride]);

  const displayProjections = useMemo(() => {
    const rows = projections.length;
    const baseRows = rows > 100 ? projections.filter((_, i) => i % 5 === 0) : projections;
    if (optimizerEnabled && proEnabled && optimizerResult) {
      return buildOptimizerViewProjections(baseRows, optimizerResult);
    }
    return baseRows;
  }, [projections, optimizerEnabled, proEnabled, optimizerResult]);

  const firstYear = projections[0];
  const lastPositive = [...projections].reverse().find(p => p.totalAssets > 0);
  const depletionAge = getAssetDepletionAge(projections);
  const surplus = depletionAge === null;

  const firstStageId = lifeStages[0]?.id ?? 'active';
  const annualSpend = getStageTotalSpending(state, firstStageId);

  // Tax summary stats (for strategy tab non-Pro display)
  const lifetimeIncomeTax = projections.reduce((s, p) => s + p.incomeTaxPaid, 0);
  const lifetimeCGT = projections.reduce((s, p) => s + p.totalCgtPaid, 0);
  const lifetimeIncome = projections.reduce((s, p) => s + p.totalIncome, 0);
  const taxFreeYears = projections.filter(p => Math.round(p.totalTaxPaid) === 0).length;
  const effectiveRate = lifetimeIncome > 0 ? (lifetimeIncomeTax + lifetimeCGT) / lifetimeIncome * 100 : 0;

  // Tax guide constants
  const WITHDRAWAL_GUIDE = {
    ufplsTaxFree: `${Math.round(PENSION_RULES.UFPLS_TAX_FREE_FRACTION * 100)}%`,
    ufplsTaxable: `${Math.round((1 - PENSION_RULES.UFPLS_TAX_FREE_FRACTION) * 100)}%`,
    personalAllowance: formatCurrency(INCOME_TAX.PERSONAL_ALLOWANCE, true),
    annualExempt: formatCurrency(CGT.ANNUAL_EXEMPT, true),
    cgtBasicRate: `${Math.round(CGT.BASIC_RATE * 100)}%`,
    cgtHigherRate: `${Math.round(CGT.HIGHER_RATE * 100)}%`,
  } as const;
  const { ufplsTaxFree, ufplsTaxable, personalAllowance, annualExempt, cgtBasicRate, cgtHigherRate } = WITHDRAWAL_GUIDE;

  const goalTargetControlConfig = useMemo<Partial<Record<GoalId, GoalTargetControlConfig>>>(() => {
    const annualTargetMax = roundUp(Math.max(annualSpend * 2, GOAL_PANEL.ANNUAL_TARGET_FLOOR), 1_000);
    const capitalTargetMax = roundUp(Math.max(firstYear?.totalAssets ?? 0, CARE_RESERVE.MAX_AMOUNT, GOAL_PANEL.CAPITAL_TARGET_FLOOR), 5_000);

    return {
      longevity_protection: { max: annualTargetMax, step: 1_000, suggested: roundUp(annualSpend, 1_000) },
      spending_floor: { max: annualTargetMax, step: 1_000, suggested: roundUp(annualSpend, 1_000) },
      care_reserve: { max: CARE_RESERVE.MAX_AMOUNT, step: 5_000, suggested: CARE_RESERVE.DEFAULT_AMOUNT },
      bequest: { max: capitalTargetMax, step: 5_000, suggested: roundUp((firstYear?.totalAssets ?? 0) * 0.25, 5_000) },
    };
  }, [annualSpend, firstYear?.totalAssets]);

  // Helper: update care reserve from goal panel
  function updateCareReserveFromGoalPanel(nextReserve: Partial<CareReserve>) {
    const merged = {
      enabled: careReserve.enabled,
      amount: careReserve.amount,
      ...nextReserve,
    };

    setCareReserve({
      enabled: merged.enabled,
      amount: Math.min(CARE_RESERVE.MAX_AMOUNT, Math.max(0, merged.amount)),
    });
  }

  // ─── Withdrawal strategy options ─────────────────────────────────────────────
  const strategies = [
    {
      id: 'standard-ufpls' as DrawdownStrategy,
      label: 'Flexible pension drawdown',
      icon: '💧',
      description: 'Draw flexibly from your pension — each withdrawal is 25% tax-free and 75% taxable, using your tax-free entitlement gradually over time.',
    },
    {
      id: 'pcls-bed-isa' as DrawdownStrategy,
      label: 'Tax-free lump sum + ISA transfer',
      icon: '🚀',
      description: 'Once your pension pot is large enough that any further growth would be fully taxable on withdrawal, it could make sense to take your entire tax-free entitlement now and move it into an ISA — where future growth is sheltered from tax.',
    },
  ] as const;

  // ─── Tab definitions ──────────────────────────────────────────────────────────
  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'goals', label: 'Goals' },
    { id: 'iht', label: 'IHT & Estate' },
    { id: 'care', label: 'Care Reserve' },
  ];

  // Sanitise the persisted drawdown strategy: if Pro is disabled, fall back to the
  // default strategy so the Pro-only UI never appears active in the calculations or UI.
  const effectiveDrawdownStrategy: DrawdownStrategy =
    !proEnabled && drawdownStrategy === 'pcls-bed-isa'
      ? 'standard-ufpls'
      : (drawdownStrategy ?? 'standard-ufpls');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero section */}
      <div className="text-center pt-4 pb-6 px-4 bg-white border-b border-slate-200">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold px-4 py-1.5 rounded-full mb-3">
          🎯 Step 5 of 5 — Your Dashboard
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2 tracking-tight">
          Your lifetime{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">plan</span>
        </h2>
        <p className="text-slate-500">
          From age {fiAge} → {state.assumptions.lifeExpectancy} · nominal £
        </p>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm no-print">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'text-slate-600 hover:bg-slate-100 border border-transparent',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content — single column */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Overview tab ──────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <DashboardMain
            state={state}
            projections={projections}
            displayProjections={displayProjections}
            surplus={surplus}
            depletionAge={depletionAge ?? 'Never'}
            firstYear={firstYear}
            lastPositive={lastPositive}
            lifeStages={lifeStages}
            mode={mode}
            p1Name={person1.name || (mode === 'couple' ? 'Partner 1' : 'You')}
            p2Name={person2?.name || 'Partner 2'}
            rlssStandard={rlssStandard ?? undefined}
            optimizerEnabled={optimizerEnabled}
            proEnabled={proEnabled}
            optimizerResult={optimizerResult ?? null}
            plannerState={deferredState}
            onProCta={() => setProModalSource('optimizer-explain')}
          />
        )}

        {/* ── Strategy tab ──────────────────────────────────────────────────── */}
        {activeTab === 'strategy' && (
          <div className="game-card space-y-4">
            <div>
              <h3 className="section-heading">Withdrawal Strategy</h3>
              <p className="text-xs text-slate-500">Choose how you draw down your pension and investment accounts each year.</p>
            </div>

            <div className="space-y-3">
              {strategies.map(option => (
                <button
                  key={option.id}
                  onClick={() => {
                    if (option.id === 'pcls-bed-isa' && !proEnabled) {
                      setProModalSource('strategy-pcls-bed-isa');
                      return;
                    }
                    setDrawdownStrategy(option.id);
                  }}
                  className={clsx(
                    'w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md',
                    effectiveDrawdownStrategy === option.id
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
                  )}
                  aria-pressed={effectiveDrawdownStrategy === option.id}
                  aria-label={`${option.label}. ${option.description}${option.id === 'pcls-bed-isa' && !proEnabled ? ' (Pro only)' : ''}${effectiveDrawdownStrategy === option.id ? ' (Active)' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl" aria-hidden="true">{option.icon}</span>
                    <span className={clsx('font-bold text-sm', effectiveDrawdownStrategy === option.id ? 'text-orange-800' : 'text-slate-800')} aria-hidden="true">
                      {option.label}
                    </span>
                    {effectiveDrawdownStrategy === option.id && (
                      <span className="ml-auto text-xs font-bold bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full" aria-hidden="true">Active</span>
                    )}
                    {option.id === 'pcls-bed-isa' && !proEnabled && (
                      <span className="ml-auto text-xs font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full" aria-hidden="true">Pro</span>
                    )}
                  </div>
                  <p className={clsx('text-sm leading-relaxed', effectiveDrawdownStrategy === option.id ? 'text-orange-700' : 'text-slate-500')}>
                    {option.description}
                  </p>
                </button>
              ))}
            </div>

            {effectiveDrawdownStrategy === 'pcls-bed-isa' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <label className="text-sm font-semibold text-slate-700 block mb-2">
                  Lump sum age
                </label>
                <input
                  type="number"
                  value={effectivePclsAge}
                  onChange={(e) => setPclsAge(Math.max(person1.currentAge, parseInt(e.target.value) || effectivePclsAge))}
                  min={person1.currentAge}
                  max={120}
                  className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-blue-600 mt-1">Strategy applies from age {effectivePclsAge}</p>
              </div>
            )}

            {/* Simplified tax-efficient withdrawal strategy — shown only in non-Pro mode */}
            {!proEnabled && (
              <div className="mt-6 pt-6 border-t-2 border-t-orange-200 bg-gradient-to-br from-orange-50/30 to-transparent rounded-xl p-4">
                <h3 className="section-heading mb-3 flex items-center gap-2">
                  <span>💡</span>
                  <span>Simplified tax-efficient withdrawal strategy</span>
                </h3>
                <p className="text-xs text-slate-500 mb-1">A simplified guide to how income is typically structured each year to reduce tax.</p>
                <p className="text-xs text-slate-400 mb-4 italic">
                  This is a simplified, typical ordering only — the most tax-efficient sequence and outcomes can vary based on your circumstances and current tax position.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="rounded-2xl p-3 bg-rose-50 border border-rose-100 hover:shadow-md hover:border-rose-200 transition-all duration-200 cursor-default">
                    <p className="text-xs text-rose-600 font-bold mb-1">Lifetime income tax</p>
                    <p className="text-xl font-black text-rose-800">{formatCurrency(lifetimeIncomeTax, true)}</p>
                  </div>
                  <div className="rounded-2xl p-3 bg-amber-50 border border-amber-100 hover:shadow-md hover:border-amber-200 transition-all duration-200 cursor-default">
                    <p className="text-xs text-amber-600 font-bold mb-1 flex items-center">Lifetime CGT<InfoIcon term="CGT" tooltip={GLOSSARY.CGT} /></p>
                    <p className="text-xl font-black text-amber-800">{formatCurrency(lifetimeCGT, true)}</p>
                  </div>
                  <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100 hover:shadow-md hover:border-emerald-200 transition-all duration-200 cursor-default">
                    <p className="text-xs text-emerald-600 font-bold mb-1">Tax-free years</p>
                    <p className="text-xl font-black text-emerald-800">{taxFreeYears}</p>
                    <p className="text-xs text-emerald-500 mt-0.5">of {projections.length} projected</p>
                  </div>
                  <div className="rounded-2xl p-3 bg-sky-50 border border-sky-100 hover:shadow-md hover:border-sky-200 transition-all duration-200 cursor-default">
                    <p className="text-xs text-sky-600 font-bold mb-1 flex items-center">Effective rate<InfoIcon term="Effective rate" tooltip={GLOSSARY['Effective rate']} /></p>
                    <p className="text-xl font-black text-sky-800">{effectiveRate.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {([
                    { n: 1, icon: '🏦', label: 'DC pension', labelSuffix: '— within personal allowance', desc: `Any unused personal allowance (${personalAllowance}) may be met with DC pension withdrawals. Each withdrawal is typically ${ufplsTaxFree} tax-free, and the remaining ${ufplsTaxable} may fall within the allowance, which can reduce or eliminate income tax in some cases.`, color: 'bg-violet-50 border-violet-100' },
                    { n: 2, icon: '📊', label: 'GIA', labelSuffix: '— within CGT exempt amount', desc: `Investment gains up to ${annualExempt}/person may be crystallised with no CGT due in a given tax year, subject to your overall circumstances.`, color: 'bg-amber-50 border-amber-100' },
                    { n: 3, icon: '✅', label: 'ISA', labelSuffix: '', desc: 'ISA withdrawals are typically free of UK income tax and capital gains tax. Used after personal allowance and CGT allowance have been maximised in this simplified guide.', color: 'bg-emerald-50 border-emerald-100' },
                    { n: 4, icon: '💰', label: 'Remaining GIA & cash', labelSuffix: '', desc: `GIA gains above the exempt amount may be taxed at ${cgtBasicRate} (basic-rate) or ${cgtHigherRate} (higher-rate), depending on your position. Cash withdrawals are generally tax-free.`, color: 'bg-sky-50 border-sky-100' },
                    { n: 5, icon: '💼', label: 'DC pension', labelSuffix: '— above personal allowance', desc: 'Any remaining net spending gap may be covered by further pension withdrawals, typically after other sources have been considered in this simplified ordering.', color: 'bg-slate-50 border-slate-100' },
                  ] as const).map(({ n, icon, label, labelSuffix, desc, color }) => (
                    <div key={n} className={clsx('flex gap-3 p-3 rounded-2xl border', color)}>
                      <div className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center font-black text-xs flex-shrink-0 text-slate-700">{n}</div>
                      <div>
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-800">
                          <span>{icon}</span>
                          <span>{label}</span>
                          {labelSuffix && <span className="font-normal text-slate-600">{labelSuffix}</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Goals tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'goals' && (
          proEnabled ? (
            <GoalPriorityPanel
              goalRegistry={goalRegistry}
              onChange={setGoalRegistry}
              careReserve={careReserve}
              onCareReserveChange={updateCareReserveFromGoalPanel}
              isApplying={policyLoading}
              targetControlConfig={goalTargetControlConfig}
            />
          ) : (
            <ProFeatureBanner
              icon="🎯"
              headline="Goal Priorities"
              description="Reorder goals and set spending targets to match your priorities. The optimizer uses these to shape the drawdown strategy."
              onCta={() => setProModalSource('goal-priorities')}
            />
          )
        )}

        {/* ── IHT & Estate tab ──────────────────────────────────────────────── */}
        {activeTab === 'iht' && (
          proEnabled ? (
            <div className="space-y-4">
              <div className="game-card">
                <h3 className="section-heading">IHT & Estate Planning</h3>
                <p className="text-xs text-slate-500 mb-4">Projected inheritance tax exposure and estate scenarios based on your current plan.</p>
              </div>
              <IHTOutlookPanel state={state} projections={projections} />
            </div>
          ) : (
            <ProFeatureBanner
              icon="🏛️"
              headline="IHT & Estate Planning"
              description="Explore inheritance scenarios, optimize gifting strategy, and see your projected IHT exposure over time."
              onCta={() => setProModalSource('iht-planning')}
            />
          )
        )}

        {/* ── Care Reserve tab ──────────────────────────────────────────────── */}
        {activeTab === 'care' && (
          <div className="game-card space-y-4">
            <div>
              <h3 className="section-heading">Care Reserve</h3>
              <p className="text-xs text-slate-500">Set aside protected capital for later-life care costs, separate from your spending plan.</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={careReserve.enabled}
                onChange={(e) => updateCareReserveFromGoalPanel({ enabled: e.target.checked })}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 w-4 h-4"
                id="care-reserve-enabled-tab"
              />
              <label htmlFor="care-reserve-enabled-tab" className="font-semibold text-slate-700 cursor-pointer">
                Enable care reserve
              </label>
            </div>

            {careReserve.enabled ? (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-3">
                <label className="block font-semibold text-sm text-slate-700">Target amount</label>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-500 font-semibold">£</span>
                  <input
                    type="number"
                    value={careReserve.amount}
                    onChange={(e) => updateCareReserveFromGoalPanel({ amount: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-40 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    min="0"
                    step={CARE_RESERVE.STEP_AMOUNT}
                  />
                </div>
                <p className="text-sm text-blue-700 font-semibold">
                  Projected at {fiAge}: {formatCurrency(firstYear?.careReserveBalance ?? careReserve.amount, true)}
                </p>
                <p className="text-xs text-blue-600">
                  Protected capital stays invested and is excluded from normal spending. If care costs never arise, it remains part of your estate.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Disabled. Enable above to set aside funds for later-life care.</p>
            )}
          </div>
        )}


      </div>

      {/* Action buttons footer */}
      <div className="flex flex-wrap gap-3 justify-between px-4 py-4 border-t border-slate-200 bg-white no-print">
        <button onClick={onBack} className="btn-secondary">← Edit income & assets</button>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'lifeplan.json'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="btn-secondary text-sm"
          >💾 Save scenario</button>
          <button onClick={() => window.print()} className="btn-primary text-sm">🖨️ Export PDF</button>
        </div>
      </div>

      <ProInterestModal
        open={proModalSource !== null}
        sourcePanel={proModalSource ?? 'unknown'}
        onClose={() => setProModalSource(null)}
      />
    </div>
  );
}
