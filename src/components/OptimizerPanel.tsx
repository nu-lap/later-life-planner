'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { describeStrategyLabel } from '@/financialEngine/withdrawalOptimizer';
import type { OptimizationResult, WaterfallResult } from '@/financialEngine/types';

interface Props {
  result: OptimizationResult;
}

function StrategyRow({
  label,
  result,
  accent,
}: {
  label: string;
  result: WaterfallResult;
  accent: 'emerald' | 'amber';
}) {
  const accents = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    amber: 'bg-amber-50 border-amber-100 text-amber-900',
  } as const;

  return (
    <div className={clsx('rounded-2xl border p-3', accents[accent])}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{describeStrategyLabel(result.strategy.label)}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="opacity-60">Tax</p>
          <p className="font-bold">{formatCurrency(result.totalTax, true)}</p>
        </div>
        <div>
          <p className="opacity-60">Net income</p>
          <p className="font-bold">{formatCurrency(result.netIncome, true)}</p>
        </div>
      </div>
    </div>
  );
}

export default function OptimizerPanel({ result }: Props) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => (showAll ? result.yearRecords : result.yearRecords.slice(0, 10)),
    [result.yearRecords, showAll],
  );
  const recommended = describeStrategyLabel(result.recommendedStrategy.label);
  const depletionLabel = result.assetDepletionAge === null
    ? 'Assets last to horizon'
    : `Age ${result.assetDepletionAge}`;

  return (
    <div className="game-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="section-heading mb-1">AI optimizer preview</h3>
          <p className="text-xs text-slate-500">
            Deterministic strategy search over the existing waterfall order. No LLM in the hot path.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <p className="text-xs uppercase tracking-wide text-slate-300">Recommended</p>
          <p className="text-lg font-black">{recommended}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-700">Lifetime tax saving</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">
            {formatCurrency(result.lifetimeTaxSaving, true)}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            vs {describeStrategyLabel(result.baselineStrategy.label)}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
          <p className="text-xs font-bold text-sky-700">Asset depletion age</p>
          <p className="mt-1 text-2xl font-black text-sky-900">{depletionLabel}</p>
          <p className="mt-1 text-xs text-sky-700">
            Baseline: {result.baselineAssetDepletionAge === null
              ? 'lasts to horizon'
              : `age ${result.baselineAssetDepletionAge}`}
          </p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs font-bold text-violet-700">Terminal assets</p>
          <p className="mt-1 text-2xl font-black text-violet-900">
            {formatCurrency(result.terminalAssets, true)}
          </p>
          <p className="mt-1 text-xs text-violet-700">
            Optimized tax: {formatCurrency(result.lifetimeTaxPaid, true)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="pb-2 pr-3 font-bold">Age</th>
              <th className="pb-2 pr-3 font-bold">Best</th>
              <th className="pb-2 pr-3 font-bold">Runner-up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => {
              const [best, runnerUp] = record.topStrategies;
              return (
                <tr key={record.p1Age} className="border-b border-slate-50 align-top">
                  <td className="py-3 pr-3 text-slate-700">
                    {record.p1Age}
                    {record.p2Age !== null ? ` / ${record.p2Age}` : ''}
                  </td>
                  <td className="py-3 pr-3">
                    <StrategyRow label="Best" result={best ?? record.winner} accent="emerald" />
                  </td>
                  <td className="py-3 pr-0">
                    {runnerUp ? (
                      <StrategyRow label="Runner-up" result={runnerUp} accent="amber" />
                    ) : (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                        No alternative strategy for this year.
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.yearRecords.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          {showAll ? '▲ Show fewer years' : '▼ Show all optimizer years'}
        </button>
      )}
    </div>
  );
}
