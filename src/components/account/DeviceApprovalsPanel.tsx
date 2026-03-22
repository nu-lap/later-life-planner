'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DeviceRegistrationDocument } from '@/lib/cosmos';
import { extractApprovalCodeJson } from '@/lib/deviceApprovalLink';

interface Props {
  devices: DeviceRegistrationDocument[];
  onRefreshDevices: () => void | Promise<void>;
  onApproveDevice: (approvalCodeJson: string) => void | Promise<void>;
  defaultApprovalInput?: string;
}

function formatExpiry(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

function isPendingDevice(device: DeviceRegistrationDocument): boolean {
  if (device.status !== 'pending') return false;
  if (typeof device.requestId !== 'string') return false;
  if (typeof device.requestExpiresAt !== 'string') return false;
  return new Date(device.requestExpiresAt).getTime() > Date.now();
}

export default function DeviceApprovalsPanel({
  devices,
  onRefreshDevices,
  onApproveDevice,
  defaultApprovalInput = '',
}: Props) {
  const [approvalInput, setApprovalInput] = useState(defaultApprovalInput);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!defaultApprovalInput.trim()) return;
    setApprovalInput((current) => (current.trim().length > 0 ? current : defaultApprovalInput));
  }, [defaultApprovalInput]);

  const pendingDevices = useMemo(
    () => devices.filter(isPendingDevice),
    [devices],
  );

  return (
    <section className="game-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Devices</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Approve a device</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open the approval link from your new device, or paste the approval link/code here as a fallback.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/account" className="btn-secondary py-2.5 text-sm whitespace-nowrap">
            Back to account
          </Link>
          <button onClick={onRefreshDevices} className="btn-secondary py-2.5 text-sm whitespace-nowrap">
            Refresh devices
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval link or code</p>
        <p className="mt-1 text-xs text-slate-600">
          Paste the approval link (recommended) or the fallback JSON code from the new device.
        </p>
        <textarea
          value={approvalInput}
          onChange={(event) => {
            setApprovalInput(event.target.value);
            setApprovalError(null);
          }}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
          rows={4}
          placeholder='https://.../account/devices/approve#code=... or {"v":1,...}'
        />
        {approvalError ? (
          <p className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {approvalError}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            onClick={async () => {
              try {
                setIsApproving(true);
                const json = extractApprovalCodeJson(approvalInput);
                if (!json) throw new Error('Approval link or code is required.');
                await onApproveDevice(json);
                setApprovalInput('');
                setApprovalError(null);
              } catch (error) {
                setApprovalError(error instanceof Error ? error.message : 'Failed to approve device.');
              } finally {
                setIsApproving(false);
              }
            }}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            disabled={isApproving}
          >
            {isApproving ? 'Approving…' : 'Approve device'}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-800">Pending approvals</p>
        {pendingDevices.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No pending device approvals.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {pendingDevices.map((device) => (
              <div
                key={device.deviceId}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold text-slate-800">{device.label ?? 'New device'}</p>
                  <p className="text-xs text-slate-500">
                    Expires: <span className="font-semibold text-slate-700">{formatExpiry(device.requestExpiresAt)}</span>
                  </p>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                    Details
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-slate-600">
                    <p>Device ID: <span className="font-mono text-slate-800">{device.deviceId}</span></p>
                    <p>Request ID: <span className="font-mono text-slate-800">{device.requestId}</span></p>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
