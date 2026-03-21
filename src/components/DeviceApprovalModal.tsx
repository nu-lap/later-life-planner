'use client';

interface Props {
  isOpen: boolean;
  deviceId: string;
  requestId: string;
  expiresAt: string;
  error: string | null;
  onClose: () => void;
}

function formatExpiry(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

export default function DeviceApprovalModal({
  isOpen,
  deviceId,
  requestId,
  expiresAt,
  error,
  onClose,
}: Props) {
  if (!isOpen) return null;

  const codePayload = JSON.stringify({ deviceId, requestId, expiresAt });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-approval-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Device Approval</p>
        <h2 id="device-approval-title" className="mt-2 text-xl font-black text-slate-900">
          Approve this device to unlock your saved plan
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          For privacy, your saved plan can only be decrypted on devices you explicitly approve.
          Open the planner on a device that already has access, then approve this request.
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval code</p>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
            {codePayload}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Expires: <span className="font-semibold text-slate-700">{formatExpiry(expiresAt)}</span>
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-secondary py-2.5 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

