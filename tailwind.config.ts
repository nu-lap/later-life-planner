import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Stitch "Modern Design Refresh" design system ───────────────────
        navy: {
          DEFAULT: '#041632',   // primary — headings, primary text
          mid:     '#1b2b48',   // primary-container — card accents, dark fills
          muted:   '#4f5e7e',   // surface-tint — subtle treatment
          light:   '#b7c7eb',   // primary-fixed-dim — hover highlights
        },
        tangerine: {
          DEFAULT: '#fc820c',   // secondary-container — CTA fills
          dark:    '#964900',   // secondary — hover/active
          light:   '#ffdcc6',   // secondary-fixed — tinted backgrounds
        },
        surface: {
          DEFAULT:   '#fbf9f4',   // page background
          container: '#f0eee9',   // card backgrounds
          low:       '#f5f3ee',   // subtle fills
          high:      '#eae8e3',   // dividers
          highest:   '#e4e2dd',   // strong dividers
          white:     '#ffffff',   // card faces
          dim:       '#dbdad5',   // disabled
        },
        border: {
          DEFAULT: '#c5c6ce',   // outline-variant
          strong:  '#75777e',   // outline
        },
        ink: {
          DEFAULT: '#1b1c19',   // on-surface — primary text
          muted:   '#44474d',   // on-surface-variant — secondary text
        },
        success: '#55a454',
        // ── Legacy palette (kept for backward compat) ─────────────────────
        cream: {
          50:  '#fefcf8',
          100: '#fbf9f4',
          200: '#f0eee9',
        },
        stage: {
          active:  '#f97316',
          gradual: '#10b981',
          later:   '#8b5cf6',
        },
        lifestyle: {
          minimum:     '#64748b',
          moderate:    '#0ea5e9',
          comfortable: '#10b981',
          beyond:      '#f97316',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'card':       '0px 4px 20px rgba(27, 43, 72, 0.04)',
        'card-lg':    '0px 12px 32px rgba(27, 43, 72, 0.08)',
        // Legacy
        'game':       '0 4px 24px -4px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.04)',
        'game-lg':    '0 8px 40px -8px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.06)',
        'inner-soft': 'inset 0 2px 8px rgba(0,0,0,0.06)',
      },
      backgroundImage: {
        'gradient-active':  'linear-gradient(135deg, #f97316, #fb923c)',
        'gradient-gradual': 'linear-gradient(135deg, #10b981, #34d399)',
        'gradient-later':   'linear-gradient(135deg, #8b5cf6, #a78bfa)',
        'gradient-hero':    'linear-gradient(135deg, #f97316 0%, #fb923c 40%, #fbbf24 100%)',
        'gradient-income':  'linear-gradient(135deg, #0ea5e9, #38bdf8)',
        'gradient-assets':  'linear-gradient(135deg, #10b981, #34d399)',
      },
    },
  },
  plugins: [],
};

export default config;
