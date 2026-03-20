'use client';

import type { PlannerSaveStatus } from '@/models/types';

interface Props {
  saveStatus: PlannerSaveStatus;
  lastSavedAt: string | null;
  revision: number | null;
  syncError: string | null;
  onReloadRemote: () => void | Promise<void>;
  onExportPlan: () => void;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not saved yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

export default function AccountDataPanel({
  saveStatus,
  lastSavedAt,
  revision,
  syncError,
  onReloadRemote,
  onExportPlan,
}: Props) {
  return (
    <section className="game-card no-print">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Account Data</p>
          <h3 className="mt-2 text-xl font-black text-slate-900">Saved plan controls</h3>
          <p className="mt-1 text-sm text-slate-500">
            Your planner data is encrypted in the browser before it is sent to your account storage.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={onExportPlan} className="btn-secondary py-2.5 text-sm">
            Export JSON
          </button>
          <button onClick={onReloadRemote} className="btn-secondary py-2.5 text-sm">
            Reload remote
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sync status</p>
          <p className="mt-1 text-sm font-bold text-slate-800 capitalize">{saveStatus}</p>
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

      {syncError && (
        <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {syncError}
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3">
        <p className="text-sm font-bold text-amber-800">Deletion path decision</p>
        <p className="mt-1 text-xs leading-5 text-amber-700">
          Phase 3 decision: self-serve delete controls remain disabled until restore and support-led deletion
          runbooks are fully validated. For now, deletion requests stay support-led.
        </p>
      </div>
    </section>
  );
}
