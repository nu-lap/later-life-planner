'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Props { onAccept: () => void }

export default function DisclaimerGate({ onAccept }: Props) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center py-16 px-4">

      {/* Brand mark */}
      <header className="mb-10 text-center">
        <Image
          src="/images/victorylap_logo.svg"
          alt="VictoryLap"
          width={180}
          height={120}
          className="mx-auto mb-2 h-16 w-auto"
        />
        <p className="text-xs font-semibold tracking-widest text-ink-muted uppercase">
          Later Life Planner
        </p>
      </header>

      <main className="w-full max-w-[900px] bg-surface-white rounded-xl shadow-card border border-border/30 overflow-hidden">

        {/* Decorative header band */}
        <div className="w-full h-2 bg-gradient-to-r from-navy-mid via-navy to-navy-muted" />

        <div className="px-6 md:px-12 py-10">

          {/* Headline */}
          <div className="text-center max-w-[600px] mx-auto mb-10">
            <h1 className="text-2xl md:text-3xl font-bold text-navy mb-3">
              What this planner does and doesn&apos;t do
            </h1>
            <p className="text-ink-muted text-base leading-relaxed">
              To help you build a composed future, it&apos;s important to understand the scope of our modeling tools before you begin.
            </p>
          </div>

          {/* Key disclaimer notice */}
          <div className="mb-6 p-4 rounded-lg bg-surface-low border border-border/50">
            <p className="text-sm font-semibold text-navy">This planner does not give personal financial advice.</p>
            <p className="mt-1 text-sm text-ink-muted">
              This is not regulated financial advice. If you need advice tailored to your circumstances, speak to a qualified professional.
            </p>
          </div>

          {/* Bento grid — Best For / Not Covered */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-10">

            {/* Best For */}
            <div className="bg-surface rounded-lg p-5 md:p-6 border border-border/40 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-success/60" />
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-success flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <h2 className="text-base font-semibold text-navy">Best For</h2>
              </div>
              <ul className="space-y-3">
                {[
                  'Illustrative modeling of long-term retirement scenarios',
                  'Understanding how current spending impacts future portfolio longevity',
                  'Exploring "what-if" scenarios based on standard economic assumptions',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-ink-muted mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.918z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-ink-muted leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Not Covered */}
            <div className="bg-surface rounded-lg p-5 md:p-6 border border-border/40 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-border" />
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-ink-muted flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                <h2 className="text-base font-semibold text-navy">Not Covered</h2>
              </div>
              <ul className="space-y-3">
                {[
                  'Providing formal financial, tax, or legal investment advice',
                  'Guaranteeing future market performance or specific returns',
                  'Replacing a personalized consultation with a certified planner',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-ink-muted mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                    <span className="text-sm text-ink-muted leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Checkbox + CTA */}
          <div className="pt-6 border-t border-border/30">
            <label className="group flex cursor-pointer items-start gap-3 mb-6">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                  agreed ? 'border-tangerine bg-tangerine' : 'border-border group-hover:border-tangerine/60'
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

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onAccept}
                disabled={!agreed}
                className={`rounded-full px-10 py-3 text-sm font-bold transition-all ${
                  agreed
                    ? 'bg-tangerine hover:bg-tangerine-dark text-white shadow-card-lg hover:-translate-y-0.5'
                    : 'cursor-not-allowed bg-surface-high text-ink-muted'
                }`}
              >
                Get started
              </button>
              <p className="text-xs text-ink-muted">
                You can review the assumptions and reset the plan at any time.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
