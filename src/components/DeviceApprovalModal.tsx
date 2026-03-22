'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { buildDeviceApprovalLink } from '@/lib/deviceApprovalLink';

interface Props {
  isOpen: boolean;
  deviceId: string;
  requestId: string;
  expiresAt: string;
  publicKeyFingerprint: string;
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
  publicKeyFingerprint,
  error,
  onClose,
}: Props) {
  const codePayload = useMemo(() => JSON.stringify({
    v: 1,
    deviceId,
    requestId,
    expiresAt,
    publicKeyFingerprint,
  }), [deviceId, expiresAt, publicKeyFingerprint, requestId]);

  const [approvalLink, setApprovalLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setApprovalLink(null);
      setQrDataUrl(null);
      setCopyStatus(null);
      return;
    }

    // Use a fragment-based payload so nothing sensitive is sent to the server in a URL.
    const origin = window.location.origin;
    const link = buildDeviceApprovalLink(origin, codePayload);
    setApprovalLink(link);
    setCopyStatus(null);

    let cancelled = false;
    void (async () => {
      try {
        const mod = await import('qrcode');
        const dataUrl = await mod.toDataURL(link, { margin: 1, width: 220 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [codePayload, isOpen]);

  if (!isOpen) return null;

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus(`Unable to copy ${label.toLowerCase()} in this browser.`);
    }
  }

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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan to approve</p>
            <div className="mt-2 flex items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="Device approval QR code"
                  width={220}
                  height={220}
                  unoptimized
                  className="h-[220px] w-[220px]"
                />
              ) : (
                <p className="text-xs text-slate-500">QR unavailable in this browser.</p>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Expires: <span className="font-semibold text-slate-700">{formatExpiry(expiresAt)}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approve link</p>
            <p className="mt-1 text-xs text-slate-600">
              Copy this link and open it on the device that already has access.
            </p>
            <div className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
              <code className="break-all">{approvalLink ?? ''}</code>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => approvalLink && void copyText('Approval link', approvalLink)}
                className="btn-secondary py-2 text-sm"
                disabled={!approvalLink}
              >
                Copy approval link
              </button>
              <button
                onClick={() => void copyText('Approval code', codePayload)}
                className="btn-secondary py-2 text-sm"
              >
                Copy code (fallback)
              </button>
            </div>
            {copyStatus ? (
              <p className="mt-2 text-xs text-slate-500">{copyStatus}</p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                Show fallback code
              </summary>
              <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
                {codePayload}
              </pre>
            </details>
          </div>
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
