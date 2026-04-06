'use client';

import { useState } from 'react';
import { PLANNER_SAVE_STATUS_LABELS, plannerSyncMessageClass } from '@/lib/plannerSaveStatus';
import type { PlannerSaveStatus } from '@/models/types';
import type { DeviceRegistrationDocument } from '@/lib/cosmos';

interface Props {
  saveStatus: PlannerSaveStatus;
  lastSavedAt: string | null;
  revision: number | null;
  syncError: string | null;
  devices: DeviceRegistrationDocument[];
  onReloadRemote: () => void | Promise<void>;
  onExportPlan: () => void;
  onRefreshDevices: () => void | Promise<void>;
  onApproveDevice: (approvalCode: string) => void | Promise<void>;
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
  devices,
  onReloadRemote,
  onExportPlan,
  onRefreshDevices,
  onApproveDevice,
}: Props) {
  const [approvalCode, setApprovalCode] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const pendingDevices = devices.filter((device) => (
    device.status === 'pending' &&
    typeof device.requestId === 'string' &&
    typeof device.requestExpiresAt === 'string' &&
    new Date(device.requestExpiresAt).getTime() > Date.now()
  ));

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

      {syncError && (
        <p className={`mt-4 ${plannerSyncMessageClass(saveStatus)}`}>
          {syncError}
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Device approvals</p>
            <p className="mt-1 text-xs text-slate-500">
              New devices must be explicitly approved before they can decrypt your saved plan.
            </p>
          </div>
          <button onClick={onRefreshDevices} className="btn-secondary py-2.5 text-sm">
            Refresh devices
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approve a device</p>
          <p className="mt-1 text-xs text-slate-600">
            Paste the approval code shown on the new device, then approve.
          </p>
          <textarea
            value={approvalCode}
            onChange={(event) => {
              setApprovalCode(event.target.value);
              setApprovalError(null);
            }}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
            rows={3}
            placeholder='{"v":1,"deviceId":"...","requestId":"...","expiresAt":"...","publicKeyFingerprint":"..."}'
          />
          {approvalError && (
            <p className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {approvalError}
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={async () => {
                try {
                  await onApproveDevice(approvalCode);
                  setApprovalCode('');
                  setApprovalError(null);
                } catch (error) {
                  setApprovalError(error instanceof Error ? error.message : 'Failed to approve device.');
                }
              }}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
            >
              Approve
            </button>
          </div>
        </div>

        {pendingDevices.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No pending device approvals.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {pendingDevices.map((device) => (
              <div
                key={device.deviceId}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {device.label ?? 'New device'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Device ID: <span className="font-mono">{device.deviceId}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
