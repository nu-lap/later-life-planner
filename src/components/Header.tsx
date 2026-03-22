'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usePlannerStore } from '@/store/plannerStore';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type { PlannerSaveStatus } from '@/models/types';

type PendingAction = 'reset' | 'demo' | null;

const SAVE_STATUS_STYLES: Record<PlannerSaveStatus, string> = {
  local: 'bg-slate-100 text-slate-500',
  loading: 'bg-amber-100 text-amber-700',
  saving: 'bg-amber-100 text-amber-700',
  saved: 'bg-emerald-100 text-emerald-700',
  error: 'bg-rose-100 text-rose-700',
  conflict: 'bg-rose-100 text-rose-700',
};

const SAVE_STATUS_LABELS: Record<PlannerSaveStatus, string> = {
  local: 'Local draft',
  loading: 'Loading',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Save error',
  conflict: 'Conflict',
};

interface Props {
  onReset: () => void;
  saveStatus?: PlannerSaveStatus;
  authControls?: React.ReactNode;
  showPlannerActions?: boolean;
}

export default function Header({
  onReset,
  saveStatus = 'local',
  authControls,
  showPlannerActions = true,
}: Props) {
  const { loadDemo } = usePlannerStore();
  const [pending, setPending] = useState<PendingAction>(null);

  function handleConfirm() {
    if (pending === 'reset') onReset();
    if (pending === 'demo') loadDemo();
    setPending(null);
  }

  return (
    <>
      <header className="bg-white/80 backdrop-blur-sm border-b border-orange-100/60 no-print sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-hero shadow-inner-soft flex items-center justify-center">
              <Image src="/images/victorylap_icon.svg" alt="LifePlan icon" width={40} height={40} className="rounded-[14px]" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-tight tracking-tight">LifePlan</h1>
              <p className="text-xs text-slate-400 leading-tight hidden sm:block">Design the life you want</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:block ${SAVE_STATUS_STYLES[saveStatus]}`}>
              {SAVE_STATUS_LABELS[saveStatus]}
            </div>
            {authControls}
            {showPlannerActions ? (
              <>
                <button
                  onClick={() => setPending('demo')}
                  className="btn-ghost text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  title="Load a sample scenario to explore"
                >
                  ✨ Demo
                </button>
                <button
                  onClick={() => setPending('reset')}
                  className="btn-ghost text-slate-400 hover:text-rose-500"
                >
                  Reset
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {pending === 'reset' && (
        <ConfirmModal
          title="Reset your plan?"
          message="This will clear all your data and start fresh. This cannot be undone."
          confirmLabel="Reset plan"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      {pending === 'demo' && (
        <ConfirmModal
          title="Load the demo scenario?"
          message="This will replace your current plan with sample data. Any data you've entered will be lost."
          confirmLabel="Load demo"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
