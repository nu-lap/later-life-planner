'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import type {
  OptimizationResult,
  PensionWithdrawalBreakdown,
  TaxableWithdrawalBreakdown,
  TaxFreeWithdrawalBreakdown,
  WaterfallResult,
} from '@/financialEngine/types';
import { explainOptimizerResult, getCachedOptimizerExplanation } from '@/lib/optimizerExplainClient';
import { getStrategyDefinitions, getStrategyDisplayLabel } from '@/lib/strategyDefinitions';
import type { PlannerState } from '@/models/types';

interface Props {
  plannerState: PlannerState;
  result: OptimizationResult;
}

function StrategyRow({
  label,
  result,
  accent,
  mode,
}: {
  label: string;
  result: WaterfallResult;
  accent: 'emerald' | 'amber';
  mode: PlannerState['mode'];
}) {
  const accents = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    amber: 'bg-amber-50 border-amber-100 text-amber-900',
  } as const;

  return (
    <div className={clsx('rounded-2xl border p-3', accents[accent])}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{getStrategyDisplayLabel(mode, result.strategy.label)}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="opacity-60">Required net income</p>
          <p className="font-bold">{formatCurrency(result.spendingTarget, true)}</p>
        </div>
        <div>
          <p className="opacity-60">Net income after tax</p>
          <p className="font-bold">{formatCurrency(result.netIncome, true)}</p>
        </div>
        <div>
          <p className="opacity-60">Shortfall</p>
          <p className="font-bold">{formatCurrency(result.gap, true)}</p>
        </div>
        <div>
          <p className="opacity-60">Tax</p>
          <p className="font-bold">{formatCurrency(result.totalTax, true)}</p>
        </div>
      </div>
    </div>
  );
}


function formatBreakdownAmount(value?: number): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return formatCurrency(value, true);
}

function BreakdownField({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-700">{formatBreakdownAmount(value)}</span>
    </div>
  );
}

function PensionBreakdownCell({ breakdown }: { breakdown?: PensionWithdrawalBreakdown }) {
  if (!breakdown) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-1">
      <BreakdownField label="Gross" value={breakdown.grossAmount} />
      <BreakdownField label="25% Tax Free" value={breakdown.pcls} />
      <BreakdownField label="Taxable" value={breakdown.taxableAmount} />
      <BreakdownField label="Tax due" value={breakdown.taxDue} />
    </div>
  );
}

function TaxableBreakdownCell({
  breakdown,
  taxableLabel,
}: {
  breakdown?: TaxableWithdrawalBreakdown;
  taxableLabel: string;
}) {
  if (!breakdown) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-1">
      <BreakdownField label="Gross" value={breakdown.grossAmount} />
      <BreakdownField label={taxableLabel} value={breakdown.taxableAmount} />
      <BreakdownField label="Tax due" value={breakdown.taxDue} />
    </div>
  );
}

