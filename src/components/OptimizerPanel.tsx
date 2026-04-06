'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { describeStrategyLabel } from '@/financialEngine/withdrawalOptimizer';
import type { OptimizationResult, WaterfallResult } from '@/financialEngine/types';
import { explainOptimizerResult } from '@/lib/optimizerExplainClient';
import type { PlannerState } from '@/models/types';

interface Props {
  plannerState: PlannerState;
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

const KNOWN_PROVIDER_LABELS: Record<string, string> = {
  'azure-openai': 'Azure OpenAI',
  'anthropic': 'Anthropic',
};

function getProviderLabel(): string {
  const raw = process.env.NEXT_PUBLIC_LLM_PROVIDER;
  if (!raw) return KNOWN_PROVIDER_LABELS['azure-openai'];
  return KNOWN_PROVIDER_LABELS[raw] ?? 'your configured AI provider';
}

export default function OptimizerPanel({ plannerState, result }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const rows = useMemo(
    () => (showAll ? result.yearRecords : result.yearRecords.slice(0, 10)),
    [result.yearRecords, showAll],
  );
  const recommended = describeStrategyLabel(result.recommendedStrategy.label);
  const depletionLabel = result.assetDepletionAge === null
    ? 'Assets last to horizon'
    : `Age ${result.assetDepletionAge}`;
  const providerLabel = getProviderLabel();

  async function handleExplain() {
    if (!hasConsented || isExplaining) return;

    setIsExplaining(true);
    setExplainError(null);
    setExplanation(null);

    try {
      const text = await explainOptimizerResult({ plannerState, optimizationResult: result });
      setExplanation(text);
    } catch (error) {
      setExplainError(error instanceof Error ? error.message : 'Unable to generate explanation.');
    } finally {
      setIsExplaining(false);
    }
  }

  function openDialog() {
    setExplainError(null);
    setExplanation(null);
    setHasConsented(false);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isExplaining) return;
    setIsDialogOpen(false);
    setHasConsented(false);
  }

  return (
    <>
      <div className="game-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="section-heading mb-1">AI optimizer preview</h3>
            <p className="text-xs text-slate-500">
              Deterministic strategy search over the existing waterfall order. No LLM in the hot path.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-300">Recommended</p>
              <p className="text-lg font-black">{recommended}</p>
            </div>
            <button
              type="button"
              onClick={openDialog}
              className="btn-secondary py-2 text-sm"
            >
              Explain this recommendation
            </button>
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

      {isDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="optimizer-explain-title"
          className="fixed inset-0 z-50 overflow-y-auto"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6">
            <div
              data-testid="optimizer-explain-panel"
              className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div data-testid="optimizer-explain-body" className="overflow-y-auto p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  Optimizer Explanation
                </p>
                <h2 id="optimizer-explain-title" className="mt-2 text-xl font-black text-slate-900">
                  Send a minimised summary to explain this recommendation
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  LLP will send a minimised summary of your ages, household type, high-level asset totals,
                  optimizer result, and HMRC rule provenance to {providerLabel} through the server-side
                  explanation route. Names, addresses, account numbers, and full yearly plan data are not sent.
                </p>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Data disclosed if you continue
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    <li>Household type, ages, and tax jurisdiction</li>
                    <li>Guaranteed income total and DC, ISA, and GIA balances</li>
                    <li>Recommended strategy, baseline comparison, tax saving, and terminal assets</li>
                    <li>HMRC rule IDs, versions, and tax years used to build the recommendation</li>
                  </ul>
                </div>

                <label className="mt-4 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    checked={hasConsented}
                    onChange={(event) => setHasConsented(event.target.checked)}
                    disabled={isExplaining}
                  />
                  <span>
                    I consent to LLP sending this minimised optimizer summary for explanation generation.
                  </span>
                </label>

                {explainError ? (
                  <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {explainError}
                  </p>
                ) : null}

                {isExplaining ? (
                  <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">
                    Generating explanation...
                  </div>
                ) : null}

                {explanation ? (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Explanation
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-950">
                      {explanation}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="btn-secondary py-2.5 text-sm"
                  disabled={isExplaining}
                >
                  {explanation ? 'Close' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExplain()}
                  className="btn-primary py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasConsented || isExplaining}
                >
                  {isExplaining ? 'Generating...' : 'Generate explanation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
