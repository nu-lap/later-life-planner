# LaterLifePlan Spending Page — UI/UX Critical Review & Improvement Plan

**Reviewed:** 25 April 2026  
**Reviewer:** Copilot (senior product designer persona — see `docs/operations/ui-review-process.md`)  
**Method:** Playwright live review of production build at 1440×900, screenshots across all page states (Go-Go, Slo-Go, No-Go tabs; Advanced planning expanded; Planned event add form)  
**Scope:** Step 3 — Spending Goals — all sections from hero to footer  
**Branch at review:** `feat/planned-events` (not yet deployed; some fixes pending)

---

## Executive Summary

The spending page is **well-structured and content-rich**, with a smart PLSA benchmark-first approach and a compelling life-stage model. For most users it will feel approachable. However several issues undermine trust and clarity:

1. **Colour system incoherence on the life-stage tabs** — each tab uses a different accent colour (orange / green / purple) with no semantic rationale, creating an inconsistent visual language.
2. **Critical bug still live: inflation toggle label clipped** — the "Add event" form shows ".djust for inflation..." (the "A" is cut off). The fix is committed but not yet deployed.
3. **"+ Add" primary action uses purple** — inconsistent with the orange brand colour used for all other primary CTAs on this page, de-emphasising the most important new feature.
4. **Spending Smile card interrupts the customisation flow** — positioned between the spending total and the category editor, it creates scroll friction for users who want to customise immediately.
5. **Users cannot compare spending across life stages without clicking** — the tab amounts (£62.4k / £57.0k / £48.4k) are only revealed one at a time.

---

## Section-by-Section Findings

### 1. Hero Section

**What works**
- Bold headline "What will your life cost?" is direct and emotionally resonant.
- Orange "cost?" matches the brand colour, creating a focal point.
- Subtitle "Start with a UK benchmark, then make it yours." clearly sets expectations.

**Issues**
- The hero section has no breathing room — the white card immediately follows the subtitle with almost no vertical gap. For a step about a significant financial decision, the page feels rushed.
- There is no visual cue that the user's Life Vision has influenced this page (e.g. no "Based on your vision: active lifestyle" contextual note). The link between Step 2 and Step 3 is invisible.

**Improvements**
- Add 8–12px more vertical gap below the subtitle before the lifestyle card.
- Consider a small contextual pill showing the life vision chosen (e.g. "🌍 Adventure & travel lifestyle").

---

### 2. Lifestyle Selector (PLSA Cards)

**What works**
- Three-card layout with clear labels (Minimum / Moderate / Comfortable) is immediately scannable.
- Selected card has a distinct green border and a ✓ badge — state is clear.
- PLSA source attribution and "More info" link demonstrate credibility.

**Issues**
- **Unselected cards lack hover affordance.** White on white with a faint border — they look like static content, not clickable options. A subtle shadow or background shift on hover is absent.
- **Card label colour is inconsistent.** "Comfortable" is rendered in green (matching selection state) but "Minimum" and "Moderate" are plain black. The colour is applied to the selected card's title but not the others — this should be uniform.
- **No connection between PLSA figure and actual plan total.** The card says "£60.6k/yr" but the dark banner below shows "£62.4k". A first-time user will not understand why these differ. A note like "Your current total: £62.4k (customised above standard)" would close this gap.
- **"/yr" unit is ~11px and easily missed.** The figure looks like a one-time cost, not an annual one.

**Improvements**
- Add `hover:shadow-md hover:border-slate-300` to unselected cards.
- Standardise card title colour: all three use a neutral dark colour; the selected card uses the green border as the differentiator, not the text colour.
- Add a sentence below the selected card: "Your plan total is £62.4k — above the Comfortable standard due to category customisations."
- Increase "/yr" to at least 13px and display as a styled unit: `£60.6k /year`.

---

### 3. Life-Stage Tabs (Go-Go / Slo-Go / No-Go)

**What works**
- The three-tab pattern is a clear and learnable pattern.
- Age range labels (60–70, 71–80, 81–96) inside each tab are useful context.
- The dark spending banner below the tabs updates dynamically — good feedback.

