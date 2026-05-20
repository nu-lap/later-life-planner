'use client';

import { useCallback, useEffect, useRef, useState as useLocalState } from 'react';
import Script from 'next/script';
import { usePlannerStore } from '@/store/plannerStore';
import type { AspirationTag } from '@/models/types';
import clsx from 'clsx';

const ASPIRATIONS: { tag: AspirationTag; label: string; icon: string }[] = [
  { tag: 'travel',       label: 'Travel',       icon: '✈️'  },
  { tag: 'hobbies',      label: 'Hobbies',       icon: '🎨'  },
  { tag: 'learning',     label: 'Learning',      icon: '📚'  },
  { tag: 'family',       label: 'Family',        icon: '👨‍👩‍👧‍👦' },
  { tag: 'giving',       label: 'Giving',        icon: '💝'  },
  { tag: 'volunteering', label: 'Volunteering',  icon: '🤝'  },
  { tag: 'property',     label: 'Home & Garden', icon: '🏡'  },
  { tag: 'health',       label: 'Wellbeing',     icon: '💚'  },
  { tag: 'fitness',      label: 'Fitness',       icon: '🏃'  },
  { tag: 'social',       label: 'Friends & Social', icon: '🥂' },
];

interface Props { onNext: () => void; onBack: () => void }

