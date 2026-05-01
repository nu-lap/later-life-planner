'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useOptionalGetToken } from '@/hooks/useOptionalGetToken';
import { newId } from '@/lib/ids';
import {
  calculateProjections, getStageTotalSpending,
  getAssetDepletionAge, formatCurrency,
} from '@/lib/calculations';
import ProInterestModal from '@/components/ProInterestModal';
import DashboardMain from '@/components/DashboardMain';
import DashboardSidebar from '@/components/DashboardSidebar';
import { CARE_RESERVE, CURRENT_TAX_YEAR_START, PENSION_RULES } from '@/config/financialConstants';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import {
  buildGoalOrchestrateRequest,
  DEFAULT_GOAL_ORCHESTRATION_SCHEMA_VERSION,
  orchestrateGoals,
  sortGoalRegistry,
  syncCareReserveGoal,
} from '@/lib/goalOrchestration';
import type { YearlyProjection } from '@/lib/types';
import type { OptimizerPolicyOverride } from '@/financialEngine/types';
import type { CareReserve, DrawdownStrategy } from '@/models/types';

interface Props { onBack: () => void }

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Restore sidebar state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('llp:dashboardSidebarOpen');
      if (stored !== null) setSidebarOpen(stored === 'true');
    } catch { /* ignore localStorage errors */ }
  }, []);

  // Persist sidebar state to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('llp:dashboardSidebarOpen', String(sidebarOpen));
    } catch { /* ignore localStorage errors */ }
  }, [sidebarOpen]);

  // Calculate PCLS age resolution
  const resolvePclsAge = (candidate: number) => {
    const calYear = CURRENT_TAX_YEAR_START + (candidate - person1.currentAge);
    const nmpaForAge = calYear >= PENSION_RULES.NMPA_RISE_YEAR
      ? PENSION_RULES.MIN_ACCESS_AGE_POST_2028
      : PENSION_RULES.MIN_ACCESS_AGE;
    return Math.max(candidate, nmpaForAge, person1.currentAge);
  };

  const rawAge = pclsAge ?? fiAge;
  const pclsCalYear = CURRENT_TAX_YEAR_START + (rawAge - person1.currentAge);
  const nmpa = pclsCalYear >= PENSION_RULES.NMPA_RISE_YEAR
    ? PENSION_RULES.MIN_ACCESS_AGE_POST_2028
    : PENSION_RULES.MIN_ACCESS_AGE;
  const effectivePclsAge = Math.max(rawAge, nmpa, person1.currentAge);

  // Goal registry sync effect (from original)
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

  // Optimizer effect (from original)
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
      if (cancelled) {
        return;
      }

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
  }, [deferredState, optimizerEnabled, proEnabled, goalRegistry]);

  // Calculate projections (from original)
  const { projections, optimizerResult } = useMemo(() => {
    // Sanitise: pcls-bed-isa is a Pro-only strategy — fall back to standard-ufpls if Pro is off.
    const effectiveState = !proEnabled && deferredState.drawdownStrategy === 'pcls-bed-isa'
      ? { ...deferredState, drawdownStrategy: 'standard-ufpls' as const }
      : deferredState;

    if (!optimizerEnabled) {
      return {
        projections: calculateProjections(effectiveState),
        optimizerResult: null,
      };
    }

    // Run the optimizer once; reuse its pre-computed projections so we avoid
    // a duplicate calculateProjections() call.
    const result = optimizeWithdrawals(effectiveState, {
      policyOverride: policyOverride ?? undefined,
    });
    return {
      projections: result.baselineProjections,
      optimizerResult: result,
    };
  }, [deferredState, optimizerEnabled, proEnabled, policyOverride]);

  // Income and spending only starts at FI age — filter for display, but keep full
  // projections for asset depletion checks (assets grow from current age).
  const displayProjections = useMemo(() => {
    const rows = projections.length;
    return rows > 100 ? projections.filter((_, i) => i % 5 === 0) : projections;
  }, [projections]);

  const firstYear = projections[0];
  const firstStageId = lifeStages[0]?.id ?? 'active';
  const depletionAge = getAssetDepletionAge(projections);
  const surplus = depletionAge === null;
  const annualSpend = getStageTotalSpending(state, firstStageId);

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

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-6 px-4 py-6 max-w-7xl mx-auto">
        {/* Main area (70%) */}
        <DashboardMain
          state={state}
          projections={projections}
          displayProjections={displayProjections}
          surplus={surplus}
          depletionAge={depletionAge ?? 'Never'}
          firstYear={firstYear}
          lifeStages={lifeStages}
          mode={mode}
          p1Name={person1.name || (mode === 'couple' ? 'Partner 1' : 'You')}
          p2Name={person2?.name || 'Partner 2'}
          rlssStandard={rlssStandard ?? undefined}
          optimizerEnabled={optimizerEnabled}
          proEnabled={proEnabled}
        />

        {/* Sidebar (30%) */}
        <DashboardSidebar
          state={state}
          projections={projections}
          proEnabled={proEnabled}
          optimizerEnabled={optimizerEnabled}
          activeStrategy={drawdownStrategy ?? 'standard-ufpls'}
          effectivePclsAge={effectivePclsAge}
          onStrategyChange={setDrawdownStrategy}
          onPclsAgeChange={setPclsAge}
          goalRegistry={goalRegistry}
          onGoalRegistryChange={setGoalRegistry}
          careReserve={careReserve}
          onCareReserveChange={updateCareReserveFromGoalPanel}
          optimizerResult={optimizerResult}
          onProCta={setProModalSource}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
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
