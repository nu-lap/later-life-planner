'use client';

interface Props {
  /** Headline shown on the lock card. */
  headline: string;
  /** Body copy explaining what is locked. */
  description: string;
  /** CTA button label. */
  ctaLabel?: string;
  onCta: () => void;
}

/**
 * Frosted glass overlay used to gate Pro features.
 * Renders children beneath the overlay so users can see (but not interact with)
 * the content behind it.
 */
export default function ProUpgradeOverlay({ headline, description, ctaLabel = 'Unlock with Pro →', onCta, children }: Props & { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-sm border border-violet-200 rounded-2xl shadow-lg p-6 max-w-sm w-full mx-4 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h3 className="font-black text-slate-900 text-base mb-1">{headline}</h3>
          <p className="text-sm text-slate-500 mb-4">{description}</p>
          <button
            onClick={onCta}
            className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-sm"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
