'use client';

import { useState, useEffect } from 'react';

interface Props {
  open: boolean;
  sourcePanel: string;
  onClose: () => void;
}

const PRO_FEATURES = [
  { icon: '🤖', title: 'AI-powered tax explanation', desc: 'Understand exactly why this drawdown sequence saves you tax, in plain English.' },
  { icon: '🎯', title: 'Goal-priority optimisation', desc: 'Set your goals — minimise tax, protect your estate, maximise income — and the plan adapts.' },
  { icon: '🏡', title: 'IHT estate modelling', desc: 'Project your full inheritance tax position including pension pots from April 2027.' },
  { icon: '🎁', title: 'Gifting & RNRB planning', desc: 'Reduce your IHT exposure with structured gifting strategies and residence nil-rate band planning.' },
];

export default function ProInterestModal({ open, sourcePanel, onClose }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset state each time the modal opens so users can re-submit from a different panel
  // and don't see stale confirmation state on reopen.
  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setLoading(false);
    }
  }, [open, sourcePanel]);

  if (!open) return null;

  async function handleSubmit() {
    setLoading(true);
    try {
      await fetch('/api/pro-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePanel }),
      });
      setSubmitted(true);
    } catch {
      // Fail silently — interest capture is non-critical
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
        {submitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">✅</div>
            <h2 className="font-black text-slate-900 text-xl">We&apos;ll be in touch!</h2>
            <p className="text-slate-500 text-sm">We&apos;ve noted your interest in LaterLifePlan Pro. We&apos;ll let you know as soon as it launches.</p>
            <button onClick={onClose} className="btn-primary w-full mt-2">Close</button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="font-black text-slate-900 text-xl">Your plan is good.</h2>
              <p className="text-lg font-bold text-violet-600">LaterLifePlan Pro makes it exceptional.</p>
            </div>

            <div className="space-y-3">
              {PRO_FEATURES.map((f) => (
                <div key={f.title} className="flex gap-3 items-start">
                  <span className="text-xl flex-shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{f.title}</p>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl transition-colors text-sm"
              >
                {loading ? 'Sending…' : 'Tell me when Pro launches →'}
              </button>
              <button
                onClick={onClose}
                className="w-full text-sm text-slate-400 hover:text-slate-600 py-2 transition-colors"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
