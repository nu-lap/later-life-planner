---
# LaterLifePlan — Design tokens for Google Stitch
# Generated from tailwind.config.ts, globals.css, and UI screenshots

colors:
  # ── Brand ─────────────────────────────────────────────────────────────────
  primary:
    default: "#f97316"   # orange-500 — primary action, Go-Go life stage
    hover:   "#ea580c"   # orange-600
    light:   "#fed7aa"   # orange-200
    subtle:  "#fff7ed"   # orange-50

  # ── App background ────────────────────────────────────────────────────────
  surface:
    page:    "#fdf8f0"   # cream-100 — warm off-white body background
    card:    "#ffffff"   # white card surfaces
    raised:  "#fefcf8"   # cream-50 — very subtle elevation hint
    muted:   "#faf1e1"   # cream-200 — hover / selected card tint

  # ── Text ──────────────────────────────────────────────────────────────────
  text:
    primary:   "#1e293b"  # slate-800 — body text
    secondary: "#64748b"  # slate-500 — secondary / meta
    muted:     "#94a3b8"  # slate-400 — placeholder / disabled
    inverse:   "#ffffff"  # on dark backgrounds

  # ── Life stages (Go-Go / Slo-Go / No-Go) ──────────────────────────────────
  stage:
    active:  "#f97316"   # orange-500  — Go-Go Years  (energy, momentum)
    gradual: "#10b981"   # emerald-500 — Slo-Go Years (balance, ease)
    later:   "#8b5cf6"   # violet-500  — No-Go Years  (calm, wisdom)

  # ── Lifestyle spending levels ──────────────────────────────────────────────
  lifestyle:
    minimum:     "#64748b"  # slate-500
    moderate:    "#0ea5e9"  # sky-500
    comfortable: "#10b981"  # emerald-500
    beyond:      "#f97316"  # orange-500

  # ── Semantic ───────────────────────────────────────────────────────────────
  success: "#10b981"   # emerald-500
  warning: "#f59e0b"   # amber-500
  error:   "#ef4444"   # red-500
  info:    "#0ea5e9"   # sky-500

  # ── Neutrals (Tailwind slate) ──────────────────────────────────────────────
  slate:
    50:  "#f8fafc"
    100: "#f1f5f9"
    200: "#e2e8f0"
    300: "#cbd5e1"
    400: "#94a3b8"
    500: "#64748b"
    600: "#475569"
    700: "#334155"
    800: "#1e293b"
    900: "#0f172a"

typography:
  fontFamily:
    sans: "'Inter', system-ui, sans-serif"

  # Display headings — paired with an orange accent word
  display:
    size:   "2.5rem"    # ~40px at desktop
    weight: 900         # Inter Black
    lineHeight: 1.1
    color: "#1e293b"    # slate-800
    accentColor: "#f97316"  # orange-500 — one word styled in orange

  # Page section headings
  h1:
    size:   "2rem"     # 32px
    weight: 800
    lineHeight: 1.2

  h2:
    size:   "1.5rem"   # 24px
    weight: 700
    lineHeight: 1.3

  h3:
    size:   "1.25rem"  # 20px
    weight: 700
    lineHeight: 1.4

  # Body
  body:
    size:   "1rem"     # 16px
    weight: 400
    lineHeight: 1.6

  bodySmall:
    size:   "0.875rem" # 14px
    weight: 400

  label:
    size:   "0.875rem"
    weight: 600
    color: "#1e293b"

  caption:
    size:   "0.75rem"  # 12px
    weight: 400
    color: "#64748b"

  # Stat / KPI number
  stat:
    size:   "1.875rem" # 30px
    weight: 800

spacing:
  # Tailwind default 4px base; key custom spacings used in layout
  xs:   "0.25rem"    # 4px
  sm:   "0.5rem"     # 8px
  md:   "1rem"       # 16px
  lg:   "1.5rem"     # 24px
  xl:   "2rem"       # 32px
  2xl:  "2.5rem"     # 40px
  3xl:  "3rem"       # 48px
  4xl:  "4rem"       # 64px
  page: "1280px"     # max content width at desktop

radii:
  sm:   "0.375rem"   # rounded — small inputs, tags
  md:   "0.5rem"     # rounded-lg
  lg:   "0.75rem"    # rounded-xl — input fields
  xl:   "1rem"       # rounded-2xl — buttons, small cards
  2xl:  "1.5rem"     # rounded-3xl — main cards (.game-card)
  3xl:  "2rem"       # rounded-4xl — large feature panels
  4xl:  "2.5rem"     # rounded-5xl — hero / pill elements
  full: "9999px"     # rounded-full — badges, sliders, avatars