**Issues**
- **Each tab uses a completely different colour when active: orange, green, purple.** This is arbitrary. There is no semantic reason why No-Go should be purple. To a user unfamiliar with the design intent, this looks like three distinct and unrelated sections, not three states of the same selector. The product colour system has no role for purple; using it here introduces a fourth accent colour with no meaning.
- **No spending summary on the tab labels.** The user must click each tab to compare spending across life stages. A sub-label showing the total (e.g. "Go-Go Years · £62.4k") would allow instant comparison.
- **The age range text (e.g. "60-70") inside the active tab has reduced legibility** — on the orange background with white text, the small grey age range number has low contrast.

**Improvements**
- Standardise active tab to a single colour: use **brand orange** for all three active states. The life-stage name already distinguishes them; colour duplication adds no information.
- Add spending total as a secondary line under each tab label: `60-70  ·  £62.4k`.
- Increase age range text to `text-xs text-white/80` on active tab so it remains readable against the orange background.

---

### 4. Annual Spending Banner

**What works**
- High-contrast dark card with large white figure is immediately readable.
- Updating dynamically across tab switches is satisfying and quick.

**Issues**
- **"Comfortable+" is unexplained.** Users who selected "Comfortable" (£60.6k) will see "Comfortable+" and not know what the "+" means. There is no tooltip, legend, or footnote.
- **The middot (·) separator** in "Annual spending · Go-Go Years" is typographically unusual and reads oddly in a screen-reader or for dyslexic users. Use a comma, dash, or line break instead.
- **The life-stage label in the banner is redundant** — the active tab above already shows "Go-Go Years". This space could instead show the category breakdown at a glance (e.g. "Essential £36.4k · Lifestyle £13.4k · Family £6.3k · Other £6.3k").

**Improvements**
- Replace "Comfortable+" with "Above comfortable standard" or add a `?` tooltip: "Your total exceeds the Comfortable benchmark of £60.6k."
- Remove the life-stage name from the banner subtitle; replace with category mini-breakdown.
- Replace middot with ` — ` or a newline.

---

### 5. Spending Smile Card

**What works**
- Valuable framing — contextualising the life-stage model with research is reassuring and differentiating.
- External citation link adds credibility.

**Issues**
- **Position is wrong.** It sits between the spending total and the Advanced planning section, which is exactly where users who want to customise spending need to be. Many users will scroll past it without reading it; others will be slowed. This card should be placed **above** the life-stage tabs, as contextual framing before the user sets any numbers.
- **The external link opens in the same tab**, causing the user to lose their session context. External links must open in a new tab (`target="_blank" rel="noopener noreferrer"`).
- **The card is visually indistinct from the page background** — light grey border on cream. It has no header or icon that signals "this is an insight, not a control".

**Improvements**
- Move the Spending Smile card to above the life-stage tabs (after the lifestyle selector and spending banner).
- Add `target="_blank"` to the Dan Haylett link.
- Add a subtle left-border accent (e.g. `border-l-4 border-orange-300`) to visually mark it as an informational aside.

---

### 6. Advanced Planning (Expandable)

**What works**
- Collapsed by default — correct choice; this is a power-user feature and hiding it reduces overwhelm. ✅
- Category breakdown (Essential / Lifestyle / Family & Giving / Other) with colour coding is logical.
- The benchmark bar ("vs UK standards") is a clever, compact way to show relative position.
- Care Reserve concept is clearly described.

**Issues**
- **"Advanced planning · Customise by category · Care Reserve"** — three distinct concepts crammed into one descriptor. Users won't know that "Care Reserve" is a toggle they can turn on; it reads like a section label.
- **Expand/collapse uses plain text triangles** ("▼ Show" / "▲ Hide"). These look like text, not interactive controls. A proper `<ChevronDown>` icon with a button-style treatment would have clear affordance.
- **Category summary cards (Essential £36.4k, etc.) have no icons** — the only differentiator is a small coloured label text. They feel sparse and don't invite interaction; users may not realise they can expand each category below.
- **Slider thumb is orange on all categories** regardless of the category colour (teal for Essential, green for Lifestyle, etc.). The orange thumb is a mismatch that subtly undermines the colour-coding.
- **The benchmark bar tick and "Comfortable+" label are tiny** (~10px) — the user's precise position on the range is very hard to read.
- **Care Reserve toggle** (off state) is a grey pill on a light-teal card — the toggle has poor contrast against the background. The off state is almost invisible.

