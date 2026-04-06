import type { PlannerSaveStatus } from '@/models/types';

export const PLANNER_SAVE_STATUS_STYLES: Record<PlannerSaveStatus, string> = {
  local: 'bg-slate-100 text-slate-500',
  loading: 'bg-amber-100 text-amber-700',
  saving: 'bg-amber-100 text-amber-700',
  saved: 'bg-emerald-100 text-emerald-700',
  approval_required: 'bg-amber-100 text-amber-700',
  error: 'bg-rose-100 text-rose-700',
  conflict: 'bg-rose-100 text-rose-700',
};

export const PLANNER_SAVE_STATUS_LABELS: Record<PlannerSaveStatus, string> = {
  local: 'Local draft',
  loading: 'Loading',
  saving: 'Saving',
  saved: 'Saved',
  approval_required: 'Approval required',
  error: 'Save error',
  conflict: 'Conflict',
};

export const PLANNER_SAVE_STATUS_LABELS_COMPACT: Record<PlannerSaveStatus, string> = {
  local: 'Local',
  loading: 'Loading',
  saving: 'Saving',
  saved: 'Saved',
  approval_required: 'Approval',
  error: 'Error',
  conflict: 'Conflict',
};

export function plannerSyncMessageClass(saveStatus: PlannerSaveStatus): string {
  if (saveStatus === 'approval_required') {
    return 'rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700';
  }

  return 'rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700';
}
