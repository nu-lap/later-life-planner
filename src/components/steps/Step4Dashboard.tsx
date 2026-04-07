'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePlannerStore } from '@/store/plannerStore';
import {
  calculateProjections, getStageTotalSpending,
  getAssetDepletionAge, formatCurrency, getTotalUnrealisedGain,
  calculateGamificationMetrics,
} from '@/lib/calculations';
import OptimizerPanel from '@/components/OptimizerPanel';
import { CGT, INCOME_TAX } from '@/config/financialConstants';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import { RLSS_STANDARDS } from '@/lib/mockData';
import type { YearlyProjection } from '@/lib/types';
import clsx from 'clsx';

const ChartSkeleton = () => <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />;
const LifetimeChart = dynamic(() => import('@/components/charts/LifetimeChart'), { ssr: false, loading: ChartSkeleton });
const AssetChart    = dynamic(() => import('@/components/charts/AssetChart'),    { ssr: false, loading: ChartSkeleton });

interface Props { onBack: () => void }

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
  const { mode, person1, person2, lifeStages, rlssStandard, spendingCategories, fiAge } = state;

  const { projections, optimizerResult } = useMemo(() => {
    if (!optimizerEnabled) {
      return {
        projections: calculateProjections(deferredState),
        optimizerResult: null,
      };
    }

    // Run the optimizer once; reuse its pre-computed projections so we avoid
    // a duplicate calculateProjections() call.
    const result = optimizeWithdrawals(deferredState);
    return {
      projections: result.baselineProjections,
      optimizerResult: result,
    };
  }, [deferredState, optimizerEnabled]);
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

  const p1Name = person1.name || (mode === 'couple' ? 'Partner 1' : 'You');
  const p2Name = person2.name || 'Partner 2';

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
            <p className="font-black text-teal-800">Care Reserve — {formatCurrency(firstYear?.careReserveBalance ?? state.careReserve.amount, true)}</p>
            <p className="text-sm text-teal-600 mt-0.5">
              Earmarked for potential late-life care costs. Invested and growing, but excluded from your spending projections above.
              If care costs never arise, this remains part of your estate.
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
