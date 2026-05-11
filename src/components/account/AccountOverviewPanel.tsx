'use client';

import Link from 'next/link';
import { PLANNER_SAVE_STATUS_LABELS, plannerSyncMessageClass } from '@/lib/plannerSaveStatus';
import type { PlannerSaveStatus } from '@/models/types';
import { ACCOUNT_IDS } from '@/lib/testIds';

interface Props {
  saveStatus: PlannerSaveStatus;
  lastSavedAt: string | null;
  revision: number | null;
  syncError: string | null;
  pendingApprovals: number;
  onReloadRemote: () => void | Promise<void>;
  onExportPlan: () => void;
  onImportPlan: (file: File) => void;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not saved yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

export default function AccountOverviewPanel({
  saveStatus,
  lastSavedAt,
  revision,
  syncError,
  pendingApprovals,
  onReloadRemote,
  onExportPlan,
  onImportPlan,
}: Props) {
  const isCorruptPayload = Boolean(syncError?.includes('corrupted or unreadable'));
  const isReloadBlocked = isCorruptPayload;

  return (
    <section className="game-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Account</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Saved plan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your plan is encrypted in this browser before it is saved to your account storage.
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            data-testid={ACCOUNT_IDS.EXPORT_PLAN}
            onClick={onExportPlan}
            className="btn-secondary py-2.5 text-sm whitespace-nowrap"
          >
            Export JSON
          </button>
          <button
            data-testid={ACCOUNT_IDS.IMPORT_PLAN}
            onClick={() => document.getElementById('account-import-input-overview')?.click()}
            className="btn-secondary py-2.5 text-sm whitespace-nowrap"
          >
            Import JSON
          </button>
          <input
            id="account-import-input-overview"
            data-testid={ACCOUNT_IDS.IMPORT_INPUT}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportPlan(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={isReloadBlocked ? undefined : onReloadRemote}
            disabled={isReloadBlocked}
            aria-disabled={isReloadBlocked}
            className="btn-secondary py-2.5 text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reload remote
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sync status</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{PLANNER_SAVE_STATUS_LABELS[saveStatus]}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last saved</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{formatTimestamp(lastSavedAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revision</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{revision ?? 'Not created yet'}</p>
        </div>
      </div>

      {syncError ? (
        <p className={`mt-4 ${plannerSyncMessageClass(saveStatus)}`}>
          {syncError}
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Devices</p>
            <p className="mt-1 text-xs text-slate-500">
              New devices must be explicitly approved before they can decrypt your saved plan.
            </p>
          </div>
          <Link href="/account/devices" className="btn-secondary py-2.5 text-sm whitespace-nowrap flex-shrink-0">
            Manage devices
            {pendingApprovals > 0 ? (
              <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">
                {pendingApprovals}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </section>
  );
}
