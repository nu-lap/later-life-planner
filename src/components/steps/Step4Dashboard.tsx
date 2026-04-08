'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePlannerStore } from '@/store/plannerStore';
import {
  calculateProjections, getStageTotalSpending,
  getAssetDepletionAge, formatCurrency, getTotalUnrealisedGain,
  calculateGamificationMetrics,
} from '@/lib/calculations';
import OptimizerPanel from '@/components/OptimizerPanel';
import { CARE_RESERVE, CGT, INCOME_TAX } from '@/config/financialConstants';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import { RLSS_STANDARDS } from '@/lib/mockData';
import {
  buildGoalOrchestrateRequest,
  DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
  orchestrateGoals,
  sortGoalRegistry,
  syncCareReserveGoal,
} from '@/lib/goalOrchestration';
import type { YearlyProjection } from '@/lib/types';
import type { OptimizerPolicyOverride } from '@/financialEngine/types';
import type { CareReserve, GoalConfig, GoalId } from '@/models/types';
import clsx from 'clsx';

const GOAL_ORCHESTRATION_DEBOUNCE_MS = 300;

const ChartSkeleton = () => <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />;
const LifetimeChart = dynamic(() => import('@/components/charts/LifetimeChart'), { ssr: false, loading: ChartSkeleton });
const AssetChart    = dynamic(() => import('@/components/charts/AssetChart'),    { ssr: false, loading: ChartSkeleton });

interface Props { onBack: () => void }

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
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(0, value));
}

// ─── Life stage timeline ───────────────────────────────────────────────────────


