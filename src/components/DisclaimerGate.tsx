'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Props { onAccept: () => void }

export default function DisclaimerGate({ onAccept }: Props) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center px-4 py-10">

      {/* Page header */}
      <header className="text-center mb-6 max-w-2xl w-full">
        <Image
          src="/images/victorylap_logo.svg"
          alt="VictoryLap"
          width={180}
          height={120}
          className="mx-auto mb-4 h-20 w-auto"
        />
        <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase mb-3">
          Later Life Planner
        </p>
        <h1 className="text-5xl md:text-6xl font-black text-navy leading-none tracking-tight">
          What this planner
        </h1>
        <p className="text-5xl md:text-6xl font-black text-tangerine leading-none tracking-tight">
          does
        </p>
        <p className="text-5xl md:text-6xl font-black text-tangerine leading-none tracking-tight mb-4">
          and doesn&apos;t do
        </p>
        <p className="text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
          A quick guide before you begin, so the numbers are useful in the right way.
        </p>
      </header>

      <main className="w-full max-w-3xl bg-surface-white rounded-xl shadow-card border border-border/30 p-6 md:p-8 mb-8">

        {/* Disclaimer notice */}
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 mb-6">
          <p className="text-sm font-bold text-amber-800">
            This planner does not give personal financial advice.
          </p>
          <p className="text-sm text-amber-700 mt-1">This is not regulated financial advice.</p>
          <p className="text-sm text-amber-700">
            If you need advice tailored to your circumstances, speak to a qualified professional.
          </p>
        </div>

        {/* Two-column content */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">

          {/* Left — description */}
          <div className="space-y-4">
            <p className="text-sm text-ink leading-relaxed">
              This planner is designed to help with one specific task:{' '}
              <strong>comparing how different ways of drawing from pensions, ISAs, savings and other assets could affect your income over time</strong>.
            </p>

            <div className="bg-surface-low rounded-lg p-4 border border-surface-high">
              <p className="text-sm font-semibold text-ink mb-2">Use it to explore:</p>
              <ul className="space-y-1.5">
                {[
                  'which pots you might draw from first',
                  'how spending choices could affect your income over time',
                  'where you may want a professional second opinion',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
                    <span className="text-tangerine mt-0.5 flex-shrink-0" aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">A note on the numbers</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                The projections use fixed assumptions for growth, inflation and tax rules. Real life will be different, and rules can change, so treat these results as examples, not forecasts.
              </p>
            </div>

            <p className="text-sm text-ink-muted leading-relaxed">
              If you need advice tailored to your circumstances, speak to a qualified financial adviser. Try{' '}
              <a
                href="https://www.unbiased.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-tangerine underline underline-offset-2 hover:text-tangerine-dark"
              >
                unbiased.co.uk
              </a>
              {' '}or{' '}
              <a
                href="https://www.vouchedfor.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-tangerine underline underline-offset-2 hover:text-tangerine-dark"
              >
                vouchedfor.co.uk
              </a>.
            </p>
          </div>

          {/* Right — Best For */}
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
              Best For
            </p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-emerald-800 mb-2">What it helps with</p>
              <ul className="space-y-2">
                {[
                  'Comparing different ways to draw from your assets',
                  'Seeing how spending choices affect your plan over time',
                  'Preparing for a conversation with a financial adviser',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-emerald-700">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-surface-low border border-surface-high rounded-lg p-4">
              <p className="text-sm font-semibold text-ink mb-2">What it won&apos;t cover</p>
              <ul className="space-y-2">
                {[
                  'Telling you what you personally should do',
                  'Assessing whether a strategy is suitable for you',
                  'Complex cases such as trusts, business assets or inheritance tax planning',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Checkbox + CTA */}
        <div className="border-t border-border/30 pt-6">
          <label className="group flex cursor-pointer items-start gap-3 mb-6">
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="sr-only"
              />
              <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                agreed ? 'border-navy bg-navy' : 'border-border group-hover:border-navy/60'
              }`}>
                {agreed && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm leading-6 text-ink-muted">
              I understand this planner is for guidance only and does not give personal financial advice.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <button
              onClick={onAccept}
              disabled={!agreed}
              className={`rounded-full px-8 py-2.5 text-sm font-bold transition-all flex items-center gap-2 self-end sm:self-auto ${
                agreed
                  ? 'bg-navy hover:bg-navy-mid text-white shadow-card hover:-translate-y-0.5'
                  : 'cursor-not-allowed bg-surface-high text-ink-muted'
              }`}
            >
              Get started
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </button>
            <p className="text-xs text-ink-muted text-right">
              You can review the assumptions and reset the plan at any time.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