export default function Step2LifeVision({ onNext, onBack }: Props) {
  const {
    mode,
    lifeVision, setLifeVision,
    aspirations, toggleAspiration,
    lifeStages, updateLifeStage,
    assumptions, updateAssumptions,
  } = usePlannerStore();

  const [isGenerating, setIsGenerating] = useLocalState(false);
  const [showCaptcha, setShowCaptcha] = useLocalState(false);
  const [captchaToken, setCaptchaToken] = useLocalState<string | null>(null);
  const [captchaError, setCaptchaError] = useLocalState<string | null>(null);
  const [scriptReady, setScriptReady] = useLocalState(false);
  const [pendingGenerate, setPendingGenerate] = useLocalState(false);
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const captchaEnabled = Boolean(siteKey);

  useEffect(() => {
    if (!captchaEnabled || !showCaptcha || !scriptReady || !captchaRef.current) return;
    setCaptchaError(null);
    if (widgetIdRef.current) {
      try { window.turnstile.reset(widgetIdRef.current); } catch {}
      return;
    }
    try {
      widgetIdRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey!,
        callback: (token: string) => {
          setCaptchaToken(token);
          setCaptchaError(null);
        },
        'error-callback': () => setCaptchaError('Captcha failed. Please try again.'),
        'expired-callback': () => setCaptchaToken(null),
        theme: 'light',
      });
    } catch {
      setCaptchaError('Captcha failed to load. Please try again.');
    }
  }, [captchaEnabled, showCaptcha, scriptReady, siteKey, setCaptchaError, setCaptchaToken]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 360)}px`;
  }, [lifeVision]);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaError(null);
    if (widgetIdRef.current && window.turnstile?.reset) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [setCaptchaError, setCaptchaToken]);

  const startGenerate = useCallback(async (token: string | null) => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspirations, mode, turnstileToken: token }),
      });
      if (!res.ok || !res.body) {
        resetCaptcha();
        throw new Error('Request failed');
      }
      setLifeVision('');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setLifeVision(text);
      }
    } catch {
      // silently fail — user can just type manually
    } finally {
      setIsGenerating(false);
      setPendingGenerate(false);
      if (captchaEnabled) {
        resetCaptcha();
        setShowCaptcha(false);
      }
    }
  }, [aspirations, mode, setLifeVision, setIsGenerating, setPendingGenerate, resetCaptcha, captchaEnabled, setShowCaptcha]);

  async function handleGenerateVision() {
    if (captchaEnabled && !captchaToken) {
      setShowCaptcha(true);
      setCaptchaError(null);
      setPendingGenerate(true);
      return;
    }
    await startGenerate(captchaToken);
  }

  useEffect(() => {
    if (!captchaEnabled) return;
    if (!pendingGenerate) return;
    if (!captchaToken) return;
    startGenerate(captchaToken);
  }, [captchaEnabled, pendingGenerate, captchaToken, startGenerate]);

  // Max endAge for a non-last stage: must leave 1 year for every stage that follows.
  function maxEndAge(stageIndex: number): number {
    return assumptions.lifeExpectancy - (lifeStages.length - 1 - stageIndex);
  }

  function handleEndAge(stageIndex: number, newEndAge: number) {
    const stage = lifeStages[stageIndex];
    if (newEndAge <= stage.startAge) return;
    if (newEndAge > maxEndAge(stageIndex)) return;

    // Apply the change and cascade through every downstream stage so all
    // startAge/endAge values stay consistent with each other.
    updateLifeStage(stage.id, { endAge: newEndAge });

    let prevEnd = newEndAge;
    for (let j = stageIndex + 1; j < lifeStages.length; j++) {
      const s = lifeStages[j];
      const newStart = prevEnd + 1;
      const isLast = j === lifeStages.length - 1;
      if (isLast) {
        // Last stage: endAge is fixed (= lifeExpectancy); only startAge moves.
        updateLifeStage(s.id, { startAge: newStart });
      } else {
        // Non-last: if the push compresses this stage, extend its end (capped at its max).
        const newEnd = Math.max(s.endAge, Math.min(newStart, maxEndAge(j)));
        updateLifeStage(s.id, { startAge: newStart, endAge: newEnd });
        prevEnd = newEnd;
      }
    }
  }

  return (
    <div className="space-y-6 pb-24">

      {/* Hero */}
      <div className="text-center py-10">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-bold px-4 py-1.5 rounded-full mb-4">
          ✨ Step 2 of 5 — Life Vision
        </div>
        <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 leading-tight tracking-tight">
          What does your<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">
            ideal life look like?
          </span>
        </h2>
        <p className="text-lg text-slate-500 max-w-xl mx-auto">
          The best plan starts with knowing what you want. Design your life first — then figure out how to fund it.
        </p>
      </div>

      {/* Life stage visual timeline */}
      <div className="game-card">
        <h3 className="section-heading">Your life stages</h3>
        <p className="section-subheading">
          We divide your plan into three stages. Adjust the boundaries to match your vision.
        </p>

        {/* Visual timeline bar — always 100% wide; each segment is its share of all stage years */}
        <div className="flex rounded-2xl overflow-hidden mb-5 h-12 shadow-inner-soft">
          {(() => {
            const totalSpan = lifeStages.reduce((s, st) => s + (st.endAge - st.startAge + 1), 0);
            return lifeStages.map((stage) => {
              const span = stage.endAge - stage.startAge + 1;
              const pct  = totalSpan > 0 ? (span / totalSpan) * 100 : 0;
              return (
                <div
                  key={stage.id}
                  className="flex items-center justify-center text-white text-xs font-bold gap-1 transition-all overflow-hidden"
                  style={{ width: `${pct}%`, backgroundColor: stage.color }}
                >
                  {pct >= 20 ? (
                    <span className="truncate px-1">{stage.startAge} — {stage.label}</span>
                  ) : pct >= 10 ? (
                    <span className="truncate px-1">{stage.startAge}</span>
                  ) : null}
                </div>
              );
            });
          })()}
        </div>

        <div className="space-y-3">
          {lifeStages.map((stage, i) => {
            const isLast = i === lifeStages.length - 1;
            return (
              <div key={stage.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                {/* Label row */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <input
                    type="text"
                    value={stage.label}
                    onChange={(e) => updateLifeStage(stage.id, { label: e.target.value })}
                    className="flex-1 font-semibold text-slate-800 bg-transparent border-0 border-b border-dashed border-slate-300 focus:outline-none focus:border-orange-400 text-sm"
                  />
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {stage.endAge - stage.startAge + 1}yr
                  </span>
                </div>
                {/* Age controls row */}
                <div className="flex items-center justify-between pl-6">
                  <span className="text-sm text-slate-500">
                    Ages <span className="font-bold text-slate-700">{stage.startAge}</span> – <span className="font-bold text-slate-700">{stage.endAge}</span>
                  </span>
                  {!isLast && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">End at</span>
                      <button
                        type="button"
                        onClick={() => handleEndAge(i, stage.endAge - 1)}
                        disabled={stage.endAge <= stage.startAge + 1}
                        className="w-9 h-9 rounded-xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg leading-none flex items-center justify-center transition-colors select-none"
                      >−</button>
                      <span className="w-8 text-center font-black text-slate-800 tabular-nums">{stage.endAge}</span>
                      <button
                        type="button"
                        onClick={() => handleEndAge(i, stage.endAge + 1)}
                        disabled={stage.endAge >= maxEndAge(i)}
                        className="w-9 h-9 rounded-xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg leading-none flex items-center justify-center transition-colors select-none"
                      >+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Life goals */}
      <div className="game-card">
        <h3 className="section-heading">What matters most to you?</h3>
        <p className="section-subheading">Pick everything you want your later life to include.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {ASPIRATIONS.map(({ tag, label, icon }) => {
            const on = aspirations.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleAspiration(tag)}
                className={clsx(
                  'flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all text-center',
                  on
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/50'
                )}
              >
                <span className="text-2xl">{icon}</span>
                <span className="font-semibold text-xs leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Life vision text */}
      <div className="game-card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
          <h3 className="section-heading mb-0">
            {mode === 'couple' ? '💬 Your shared life vision' : '💬 Your life vision'}
          </h3>
          <div className="flex flex-col sm:items-end gap-2">
            <button
              onClick={handleGenerateVision}
              disabled={isGenerating}
              className={clsx(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all flex-shrink-0',
                isGenerating
                  ? 'bg-violet-100 text-violet-400 cursor-not-allowed'
                  : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
              )}
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full" />
                  Writing…
                </>
              ) : captchaEnabled && showCaptcha && !captchaToken ? (
                <>🧩 Complete check to continue</>
              ) : (
                <>✨ Help me write this</>
              )}
            </button>
            {captchaEnabled && (
              <div className={clsx('text-left sm:text-right', !showCaptcha && 'hidden')}>
                <p className="text-xs text-slate-500 mb-2">Quick check before we generate your vision:</p>
                <div ref={captchaRef} />
                {captchaError && <p className="text-xs text-rose-600 mt-2">{captchaError}</p>}
              </div>
            )}
          </div>
        </div>
        <p className="section-subheading">
          In your own words — what does a great week, month or year look like?
        </p>
        <textarea
          ref={textareaRef}
          value={lifeVision}
          onChange={(e) => setLifeVision(e.target.value)}
          placeholder={mode === 'couple'
            ? 'e.g. We want to travel widely while we have the energy, spend time with grandchildren, pursue photography and sailing…'
            : 'e.g. I want to winter in Southeast Asia, spend summers in my garden, help my grandchildren with their education…'}
          rows={6}
          className="input-base resize-none leading-relaxed text-base whitespace-pre-wrap overflow-hidden"
        />
        <p className="text-xs text-slate-400 mt-2 text-right">
          {lifeVision.length > 0 ? `${lifeVision.length} characters` : 'Optional — but powerful for clarity'}
        </p>
      </div>

      {captchaEnabled && (
        <Script
          id="turnstile-script"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
        />
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <div className="flex items-center gap-4">
          <button onClick={onNext} className="text-sm text-slate-400 hover:text-slate-600 underline underline-offset-2">
            Skip for now →
          </button>
          <button onClick={onNext} className="btn-primary px-10 text-base">
            Set spending goals →
          </button>
        </div>
      </div>
    </div>
  );
}
