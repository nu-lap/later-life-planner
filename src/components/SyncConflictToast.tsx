'use client';

import { useEffect, useMemo, useState } from 'react';

interface Props {
  isOpen: boolean;
  message: string;
  onReloadRemote: () => void | Promise<void>;
}

function computeKeyboardInsetPx(): number {
  const vv = globalThis.visualViewport;
  if (!vv) return 0;

  // Approximate the occluded area from the on-screen keyboard. When the keyboard is open,
  // `visualViewport.height` shrinks while `window.innerHeight` stays closer to the layout viewport.
  // Clamp to avoid negative/NaN values.
  const inset = Math.max(0, Math.round(globalThis.innerHeight - vv.height - vv.offsetTop));
  return Number.isFinite(inset) ? inset : 0;
}

export default function SyncConflictToast({ isOpen, message, onReloadRemote }: Props) {
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const vv = globalThis.visualViewport;
    const update = () => setKeyboardInsetPx(computeKeyboardInsetPx());

    update();

    if (!vv) return;
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  const bottomStyle = useMemo(() => {
    // Keep the toast above the iOS keyboard (when possible) and above the safe-area inset.
    const px = keyboardInsetPx > 0 ? keyboardInsetPx + 12 : 12;
    return { bottom: `calc(env(safe-area-inset-bottom) + ${px}px)` };
  }, [keyboardInsetPx]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={bottomStyle}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-rose-200 bg-white/95 backdrop-blur-sm shadow-game px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Sync paused</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                This plan was updated elsewhere.
              </p>
              <p className="mt-1 text-sm text-slate-600 break-words">
                {message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onReloadRemote()}
              className="shrink-0 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-700 active:scale-95 transition-all duration-150"
              title="Reload the remote version to resolve the conflict"
            >
              Reload remote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

