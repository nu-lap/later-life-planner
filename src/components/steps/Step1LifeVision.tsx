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
    assumptions,
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
        callback: (token: string) => { setCaptchaToken(token); setCaptchaError(null); },
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
      if (!res.ok || !res.body) { resetCaptcha(); throw new Error('Request failed'); }
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
      // silently fail — user can type manually
    } finally {
      setIsGenerating(false);
      setPendingGenerate(false);
      if (captchaEnabled) { resetCaptcha(); setShowCaptcha(false); }
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
    if (!captchaEnabled || !pendingGenerate || !captchaToken) return;
    startGenerate(captchaToken);
  }, [captchaEnabled, pendingGenerate, captchaToken, startGenerate]);

  function maxEndAge(stageIndex: number): number {
    return assumptions.lifeExpectancy - (lifeStages.length - 1 - stageIndex);
  }

  function handleEndAge(stageIndex: number, newEndAge: number) {
    const stage = lifeStages[stageIndex];
    if (newEndAge <= stage.startAge) return;
    if (newEndAge > maxEndAge(stageIndex)) return;
    updateLifeStage(stage.id, { endAge: newEndAge });
    let prevEnd = newEndAge;
    for (let j = stageIndex + 1; j < lifeStages.length; j++) {
      const s = lifeStages[j];
      const newStart = prevEnd + 1;
      const isLast = j === lifeStages.length - 1;
      if (isLast) {
        updateLifeStage(s.id, { startAge: newStart });
      } else {
        const newEnd = Math.max(s.endAge, Math.min(newStart, maxEndAge(j)));
        updateLifeStage(s.id, { startAge: newStart, endAge: newEnd });
        prevEnd = newEnd;
      }
    }
  }

  return (
    <div className="space-y-6 pb-24">

      {/* Page header */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-navy mb-3 tracking-tight">
          What does your ideal life look like?
        </h1>
        <p className="text-base text-ink-muted max-w-xl mx-auto leading-relaxed">
          Defining your vision helps us build a plan that truly matters to you. Think about the different stages of your retirement.
        </p>
      </div>

      {/* Retirement phases timeline */}
      <section className="game-card">
        <h2 className="section-heading">Your life stages</h2>
        <p className="section-subheading">
          Visualize how your energy and activity levels might change over time. Adjust the boundaries to match your vision.
        </p>

        {/* Segmented bar */}
        <div className="flex h-12 rounded-full overflow-hidden w-full shadow-card border border-border/40 mb-4">
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
                    <span className="truncate px-2">{stage.startAge} — {stage.label}</span>
                  ) : pct >= 10 ? (
                    <span className="truncate px-1">{stage.startAge}</span>
                  ) : null}
                </div>
              );
            });
          })()}
        </div>

        {/* Stage descriptors */}
        <div className="flex justify-between text-xs text-ink-muted px-1 mb-5">
          <span>High Activity / Higher Spending</span>
          <span className="text-center hidden md:block">Moderate Activity</span>
          <span className="text-right">Lower Activity / Healthcare</span>
        </div>

        {/* Stage controls */}
        <div className="space-y-3">
          {lifeStages.map((stage, i) => {
            const isLast = i === lifeStages.length - 1;
            return (
              <div key={stage.id} className="p-3 rounded-lg bg-surface-low border border-surface-high">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <input
                    type="text"
                    value={stage.label}
                    onChange={(e) => updateLifeStage(stage.id, { label: e.target.value })}
                    className="flex-1 font-semibold text-navy bg-transparent border-0 border-b border-dashed border-border focus:outline-none focus:border-tangerine text-sm"
                  />
                  <span className="text-xs text-ink-muted flex-shrink-0">
                    {stage.endAge - stage.startAge + 1}yr
                  </span>
                </div>
                <div className="flex items-center justify-between pl-5">
                  <span className="text-sm text-ink-muted">
                    Ages <span className="font-bold text-ink">{stage.startAge}</span> – <span className="font-bold text-ink">{stage.endAge}</span>
                  </span>
                  {!isLast && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">End at</span>
                      <button
                        type="button"
                        onClick={() => handleEndAge(i, stage.endAge - 1)}
                        disabled={stage.endAge <= stage.startAge + 1}
                        className="w-8 h-8 rounded-lg bg-surface-high hover:bg-surface-highest disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base flex items-center justify-center transition-colors"
                      >−</button>
                      <span className="w-8 text-center font-bold text-navy tabular-nums text-sm">{stage.endAge}</span>
                      <button
                        type="button"
                        onClick={() => handleEndAge(i, stage.endAge + 1)}
                        disabled={stage.endAge >= maxEndAge(i)}
                        className="w-8 h-8 rounded-lg bg-surface-high hover:bg-surface-highest disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base flex items-center justify-center transition-colors"
                      >+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* What matters most */}
      <section className="game-card">
        <h2 className="section-heading">What matters most to you?</h2>
        <p className="section-subheading">Select the core themes of your ideal retirement.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ASPIRATIONS.map(({ tag, label, icon }) => {
            const on = aspirations.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleAspiration(tag)}
                className={clsx(
                  'flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all text-center',
                  on
                    ? 'border-tangerine bg-surface shadow-card-lg'
                    : 'border-border bg-surface-white hover:bg-surface-low hover:border-navy/40'
                )}
              >
                <div className={clsx(
                  'w-11 h-11 rounded-full flex items-center justify-center mb-2',
                  on ? 'bg-tangerine/20' : 'bg-surface-container'
                )}>
                  <span className="text-xl">{icon}</span>
                </div>
                <span className={clsx(
                  'text-xs font-semibold leading-tight',
                  on ? 'text-navy' : 'text-ink-muted'
                )}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Life vision text */}
      <section className="game-card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="section-heading mb-0">
              {mode === 'couple' ? 'Your shared life vision' : 'Your life vision'}
            </h2>
            <p className="section-subheading mt-1 mb-0">Describe your ideal day in retirement or overarching goals.</p>
          </div>
          <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
            <button
              onClick={handleGenerateVision}
              disabled={isGenerating}
              className={clsx(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all border',
                isGenerating
                  ? 'bg-surface-container text-ink-muted cursor-not-allowed border-border'
                  : 'bg-surface-container text-navy hover:bg-surface-high border-border hover:border-navy/50'
              )}
            >
              {isGenerating ? (
                <>
                  <span aria-hidden="true" className="animate-spin inline-block w-3 h-3 border-2 border-navy/40 border-t-navy rounded-full"></span>
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
                <p className="text-xs text-ink-muted mb-2">Quick check before we generate your vision:</p>
                <div ref={captchaRef} />
                {captchaError && <p className="text-xs text-rose-600 mt-2">{captchaError}</p>}
              </div>
            )}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={lifeVision}
          onChange={(e) => setLifeVision(e.target.value)}
          placeholder={mode === 'couple'
            ? 'e.g. We want to travel widely while we have the energy, spend time with grandchildren, pursue photography and sailing…'
            : 'e.g. I want to winter in Southeast Asia, spend summers in my garden, help my grandchildren with their education…'}
          rows={5}
          className="w-full bg-surface-white border border-border rounded-lg p-3 text-sm text-ink focus:border-navy focus:ring-2 focus:ring-navy/10 focus:outline-none transition-all resize-y"
        />
        <p className="text-xs text-ink-muted mt-2 text-right">
          {lifeVision.length > 0 ? `${lifeVision.length} characters` : 'Optional — but powerful for clarity'}
        </p>
      </section>

      {captchaEnabled && (
        <Script
          id="turnstile-script"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
        />
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center pt-2">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <div className="flex items-center gap-4">
          <button onClick={onNext} className="text-sm text-ink-muted hover:text-navy underline underline-offset-2">
            Skip for now
          </button>
          <button onClick={onNext} className="btn-primary flex items-center gap-2">
            Set spending goals
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