function TaxFreeBreakdownCell({ breakdown }: { breakdown?: TaxFreeWithdrawalBreakdown }) {
  if (!breakdown) {
    return <span className="text-slate-400">—</span>;
  }

  return <BreakdownField label="Gross" value={breakdown.grossAmount} />;
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0, true);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), true)}`;
}

function formatDurabilityHeadline(current: number | null, baseline: number | null): string {
  if (current === baseline) return 'No change';
  if (current === null) return 'Lasts to horizon';
  if (baseline === null) return 'Earlier depletion';
  const delta = current - baseline;
  return delta > 0 ? `+${delta} years` : `${delta} years`;
}

function formatDurabilityDetail(current: number | null, baseline: number | null): string {
  if (current === null && baseline === null) {
    return 'Both approaches last to the end of the plan.';
  }
  if (current === null && baseline !== null) {
    return `Standard approach depletes at age ${baseline}.`;
  }
  if (current !== null && baseline === null) {
    return `This option depletes at age ${current}; the standard approach lasts to horizon.`;
  }
  if (current === baseline && current !== null) {
    return `Both approaches deplete at age ${current}.`;
  }
  if (current !== null && baseline !== null && current > baseline) {
    return `Extends plan durability from age ${baseline} to age ${current}.`;
  }
  if (current !== null && baseline !== null) {
    return `Shortens plan durability from age ${baseline} to age ${current}.`;
  }
  return 'Compares how long each approach keeps assets available.';
}

const KNOWN_PROVIDER_LABELS: Record<string, string> = {
  'azure-openai': 'Azure OpenAI',
  anthropic: 'Anthropic',
};

function getProviderLabel(): string {
  const raw = process.env.NEXT_PUBLIC_LLM_PROVIDER;
  if (!raw) return KNOWN_PROVIDER_LABELS['azure-openai'];
  return KNOWN_PROVIDER_LABELS[raw] ?? 'your configured AI provider';
}

function splitDenseParagraph(text: string): string[] {
  // Split only on real sentence boundaries: punctuation followed by whitespace and
  // either a capital letter or a common lowercase abbreviation that can start a
  // new sentence (e.g., i.e.). This avoids false splits inside decimal numbers
  // (e.g. £1.5m) and before arbitrary lowercase continuations.
  const sentences = text
    .split(/(?<=[.!?])\s+(?=(?:[A-Z]|e\.g\.|i\.e\.))/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return [text.trim()];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(' '));
  }

  return paragraphs;
}

type ExplanationBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'list'; items: string[] };

function formatExplanationBlocks(text: string): ExplanationBlock[] {
  const sections = text
    .split(/\n\s*\n+/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return [];
  }

  const blocks: ExplanationBlock[] = [];

  for (const section of sections) {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const bulletLines = lines.filter((line) => /^[*-]\s+/.test(line));

    if (bulletLines.length === lines.length && bulletLines.length > 0) {
      blocks.push({
        type: 'list',
        items: bulletLines.map((line) => line.replace(/^[*-]\s+/, '').trim()),
      });
      continue;
    }

    if (sections.length === 1 && lines.length === 1) {
      for (const paragraph of splitDenseParagraph(lines[0])) {
        blocks.push({ type: 'paragraph', content: paragraph });
      }
      continue;
    }

    for (const line of lines) {
      blocks.push({ type: 'paragraph', content: line });
    }
  }

  return blocks;
}

export default function OptimizerPanel({ plannerState, result }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [showStrategyComparison, setShowStrategyComparison] = useState(true);
  const [showAllStrategyDefinitions, setShowAllStrategyDefinitions] = useState(false);
  const [showDrawdownBreakdown, setShowDrawdownBreakdown] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isLoadingCachedExplanation, setIsLoadingCachedExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const rows = useMemo(
    () => (showAll ? result.yearRecords : result.yearRecords.slice(0, 5)),
    [result.yearRecords, showAll],
  );
  const isCouple = plannerState.mode === 'couple';
  const person1Label = plannerState.person1.name || (isCouple ? 'Partner 1' : 'You');
  const person2Label = plannerState.person2.name || 'Partner 2';
  const providerLabel = getProviderLabel();
  const baselineTerminalAssets = result.baselineProjections.at(-1)?.totalAssets ?? 0;
  const terminalAssetDelta = result.terminalAssets - baselineTerminalAssets;
  const allStrategyGuideEntries = useMemo(
    () => getStrategyDefinitions(plannerState.mode, person1Label, isCouple ? person2Label : undefined),
    [isCouple, person1Label, person2Label, plannerState.mode],
  );
  const strategyGuideEntries = useMemo(() => {
    if (showAllStrategyDefinitions) {
      return allStrategyGuideEntries;
    }

    const strategyLabels = new Set(rows.map((record) => getStrategyDisplayLabel(plannerState.mode, record.winner.strategy.label)));

    return allStrategyGuideEntries.filter((entry) => strategyLabels.has(entry.label));
  }, [allStrategyGuideEntries, plannerState.mode, rows, showAllStrategyDefinitions]);
  const shownYearCount = rows.length;
  const hasExplanation = Boolean(explanation && explanation.trim().length > 0);
  const explanationBlocks = useMemo(
    () => (hasExplanation ? formatExplanationBlocks(explanation!) : []),
    [explanation, hasExplanation],
  );

  async function handleExplain() {
    if (!hasConsented || isExplaining || isLoadingCachedExplanation || hasExplanation) return;

    setIsExplaining(true);
    setExplainError(null);

    try {
      const generated = await explainOptimizerResult({ plannerState, optimizationResult: result });
      setExplanation(generated.text);
    } catch (error) {
      setExplainError(error instanceof Error ? error.message : 'Unable to generate explanation.');
    } finally {
      setIsExplaining(false);
    }
  }

  async function openDialog() {
    setExplainError(null);
    setExplanation(null);
    setHasConsented(false);
    setIsDialogOpen(true);
    setIsLoadingCachedExplanation(true);

    try {
      const cached = await getCachedOptimizerExplanation({ plannerState, optimizationResult: result });
      setExplanation(cached.explanation);
    } catch {
      setExplanation(null);
    } finally {
      setIsLoadingCachedExplanation(false);
    }
  }

  function closeDialog() {
    if (isExplaining || isLoadingCachedExplanation) return;
    setIsDialogOpen(false);
    setHasConsented(false);
  }

  return (
    <>
      <div className="game-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="section-heading mb-1">Withdrawal plan optimisation</h3>
            <p className="text-xs text-slate-500">
              Compare LaterLifePlan&apos;s standard withdrawal order with other deterministic options.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void openDialog()}
              className="btn-secondary py-2 text-sm"
            >
              Explain this recommendation
            </button>
          </div>
        </div>

        <div className="mt-3 w-full rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Strategy guide</p>
              <p className="mt-1 text-xs leading-5 text-blue-700">
                These are the strategy definitions for the best option shown in the comparison table below.
                Use the button to show the full list of strategy definitions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAllStrategyDefinitions((current) => !current)}
              className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              aria-expanded={showAllStrategyDefinitions}
              aria-controls="strategy-guide-panel"
            >
              {showAllStrategyDefinitions ? 'Show best-option strategies' : 'Show all strategy definitions'}
            </button>
          </div>
          <div id="strategy-guide-panel" className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="strategy-guide-panel">
            {strategyGuideEntries.map((entry) => (
              <div key={entry.label} className="rounded-xl border border-blue-100 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{entry.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-bold text-emerald-700">Tax impact vs standard approach</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">
              {formatCurrency(result.lifetimeTaxSaving, true)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Optimized tax: {formatCurrency(result.lifetimeTaxPaid, true)} · standard: {formatCurrency(result.baselineLifetimeTaxPaid, true)}
            </p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <p className="text-xs font-bold text-sky-700">Plan durability vs standard approach</p>
            <p className="mt-1 text-2xl font-black text-sky-900">
              {formatDurabilityHeadline(result.assetDepletionAge, result.baselineAssetDepletionAge)}
            </p>
            <p className="mt-1 text-xs text-sky-700">
              {formatDurabilityDetail(result.assetDepletionAge, result.baselineAssetDepletionAge)}
            </p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <p className="text-xs font-bold text-violet-700">End-of-plan assets vs standard approach</p>
            <p className="mt-1 text-2xl font-black text-violet-900">
              {formatSignedCurrency(terminalAssetDelta)}
            </p>
            <p className="mt-1 text-xs text-violet-700">
              Optimized: {formatCurrency(result.terminalAssets, true)} · standard: {formatCurrency(baselineTerminalAssets, true)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">
                Strategy comparison by year
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Secondary detail showing the best and runner-up options for each year. Showing {shownYearCount} of {result.yearRecords.length} years.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowStrategyComparison((current) => !current)}
                className="text-sm font-semibold text-orange-600 hover:text-orange-700"
              >
                {showStrategyComparison ? '▲ Hide comparison' : '▼ Show comparison'}
              </button>
            </div>
          </div>

          {showStrategyComparison ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="w-24 pb-2 pr-3 font-bold sm:w-32">Age</th>
                    <th className="pb-2 pr-3 font-bold">Best</th>
                    <th className="pb-2 pr-0 font-bold">Runner-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => {
                    const [best, runnerUp] = record.topStrategies;
                    return (
                      <tr key={record.p1Age} className="border-b border-slate-50 align-top">
                        <td className="w-24 py-3 pr-3 text-slate-700 sm:w-32">
                          {record.p1Age}
                          {record.p2Age !== null ? ` / ${record.p2Age}` : ''}
                        </td>
                        <td className="py-3 pr-3">
                          <StrategyRow label="Best" result={best ?? record.winner} accent="emerald" mode={plannerState.mode} />
                        </td>
                        <td className="py-3 pr-0">
                          {runnerUp ? (
                            <StrategyRow label="Runner-up" result={runnerUp} accent="amber" mode={plannerState.mode} />
                          ) : (
                            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-xs text-slate-500">
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
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">
                Drawdown breakdown by year
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Shows the actual withdrawals used year by year. This is the source of truth when the plan changes over time and the net spend target must still be met after tax.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 text-left sm:w-48 sm:items-end sm:text-right">
              <p className="text-xs text-slate-500">
                Showing {shownYearCount} of {result.yearRecords.length} years
              </p>
              <button
                type="button"
                onClick={() => setShowDrawdownBreakdown((current) => !current)}
                className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                aria-expanded={showDrawdownBreakdown}
                aria-controls="drawdown-breakdown-panel"
              >
                {showDrawdownBreakdown ? '▲ Hide breakdown' : '▼ Show breakdown'}
              </button>
            </div>
          </div>

          {showDrawdownBreakdown ? (
            <div id="drawdown-breakdown-panel" className="mt-4 overflow-x-auto" data-testid="optimizer-drawdown-breakdown-table">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th rowSpan={2} className="sticky left-0 z-10 w-24 border-r border-slate-100 bg-slate-50 pb-2 pr-3 font-bold sm:w-32">Age</th>
                    <th colSpan={4} className="pb-2 pr-3 text-center font-bold">{person1Label}</th>
                    {isCouple ? <th colSpan={4} className="pb-2 pr-3 text-center font-bold">{person2Label}</th> : null}
                    {isCouple ? <th colSpan={1} className="pb-2 pr-0 text-center font-bold">Joint</th> : null}
                  </tr>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="pb-2 pr-3 font-bold">Pension</th>
                    <th className="pb-2 pr-3 font-bold">ISA</th>
                    <th className="pb-2 pr-3 font-bold">GIA</th>
                    <th className="pb-2 pr-3 font-bold">Cash</th>
                    {isCouple ? <th className="pb-2 pr-3 font-bold">Pension</th> : null}
                    {isCouple ? <th className="pb-2 pr-3 font-bold">ISA</th> : null}
                    {isCouple ? <th className="pb-2 pr-3 font-bold">GIA</th> : null}
                    {isCouple ? <th className="pb-2 pr-3 font-bold">Cash</th> : null}
                    {isCouple ? <th className="pb-2 pr-0 font-bold">GIA</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={`breakdown-${record.p1Age}-${record.yearIndex}`} className="border-b border-slate-50 align-top">
                      <td className="sticky left-0 z-0 w-24 border-r border-slate-100 bg-slate-50 py-3 pr-3 text-slate-700 sm:w-32">
                        {record.p1Age}
                        {record.p2Age !== null ? ` / ${record.p2Age}` : ''}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        <PensionBreakdownCell breakdown={record.drawdownBreakdown.person1.pension} />
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        <TaxFreeBreakdownCell breakdown={record.drawdownBreakdown.person1.isa} />
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        <TaxableBreakdownCell breakdown={record.drawdownBreakdown.person1.gia} taxableLabel="Taxable gain" />
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        <TaxFreeBreakdownCell breakdown={record.drawdownBreakdown.person1.cash} />
                      </td>
                      {isCouple ? (
                        <td className="py-3 pr-3 text-slate-600">
                          <PensionBreakdownCell breakdown={record.drawdownBreakdown.person2?.pension} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="py-3 pr-3 text-slate-600">
                          <TaxFreeBreakdownCell breakdown={record.drawdownBreakdown.person2?.isa} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="py-3 pr-3 text-slate-600">
                          <TaxableBreakdownCell breakdown={record.drawdownBreakdown.person2?.gia} taxableLabel="Taxable gain" />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="py-3 pr-3 text-slate-600">
                          <TaxFreeBreakdownCell breakdown={record.drawdownBreakdown.person2?.cash} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="py-3 pr-0 text-slate-600">
                          <TaxableBreakdownCell breakdown={record.drawdownBreakdown.joint?.gia} taxableLabel="Taxable gain" />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {result.yearRecords.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            {showAll ? '▲ Show fewer years' : '▼ Show all optimiser years'}
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
              className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div data-testid="optimizer-explain-body" className="overflow-y-auto p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  Optimizer Explanation
                </p>
                <h2 id="optimizer-explain-title" className="mt-2 text-xl font-black text-slate-900">
                  Explain this recommendation
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  LaterLifePlan will send a short summary of your plan details to generate this explanation.
                  If you agree, it will also look up the matching HMRC guidance using the rule IDs, tax year,
                  and jurisdiction in your plan. It will not send names, addresses, account numbers, or the
                  full year-by-year plan.
                </p>

                {isLoadingCachedExplanation ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Checking for a saved explanation for this plan...
                  </div>
                ) : null}

                {hasExplanation ? (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                    This saved explanation matches your current plan. Change your plan to generate a new one.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Data disclosed if you continue
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        <li>Household type, ages, and tax jurisdiction</li>
                        <li>Guaranteed income total and DC, ISA, and GIA balances</li>
                        <li>Recommended strategy, baseline comparison, tax saving, and terminal assets</li>
                        <li>HMRC rule IDs, versions, and tax years used to build the recommendation</li>
                        <li>Matched HMRC guidance for those rule IDs, tax year, and jurisdiction</li>
                      </ul>
                    </div>

                    <label className="mt-4 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        checked={hasConsented}
                        onChange={(event) => setHasConsented(event.target.checked)}
                        disabled={isExplaining || isLoadingCachedExplanation}
                      />
                      <span>
                        I consent to LaterLifePlan sending this minimised optimiser summary and retrieving matched HMRC guidance for explanation generation.
                      </span>
                    </label>
                  </>
                )}

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

                {hasExplanation ? (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Explanation
                    </p>
                    <div className="mt-3 space-y-3 text-sm leading-6 text-emerald-950">
                      {explanationBlocks.map((block, index) => {
                        if (block.type === 'list') {
                          return (
                            <ul
                              key={`list-${index}`}
                              data-testid="optimizer-explanation-list"
                              className="list-disc space-y-2 pl-5"
                            >
                              {block.items.map((item, itemIndex) => (
                                <li key={`list-${index}-item-${itemIndex}`}>{item}</li>
                              ))}
                            </ul>
                          );
                        }

                        return (
                          <p key={`paragraph-${index}`} data-testid="optimizer-explanation-paragraph">
                            {block.content}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="btn-secondary py-2.5 text-sm"
                  disabled={isExplaining || isLoadingCachedExplanation}
                >
                  {hasExplanation ? 'Close' : 'Cancel'}
                </button>
                {!hasExplanation ? (
                  <button
                    type="button"
                    onClick={() => void handleExplain()}
                    className="btn-primary py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasConsented || isExplaining || isLoadingCachedExplanation}
                  >
                    {isLoadingCachedExplanation ? 'Checking cache...' : isExplaining ? 'Generating...' : 'Generate explanation'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
