'use client';

interface Props {
  /** Short emoji icon shown before the headline. */
  icon?: string;
  /** Feature name / headline. */
  headline: string;
  /** One-sentence plain-English description of what the feature does. */
  description: string;
  /** CTA button label. */
  ctaLabel?: string;
  /** Called when the CTA button is clicked. */
  onCta: () => void;
}

/**
 * Slim horizontal banner for gating Pro features in non-Pro mode.
 * Replaces the full frosted-glass overlay — no blurred preview, just a clear
 * headline, plain-English description, and a single CTA.
 */
export default function ProFeatureBanner({
  icon = '🔒',
  headline,
  description,
  ctaLabel = 'Unlock with Pro →',
  onCta,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-5 py-4">
      <span className="text-2xl flex-shrink-0 hidden sm:block">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 text-sm leading-snug">
          <span className="sm:hidden mr-1.5">{icon}</span>
          {headline}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{description}</p>
      </div>
      <button
        onClick={onCta}
        className="flex-shrink-0 self-start sm:self-auto bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold py-2 px-4 rounded-xl transition-colors text-sm whitespace-nowrap"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
