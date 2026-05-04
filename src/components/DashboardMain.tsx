'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { YearlyProjection, DrawdownStrategy, LifeStage } from '@/lib/types';
import type { PlannerState, RlssStandard } from '@/models/types';
import type { OptimizationResult } from '@/financialEngine/types';
import { formatCurrency } from '@/lib/calculations';
import { getStageTotalSpending } from '@/financialEngine/projectionEngine';
import { RLSS_STANDARDS } from '@/lib/mockData';
import { CGT, INCOME_TAX, PENSION_RULES } from '@/config/financialConstants';
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-right">
              {['Age', 'Stage', 'Spending', 'Income', 'Tax', 'Net', 'Inv. Assets'].map((h, i) => (
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

// ─── Withdrawal guide strings — computed once from HMRC constants ──────────────
// These derive from module-level constants, so they are stable across all renders.
const WITHDRAWAL_GUIDE = {
  ufplsTaxFree:      `${Math.round(PENSION_RULES.UFPLS_TAX_FREE_FRACTION * 100)}%`,
  ufplsTaxable:      `${Math.round((1 - PENSION_RULES.UFPLS_TAX_FREE_FRACTION) * 100)}%`,
  personalAllowance: formatCurrency(INCOME_TAX.PERSONAL_ALLOWANCE, true),
  annualExempt:      formatCurrency(CGT.ANNUAL_EXEMPT, true),
  cgtBasicRate:      `${Math.round(CGT.BASIC_RATE * 100)}%`,
  cgtHigherRate:     `${Math.round(CGT.HIGHER_RATE * 100)}%`,
} as const;

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

  // Tax summary stats (used for overview panels)
  const lifetimeIncomeTax = projections.reduce((s, p) => s + p.incomeTaxPaid, 0);
  const lifetimeCGT = projections.reduce((s, p) => s + p.totalCgtPaid, 0);
  const lifetimeIncome = projections.reduce((s, p) => s + p.totalIncome, 0);
  const taxFreeYears = projections.filter(p => Math.round(p.totalTaxPaid) === 0).length;
  const effectiveRate = lifetimeIncome > 0 ? (lifetimeIncomeTax + lifetimeCGT) / lifetimeIncome * 100 : 0;

  const { ufplsTaxFree, ufplsTaxable, personalAllowance, annualExempt, cgtBasicRate, cgtHigherRate } = WITHDRAWAL_GUIDE;

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

      {/* Withdrawal plan optimisation — shown above charts */}
      {optimizerEnabled && optimizerResult && plannerState && (
        <OptimizerPanel
          plannerState={plannerState}
          result={optimizerResult}
          proEnabled={proEnabled}
          onProCta={onProCta}
        />
      )}

      {/* Charts */}
      <div id="section-charts" className="scroll-mt-32 game-card mb-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="section-heading mb-0">
            {optimizerEnabled && proEnabled ? 'Gross income vs required spending — optimiser view' : 'Gross income vs required spending — lifetime view'}
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {optimizerEnabled && proEnabled
            ? 'This chart uses the optimiser-selected strategy, so it matches the withdrawal plan optimisation above. Tax reduces spendable cash, so gross income can be higher than required spending.'
            : 'Stacked bars = gross income sources. Dashed line = required spending — the cash need the plan must meet after tax. Tax reduces spendable cash, so gross income can be higher than spending in a given year.'}
        </p>
        <LifetimeChart projections={displayProjections} mode={mode} p1Name={p1Name} p2Name={p2Name} />
        <p className="mt-3 text-xs text-slate-400 text-center">
          Bars above the dashed line indicate surplus income; bars below indicate a shortfall.
        </p>
      </div>

      <div className="game-card mb-6">
        <h3 className="section-heading">Investment balances over time</h3>
        <p className="text-xs text-slate-500 mb-4">
          Combined <span className="inline-flex items-center">ISA<InfoIcon term="ISA" tooltip={GLOSSARY.ISA} /></span>, <span className="inline-flex items-center">GIA<InfoIcon term="GIA" tooltip={GLOSSARY.GIA} /></span>, cash and pension as you draw from them.
          {state.careReserve?.enabled && (
            <span className="ml-1 text-teal-600 font-semibold">Care Reserve shown separately — earmarked, not drawn for spending.</span>
          )}
        </p>
        <AssetChart projections={displayProjections} />
      </div>

      {/* Projection table */}
      <ProjectionTable projections={projections} lifeStages={lifeStages} />

      {/* Tax panels in overview: show full simplified withdrawal guide for non-Pro users; show a compact Tax Summary for Pro users */}
      {!proEnabled ? (
        <div className="game-card mt-6">
          <h3 className="section-heading">Simplified tax-efficient withdrawal strategy</h3>
          <p className="text-xs text-slate-500 mb-1">A simplified guide to how income is typically structured each year to reduce tax.</p>
          <p className="text-xs text-slate-400 mb-4 italic">
            This is a simplified, typical ordering only — the most tax-efficient sequence and outcomes can vary based on your circumstances and current tax position.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-2xl p-3 bg-rose-50 border border-rose-100">
              <p className="text-xs text-rose-600 font-bold mb-1">Lifetime income tax</p>
              <p className="text-xl font-black text-rose-800">{formatCurrency(lifetimeIncomeTax, true)}</p>
            </div>
            <div className="rounded-2xl p-3 bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 font-bold mb-1 flex items-center">Lifetime CGT<InfoIcon term="CGT" tooltip={GLOSSARY.CGT} /></p>
              <p className="text-xl font-black text-amber-800">{formatCurrency(lifetimeCGT, true)}</p>
            </div>
            <div className="rounded-2xl p-3 bg-emerald-50 border border-emerald-100">
              <p className="text-xs text-emerald-600 font-bold mb-1">Tax-free years</p>
              <p className="text-xl font-black text-emerald-800">{taxFreeYears}</p>
              <p className="text-xs text-emerald-500 mt-0.5">of {projections.length} projected</p>
            </div>
            <div className="rounded-2xl p-3 bg-sky-50 border border-sky-100">
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
      ) : (
        <div className="game-card mt-6">
          <h3 className="section-heading">Tax Summary</h3>
          <p className="text-xs text-slate-500 mb-1">Key lifetime tax figures based on the standard drawdown plan.</p>
          {optimizerEnabled && (
            <p className="text-xs text-amber-600 mb-4 italic">
              Figures reflect the standard drawdown (pre-optimiser baseline). Use the Withdrawal Optimizer panel for optimised projections.
            </p>
          )}
          {!optimizerEnabled && <div className="mb-4" />}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-rose-50 border border-rose-100">
              <p className="text-xs text-rose-600 font-bold">Income Tax</p>
              <p className="text-xl font-black text-rose-800 mt-1">{formatCurrency(lifetimeIncomeTax, true)}</p>
            </div>
            <div className="rounded-xl p-4 bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 font-bold">CGT</p>
              <p className="text-xl font-black text-amber-800 mt-1">{formatCurrency(lifetimeCGT, true)}</p>
            </div>
            <div className="rounded-xl p-4 bg-sky-50 border border-sky-100">
              <p className="text-xs text-sky-600 font-bold">Effective Rate</p>
              <p className="text-xl font-black text-sky-800 mt-1">{effectiveRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-100">
              <p className="text-xs text-emerald-600 font-bold">Tax-free Years</p>
              <p className="text-xl font-black text-emerald-800 mt-1">{taxFreeYears}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