shadows:
  # "game" shadow — soft, layered, white card on warm background
  game:    "0 4px 24px -4px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.04)"
  gameLg:  "0 8px 40px -8px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.06)"
  innerSoft: "inset 0 2px 8px rgba(0,0,0,0.06)"
  # Slider thumb glow
  sliderThumb: "0 2px 8px rgba(249,115,22,0.35)"
  # Button hover lift
  button: "0 2px 8px rgba(0,0,0,0.12)"

gradients:
  active:  "linear-gradient(135deg, #f97316, #fb923c)"    # orange Go-Go
  gradual: "linear-gradient(135deg, #10b981, #34d399)"    # emerald Slo-Go
  later:   "linear-gradient(135deg, #8b5cf6, #a78bfa)"    # violet No-Go
  hero:    "linear-gradient(135deg, #f97316 0%, #fb923c 40%, #fbbf24 100%)"  # brand hero
  income:  "linear-gradient(135deg, #0ea5e9, #38bdf8)"    # sky blue income
  assets:  "linear-gradient(135deg, #10b981, #34d399)"    # emerald assets

motion:
  # All UI transitions are fast and snappy — 150ms
  fast:     "150ms ease-in-out"
  # Content enter animation
  fadeIn:   "opacity 0 → 1, translateY 6px → 0, duration 250ms ease-out"
  # Button press
  press:    "scale(0.95) on active"
  # Slider thumb hover
  thumbHover: "scale(1.15), background darken, duration 100ms"

borders:
  default: "1px solid #e2e8f0"    # slate-200
  card:    "1px solid rgba(255,255,255,0.6)"  # white/60 — card outline
  input:   "1px solid #e2e8f0"    # slate-200
  focus:   "2px solid #fb923c"    # orange-400 focus ring (ring-2)

# ─── Component token groups ────────────────────────────────────────────────

components:
  card:
    background:   "#ffffff"
    border:       "1px solid rgba(255,255,255,0.6)"
    shadow:       "0 4px 24px -4px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.04)"
    radius:       "1.5rem"    # rounded-3xl
    padding:      "1.5rem"    # p-6

  cardSm:
    radius: "1rem"    # rounded-2xl
    padding: "1rem"   # p-4

  buttonPrimary:
    background:  "#f97316"
    hoverBg:     "#ea580c"
    textColor:   "#ffffff"
    fontWeight:  700
    paddingY:    "0.75rem"
    paddingX:    "1.75rem"
    radius:      "1rem"       # rounded-2xl
    fontSize:    "1rem"

  buttonSecondary:
    background:  "#ffffff"
    hoverBg:     "#f8fafc"
    textColor:   "#334155"
    border:      "1px solid #e2e8f0"
    fontWeight:  600
    radius:      "1rem"

  buttonGhost:
    textColor:   "#475569"
    hoverColor:  "#1e293b"
    fontWeight:  500
    radius:      "0.75rem"
    fontSize:    "0.875rem"

  input:
    background:  "#ffffff"
    border:      "1px solid #e2e8f0"
    radius:      "0.75rem"    # rounded-xl
    paddingY:    "0.625rem"
    paddingX:    "1rem"
    fontSize:    "1rem"
    focusRing:   "2px solid #fb923c"

  slider:
    trackHeight: "8px"
    trackBg:     "#e2e8f0"
    trackRadius: "9999px"
    thumbSize:   "26px"
    thumbBg:     "#f97316"
    thumbBorder: "3px solid #ffffff"
    thumbShadow: "0 2px 8px rgba(249,115,22,0.35)"
    thumbHoverBg: "#ea6b0a"
    thumbHoverScale: "1.15"

  stagePill:
    active:  { background: "#f97316", textColor: "#ffffff" }
    gradual: { background: "#10b981", textColor: "#ffffff" }
    later:   { background: "#8b5cf6", textColor: "#ffffff" }
    radius:  "9999px"
    fontSize: "0.75rem"
    fontWeight: 700
    paddingY: "0.25rem"
    paddingX: "0.75rem"

  statCard:
    radius:   "1rem"      # rounded-2xl
    padding:  "1.25rem"   # p-5
    textColor: "#ffffff"

  nav:
    height:    "56px"
    background: "#ffffff"
    borderBottom: "1px solid #e2e8f0"
    stepTabActiveBg: "#f97316"
    stepTabActiveText: "#ffffff"
    stepTabRadius: "0.75rem"    # rounded-xl
    progressBarBg: "#e2e8f0"
    progressBarFill: "#f97316"
