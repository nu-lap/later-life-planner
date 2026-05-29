'use client';

import clsx from 'clsx';

interface Step { label: string; description: string }

interface Props {
  steps: Step[];
  currentStep: number;
  maxVisitedStep: number;
  onStepClick: (i: number) => void;
}

export default function StepIndicator({ steps, currentStep, maxVisitedStep, onStepClick }: Props) {
  const progressPct = (currentStep / (steps.length - 1)) * 100;

  return (
    <div className="space-y-2">
      {/* Step bubbles */}
      <div className="flex items-center justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-4 left-0 right-0 h-px bg-border/60 -z-10" />

        {steps.map((step, i) => {
          const done   = i < currentStep;
          const active = i === currentStep;
          const locked = i > maxVisitedStep;

          return (
            <button
              key={i}
              onClick={() => !locked && onStepClick(i)}
              disabled={locked}
              aria-disabled={locked}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 border-2',
                active && 'bg-tangerine text-white border-tangerine shadow-card-lg',
                done   && 'bg-navy text-white border-navy',
                locked && 'bg-surface-high text-ink-muted border-border cursor-not-allowed',
                !active && !done && !locked && 'bg-surface-white text-ink-muted border-border hover:border-navy',
              )}>
                {done ? (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={clsx(
                'hidden sm:block text-[10px] font-semibold tracking-wide transition-colors',
                active && 'text-tangerine',
                done   && 'text-navy',
                locked && 'text-ink-muted',
                !active && !done && !locked && 'text-ink-muted',
              )}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-high rounded-full overflow-hidden">
        <div
          className="h-full bg-tangerine rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
