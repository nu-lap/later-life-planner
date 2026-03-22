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

const SAVE_STATUS_LABELS_COMPACT: Record<PlannerSaveStatus, string> = {
  local: 'Local',
  loading: 'Loading',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Error',
  conflict: 'Conflict',
};

interface Props {
  onReset: () => void;
  saveStatus?: PlannerSaveStatus;
  onReloadRemote?: () => void | Promise<void>;
  authControls?: React.ReactNode;
  showPlannerActions?: boolean;
}

export default function Header({
  onReset,
  saveStatus = 'local',
  onReloadRemote,
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
	            <div
	              className={`rounded-full px-2 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs ${SAVE_STATUS_STYLES[saveStatus]}`}
	              aria-label={`Save status: ${SAVE_STATUS_LABELS[saveStatus]}`}
	              title={SAVE_STATUS_LABELS[saveStatus]}
	            >
	              <span className="sm:hidden">{SAVE_STATUS_LABELS_COMPACT[saveStatus]}</span>
	              <span className="hidden sm:inline">{SAVE_STATUS_LABELS[saveStatus]}</span>
	            </div>
	            {saveStatus === 'conflict' && onReloadRemote ? (
	              <button
	                type="button"
	                onClick={() => void onReloadRemote()}
	                className="btn-ghost text-rose-700 hover:text-rose-800 hover:bg-rose-50"
	                title="Reload the remote version to resolve the conflict"
	              >
	                <span className="sm:hidden">Reload</span>
	                <span className="hidden sm:inline">Reload remote</span>
	              </button>
	            ) : null}
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
