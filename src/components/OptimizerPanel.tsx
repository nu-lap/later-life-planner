'use client';

import { useEffect, useMemo, useState } from 'react';
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
import type { PlannerState, YearlyProjection } from '@/models/types';

interface Props {
  plannerState: PlannerState;
  result: OptimizationResult;
  proEnabled: boolean;
  onProCta?: () => void;
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{formatBreakdownAmount(value)}</span>
    </div>
  );
}

function PensionBreakdownCell({ breakdown }: { breakdown?: PensionWithdrawalBreakdown }) {
  if (!breakdown) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-100 bg-white/90 p-2 shadow-sm">
      <BreakdownField label="Gross" value={breakdown.grossAmount} />
      {breakdown.pcls > 0 && <BreakdownField label="25% Tax Free" value={breakdown.pcls} />}
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
    <div className="space-y-2 rounded-xl border border-slate-100 bg-white/90 p-2 shadow-sm">
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

  return (
    <div className="rounded-xl border border-slate-100 bg-white/90 p-2 shadow-sm">
      <BreakdownField label="Gross" value={breakdown.grossAmount} />
    </div>
  );
}

function BedIsaCell({ amount, cgt, isaSpend = 0 }: { amount: number; cgt: number; isaSpend?: number }) {
  if (amount <= 0) {
    return <span className="text-slate-400">—</span>;
  }
  // How much of the GIA sale goes directly to spending vs. into the ISA wrapper
  const toSpend = Math.min(amount, isaSpend);
  const netToIsa = amount - toSpend;
  const isSplit = toSpend > 0;

  return (
    <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2 shadow-sm">
      {isSplit ? (
        // When ISA spending intercepts some of the Bed & ISA, show the full GIA sale with a breakdown
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">GIA sold (Bed &amp; ISA)</span>
            <span className="text-sm font-semibold text-emerald-800">{formatCurrency(amount, true)}</span>
          </div>
          <div className="space-y-0.5 border-t border-emerald-100 pt-1">
            {netToIsa > 0 && (
              <div className="flex items-baseline justify-between gap-1 text-[10px]">
                <span className="text-emerald-700">↳ Into ISA:</span>
                <span className="font-semibold text-emerald-800">{formatCurrency(netToIsa, true)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-1 text-[10px]">
              <span className="text-slate-500">↳ Covers ISA spending:</span>
              <span className="font-semibold text-slate-700">{formatCurrency(toSpend, true)}</span>
            </div>
          </div>
        </>
      ) : (
        // Standard case: full amount moves into the ISA wrapper
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Move to ISA</span>
          <span className="text-sm font-semibold text-emerald-800">{formatCurrency(amount, true)}</span>
        </div>
      )}
      {cgt > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">CGT due</span>
          <span className="text-xs font-semibold text-orange-700">~{formatCurrency(cgt, true)}</span>
        </div>
      )}
    </div>
  );
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

export default function OptimizerPanel({ plannerState, result, proEnabled, onProCta }: Props) {
  const [showAll, setShowAll] = useState(false);
  // Initialise collapsed by default; read localStorage after mount to avoid hydration mismatch.
  const [showStrategyComparison, setShowStrategyComparison] = useState(false);
  const [showAllStrategyDefinitions, setShowAllStrategyDefinitions] = useState(false);
  const [showDrawdownBreakdown, setShowDrawdownBreakdown] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isLoadingCachedExplanation, setIsLoadingCachedExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [selectedActionPlanYear, setSelectedActionPlanYear] = useState(0);
  // Read persisted toggle from localStorage after mount (client-only) to avoid SSR hydration mismatch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('llp:showStrategyComparison');
      if (stored !== null) setShowStrategyComparison(stored === 'true');
    } catch { /* ignore */ }
  }, []);
  // Persist strategy comparison toggle across remounts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem('llp:showStrategyComparison', String(showStrategyComparison)); } catch { /* ignore */ }
  }, [showStrategyComparison]);
  // Reset to year 0 when Pro is disabled; clamp within bounds when result changes.
  useEffect(() => {
    if (!proEnabled) {
      setSelectedActionPlanYear(0);
    } else {
      setSelectedActionPlanYear(y => Math.min(y, result.yearRecords.length - 1));
    }
  }, [proEnabled, result.yearRecords.length]);
  const rows = useMemo(
    () => (proEnabled && showAll ? result.yearRecords : result.yearRecords.slice(0, 5)),
    [result.yearRecords, showAll, proEnabled],
  );
  const isCouple = plannerState.mode === 'couple';
  const person1Label = plannerState.person1.name || (isCouple ? 'Partner 1' : 'You');
  const person2Label = plannerState.person2.name || 'Partner 2';
  const providerLabel = getProviderLabel();
  const baselineTerminalAssets = result.baselineProjections.at(-1)?.totalAssets ?? 0;
  const terminalAssetDelta = result.terminalAssets - baselineTerminalAssets;
  const hasAnyBedIsa = result.baselineProjections.some(
    p => p.p1BedIsaTransfer > 0 || p.p2BedIsaTransfer > 0,
  );
  const clampedActionPlanYear = !proEnabled
    ? 0
    : Math.min(selectedActionPlanYear, result.yearRecords.length - 1);
  const apRecord = result.yearRecords[clampedActionPlanYear] ?? result.yearRecords[0]!;
  // apRecord.yearIndex is the absolute index into baselineProjections (which starts at
  // currentAge, not fiAge). clampedActionPlanYear is the post-FI–relative offset, so
  // we must look up by yearIndex to avoid reading data from the wrong simulation year.
  const apProj: YearlyProjection = result.baselineProjections[apRecord.yearIndex] ?? result.baselineProjections[0]!;
  const apBd = proEnabled ? apRecord.drawdownBreakdown : apRecord.baseline.breakdown;
  const apIsFirstYear = clampedActionPlanYear === 0;
  const apIsLastYear = clampedActionPlanYear === result.yearRecords.length - 1;
  const apFixedIncomeItems = [
    { label: 'State Pension', p1: apProj.p1StatePension, p2: isCouple ? apProj.p2StatePension : 0 },
    { label: 'DB Pension', p1: apProj.p1DbPension, p2: isCouple ? apProj.p2DbPension : 0 },
    { label: 'Part-time work', p1: apProj.p1PartTimeWork, p2: isCouple ? apProj.p2PartTimeWork : 0 },
    { label: 'Other income', p1: apProj.p1OtherIncome, p2: isCouple ? apProj.p2OtherIncome : 0 },
    { label: 'Property rent', p1: apProj.p1PropertyRent, p2: isCouple ? apProj.p2PropertyRent : 0 },
  ].filter(item => item.p1 + item.p2 > 0);
  
  // Suppress BED transfer display when ISA withdrawal already covers or exceeds the transfer amount.
  // Rationale: if you're withdrawing more from ISA than the BED amount, the transfer is redundant.
  const p1IsaWithdrawal = apBd.person1.isa?.grossAmount ?? 0;
  const p2IsaWithdrawal = isCouple ? (apBd.person2?.isa?.grossAmount ?? 0) : 0;

  // How much of the Bed & ISA transfer covers spending directly (redirected, not entering ISA)
  const p1BedIsaToSpend = Math.min(apProj.p1BedIsaTransfer, p1IsaWithdrawal);
  const p2BedIsaToSpend = Math.min(apProj.p2BedIsaTransfer, p2IsaWithdrawal);
  // Net amount of Bed & ISA that actually stays in the ISA
  const p1BedIsaNetToIsa = apProj.p1BedIsaTransfer - p1BedIsaToSpend;
  const p2BedIsaNetToIsa = apProj.p2BedIsaTransfer - p2BedIsaToSpend;
  // Show Bed & ISA panel only when a net amount actually moves into the ISA
  const p1ShowBed = p1BedIsaNetToIsa > 0;
  const p2ShowBed = isCouple && p2BedIsaNetToIsa > 0;
  // Direct ISA spending = ISA withdrawal minus the Bed & ISA portion that was redirected to spending
  const p1DirectIsaSpend = p1IsaWithdrawal - p1BedIsaToSpend;
  const p2DirectIsaSpend = p2IsaWithdrawal - p2BedIsaToSpend;
  // Scaled individual/joint source breakdown for the net Bed & ISA going into ISA
  const p1BedIsaScale = apProj.p1BedIsaTransfer > 0 ? p1BedIsaNetToIsa / apProj.p1BedIsaTransfer : 0;
  const p2BedIsaScale = apProj.p2BedIsaTransfer > 0 ? p2BedIsaNetToIsa / apProj.p2BedIsaTransfer : 0;
  const p1IndivBedIsaNetToIsa = apProj.p1IndivBedIsaTransfer * p1BedIsaScale;
  const p1JointBedIsaNetToIsa = apProj.p1JointBedIsaTransfer * p1BedIsaScale;
  const p2IndivBedIsaNetToIsa = apProj.p2IndivBedIsaTransfer * p2BedIsaScale;
  const p2JointBedIsaNetToIsa = apProj.p2JointBedIsaTransfer * p2BedIsaScale;

  // GIA withdrawal calculations
  const p1GiaWithdrawal = apBd.person1.gia?.grossAmount ?? 0;
  const p2GiaWithdrawal = isCouple ? (apBd.person2?.gia?.grossAmount ?? 0) : 0;
  const jointGiaWithdrawal = apBd.joint?.gia?.grossAmount ?? 0;

  // GIA to spending: direct individual GIA draws + Bed & ISA portion redirected to spending
  const p1GiaToSpending = p1GiaWithdrawal + p1BedIsaToSpend;
  const p2GiaToSpending = p2GiaWithdrawal + p2BedIsaToSpend;

  // Total GIA withdrawn: individual GIA + full Bed & ISA transfer
  const p1TotalGiaWithdrawn = p1GiaWithdrawal + apProj.p1BedIsaTransfer;
  const p2TotalGiaWithdrawn = p2GiaWithdrawal + apProj.p2BedIsaTransfer;

  // Check if there's any GIA withdrawal to display (individual or joint)
  const apHasGiaWithdrawal = p1TotalGiaWithdrawn > 0 || p2TotalGiaWithdrawn > 0 || jointGiaWithdrawal > 0;

  const apHasIsaAction = p1ShowBed || p2ShowBed;
  const apHasPensionAction = (apBd.person1.pension?.grossAmount ?? 0) > 0 || (apBd.person2?.pension?.grossAmount ?? 0) > 0;
  const apHasIsaSpend = p1DirectIsaSpend > 0 || p2DirectIsaSpend > 0;
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
              onClick={proEnabled ? () => void openDialog() : () => onProCta?.()}
              className="btn-secondary py-2 text-sm"
            >
              Explain this recommendation
            </button>
          </div>
        </div>

        {proEnabled && (
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
        )}


        {/* ── Option B: Your action plan ── */}
        <div id="section-action" className="scroll-mt-32 mt-6 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm" data-testid="action-plan-section">
          {/* Header + year navigator */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">
                Your action plan
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                What to do with your money, year by year.
                {!proEnabled && <span className="ml-1 font-semibold text-orange-600">First year shown free — upgrade to Pro to step through all years.</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2" aria-label="Year selector">
              <button
                type="button"
                onClick={() => setSelectedActionPlanYear(y => Math.max(0, y - 1))}
                disabled={apIsFirstYear}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Previous year"
              >
                ◀
              </button>
              <div className="min-w-[9rem] text-center">
                <p className="text-sm font-semibold text-slate-800">{apRecord.taxYear}</p>
                <p className="text-xs text-slate-500">
                  Age {apRecord.p1Age}{apRecord.p2Age !== null ? ` / ${apRecord.p2Age}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!proEnabled) { onProCta?.(); return; }
                  setSelectedActionPlanYear(y => Math.min(result.yearRecords.length - 1, y + 1));
                }}
                disabled={proEnabled && apIsLastYear}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                aria-label={proEnabled ? 'Next year' : 'Unlock all years with Pro'}
              >
                {proEnabled ? '▶' : '🔓'}
              </button>
            </div>
          </div>

          {/* Action cards grid */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">

            {/* GIA Withdrawal */}
            {apHasGiaWithdrawal && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
                  💷 GIA withdrawal
                </p>
                {p1TotalGiaWithdrawn > 0 && (
                  <div className={clsx('mb-2', isCouple && p2TotalGiaWithdrawn > 0 && 'pb-2 border-b border-amber-100')}>
                    {isCouple && <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person1Label}</p>}
                    <p className="text-sm font-semibold text-slate-800">
                      Total withdrawal:{' '}
                      <span className="font-black text-amber-700">{formatCurrency(p1TotalGiaWithdrawn, true)}</span>
                    </p>
                    <div className="mt-2 space-y-1.5 rounded-lg bg-white/50 p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          To spending:
                        </span>
                        <span className="font-semibold text-slate-800">{formatCurrency(p1GiaToSpending, true)}</span>
                      </div>
                      {p1BedIsaNetToIsa > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">
                            To ISA (via Bed & ISA):
                          </span>
                          <span className="font-semibold text-slate-800">{formatCurrency(p1BedIsaNetToIsa, true)}</span>
                        </div>
                      )}
                    </div>
                    {apProj.p1CgtPaid > 0 && (
                      <p className="mt-1.5 text-xs text-orange-600">
                        Capital gains tax due: ~{formatCurrency(apProj.p1CgtPaid, true)}
                      </p>
                    )}
                  </div>
                )}
                {isCouple && p2TotalGiaWithdrawn > 0 && (
                  <div>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person2Label}</p>
                    <p className="text-sm font-semibold text-slate-800">
                      Total withdrawal:{' '}
                      <span className="font-black text-amber-700">{formatCurrency(p2TotalGiaWithdrawn, true)}</span>
                    </p>
                    <div className="mt-2 space-y-1.5 rounded-lg bg-white/50 p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          To spending:
                        </span>
                        <span className="font-semibold text-slate-800">{formatCurrency(p2GiaToSpending, true)}</span>
                      </div>
                      {p2BedIsaNetToIsa > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">
                            To ISA (via Bed & ISA):
                          </span>
                          <span className="font-semibold text-slate-800">{formatCurrency(p2BedIsaNetToIsa, true)}</span>
                        </div>
                      )}
                    </div>
                    {apProj.p2CgtPaid > 0 && (
                      <p className="mt-1.5 text-xs text-orange-600">
                        Capital gains tax due: ~{formatCurrency(apProj.p2CgtPaid, true)}
                      </p>
                    )}
                  </div>
                )}
                {jointGiaWithdrawal > 0 && (
                  <div className={clsx(isCouple && (p1TotalGiaWithdrawn > 0 || p2TotalGiaWithdrawn > 0) && 'mt-2 pt-2 border-t border-amber-100')}>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Joint portfolio</p>
                    <p className="text-sm font-semibold text-slate-800">
                      Total withdrawal:{' '}
                      <span className="font-black text-amber-700">{formatCurrency(jointGiaWithdrawal, true)}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ISA action (Bed & ISA) */}
            {apHasIsaAction && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  🗓️ Before 5 April — Move to ISA
                </p>
                {p1ShowBed && (
                  <div className={clsx('mb-2', isCouple && p2ShowBed && 'pb-2 border-b border-emerald-100')}>
                    {isCouple && <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person1Label}</p>}
                    <p className="text-sm font-semibold text-slate-800">
                      Move to ISA:{' '}
                      <span className="font-black text-emerald-700">{formatCurrency(p1BedIsaNetToIsa, true)}</span>
                    </p>
                    {p1IndivBedIsaNetToIsa > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        · <span className="font-semibold">{formatCurrency(p1IndivBedIsaNetToIsa, true)}</span>{' '}
                        from {isCouple ? `${person1Label}'s` : 'your'} own portfolio
                      </p>
                    )}
                    {p1JointBedIsaNetToIsa > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        · <span className="font-semibold">{formatCurrency(p1JointBedIsaNetToIsa, true)}</span>{' '}
                        from joint portfolio
                      </p>
                    )}
                  </div>
                )}
                {isCouple && p2ShowBed && (
                  <div>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person2Label}</p>
                    <p className="text-sm font-semibold text-slate-800">
                      Move to ISA:{' '}
                      <span className="font-black text-emerald-700">{formatCurrency(p2BedIsaNetToIsa, true)}</span>
                    </p>
                    {p2IndivBedIsaNetToIsa > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        · <span className="font-semibold">{formatCurrency(p2IndivBedIsaNetToIsa, true)}</span>{' '}
                        from {person2Label}&apos;s own portfolio
                      </p>
                    )}
                    {p2JointBedIsaNetToIsa > 0 && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        · <span className="font-semibold">{formatCurrency(p2JointBedIsaNetToIsa, true)}</span>{' '}
                        from joint portfolio
                      </p>
                    )}
                  </div>
                )}
                {(p1ShowBed || (isCouple && p2ShowBed)) && (
                  <p className="mt-2 text-xs text-slate-500">
                    Sell GIA investments and repurchase inside your ISA — your platform may offer this as a &ldquo;Bed &amp; ISA&rdquo; service.
                  </p>
                )}
              </div>
            )}

            {/* Planned event */}
            {(apProj.plannedEventSpend ?? 0) > 0 && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 sm:col-span-2">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-purple-700">
                  🎯 Planned big purchase this year
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  Extra spend:{' '}
                  <span className="font-black text-purple-700">{formatCurrency(apProj.plannedEventSpend, true)}</span>
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  This is built into the drawdown plan — the withdrawal strategy already accounts for funding this expense from a source that is designed to be tax-efficient.
                </p>
              </div>
            )}

            {/* Pension withdrawals */}
            {apHasPensionAction && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-700">
                  Pension withdrawals
                </p>
                {(apBd.person1.pension?.grossAmount ?? 0) > 0 && (
                  <div className={clsx('mb-2', isCouple && (apBd.person2?.pension?.grossAmount ?? 0) > 0 && 'pb-2 border-b border-sky-100')}>
                    {isCouple && <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person1Label}</p>}
                    <p className="text-sm font-semibold text-slate-800">
                      Withdraw{' '}
                      <span className="font-black text-sky-700">{formatCurrency(apBd.person1.pension!.grossAmount, true)}</span>
                      {' '}from your pension
                    </p>
                    {apBd.person1.pension!.pcls > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">Tax-free: {formatCurrency(apBd.person1.pension!.pcls, true)}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      Taxable: {formatCurrency(apBd.person1.pension!.taxableAmount, true)}
                      {' '}· Income tax: ~{formatCurrency(apBd.person1.pension!.taxDue, true)}
                    </p>
                  </div>
                )}
                {isCouple && (apBd.person2?.pension?.grossAmount ?? 0) > 0 && (
                  <div>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person2Label}</p>
                    <p className="text-sm font-semibold text-slate-800">
                      Withdraw{' '}
                      <span className="font-black text-sky-700">{formatCurrency(apBd.person2!.pension!.grossAmount, true)}</span>
                      {' '}from your pension
                    </p>
                    {apBd.person2!.pension!.pcls > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">Tax-free: {formatCurrency(apBd.person2!.pension!.pcls, true)}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      Taxable: {formatCurrency(apBd.person2!.pension!.taxableAmount, true)}
                      {' '}· Income tax: ~{formatCurrency(apBd.person2!.pension!.taxDue, true)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ISA and GIA spending (with BED context) */}
            {apHasIsaSpend && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                  ISA withdrawal
                </p>
                {p1DirectIsaSpend > 0 && (
                  <div className={clsx('mb-2', isCouple && p2DirectIsaSpend > 0 && 'pb-2 border-b border-indigo-100')}>
                    {isCouple && <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person1Label}</p>}
                    <p className="text-sm font-semibold text-slate-800">
                      ISA-funded spending:{' '}
                      <span className="font-black text-indigo-700">{formatCurrency(p1DirectIsaSpend, true)}</span>
                    </p>
                    <div className="mt-2 space-y-1.5 rounded-lg bg-white/50 p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          Tax-free from ISA:
                        </span>
                        <span className="font-semibold text-indigo-700">
                          {formatCurrency(p1DirectIsaSpend, true)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {isCouple && p2DirectIsaSpend > 0 && (
                  <div>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{person2Label}</p>
                    <p className="text-sm font-semibold text-slate-800">
                      ISA-funded spending:{' '}
                      <span className="font-black text-indigo-700">{formatCurrency(p2DirectIsaSpend, true)}</span>
                    </p>
                    <div className="mt-2 space-y-1.5 rounded-lg bg-white/50 p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">
                          Tax-free from ISA:
                        </span>
                        <span className="font-semibold text-indigo-700">
                          {formatCurrency(p2DirectIsaSpend, true)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Income arriving automatically */}
            {apFixedIncomeItems.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Income arriving automatically
                </p>
                <ul className="space-y-1">
                  {apFixedIncomeItems.map(item => (
                    <li key={item.label} className="flex justify-between text-xs text-slate-700">
                      <span>{item.label}</span>
                      <span className="font-semibold">{formatCurrency(item.p1 + item.p2, true)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  No action needed — these payments arrive automatically.
                </p>
              </div>
            )}

            {/* Spending target summary */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-violet-700">
                Spending this year
              </p>
              <p className="text-2xl font-black text-violet-900">{formatCurrency(apRecord.spending, true)}</p>
              <p className="mt-0.5 text-xs text-violet-700">target net spending for the year</p>
            </div>
          </div>
        </div>

        {proEnabled && <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">
                Drawdown detail by year
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                See where each year&rsquo;s spending comes from and what tax is due.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 text-left sm:w-48 sm:items-end sm:text-right">
              <p className="text-xs text-slate-500">
                Showing {shownYearCount} of {result.yearRecords.length} years
              </p>
              {proEnabled && (
                <button
                  type="button"
                  onClick={() => setShowDrawdownBreakdown((current) => !current)}
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                  aria-expanded={showDrawdownBreakdown}
                  aria-controls="drawdown-breakdown-panel"
                >
                  {showDrawdownBreakdown ? '▲ Hide breakdown' : '▼ Show breakdown'}
                </button>
              )}
            </div>
          </div>

          {(!proEnabled || showDrawdownBreakdown) ? (
            <>
            <div id="drawdown-breakdown-panel" className="mt-4 max-h-[36rem] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="optimizer-drawdown-breakdown-table">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th scope="col" rowSpan={2} className="sticky left-0 z-20 w-24 border-r border-slate-200 bg-slate-100 px-3 py-3 font-bold shadow-[4px_0_12px_rgba(15,23,42,0.06)] sm:w-32">Age</th>
                    <th scope="colgroup" colSpan={4} className="border-b border-sky-100 bg-sky-50 px-3 py-3 text-center font-bold text-sky-800">{person1Label}</th>
                    {isCouple ? <th scope="colgroup" colSpan={4} className="border-b border-amber-100 bg-amber-50 px-3 py-3 text-center font-bold text-amber-800">{person2Label}</th> : null}
                    {isCouple ? <th scope="colgroup" colSpan={1} className="border-b border-violet-100 bg-violet-50 px-3 py-3 text-center font-bold text-violet-800">Joint</th> : null}
                    {hasAnyBedIsa ? (
                      <th scope="colgroup" colSpan={isCouple ? 2 : 1} className="border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-center font-bold text-emerald-800">
                        Annual ISA action
                      </th>
                    ) : null}
                  </tr>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th scope="col" className="border-b border-sky-100 bg-sky-50 px-3 py-2 font-bold text-sky-700">Pension</th>
                    <th scope="col" className="border-b border-sky-100 bg-sky-50 px-3 py-2 font-bold text-sky-700">ISA</th>
                    <th scope="col" className="border-b border-sky-100 bg-sky-50 px-3 py-2 font-bold text-sky-700">GIA</th>
                    <th scope="col" className="border-b border-sky-100 bg-sky-50 px-3 py-2 font-bold text-sky-700">Cash</th>
                    {isCouple ? <th scope="col" className="border-b border-amber-100 bg-amber-50 px-3 py-2 font-bold text-amber-700">Pension</th> : null}
                    {isCouple ? <th scope="col" className="border-b border-amber-100 bg-amber-50 px-3 py-2 font-bold text-amber-700">ISA</th> : null}
                    {isCouple ? <th scope="col" className="border-b border-amber-100 bg-amber-50 px-3 py-2 font-bold text-amber-700">GIA</th> : null}
                    {isCouple ? <th scope="col" className="border-b border-amber-100 bg-amber-50 px-3 py-2 font-bold text-amber-700">Cash</th> : null}
                    {isCouple ? <th scope="col" className="border-b border-violet-100 bg-violet-50 px-3 py-2 font-bold text-violet-700">GIA</th> : null}
                    {hasAnyBedIsa ? <th scope="col" className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 font-bold text-emerald-700">{person1Label}</th> : null}
                    {hasAnyBedIsa && isCouple ? <th scope="col" className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 font-bold text-emerald-700">{person2Label}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record, index) => {
                    const bd = proEnabled ? record.drawdownBreakdown : record.baseline.breakdown;
                    return (
                    <tr
                      key={`breakdown-${record.p1Age}-${record.yearIndex}`}
                      className={clsx(
                        'border-b border-slate-100 align-top',
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60',
                        !proEnabled && index > 0 && 'blur-[2px] opacity-50 pointer-events-none select-none',
                      )}
                    >
                      <th
                        scope="row"
                        className={clsx(
                          'sticky left-0 z-10 w-24 border-r border-slate-200 py-3 pr-3 text-sm font-semibold text-slate-700 shadow-[4px_0_12px_rgba(15,23,42,0.04)] sm:w-32',
                          index % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100/95',
                        )}
                      >
                        {record.p1Age}
                        {record.p2Age !== null ? ` / ${record.p2Age}` : ''}
                      </th>
                      <td className="px-3 py-3 text-slate-600">
                        <PensionBreakdownCell breakdown={bd.person1.pension} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <TaxFreeBreakdownCell breakdown={bd.person1.isa} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <TaxableBreakdownCell breakdown={bd.person1.gia} taxableLabel="Taxable gain" />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <TaxFreeBreakdownCell breakdown={bd.person1.cash} />
                      </td>
                      {isCouple ? (
                        <td className="px-3 py-3 text-slate-600">
                          <PensionBreakdownCell breakdown={bd.person2?.pension} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="px-3 py-3 text-slate-600">
                          <TaxFreeBreakdownCell breakdown={bd.person2?.isa} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="px-3 py-3 text-slate-600">
                          <TaxableBreakdownCell breakdown={bd.person2?.gia} taxableLabel="Taxable gain" />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="px-3 py-3 text-slate-600">
                          <TaxFreeBreakdownCell breakdown={bd.person2?.cash} />
                        </td>
                      ) : null}
                      {isCouple ? (
                        <td className="px-3 py-3 text-slate-600">
                          <TaxableBreakdownCell breakdown={bd.joint?.gia} taxableLabel="Taxable gain" />
                        </td>
                      ) : null}
                      {hasAnyBedIsa ? (() => {
                        const proj = result.baselineProjections[record.yearIndex];
                        const p1IsaWd = bd.person1.isa?.grossAmount ?? 0;
                        return (
                          <td className="px-3 py-3">
                            <BedIsaCell amount={proj?.p1BedIsaTransfer ?? 0} cgt={proj?.p1CgtPaid ?? 0} isaSpend={p1IsaWd} />
                          </td>
                        );
                      })() : null}
                      {hasAnyBedIsa && isCouple ? (() => {
                        const proj = result.baselineProjections[record.yearIndex];
                        const p2IsaWd = bd.person2?.isa?.grossAmount ?? 0;
                        return (
                          <td className="px-3 py-3">
                            <BedIsaCell amount={proj?.p2BedIsaTransfer ?? 0} cgt={proj?.p2CgtPaid ?? 0} isaSpend={p2IsaWd} />
                          </td>
                        );
                      })() : null}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasAnyBedIsa && (
              <p className="mt-3 text-xs text-slate-500">
                <span className="font-semibold text-emerald-700">Annual ISA action:</span> Each year before 5 April, sell the amount shown from your general investment account and repurchase inside your ISA wrapper (your platform may call this a &ldquo;Bed &amp; ISA&rdquo; service). Any capital gains tax shown is due on the sale. Where &ldquo;Covers ISA spending&rdquo; appears, the GIA sale proceeds fund that year&rsquo;s ISA withdrawals directly — only the &ldquo;Into ISA&rdquo; portion actually enters the ISA wrapper.
              </p>
            )}
            </>
          ) : null}
        </div>}

        {result.yearRecords.length > 5 && (proEnabled || !!onProCta) && (
          <button
            type="button"
            onClick={proEnabled ? () => setShowAll((current) => !current) : () => onProCta?.()}
            className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            {proEnabled && showAll ? '▲ Show fewer years' : '▼ Show all optimiser years'}
          </button>
        )}

        {proEnabled ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-600">Tax vs standard approach</p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {formatCurrency(result.lifetimeTaxSaving, true)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Optimised: {formatCurrency(result.lifetimeTaxPaid, true)} · standard: {formatCurrency(result.baselineLifetimeTaxPaid, true)}. A higher tax figure here may reflect a better drawdown sequence — not a worse outcome.
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
          </>
        ) : (
            <div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-600">Tax vs standard approach</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {formatCurrency(result.lifetimeTaxSaving, true)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Optimised: {formatCurrency(result.lifetimeTaxPaid, true)} · standard: {formatCurrency(result.baselineLifetimeTaxPaid, true)}. A higher tax figure here may reflect a better drawdown sequence — not a worse outcome.
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
                <h4 className="text-sm font-black uppercase tracking-wide text-slate-700">
                  Baseline waterfall by year (first 5 years)
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Non-Pro shows your LaterLifePlan baseline strategy for the first 5 years.
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  Same strategy as the <span className="font-black">Simplified tax-efficient withdrawal strategy</span> panel above.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-500">
                        <th className="w-24 pb-2 pr-3 font-bold sm:w-32">Age</th>
                        <th className="pb-2 pr-3 font-bold">Baseline</th>
                        <th className="pb-2 pr-0 font-bold">Alternative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((record) => {
                        const baseline = record.baseline;
                        return (
                          <tr key={record.p1Age} className="border-b border-slate-50 align-top">
                            <td className="w-24 py-3 pr-3 text-slate-700 sm:w-32">
                              {record.p1Age}
                              {record.p2Age !== null ? ` / ${record.p2Age}` : ''}
                            </td>
                            <td className="py-3 pr-3">
                              <StrategyRow label="Baseline" result={baseline} accent="emerald" mode={plannerState.mode} />
                            </td>
                            <td className="py-3 pr-0">
                              <div className="rounded-2xl border border-slate-100 bg-white p-3 text-xs text-slate-500">
                                Upgrade to Pro to compare optimised alternatives.
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