---

# LaterLifePlan — Visual Identity

## Essence

LaterLifePlan feels like a well-designed app that takes a complicated subject (UK retirement planning) and makes it feel achievable and even enjoyable. The aesthetic is warm, clean, and confidently modern — closer to a consumer lifestyle app than a financial spreadsheet. The visual language borrows from gaming HUDs: cards feel like panels in a game interface, sliders are tactile and oversized, numbers are bold and celebratory.

The tone is optimistic without being naïve. Everything communicates "you can do this."

---

## Colour Narrative

**Cream background** (`#fdf8f0`) is the foundation. Not white — warm. It makes the white cards float slightly off the page without harsh contrast. The whole app breathes.

**Orange** (`#f97316`) is the primary action colour and the colour of the first life stage (Go-Go Years). It appears on CTAs, active step tabs, the FI age slider thumb, the nav progress bar, selected selection cards, and the brand logo. Orange signals energy, forward motion, and confidence. It is used sparingly enough to retain meaning.

**The life stage trio** runs through every page that references the three planning phases:
- **Orange** — Go-Go Years (active retirement, peak spending)
- **Emerald** (`#10b981`) — Slo-Go Years (slowing down, balanced spending)
- **Violet** (`#8b5cf6`) — No-Go Years (care phase, reduced mobility)

These colours appear as progress-bar segments, tab backgrounds, stage pills, and gradient overlays on KPI stat cards. They are never used decoratively — they always carry semantic meaning about which life phase is being referenced.

**Lifestyle level colours** distinguish spending benchmarks: slate (Minimum), sky blue (Moderate), emerald (Comfortable), orange (Beyond). A badge using these colours appears in the page header summary bar throughout the wizard, giving users persistent awareness of their chosen lifestyle tier.

---

## Layout & Spacing

The app uses a single centred column at desktop (max ~860px wide), padded from the edges, with the cream background filling the remainder. There is no sidebar. Cards are spaced generously (24–32px vertical gap) so each section feels like a distinct panel rather than a wall of form fields.

On mobile (≤ 390px) the layout stacks into a single column with reduced horizontal padding. Cards remain fully rounded; font sizes scale down slightly but the visual hierarchy is preserved.

---

## Card Pattern

Cards are the primary grouping mechanism. The `.game-card` pattern:
- **Background:** white
- **Border radius:** `rounded-3xl` (24px) — distinctly more rounded than typical SaaS
- **Shadow:** `game` — a two-layer soft shadow (4px spread at 8% opacity, 1px spread at 4% opacity). At a distance the card appears to hover 2–3px above the cream background
- **Border:** `1px solid rgba(255,255,255,0.6)` — almost invisible, just enough to crisp the edge
- **Padding:** 24px all sides

Cards never have coloured headers or thick top borders. All emphasis comes from typographic weight and colour tokens applied to text elements inside the card.

---

## Typography Hierarchy

**Display headings** (step entry screens) use a two-line pattern: first line in dark slate-800 (`font-black`), second line or key phrase in orange-500. This creates a visual punch that anchors each step. Examples: "Who are we / **planning for?**", "What does your / **ideal life look like?**", "What will your life / **cost?**"

**Section headings** inside cards use `text-xl font-bold text-slate-800` with a short muted subtitle in `text-sm text-slate-500`.

**Body copy** is `text-base text-slate-800` with secondary information in `text-slate-500`. Instructional text that contextualises a feature (e.g., the "Spending Smile" explanatory block) uses a lightly tinted background panel (sky-50, emerald-50, etc.) to distinguish it from interactive content.

**KPI numbers** on the dashboard use `text-3xl font-extrabold text-white` against coloured stat-card backgrounds.

---

## Navigation & Wizard Progress

A sticky top nav contains the brand mark (orange flame icon + "LaterLifePlan" wordmark + "Design the life you want" sub-tagline) on the left, a save-state badge ("Saving" / "Saved" in a small sky-blue or green pill) and an Account link + avatar on the right.

Below the nav, a horizontal step strip shows all 5 steps as numbered tabs: Household · Life Vision · Spending · Income & Assets · Dashboard. The active step tab has an orange background and white bold text; completed steps are slightly muted; future steps are slate-300. A thin orange progress bar fills from left to right across the full width, tracking overall completion.

---

## Interactive Controls

**Selection cards** (e.g., "Just me" vs "Me & my partner") are white rounded-2xl cards with a subtle slate-200 border. When selected, the border becomes orange and the card receives a light orange background tint (orange-50/cream-200). An emoji icon is centred at large size (48px) above the label text.

