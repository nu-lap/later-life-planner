'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { YearlyProjection, DrawdownStrategy, LifeStage } from '@/lib/types';
import type { PlannerState, RlssStandard } from '@/models/types';
import type { OptimizationResult } from '@/financialEngine/types';
import { formatCurrency } from '@/lib/calculations';
import { getStageTotalSpending } from '@/financialEngine/projectionEngine';
import { RLSS_STANDARDS } from '@/lib/mockData';

import InfoIcon from '@/components/ui/InfoIcon';
import { GLOSSARY } from '@/lib/glossary';
import OptimizerPanel from '@/components/OptimizerPanel';
import clsx from 'clsx';

const ChartSkeleton = () => <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />;
const LifetimeChart = dynamic(() => import('@/components/charts/LifetimeChart'), { ssr: false, loading: ChartSkeleton });
const AssetChart    = dynamic(() => import('@/components/charts/AssetChart'),    { ssr: false, loading: ChartSkeleton });

// ProjectionTable component
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
      <div className="overflow-x-auto -mx-2 sm:mx-0 sm:overflow-visible">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-right">
              {['Age', 'Stage', 'Spending', 'Income', 'Tax', 'Net', 'Inv. Assets'].map((h, i) => (
                <th key={h} className={clsx('pb-2 px-1 sm:px-3 sm:pr-3 font-bold text-slate-500 whitespace-nowrap', i <= 1 && 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const stageColor = lifeStages.find(s => s.label === p.lifeStage)?.color ?? '#94a3b8';
              return (
                <tr key={p.p1Age} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 text-slate-700 whitespace-nowrap">
                    {p.p1Age}{p.p2Age !== null && <span>/{p.p2Age}</span>}
                  </td>
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 whitespace-nowrap">
                    <span className="text-xs font-semibold" style={{ color: stageColor }}>{p.lifeStage}</span>
                  </td>
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 text-right text-slate-600 whitespace-nowrap">{formatCurrency(p.spending, true)}</td>
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 text-right font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(p.totalIncome, true)}</td>
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 text-right text-rose-500 whitespace-nowrap">{formatCurrency(p.totalTaxPaid, true)}</td>
                  <td className="py-2 px-1 sm:px-3 sm:pr-3 text-right text-emerald-600 font-semibold whitespace-nowrap">{formatCurrency(p.netIncome, true)}</td>
                  <td className={clsx('py-2 px-1 sm:px-3 text-right font-bold whitespace-nowrap', p.totalAssets <= 0 ? 'text-rose-600' : 'text-slate-700')}>
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

interface DashboardMainProps {
  state: PlannerState;
  projections: YearlyProjection[];
  displayProjections: YearlyProjection[];
  surplus: boolean;
  depletionAge: number | string;
  firstYear?: YearlyProjection;
  lastPositive?: YearlyProjection;
  lifeStages: LifeStage[];
  mode: 'single' | 'couple';
  p1Name: string;
  p2Name: string;
  rlssStandard?: RlssStandard;
  optimizerEnabled: boolean;
  proEnabled: boolean;
  optimizerResult?: OptimizationResult | null;
  plannerState?: PlannerState;
  onProCta?: () => void;
  drawdownStrategy?: DrawdownStrategy;
  setDrawdownStrategy?: (v: DrawdownStrategy) => void;
  pclsAge?: number | undefined;
  setPclsAge?: (v: number | undefined) => void;
  strategies?: ReadonlyArray<{ id: DrawdownStrategy; label: string; icon: string; description: string }>;
  effectiveDrawdownStrategy?: DrawdownStrategy;
  person1CurrentAge?: number;
}

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'slate' | 'sky' | 'orange' | 'emerald' | 'rose';
}

function StatCard({ icon, label, value, sub, accent = 'slate' }: StatCardProps) {
  const bgMap = { slate: 'bg-slate-50 border-slate-100', sky: 'bg-sky-50 border-sky-100', orange: 'bg-orange-50 border-orange-100', emerald: 'bg-emerald-50 border-emerald-100', rose: 'bg-rose-50 border-rose-100' };
  const textMap = { slate: 'text-slate-600', sky: 'text-sky-600', orange: 'text-orange-600', emerald: 'text-emerald-600', rose: 'text-rose-600' };

  return (
    <div className={`rounded-2xl p-4 border ${bgMap[accent]}`}>
      <p className={`text-xs font-bold mb-2 flex items-center gap-1 ${textMap[accent]}`}>{icon} {label}</p>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      {sub && <p className={`text-xs mt-1 ${textMap[accent]}`}>{sub}</p>}
    </div>
  );
}

export default function DashboardMain({
  state,
  projections,
  displayProjections,
  surplus,
  depletionAge,
  firstYear,
  lastPositive,
  lifeStages,
  mode,
  p1Name,
  p2Name,
  rlssStandard,
  optimizerEnabled,
  proEnabled,
  optimizerResult,
  plannerState,
  onProCta,
  drawdownStrategy,
  setDrawdownStrategy,
  pclsAge,
  setPclsAge,
  strategies,
  effectiveDrawdownStrategy,
  person1CurrentAge,
}: DashboardMainProps) {
  const firstStageId = lifeStages[0]?.id ?? 'active';
  const annualSpend = getStageTotalSpending(state, firstStageId);
  const fiAge = state.fiAge;
  const unrealisedGain = useMemo(() => {
    const projection = projections[0];
    if (!projection) return 0;
    const p1Gain = Math.max(0, projection.p1GiaValue - projection.p1GiaBaseCost);
    const p2Gain = Math.max(0, projection.p2GiaValue - projection.p2GiaBaseCost);
    const jointGain = Math.max(0, projection.jointGiaValue - projection.jointGiaBaseCost);
    return p1Gain + p2Gain + jointGain;
  }, [projections]);

  // State for lazy-load table and chart toggle
  const [showDetailedTable, setShowDetailedTable] = useState(false);
  const [chartView, setChartView] = useState<'income' | 'assets'>('income');

  return (
    <div className="flex-1 min-w-0">
      {/* Gap alert */}
      {!surplus && (
        <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4 flex gap-3 mb-4">
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
      <div id="section-overview" className="scroll-mt-32 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard 
          icon="💰" 
          label="Required net spending" 
          value={formatCurrency(annualSpend, true)}
          sub={rlssStandard && RLSS_STANDARDS[mode][rlssStandard] ? `${RLSS_STANDARDS[mode][rlssStandard].label} lifestyle` : "today's £"}
          accent="slate" 
        />
        <StatCard 
          icon="📥" 
          label={`Gross income at ${fiAge}`} 
          value={formatCurrency(firstYear?.totalIncome ?? 0, true)}
          sub={firstYear ? `Net after tax: ${formatCurrency(firstYear.netIncome, true)} — year 1` : 'year 1'}
          accent="sky" 
        />
        <StatCard 
          icon="🏦" 
          label={`Investment Assets at ${fiAge}`} 
          value={formatCurrency(firstYear?.totalAssets ?? 0, true)}
          sub={unrealisedGain > 0 ? `${formatCurrency(unrealisedGain, true)} unrealised gain` : 'across all accounts'}
          accent="orange" 
        />
        <StatCard
          icon={surplus ? '✅' : '⚠️'}
          label={surplus ? `Investment Assets at ${state.assumptions.lifeExpectancy}` : 'Depleted at age'}
          value={surplus ? formatCurrency(lastPositive?.totalAssets ?? 0, true) : String(depletionAge)}
          sub={surplus ? 'plan is on track' : 'review your plan'}
          accent={surplus ? 'emerald' : 'rose'} 
        />
      </div>

      {/* Care Reserve callout */}
      {state.careReserve?.enabled && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 p-4 flex items-start gap-3 mb-6">
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

      {/* Withdrawal Strategy selector — Pro mode only */}
      {proEnabled && strategies && strategies.length > 0 && setDrawdownStrategy && (
        <div className="game-card mb-6">
          <h3 className="section-heading mb-1">Withdrawal Strategy</h3>
          <p className="text-xs text-slate-500 mb-3">Choose how you draw down your pension and investment accounts each year.</p>
          <div className="space-y-3">
            {strategies.map(option => (
              <button
                key={option.id}
                onClick={() => setDrawdownStrategy(option.id)}
                className={clsx(
                  'w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md',
                  effectiveDrawdownStrategy === option.id
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
                )}
                aria-pressed={effectiveDrawdownStrategy === option.id}
                aria-label={`${option.label}. ${option.description}${effectiveDrawdownStrategy === option.id ? ' (Active)' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl" aria-hidden="true">{option.icon}</span>
                  <span className={clsx('font-bold text-sm', effectiveDrawdownStrategy === option.id ? 'text-orange-800' : 'text-slate-800')} aria-hidden="true">
                    {option.label}
                  </span>
                  {effectiveDrawdownStrategy === option.id && (
                    <span className="ml-auto text-xs font-bold bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full" aria-hidden="true">Active</span>
                  )}
                </div>
                <p className={clsx('text-sm leading-relaxed', effectiveDrawdownStrategy === option.id ? 'text-orange-700' : 'text-slate-500')}>
                  {option.description}
                </p>
              </button>
            ))}
          </div>
          {effectiveDrawdownStrategy === 'pcls-bed-isa' && setPclsAge && person1CurrentAge !== undefined && (
            <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <label className="text-sm font-semibold text-slate-700 block mb-2">
                Lump sum age
              </label>
              <input
                type="number"
                value={pclsAge ?? state.fiAge}
                onChange={(e) => setPclsAge(Math.max(person1CurrentAge, parseInt(e.target.value) || state.fiAge))}
                min={person1CurrentAge}
                max={120}
                className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-blue-600 mt-1">Strategy applies from age {pclsAge ?? state.fiAge}</p>
            </div>
          )}
        </div>
      )}

      {/* Withdrawal plan optimisation — shown above charts */}
      {optimizerEnabled && optimizerResult && plannerState && (
        <div className="mb-8">
          <OptimizerPanel
            plannerState={plannerState}
            result={optimizerResult}
            proEnabled={proEnabled}
            onProCta={onProCta}
          />
        </div>
      )}

      {/* Charts with toggle */}
      <div id="section-charts" className="scroll-mt-32 game-card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="section-heading mb-0">
              {chartView === 'income'
                ? (optimizerEnabled && proEnabled ? 'Gross income vs required spending — optimiser view' : 'Gross income vs required spending — lifetime view')
                : 'Investment balances over time'}
            </h3>
          </div>
          <div className="flex gap-2 flex-shrink-0 ml-4">
            <button
              type="button"
              aria-pressed={chartView === 'income'}
              onClick={() => setChartView('income')}
              className={clsx(
                'px-3 py-1 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                chartView === 'income'
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              )}
            >
              Income vs Spending
            </button>
            <button
              type="button"
              aria-pressed={chartView === 'assets'}
              onClick={() => setChartView('assets')}
              className={clsx(
                'px-3 py-1 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
                chartView === 'assets'
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              )}
            >
              Asset Growth
            </button>
          </div>
        </div>

        {chartView === 'income' && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              {optimizerEnabled && proEnabled
                ? 'This chart uses the optimiser-selected strategy, so it matches the withdrawal plan optimisation above. Tax reduces spendable cash, so gross income can be higher than required spending.'
                : 'Stacked bars = gross income sources. Dashed line = required spending — the cash need the plan must meet after tax. Tax reduces spendable cash, so gross income can be higher than spending in a given year.'}
            </p>
            <LifetimeChart projections={displayProjections} mode={mode} p1Name={p1Name} p2Name={p2Name} />
            <p className="mt-3 text-xs text-slate-400 text-center">
              Bars above the dashed line indicate surplus income; bars below indicate a shortfall.
            </p>
          </>
        )}

        {chartView === 'assets' && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              Combined <span className="inline-flex items-center">ISA<InfoIcon term="ISA" tooltip={GLOSSARY.ISA} /></span>, <span className="inline-flex items-center">GIA<InfoIcon term="GIA" tooltip={GLOSSARY.GIA} /></span>, cash and pension as you draw from them.
              {state.careReserve?.enabled && (
                <span className="ml-1 text-teal-600 font-semibold">Care Reserve shown separately — earmarked, not drawn for spending.</span>
              )}
            </p>
            <AssetChart projections={displayProjections} />
          </>
        )}
      </div>

      {/* Projection table — lazy loaded */}
      {showDetailedTable && (
        <div id="projection-table">
          <ProjectionTable projections={projections} lifeStages={lifeStages} />
        </div>
      )}
      {!showDetailedTable && (
        <div className="game-card mb-6">
          <div className="text-center py-8">
            <p className="text-sm text-slate-600 mb-4">View detailed year-by-year financial data for your entire projection period.</p>
            <button 
              type="button"
              aria-expanded={showDetailedTable}
              aria-controls="projection-table"
              onClick={() => setShowDetailedTable(true)}
              className="px-4 py-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 font-semibold text-sm transition-colors"
            >
              Show detailed table
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