function StageTimeline({ projections, lifeStages, p1Age }: {
  projections: YearlyProjection[];
  lifeStages: { id: string; label: string; startAge: number; endAge: number; color: string }[];
  p1Age: number;
}) {
  const maxAge = projections[projections.length - 1]?.p1Age ?? 95;
  const totalYears = maxAge - p1Age + 1;

  return (
    <div className="game-card-sm">
      <p className="text-xs font-bold text-slate-500 mb-2">Life stage timeline</p>
      <div className="flex rounded-xl overflow-hidden h-8">
        {lifeStages.map(stage => {
          const span = stage.endAge - stage.startAge + 1;
          const pct  = (span / totalYears) * 100;
          return (
            <div key={stage.id} className="flex items-center justify-center text-white text-xs font-bold overflow-hidden"
              style={{ width: `${pct}%`, backgroundColor: stage.color }}
            >
              <span className="truncate px-1">{stage.startAge} — {stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent = 'slate' }: {
  icon: string; label: string; value: string; sub?: string;
  accent?: 'slate' | 'emerald' | 'rose' | 'sky' | 'amber' | 'orange';
}) {
  const accents: Record<string, string> = {
    slate:   'bg-slate-800 text-white',
    emerald: 'bg-emerald-500 text-white',
    rose:    'bg-rose-500 text-white',
    sky:     'bg-sky-500 text-white',
    amber:   'bg-amber-500 text-white',
    orange:  'bg-orange-500 text-white',
  };
  return (
    <div className={clsx('rounded-2xl p-4', accents[accent])}>
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-black leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function moveGoal(goalRegistry: GoalConfig[], index: number, direction: -1 | 1): GoalConfig[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= goalRegistry.length) {
    return goalRegistry;
  }

  const next = goalRegistry.slice();
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);

  return next.map((goal, nextIndex) => ({
    ...goal,
    priority: nextIndex + 1,
  }));
}

function updateOrderedGoals(
  orderedGoals: GoalConfig[],
  updater: (goal: GoalConfig, index: number) => GoalConfig,
): GoalConfig[] {
  return sortGoalRegistry(orderedGoals.map(updater));
}

function canMoveGoal(orderedGoals: GoalConfig[], index: number, direction: -1 | 1): boolean {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= orderedGoals.length) {
    return false;
  }

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
  const isGoalEnabled = (goal: GoalConfig) => (
    goal.id === 'care_reserve' ? careReserve.enabled : goal.enabled
  );
  const orderedGoals = useMemo(
    () => sortGoalRegistry(goalRegistry),
    [goalRegistry],
  );
  const enabledGoals = orderedGoals.filter((goal) => isGoalEnabled(goal));
  const visibleGoals = isExpanded ? orderedGoals : enabledGoals;

  return (
    <div className="game-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="section-heading">Goal priorities</h3>
          <p className="text-xs text-slate-500 mb-4">
            {isExpanded
              ? 'Rank the retirement goals that should shape the optimizer. Higher goals are treated as harder constraints before lower-priority trade-offs.'
              : 'These are the goals currently shaping your withdrawal plan.'}
          </p>
        </div>
        <button
          className="btn-secondary text-xs"
          onClick={() => setIsExpanded((value) => !value)}
          type="button"
        >
          {isExpanded ? 'Show selected goals' : 'Show all goals'}
        </button>
      </div>

      {!isExpanded && enabledGoals.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No goals selected. Expand the panel to enable goals for the optimizer.
        </div>
      )}

      <div className="space-y-3">
        {visibleGoals.map((goal, index) => {
          const goalCopy = GOAL_COPY[goal.id];
          const targetLabel = goalCopy.targetLabel;
          const controlConfig = targetControlConfig[goal.id];
          const isCareReserveGoal = goal.id === 'care_reserve';
          const effectiveEnabled = isGoalEnabled(goal);
          // Keep the rendered Care Reserve target bound to its stored amount even when disabled.
          // This prevents the UI from showing a blank/undefined controlled value while the
          // underlying canonical amount remains mutable elsewhere in state.
          const effectiveTargetValue = isCareReserveGoal
            ? careReserve.amount
            : goal.targetValue;
          const clampedTargetValue = clampGoalTargetValue(effectiveTargetValue, controlConfig?.max ?? Number.MAX_SAFE_INTEGER);
          const sliderProgress = controlConfig
            ? Math.min(100, Math.max(0, ((clampedTargetValue ?? 0) / controlConfig.max) * 100))
            : 0;
          const currentIndex = orderedGoals.findIndex((entry) => entry.id === goal.id);
          const moveUpAllowed = isExpanded && canMoveGoal(orderedGoals, currentIndex, -1);
          const moveDownAllowed = isExpanded && canMoveGoal(orderedGoals, currentIndex, 1);

          return (
            <div
              key={goal.id}
              className={clsx('rounded-2xl border p-4', goalCopy.accent)}
              data-testid={`goal-card-${goal.id}`}
            >
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

                {isExpanded ? (
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
                      onClick={() => {
                        onChange(sortGoalRegistry(moveGoal(orderedGoals, currentIndex, -1)));
                      }}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${goalCopy.label} down`}
                      className="btn-secondary text-xs"
                      disabled={!moveDownAllowed || isApplying}
                      onClick={() => {
                        onChange(sortGoalRegistry(moveGoal(orderedGoals, currentIndex, 1)));
                      }}
                      type="button"
                    >
                      ↓
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600">
                    Selected
                  </div>
                )}
              </div>

              {!isExpanded && targetLabel && effectiveEnabled && clampedTargetValue !== undefined && (
                <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{targetLabel}</p>
                    <span className="text-sm font-black text-slate-800">
                      {formatCurrency(clampedTargetValue, true)}
                    </span>
                  </div>
                </div>
              )}

              {targetLabel && isExpanded && (
                <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`goal-target-${goal.id}`}>
                        {targetLabel}
                      </label>
                      {controlConfig?.suggested !== undefined && (
                        <p className="text-xs text-slate-400">Suggested starting point: {formatCurrency(controlConfig.suggested, true)}</p>
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
                        min={0}
                        onChange={(event) => {
                          const nextTarget = clampGoalTargetValue(event.target.valueAsNumber, controlConfig?.max ?? Number.MAX_SAFE_INTEGER);
                          if (isCareReserveGoal) {
                            onCareReserveChange({ amount: nextTarget ?? 0 });
                            return;
                          }
                          onChange(updateOrderedGoals(orderedGoals, (entry) => (
                            entry.id === goal.id ? { ...entry, targetValue: nextTarget } : entry
                          )));
                        }}
                        placeholder="0"
                        step={controlConfig?.step ?? 1000}
                        type="number"
                        value={clampedTargetValue ?? ''}
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
                          if (isCareReserveGoal) {
                            onCareReserveChange({ amount: nextTarget ?? 0 });
                            return;
                          }
                          onChange(updateOrderedGoals(orderedGoals, (entry) => (
                            entry.id === goal.id ? { ...entry, targetValue: nextTarget } : entry
                          )));
                        }}
                        step={controlConfig.step}
                        style={{
                          background: `linear-gradient(to right, #f97316 ${sliderProgress}%, #e2e8f0 ${sliderProgress}%)`,
                        }}
                        type="range"
                        value={clampedTargetValue ?? 0}
                      />
                      <div className="mt-1 flex justify-between text-xs text-slate-400">
                        <span>£0</span>
                        {controlConfig.suggested !== undefined ? (
                          <span>{formatCurrency(controlConfig.suggested, true)} suggested</span>
                        ) : (
                          <span />
                        )}
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
    </div>
  );
}

// ─── Tax overview ──────────────────────────────────────────────────────────────

function TaxOverview({ projections }: { projections: YearlyProjection[] }) {
  const lifetimeIncomeTax = projections.reduce((s, p) => s + p.incomeTaxPaid, 0);
  const lifetimeCGT       = projections.reduce((s, p) => s + p.totalCgtPaid, 0);
  const lifetimeTotalTax  = lifetimeIncomeTax + lifetimeCGT;
  const lifetimeIncome    = projections.reduce((s, p) => s + p.totalIncome, 0);
  const taxFreeYears      = projections.filter(p => Math.round(p.totalTaxPaid) === 0).length;
  const effectiveRate     = lifetimeIncome > 0 ? (lifetimeTotalTax / lifetimeIncome) * 100 : 0;
  const personalAllowance = formatCurrency(INCOME_TAX.PERSONAL_ALLOWANCE, true);
  const annualExempt = formatCurrency(CGT.ANNUAL_EXEMPT, true);
  const cgtBasicRate = `${Math.round(CGT.BASIC_RATE * 100)}%`;
  const cgtHigherRate = `${Math.round(CGT.HIGHER_RATE * 100)}%`;

  return (
    <div className="game-card">
      <h3 className="section-heading">Simplified tax-efficient withdrawal strategy</h3>
      <p className="text-xs text-slate-500 mb-4">
        A simplified guide to how income is structured each year to minimise tax. Required spending is a net cash target, so any tax on withdrawals means the plan must gross up income to leave the same spendable amount.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-2xl p-3 bg-rose-50 border border-rose-100">
          <p className="text-xs text-rose-600 font-bold mb-1">Lifetime income tax</p>
          <p className="text-xl font-black text-rose-800">{formatCurrency(lifetimeIncomeTax, true)}</p>
          <p className="text-xs text-rose-500 mt-0.5">across all years</p>
        </div>
        <div className="rounded-2xl p-3 bg-amber-50 border border-amber-100">
          <p className="text-xs text-amber-600 font-bold mb-1">Lifetime CGT</p>
          <p className="text-xl font-black text-amber-800">{formatCurrency(lifetimeCGT, true)}</p>
          <p className="text-xs text-amber-500 mt-0.5">on GIA gains</p>
        </div>
        <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100">
          <p className="text-xs text-emerald-600 font-bold mb-1">Tax-free years</p>
          <p className="text-xl font-black text-emerald-800">{taxFreeYears}</p>
          <p className="text-xs text-emerald-500 mt-0.5">of {projections.length} projected</p>
        </div>
        <div className="rounded-2xl p-3 bg-sky-50 border border-sky-100">
          <p className="text-xs text-sky-600 font-bold mb-1">Effective rate</p>
          <p className="text-xl font-black text-sky-800">{effectiveRate.toFixed(1)}%</p>
          <p className="text-xs text-sky-500 mt-0.5">avg tax on income</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { n: 1, icon: '🏦', label: 'DC pension — within personal allowance', desc: `Any unused personal allowance (${personalAllowance}) is filled by DC pension withdrawals. Each withdrawal is 25% tax-free; the remaining 75% sits within the allowance → 0% income tax.`, color: 'bg-violet-50 border-violet-100' },
          { n: 2, icon: '📊', label: 'GIA — within CGT exempt amount', desc: `Investment gains up to ${annualExempt}/person are crystallised tax-free each year. Only drawn when needed for spending.`, color: 'bg-amber-50 border-amber-100' },
          { n: 3, icon: '✅', label: 'ISA', desc: 'Completely tax-free. Used after personal allowance and CGT allowance have been maximised.', color: 'bg-emerald-50 border-emerald-100' },
          { n: 4, icon: '💰', label: 'Remaining GIA & cash', desc: `GIA gains above the exempt amount are taxed at ${cgtBasicRate} (basic-rate) or ${cgtHigherRate} (higher-rate). Cash withdrawals are always tax-free.`, color: 'bg-sky-50 border-sky-100' },
          { n: 5, icon: '💼', label: 'DC pension — above personal allowance', desc: 'Remaining net spending gap is covered by further pension withdrawals. The 75% taxable portion now attracts income tax at marginal rate. Only reached when other sources are exhausted or the gap is large.', color: 'bg-slate-50 border-slate-100' },
        ].map(({ n, icon, label, desc, color }) => (
          <div key={n} className={clsx('flex gap-3 p-3 rounded-2xl border', color)}>
            <div className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center font-black text-xs flex-shrink-0 text-slate-700">
              {n}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <span>{icon}</span>{label}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Projection table ──────────────────────────────────────────────────────────

function ProjectionTable({ projections, lifeStages }: {
  projections: YearlyProjection[];
  lifeStages: { label: string; color: string }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? projections : projections.filter((_, i) => i % 5 === 0);
  return (
    <div className="game-card">
      <h3 className="section-heading">Year-by-year projection</h3>
      <p className="text-xs text-slate-500 mb-4">Nominal (inflation-adjusted) figures in future £.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-right">
              {['Age', 'Stage', 'Spending', 'Income', 'Tax', 'Net', 'Assets'].map((h, i) => (
                <th key={h} className={clsx('pb-2 pr-3 last:pr-0 font-bold text-slate-500', i <= 1 && 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const stageColor = lifeStages.find(s => s.label === p.lifeStage)?.color ?? '#94a3b8';
              return (
                <tr key={p.p1Age} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="py-2 pr-3 text-sm text-slate-700">
                    {p.p1Age}{p.p2Age !== null && <span>/{p.p2Age}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: stageColor }}>{p.lifeStage}</span>
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600">{formatCurrency(p.spending, true)}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-slate-800">{formatCurrency(p.totalIncome, true)}</td>
                  <td className="py-2 pr-3 text-right text-rose-500">{formatCurrency(p.totalTaxPaid, true)}</td>
                  <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">{formatCurrency(p.netIncome, true)}</td>
                  <td className={clsx('py-2 text-right font-bold', p.totalAssets <= 0 ? 'text-rose-600' : 'text-slate-700')}>
                    {p.totalAssets <= 0 ? '—' : formatCurrency(p.totalAssets, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => setShowAll(!showAll)} className="mt-4 text-sm text-orange-600 hover:text-orange-700 font-semibold">
        {showAll ? '▲ Show fewer rows' : '▼ Show all years'}
      </button>
    </div>
  );
}

function buildOptimizerViewProjections(
  displayRows: YearlyProjection[],
  optimizerResult: NonNullable<ReturnType<typeof optimizeWithdrawals> | null>,
): YearlyProjection[] {
  return displayRows.map((baseRow, index) => {
    const record = optimizerResult.yearRecords[index];
    if (!record) {
      return baseRow;
    }

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
      totalAssets: winner.terminalAssets,
    };
  });
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function Step4Dashboard({ onBack }: Props) {
  const state = usePlannerStore();
  const deferredState = useDeferredValue(state);
  const optimizerEnabled = process.env.NEXT_PUBLIC_OPTIMIZER_ENABLED === 'true';
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
  } = state;
  const [policyOverride, setPolicyOverride] = useState<OptimizerPolicyOverride | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

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

  useEffect(() => {
    if (!optimizerEnabled) {
      setPolicyOverride(null);
      setPolicyLoading(false);
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      let request;
      try {
        request = buildGoalOrchestrateRequest({
          plannerState: deferredState,
          goalRegistry,
          requestId: `goal-ui:${globalThis.crypto?.randomUUID?.() ?? Date.now().toString()}`,
          schemaVersion: DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
        });
      } catch {
        setPolicyOverride(null);
        setPolicyLoading(false);
        return;
      }

      activeController = new AbortController();
      setPolicyLoading(true);
      orchestrateGoals(request, { signal: activeController.signal })
        .then((nextPolicyOverride) => {
          if (!cancelled) {
            setPolicyOverride(nextPolicyOverride);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPolicyOverride(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setPolicyLoading(false);
          }
        });
    }, GOAL_ORCHESTRATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      activeController?.abort();
    };
  }, [deferredState, goalRegistry, optimizerEnabled]);

  const { projections, optimizerResult } = useMemo(() => {
    if (!optimizerEnabled) {
      return {
        projections: calculateProjections(deferredState),
        optimizerResult: null,
      };
    }

    // Run the optimizer once; reuse its pre-computed projections so we avoid
    // a duplicate calculateProjections() call.
    const result = optimizeWithdrawals(deferredState, {
      policyOverride: policyOverride ?? undefined,
    });
    return {
      projections: result.baselineProjections,
      optimizerResult: result,
    };
  }, [deferredState, optimizerEnabled, policyOverride]);
  // Income and spending only starts at FI age — filter for display, but keep full
  // projections for asset depletion checks (assets grow from current age).
  const displayProjections = useMemo(
    () => projections.filter(p => p.p1Age >= fiAge),
    [projections, fiAge],
  );
  const chartProjections = useMemo(
    () => (optimizerEnabled && optimizerResult
      ? buildOptimizerViewProjections(displayProjections, optimizerResult)
      : displayProjections),
    [displayProjections, optimizerEnabled, optimizerResult],
  );
  const firstYear     = displayProjections[0] ?? projections[0];
  const depletionAge  = getAssetDepletionAge(projections);
  const firstStageId  = lifeStages[0]?.id ?? 'active';
  const annualSpend   = getStageTotalSpending(state, firstStageId);
  const lastPositive  = [...projections].reverse().find(p => p.totalAssets > 0);
  const surplus       = depletionAge === null;
  const unrealisedGain  = getTotalUnrealisedGain(state);
  const gamification    = useMemo(() => calculateGamificationMetrics(state, projections), [state, projections]);
  const goalTargetControlConfig = useMemo<Partial<Record<GoalId, GoalTargetControlConfig>>>(() => {
    const annualTargetMax = roundUp(Math.max(annualSpend * 2, 100_000), 1_000);
    const capitalTargetMax = roundUp(Math.max(firstYear?.totalAssets ?? 0, CARE_RESERVE.MAX_AMOUNT, 250_000), 5_000);

    return {
      longevity_protection: {
        max: annualTargetMax,
        step: 1_000,
        suggested: roundUp(annualSpend, 1_000),
      },
      spending_floor: {
        max: annualTargetMax,
        step: 1_000,
        suggested: roundUp(annualSpend, 1_000),
      },
      care_reserve: {
        max: CARE_RESERVE.MAX_AMOUNT,
        step: 5_000,
        suggested: CARE_RESERVE.DEFAULT_AMOUNT,
      },
      bequest: {
        max: capitalTargetMax,
        step: 5_000,
        suggested: roundUp((firstYear?.totalAssets ?? 0) * 0.25, 5_000),
      },
    };
  }, [annualSpend, firstYear?.totalAssets]);

  // Normalize any goal target values that exceed the current control config maxima.
  // This keeps the persisted registry in sync with the displayed (clamped) values so
  // orchestration and optimizer requests always use the same bounds shown in the UI.
  useEffect(() => {
    const normalizedGoals = goalRegistry.map((goal) => {
      const controlConfig = goalTargetControlConfig[goal.id];
      if (!controlConfig || goal.targetValue === undefined) {
        return goal;
      }
      const clamped = clampGoalTargetValue(goal.targetValue, controlConfig.max);
      return clamped !== goal.targetValue ? { ...goal, targetValue: clamped } : goal;
    });

    const sortedGoals = sortGoalRegistry(normalizedGoals);

    if (sortedGoals.some((g, i) => g !== goalRegistry[i])) {
      setGoalRegistry(sortedGoals);
    }
  }, [goalRegistry, goalTargetControlConfig, setGoalRegistry]);

  const p1Name = person1.name || (mode === 'couple' ? 'Partner 1' : 'You');
  const p2Name = person2.name || 'Partner 2';

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

  return (
    <div className="space-y-5 pb-16">

      {/* Hero */}
      <div className="text-center pt-4 pb-2">
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

      {/* Gap alert */}
      {!surplus && (
        <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4 flex gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-black text-rose-800">Funding gap detected</p>
            <p className="text-sm text-rose-600 mt-0.5">
              At current spending, assets could be depleted by age <strong>{depletionAge}</strong>.
              Consider increasing income, adjusting spending, or working a little longer.
            </p>
          </div>
        </div>
      )}

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="💰" label="Required net spending" value={formatCurrency(annualSpend, true)}
          sub={rlssStandard ? `${RLSS_STANDARDS[mode][rlssStandard].label} lifestyle` : "today's £"}
          accent="slate" />
        <StatCard icon="📥" label={`Gross income at ${fiAge}`} value={formatCurrency(firstYear?.totalIncome ?? 0, true)}
          sub={firstYear ? `Net after tax: ${formatCurrency(firstYear.netIncome, true)} — year 1` : 'year 1'}
          accent="sky" />
        <StatCard icon="🏦" label={`Assets at ${fiAge}`} value={formatCurrency(firstYear?.totalAssets ?? 0, true)}
          sub={unrealisedGain > 0 ? `${formatCurrency(unrealisedGain, true)} unrealised gain` : 'across all accounts'}
          accent="orange" />
        <StatCard
          icon={surplus ? '✅' : '⚠️'}
          label={surplus ? `Assets at ${state.assumptions.lifeExpectancy}` : 'Depleted at age'}
          value={surplus ? formatCurrency(lastPositive?.totalAssets ?? 0, true) : String(depletionAge)}
          sub={surplus ? 'plan is on track' : 'review your plan'}
          accent={surplus ? 'emerald' : 'rose'} />
      </div>

      {/* Care Reserve callout */}
      {state.careReserve?.enabled && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 p-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">🛡️</span>
          <div>
            <p className="font-black text-teal-800">Care Reserve at {fiAge} — {formatCurrency(firstYear?.careReserveBalance ?? state.careReserve.amount, true)}</p>
            <p className="text-sm text-teal-600 mt-0.5">
              Protected capital set aside for later-life care. It stays invested and is excluded from normal spending.
            </p>
            <p className="text-xs text-teal-500 mt-1">
              Current target: {formatCurrency(state.careReserve.amount, true)} · If care costs never arise, it remains part of your estate.
            </p>
          </div>
        </div>
      )}

      {/* Life stage timeline */}
      <StageTimeline projections={displayProjections} lifeStages={lifeStages} p1Age={fiAge} />

      {/* Gamification metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Income stability meter */}
        <div className="game-card-sm text-center">
          <p className="text-xs font-bold text-slate-500 mb-2">Income stability</p>
          <div className="relative w-20 h-20 mx-auto mb-2">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3"
                strokeDasharray={`${gamification.incomeStabilityScore} 100`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-black text-emerald-600">{gamification.incomeStabilityScore}%</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">of spending covered by<br />guaranteed income</p>
        </div>

        {/* Spending confidence */}
        <div className="game-card-sm text-center">
          <p className="text-xs font-bold text-slate-500 mb-2">Spending confidence</p>
          <div className="relative w-20 h-20 mx-auto mb-2">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={gamification.spendingConfidenceScore >= 80 ? '#f97316' : gamification.spendingConfidenceScore >= 50 ? '#f59e0b' : '#f43f5e'}
                strokeWidth="3"
                strokeDasharray={`${gamification.spendingConfidenceScore} 100`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-black ${gamification.spendingConfidenceScore >= 80 ? 'text-orange-600' : gamification.spendingConfidenceScore >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {gamification.spendingConfidenceScore}%
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500">of plan years<br />fully funded</p>
        </div>

        {/* Life goal progress */}
        <div className="game-card-sm">
          <p className="text-xs font-bold text-slate-500 mb-2 text-center">Life goals funded</p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-3xl font-black text-violet-600">{gamification.fundedGoalsCount}</span>
            <span className="text-sm text-slate-400">/ {gamification.totalGoalsCount}</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${gamification.totalGoalsCount > 0 ? (gamification.fundedGoalsCount / gamification.totalGoalsCount) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">lifestyle &amp; family categories with budget set</p>
        </div>
      </div>

      {optimizerEnabled && (
        <GoalPriorityPanel
          goalRegistry={goalRegistry}
          onChange={setGoalRegistry}
          careReserve={careReserve}
          onCareReserveChange={updateCareReserveFromGoalPanel}
          isApplying={policyLoading}
          targetControlConfig={goalTargetControlConfig}
        />
      )}

      {/* Charts */}
      <div className="game-card">
        <div className="flex items-start justify-between mb-1">
          <h3 className="section-heading mb-0">
            {optimizerEnabled ? 'Gross income vs required spending — optimiser view' : 'Gross income vs required spending — lifetime view'}
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {optimizerEnabled
            ? 'This chart uses the optimiser-selected strategy, so it matches the year-by-year drawdown table below. Tax reduces spendable cash, so gross income can be higher than required spending.'
            : 'Stacked bars = gross income sources. Dashed line = required spending — the cash need the plan must meet after tax. Tax reduces spendable cash, so gross income can be higher than spending in a given year.'}
        </p>
        <LifetimeChart projections={chartProjections} mode={mode} p1Name={p1Name} p2Name={p2Name} />
      </div>

      <div className="game-card">
        <h3 className="section-heading">Asset balances over time</h3>
        <p className="text-xs text-slate-500 mb-4">
          Combined ISA, GIA, cash and pension as you draw from them.
          {state.careReserve?.enabled && (
            <span className="ml-1 text-teal-600 font-semibold">Care Reserve shown separately — earmarked, not drawn for spending.</span>
          )}
        </p>
        <AssetChart projections={displayProjections} />
      </div>

      {optimizerEnabled && optimizerResult && (
        <OptimizerPanel plannerState={deferredState} result={optimizerResult} />
      )}

      {/* Tax strategy */}
      {!optimizerEnabled && (
        <TaxOverview projections={displayProjections} />
      )}

      {/* Projection table */}
      {!optimizerEnabled && (
        <ProjectionTable projections={displayProjections} lifeStages={lifeStages} />
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-between pt-2 no-print">
        <button onClick={onBack} className="btn-secondary">← Edit income & assets</button>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a'); a.href = url; a.download = 'lifeplan.json'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="btn-secondary text-sm"
          >💾 Save scenario</button>
          <button onClick={() => window.print()} className="btn-primary text-sm">🖨️ Export PDF</button>
        </div>
      </div>
    </div>
  );
}