**Improvements**
- Rewrite the section subtitle to: "Customise spending by category. Optionally reserve funds for care."
- Replace text triangles with `<ChevronDown className="w-4 h-4" />` inside a styled button.
- Add category emoji icons to the summary cards (🏠 Essential, 🌴 Lifestyle, 👨‍👩‍👧 Family & Giving, 📦 Other).
- Match slider thumb colour to category accent colour.
- Increase benchmark bar label to 12px minimum; add a small callout bubble for the current position.
- Increase Care Reserve toggle contrast: use a white card background, not teal — the teal is already used by the "Essential" category.

---

### 7. Planned Big Purchases (New Feature)

**What works**
- Section heading "Planned big purchases" with 🎯 emoji and plain-English subtitle is immediately understandable. ✅
- Quick-add chips (Home renovation, New car, Dream holiday, etc.) are an excellent UX pattern — they reduce the blank-form problem. ✅
- Saved event displays cleanly with emoji, name, age, amount, and inflation-adjusted badge. ✅
- Edit / Remove affordance is present and clearly labelled. ✅

**Issues**
- **P1 — Inflation toggle label clipped (live bug).** The form shows ".djust for inflation between now and when you spend it" — the leading "A" is cut off. Fix is committed on `feat/planned-events` branch but not yet deployed. (See `src/components/steps/Step2SpendingGoals.tsx` — `button[role=switch]` fix.)
- **P1 — "+ Add" button is purple.** Every other primary action on this page (the lifestyle cards, the "Add income & assets →" CTA, the "Go-Go Years" tab) uses orange. Purple is not part of the brand colour system on this page. The "+ Add" button should be orange to signal it is a primary action.
- **P2 — Icon picker is not discoverable.** In the Add event form, the icon picker is a horizontal row of emoji buttons with no label ("Icon" appears above, but it's very small). The selected state is a faint purple ring around the emoji. Most users will not interact with it; the section needs a clear "Choose an icon" label and a more visible selected state (e.g. coloured background behind the selected emoji).
- **P2 — "Save" button is disabled (pale purple) with no reason given.** When the form opens, Save is disabled because no name has been typed. There is no validation message or hint explaining why. Add an inline hint: "Enter a name to save."
- **P2 — Quick-add chips lack hover affordance.** The chips have a subtle border but no visible shadow or background shift on hover (not testable from static screenshot, but the border weight is very thin).
- **P3 — Event list item copy: "£30.0k today" is ambiguous.** "Today" reads as "right now, this moment" — the intended meaning is "in today's money". Change to "£30k in today's money" or "£30k (today's £)".
- **P3 — Form uses full-width buttons (Save + Cancel) in a two-column layout.** Two full-width equal-height buttons at the bottom of the form make Save and Cancel look like peers. Save should be primary (orange, full-width), Cancel should be a ghost/text link, not a large white block.
- **Nit — "What is it?" label.** Conversational tone works well but "What is it?" followed by a placeholder "e.g. Kitchen renovation" is slightly redundant. Consider "Name your purchase" with the same placeholder.
- **Nit — "Your age when you spend it" is verbose.** "Age when you spend it" is sufficient.

**Improvements**
- Deploy `feat/planned-events` to fix the inflation toggle clipping.
- Change "+ Add" button to `bg-orange-500 text-white` (primary brand colour).
- Add "Choose an icon:" label above the icon picker; use `bg-purple-100 ring-2 ring-purple-400` for selected state.
- Add inline validation: show "Add a name to save" below the name field when Save is pressed with an empty name.
- Change event list copy from "£30.0k today" to "£30k (today's money)".
- Make Save button orange full-width; make Cancel a `text-slate-500 underline` inline link.

---

### 8. Sticky Footer Bar

**What works**
- "Paul & Lisa" household label and "Required spend £62,400" are useful running context. ✅
- Lifestyle badge "⭐ Comfortable" is a quick sanity check. ✅

**Issues**
- **"Gross income £0" on the Spending page alarms users.** Income is set in Step 4. Showing £0 here implies the plan is broken; many users will be confused or worried. Until income data exists, this field should be hidden or show "— (set in Step 4)".
- **"▼ £-62,400" double-encodes the shortfall.** The downward arrow plus the negative sign both communicate the same thing. Use one convention: either "Shortfall: £62,400" or "▼ £62,400" (without the minus sign).
- **The lifestyle badge "⭐ Comfortable"** uses the same chip styling as interactive quick-add chips in the Planned purchases section. A user who clicks it will be confused when nothing happens. Make it a non-interactive `span` with a distinct visual style (e.g. no border, plain text with emoji).

**Improvements**
- Hide "Gross income" from footer until Step 4 data exists; show "— set in Step 4" placeholder text.
- Change shortfall display to "Shortfall: £62,400" with a red/amber colour to maintain clarity without double-encoding.
- Restyle the lifestyle badge as a plain non-interactive label.

---

### 9. Bottom Navigation

**What works**
- "← Back" and primary CTA are clearly differentiated.
- Orange CTA is consistent with the brand. ✅

**Issues**
- **"Add income & assets →" CTA label.** The verb "Add" implies the user will be creating things, when they may already have income and assets in the plan from a previous session. "Next: Income & Assets →" is clearer about navigation intent.

**Improvement**
- Change CTA label to "Next: Income & Assets →".

---

## Priority Matrix

| Priority | Issue | Component |
|---|---|---|
| P1 | Inflation toggle label clipped — live bug | `Step2SpendingGoals.tsx` |
| P1 | "+ Add" button purple — inconsistent CTA colour | `Step2SpendingGoals.tsx` |
| P1 | Life-stage tabs: arbitrary per-tab accent colours | `Step2SpendingGoals.tsx` |
| P2 | Spending Smile card interrupts customisation flow | `Step2SpendingGoals.tsx` |
| P2 | "Comfortable+" unexplained | `Step2SpendingGoals.tsx` |
| P2 | "Gross income £0" alarms users on spending page | Footer component |
| P2 | No spending summary on tab labels (must click to compare) | `Step2SpendingGoals.tsx` |
| P2 | Expand/collapse text triangles — low affordance | `Step2SpendingGoals.tsx` |
| P2 | Icon picker not discoverable; selected state invisible | `Step2SpendingGoals.tsx` |
| P2 | Save button disabled with no validation message | `Step2SpendingGoals.tsx` |
| P2 | Unselected PLSA cards lack hover affordance | `Step2SpendingGoals.tsx` |
| P2 | No link shown between PLSA card figure and actual plan total | `Step2SpendingGoals.tsx` |
| P3 | Event copy "£30.0k today" ambiguous | `Step2SpendingGoals.tsx` |
| P3 | Save / Cancel full-width equal-weight buttons | `Step2SpendingGoals.tsx` |
| P3 | Spending Smile external link opens in same tab | `Step2SpendingGoals.tsx` |
| P3 | Slider thumb colour (orange) doesn't match category colour | `Step2SpendingGoals.tsx` |
| P3 | Footer lifestyle badge looks interactive but isn't | Footer component |
| P3 | "Add income & assets →" CTA label unclear | `Step2SpendingGoals.tsx` |
| P3 | Shortfall double-encodes negative (▼ + minus sign) | Footer component |
| P3 | Care Reserve toggle low contrast on teal background | `Step2SpendingGoals.tsx` |
| Nit | "What is it?" label slightly redundant with placeholder | `Step2SpendingGoals.tsx` |
| Nit | "Your age when you spend it" verbose | `Step2SpendingGoals.tsx` |
| Nit | "/yr" too small on PLSA cards | `Step2SpendingGoals.tsx` |
| Nit | Middot (·) separator in spending banner and event list | `Step2SpendingGoals.tsx` |

---

## Quick Wins

These 8 improvements are all deliverable in a single PR without a design-system overhaul:

| # | Change | Effort |
|---|---|---|
| QW1 | **Deploy fix:** inflation toggle label clipping (already committed on `feat/planned-events`) | Deploy only |
| QW2 | **+ Add button colour:** change from purple to `bg-orange-500 text-white` | 1 line |
| QW3 | **Life-stage tab active colour:** standardise all three to orange (remove green/purple variants) | ~10 lines |
| QW4 | **Spending Smile card position:** move above the life-stage tabs | ~5 lines |
| QW5 | **Gross income in footer:** show `— (set in Step 4)` when no income data | ~5 lines |
| QW6 | **Spending Smile link:** add `target="_blank" rel="noopener noreferrer"` | 1 line |
| QW7 | **Event list copy:** "£30.0k today" → "£30k (today's money)" | 1 line |
| QW8 | **Bottom CTA label:** "Add income & assets →" → "Next: Income & Assets →" | 1 line |
