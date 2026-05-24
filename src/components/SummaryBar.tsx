'use client';

import { useDeferredValue, useMemo } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { getStageTotalSpending, calculateProjections, formatCurrency } from '@/lib/calculations';
import { RLSS_STANDARDS } from '@/lib/mockData';

export default function SummaryBar() {
  const state = usePlannerStore();
  const deferredState = useDeferredValue(state);
  const { mode, person1, person2, lifeStages, rlssStandard, currentStep } = state;
  const firstStage     = lifeStages[0];
  const annualSpending = getStageTotalSpending(state, firstStage?.id ?? 'active');
  const projections    = useMemo(() => calculateProjections(deferredState), [deferredState]);
  const firstYear      = projections[0];
  const totalIncome    = firstYear?.totalIncome ?? 0;
  const gap            = totalIncome - annualSpending;
  const surplus        = gap >= 0;
  const ageLabel       = mode === 'couple'
    ? `${person1.name || 'You'} & ${person2.name || 'Partner'}`
    : (person1.name || `Age ${person1.currentAge}`);

  const incomeKnown = totalIncome > 0 || currentStep >= 4;

  return (
    <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 text-sm overflow-hidden">
      <span className="text-ink-muted text-xs font-medium hidden sm:block shrink-0">{ageLabel}</span>
      <span className="w-px h-4 bg-border/50 hidden sm:block shrink-0" />

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-ink-muted text-xs">Required spend</span>
        <span className="font-bold text-ink text-xs">{formatCurrency(annualSpending)}</span>
      </div>

      {incomeKnown && (
        <>
          <span className="w-px h-4 bg-border/50 shrink-0" />
          <span className={`font-bold text-xs shrink-0 ${surplus ? 'text-success' : 'text-rose-600'}`}>
            {surplus ? '▲' : '▼'} {surplus ? '+' : ''}{formatCurrency(gap)}
          </span>
        </>
      )}

      {rlssStandard && (
        <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-tangerine-light text-tangerine-dark shrink-0">
          {RLSS_STANDARDS[mode][rlssStandard].emoji} {RLSS_STANDARDS[mode][rlssStandard].label}
        </span>
      )}
    </div>
  );
}
