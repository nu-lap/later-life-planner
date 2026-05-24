'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usePlannerStore } from '@/store/plannerStore';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { ACCOUNT_IDS, HEADER_IDS } from '@/lib/testIds';
import {
  PLANNER_SAVE_STATUS_LABELS,
  PLANNER_SAVE_STATUS_LABELS_COMPACT,
  PLANNER_SAVE_STATUS_STYLES,
} from '@/lib/plannerSaveStatus';
import type { PlannerSaveStatus } from '@/models/types';

type PendingAction = 'reset' | 'demo' | null;

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
      <header className="bg-surface-white/90 backdrop-blur-sm border-b border-border/40 no-print sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Image src="/images/victorylap_icon.svg" alt="LaterLifePlan icon" width={40} height={40} className="rounded-[14px] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-bold text-navy tracking-tight leading-tight">LaterLifePlan</div>
              <div className="text-xs text-ink-muted leading-tight hidden sm:block">Design the life you want</div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <div
              data-testid={HEADER_IDS.SAVE_STATUS}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PLANNER_SAVE_STATUS_STYLES[saveStatus]}`}
              aria-label={`Save status: ${PLANNER_SAVE_STATUS_LABELS[saveStatus]}`}
              title={PLANNER_SAVE_STATUS_LABELS[saveStatus]}
            >
              <span className="sm:hidden">{PLANNER_SAVE_STATUS_LABELS_COMPACT[saveStatus]}</span>
              <span className="hidden sm:inline">{PLANNER_SAVE_STATUS_LABELS[saveStatus]}</span>
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

            {showPlannerActions && process.env.NODE_ENV === 'development' ? (
              <>
                <button
                  onClick={() => setPending('demo')}
                  className="btn-ghost text-tangerine hover:text-tangerine-dark hover:bg-tangerine-light/30"
                  title="Load a sample scenario to explore"
                >
                  ✨ Demo
                </button>
                <button
                  data-testid={ACCOUNT_IDS.RESET_PLAN}
                  onClick={() => setPending('reset')}
                  className="btn-ghost text-ink-muted hover:text-rose-500"
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