**Range sliders** are one of the most distinctive UI elements. The track is `8px` tall and rounded-full with a slate-200 background. The thumb is `26px` in diameter — unusually large — orange with a white border and an orange glow shadow. On hover the thumb scales to 1.15×. This makes sliders feel physical and game-like. The FI age slider uses an orange value badge to the right; the planning horizon slider uses a violet value badge.

**Toggle switches** (income/asset enable controls) use standard Tailwind `rounded-full` pill toggles. Enabled state is orange; disabled is slate-300.

**Step-count inputs** (increment/decrement) use small white buttons with `+` / `–` labels flanking a display value, all inside a white rounded-xl container with slate-200 border.

---

## Step-by-Step Visual Cadence

**Step 1 — Household Setup:** Large display heading with orange accent. Two selection cards for household type. Person detail form (name, DOB) inside a rounded card with an orange avatar circle bearing the person's initials. Two sliders (FI age orange, planning horizon violet). Orange CTA.

**Step 2 — Life Vision:** Three-segment horizontal bar showing Go-Go / Slo-Go / No-Go year ranges in orange / emerald / violet fills. Interest checkboxes as white icon-cards in a grid. Freeform textarea for life vision narrative with an AI "Help me write this" shortcut.

**Step 3 — Spending Goals:** Lifestyle tier selector with three cards (Minimum / Moderate / Comfortable) in a horizontal row — the selected card gets an orange border. Below, a dark slate panel shows the current annual spend total in large white bold text with a stage label. Tab bar switches between Go-Go / Slo-Go / No-Go spending panels (active tab is orange). Planned big purchases section uses pastel chips as quick-add suggestions (home renovation, new car, dream holiday, etc.).

**Step 4 — Income & Assets:** Accordion sections (Guaranteed Income, Property Income, Flexible Income) with toggle-enable controls. Income sources expand to show fields on enable. Model assumptions (growth rate, inflation) sit at the bottom of the page inside a cream-tinted inset card.

**Step 5 — Dashboard:** The most data-dense step. A row of coloured stat cards (KPIs) at the top showing required spend, annual income, asset values, and investment totals — each with a gradient background from the income/assets/stage palette. Below, strategy recommendation panels in white cards with an orange "NEW" badge on suggested options. Drawdown tables, a stacked bar chart showing gross income vs required spending, and a year-by-year detail table. CTA bar at the bottom: "← Edit income & assets" and "Report PDF" (orange).

---

## Summary Bar (Persistent Context)

Throughout Steps 2–4, a thin dark summary bar appears below the step progress tabs. It shows: person name, Required spend £X, Gross income £X, and a delta (▲/▼ with green/red colour) to show surplus or shortfall. A lifestyle badge (Minimum / Moderate / Comfortable / Beyond) sits to the right. This bar provides the user with a running financial status so they never lose context while editing inputs.

---

## Animations & Micro-interactions

All transitions are 150ms `ease-in-out`. Content panels fade in with the `.fade-in` class (250ms `ease-out`, `opacity 0→1`, `translateY 6px→0`). Button presses apply `scale(0.95)`. The slider thumb scales to 1.15× on hover. The save-state badge briefly shows "Saving…" before returning to "Saved" — both are small rounded-full pills, sky-blue and green respectively.

There are no page transitions or route animations; the wizard steps render in-place.

---

## Iconography & Illustration

Emoji are used heavily as illustrative elements — in selection cards (🐱 for "Just me", 👫 for couple), interest chips (✈️ Travel, 🎨 Hobbies), and spend category quick-adds (🏠 Home renovation, 🚗 New car). This keeps the interface light and human without requiring a custom icon set. Functional icons (toggle arrows, info, warning) use standard Heroicons outline style in `text-slate-400`.

The brand mark is a stylised flame emoji rendered in orange, paired with the "LaterLifePlan" wordmark in `font-bold text-slate-800` and a small `font-normal text-slate-400` sub-tagline.

---

## Responsive Behaviour

At mobile widths (390px / iPhone 14 form factor):
- The top nav collapses to just the logo and avatar; the step strip stacks into a compact scrollable row
- The wizard content stretches edge to edge with 16px horizontal padding
- Cards retain their rounded-3xl radius
- Display headings drop to ~28px
- The summary bar remains visible but compresses to a single line
- Sliders remain large (26px thumb) — critical for touch usability
- The lifestyle selector cards stack vertically

The dashboard at mobile has some overflow risk — the stacked bar chart has a minimum width; a horizontal scroll container wraps it.
