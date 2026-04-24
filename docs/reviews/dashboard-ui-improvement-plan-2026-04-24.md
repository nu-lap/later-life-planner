# LaterLifePlan Dashboard — UI/UX Critical Review & Improvement Plan

**Reviewed:** 24 April 2026  
**Reviewer:** Copilot (expert UI/visual design critique)  
**Method:** Playwright live review of production build at 1440×900, full-page screenshots across all 6000px of dashboard content  
**Scope:** Step 5 Dashboard — all sections from header to footer

---

## Executive Summary

The dashboard is **informationally complete and technically impressive** — few tools surface this much financial detail in one place. But the current design prioritises density over comprehension. A first-time user arriving at this page would feel overwhelmed, struggle to find what to act on first, and have no way to navigate to the section they need without scrolling the entire 6000px page.

The three highest-leverage improvements are:

1. **Add in-page navigation** (sticky section anchors or a sidebar) — the page is too long to be a single undifferentiated scroll
2. **Elevate the Action Plan** — currently buried at ~4500px, this is the most actionable section and should be much more prominent
3. **Rationalise the visual language** — colour, typography, and spacing conventions are inconsistent across sections, eroding trust and readability

---

## Section-by-Section Findings

### 1. Header & Step Navigation

**What works**
- Pill-style step navigator is clear and scannable
- "Saved" status pill is reassuring
- Orange progress bar communicates completion

**Issues**
- The "Demo" and "Reset" buttons appear in the production header. These look like developer tools and erode trust for real users. They should be hidden behind a settings/developer menu.
- The header is thin and the logo carries no brand weight — it is just a text label. For a product positioning itself as premium, the header feels lightweight.
- The step navigation gives no indication that this is a single long scrolling page — users expect clicking "Dashboard" to show a distinct page, not reveal a ~6000px document.
- There is no way to return to an earlier step without losing your scroll position — the wizard nav always takes you to the top of the next step.

**Improvements**
- Remove Demo/Reset from the production header. Place behind an `⋮` menu visible only to authenticated users.
- Add a secondary navigation bar (or collapsible sidebar) that anchors to the main dashboard sections: Overview · IHT · Charts · Optimiser · Action Plan · Drawdown Detail.
- Persist scroll position when switching back from an earlier wizard step.

---

### 2. Withdrawal Strategy Selector

**What works**
- Two cards side-by-side clearly show the two strategy options
- "Active" badge on the selected card works as a state indicator

**Issues**
- The visual contrast between the two cards is poor. The inactive card (white, no border) looks almost identical to the active card — only the orange border and small "Active" badge differentiate them. A user could easily not notice which is selected.
- The "Active" badge is positioned top-right inside the card, where the eye goes last. Selection state should be communicated immediately — e.g. via a full coloured fill, a bold ring, or a prominent ✓ mark at the top-left.
- The "Age to take lump sum" stepper is visually detached from the strategy cards. The relationship (this stepper controls the right-hand strategy) is implied, not shown. A user who selects the left strategy may still try to edit this field not understanding it has no effect.
- The small explanatory text under the stepper is ~11px and is extremely hard to read. This is important context (NMPA constraints, tax-year implications) that users need.

**Improvements**
- Make the active card clearly different: a solid coloured background or a prominent check + "Selected" label.
- Only show the age stepper when the PCLS strategy card is active — hide or grey it out for the standard strategy.
- Increase explanatory text to at least 13px / `text-sm`.
- Add a single line under the selector summarising the chosen strategy in plain English: _"You will take a £268,275 tax-free lump sum at age 56, sheltering £20,000 into each ISA."_

---

### 3. KPI Summary Cards

**What works**
- Large bold numbers are immediately readable
- Subtitle context (e.g. "Net after tax: £62.1k — year 1") adds useful detail
- Four-card grid makes good use of horizontal space

**Issues**
- **Semantically arbitrary colour scheme.** Dark navy = Required spending. Teal = Gross income. Orange = Assets at 57. Green = Assets at 96. There is no semantic logic to these colours. A new user cannot decode them without reading the labels.
- The traffic-light implication is reversed. Orange is typically a warning colour — but "Investment Assets at 57: £597.7k" is a positive figure. Green on "Assets at 96: £2.8m" implies success, which is correct — but why is the present worse (orange) than the future?
- "Required net spending" is an *input* not an output, yet it sits alongside three *output* metrics as if they are peers.
- Cards are too short (~80px tall) for the importance of the numbers they contain.

**Improvements**
- Adopt a two-tone semantic system: **neutral/slate** for inputs, **blue/indigo** for projected outputs, **green** for on-track outcomes, **amber/red** for risk indicators.
- Separate the spending input from the output metrics — perhaps show it as a prominent "Goal" banner above the output KPI row.
- Increase card height to give numbers more breathing room.
- Add small trend arrows or delta indicators (e.g. "+£12k vs standard approach") to the output cards.

---

### 4. Life Stage Timeline

**What works**
- Coloured bar at a glance communicates the three life stages well
- Age markers are legible

**Issues**
- The bar has no "You are here" indicator. At 57, Paul is 1 year into Go-Go. There is nothing marking the current age on the timeline.
- The stage labels (Go-Go, Slo-Go, No-Go) use jargon that users may not remember from Step 2. A brief tooltip or subtitle would help: _"Active, full-pace years · ages 57–67"_.
- The proportional widths of the bars are correct (11y / 10y / 18y) but visually the No-Go section dominates — this may be emotionally unsettling without any accompanying framing text.

**Improvements**
- Add a small ▼ indicator above the bar at the current age.
- Add a one-line description under each stage on hover (desktop) or always (mobile).
- Consider framing the No-Go period with a softer label or note — it is a long period and users may react negatively to a 18-year "No-Go" bar.

---

### 5. IHT Estate Planning Section

**What works**
- The section surfaces genuinely rare, complex information (full estate breakdown with IHT calculation) that advisers typically charge for
- The £538k IHT figure in red is appropriately alarming
- The April 2027 pension impact callout is a timely, important regulatory note

**Issues**
- **The section is too long and too early.** IHT planning appears before the income charts and the optimiser. For most users, "how do I fund my lifestyle?" is more urgent than "how do I reduce inheritance tax?". IHT should be a secondary section, reachable via a link, not in the main scroll before income planning.
- The estate breakdown table presents 10+ line items with no visual grouping. Assets, deductions, allowances, and the final IHT figure all sit in the same table without section separators.
- The four IHT metric cards (NRB, RNRB, Chargeable Estate, IHT Due) are useful, but the IHT Due card's pale pink background does not convey urgency commensurate with the £538k figure.
- "Included from April 2027" in orange next to the DC pension balance is important (the pensions inclusion rule) but looks like a data label. It needs an explanatory heading or tooltip.
- The RNRB Taper Clawback Scenarios section with tab buttons does not look like tabs — the pills look like buttons. There is no visual indicator of which tab is active.

**Improvements**
- Move IHT below the income and optimizer sections. Offer a "Jump to IHT planning" link from the overview.
- Add visual subheadings within the estate breakdown table: **Assets**, **Deductions**, **Allowances**, **Inheritance Tax Due**.
- Replace the pale pink IHT Due card with a bold red/dark card to match the severity.
- Clearly style the RNRB tab selectors with an underline or fill to indicate the active state.
- Add a plain-English one-liner above the IHT section: _"Based on today's estate value, your projected IHT liability is £538,000. Here's what drives that."_

---

### 6. Investment Asset Trajectory Chart

**What works**
- Clean two-line chart (Current path vs With gifting strategy)
- Legend and axis labels are legible
- The visual separation between strategies is clear

**Issues**
- The Y axis values (£0, £750k, £1.5m, £2.3m, £3.0m) are not evenly spaced — the jump from £2.3m to £3.0m is £700k while others are £750k. This suggests an automatic scale that should be forced to round intervals (£0, £500k, £1.0m, £1.5m, £2.0m, £2.5m, £3.0m).
- No zero-line or shading to show depletion risk — a line chart reaching zero mid-plan (in a depletion scenario) should be more dramatically highlighted.
- No annotation on the chart at the death-age endpoint to confirm "plan ends at 96".

**Improvements**
- Force axis to round £500k or £1m intervals.
- Add a subtle shaded region below the line after a certain age to reinforce the planning horizon.
- Add an endpoint annotation: "Age 96" at the final data point.
- Add hover tooltips with the exact asset value at each age.

---

### 7. Gross Income vs Required Spending Chart

**What works**
- The stacked bar chart is impressively detailed — 6 income sources visualised per year
- The dashed "Required spending" line over the bars is a clear reference point
- The tax layer (grey, stacked on top) illustrates why gross > net

**Issues**
- **Too many colours to parse.** Six income component colours + grey tax + the dashed red spending line = 8 visual elements. The human eye can reliably distinguish ~5 in a legend. The small legend squares (≈10px) at the bottom are almost indistinguishable on screen.
- The tax layer being stacked *on top* of income (as a grey bar segment) is unusual and counter-intuitive. Tax is typically shown as a deduction, not an addition. First-time users will wonder why bars grow taller than the spending line if they are meant to show how income covers spending.
- No zero line or area fill to show the gap between income and spending at each age when income falls short.
- The chart title ("Gross income vs required spending — optimiser view") is fine but does not tell the user *what to look for*.

**Improvements**
- Reduce to 4 income components by combining minor sources (e.g. "Other income" + "Property rent" = "Other sources").
- Reframe the tax layer: instead of stacking it above income, show it as a desaturated overlay or add a separate "Net income" line so users can read both gross and net.
- Add a brief caption below the chart: _"Bars above the red line indicate surplus income; bars below indicate a shortfall."_
- Increase legend item size and use full-width layout.

---

### 8. Investment Balances Over Time Chart

**What works**
- Area chart works well for showing asset depletion/growth
- The "Investment Total" line over the areas gives a clear headline

**Issues**
- The chart legend appears above the chart (in the visible viewport) but the chart title is separate — the eye has to travel between the two.
- No annotation on the chart at the age where a specific event happens (e.g. "PCLS taken at 56", "State pension starts at 67").

**Improvements**
- Merge chart title and legend into a single header row above the chart.
- Add key event annotations as vertical dashed lines with labels: "State pension", "DC exhausted", etc.

---

### 9. Withdrawal Plan Optimisation Section

**What works**
- "Explain this recommendation" CTA is well-placed and well-styled
- Strategy Guide with expandable definitions is a good progressive disclosure pattern
- The three summary metric cards (Tax impact, Plan durability, End-of-plan assets) give a quick baseline comparison

**Issues**
- **The metric cards present confusing sign convention.** "Tax impact vs standard approach: -£38.0k" displayed in green implies "saving money" — but the tooltip reveals the *optimised* plan pays £38k *more* in tax than standard (£208k vs £170k). The green colour and the label "Tax impact" imply this is good, but it is worse by this metric. The saving presumably comes from a longer-lasting plan or better terminal assets, not from reduced tax. This is misleading.
- "End-of-plan assets vs standard approach: -£39.0k" — again in purple, with optimised at £2.8m vs standard at £2.9m. The optimised plan produces *fewer* terminal assets. Why call it "optimisation"? The rationale needs to be explained inline: _"The strategy prioritises a sustainable income path over terminal asset maximisation."_
- The three metric cards use three different accent colours (green, purple, purple) — inconsistency that looks accidental.
- The Strategy Guide's blue info box is visually indistinguishable from standard paragraph text at a glance — it needs a more distinct styling (e.g. a left border bar, or a soft background tint).

**Improvements**
- Relabel and reframe the Tax Impact card: _"Tax is £38k higher with this strategy — but it funds a more sustainable income through a better drawdown sequence. Net lifetime position is stronger."_ (or explain inline why this tradeoff is correct)
- Make all three metric cards the same accent colour (e.g. all blue/indigo) with icons representing each metric.
- Add a one-sentence rationale under each metric explaining the tradeoff.
- Give the Strategy Guide a visual container (e.g. `bg-blue-50` with a `border-l-4 border-blue-400`).

---

### 10. Strategy Comparison By Year Table

**What works**
- Side-by-side Best/Runner-Up card per year is a rich comparison format
- The financial metrics within each card (Total tax, Tax-free income, Gross income, Terminal assets) are well-chosen
- The "Hide comparison" toggle is useful

**Issues**
- **Enormous vertical height.** Showing 5 years at this card size consumes ~1200px. This section alone is ~20% of the total page height. For a user who just wants the headline recommendation, this is deeply buried context.
- The toggle is labelled "▲ Hide comparison" when visible — but uses the same orange styling as other primary actions, so it does not visually register as a hide/show control. It should look like a disclosure control.
- The "BEST" and "RUNNER-UP" badges are shown in every single row with no evolution commentary — there is no way to see "the best strategy is the *same* for all 5 shown years" vs "it changes year by year".
- There is no summary above the table that states: _"The recommended strategy is consistent for X of the Y years in your plan."_

**Improvements**
- Default to collapsed (the fix in PR #277 persists the state, but the *default* should be collapsed for new users).
- Add a summary banner above the table: _"One strategy wins in 38 of 40 years. Expand to see year-by-year detail."_
- Reduce card height — compact each year-row to ~60px with expandable detail.
- Style the "Hide/Show comparison" toggle as a disclosure button (chevron icon, subtle border) rather than an orange pill.

---

### 11. Your Action Plan — Outstanding Design

**What works**
- This section is the **best-designed part of the dashboard** — clear, actionable, structured
- The four card types (ISA, Pension, ISA spend, Spending) are well-categorised
- The year navigator (◀/▶) is intuitive
- GIA source breakdown (from Paul's own portfolio / from joint portfolio) is genuinely useful detail
- The CGT warning in orange is contextually appropriate

**Issues**
- **It is at ~4500px.** This is the most actionable section and most users will never reach it without a specific anchor link.
- The "PAUL" / "LISA" person labels within cards use 8–9px all-caps grey text. At that size they are very hard to read, especially in a dense dashboard, and the text/background contrast should be verified to meet WCAG AA for normal text (≥ 4.5:1).
- The card for "Spending this year" shows the spending target and life stage multiplier — but gives no indication of whether this amount is funded (surplus) or a deficit.
- The first-year-free / Pro gate message ("First year shown free — upgrade to Pro to step through all years") uses an inline `<span>` in orange, mixing the Pro upsell into the section description. This feels cramped and slightly aggressive.
- The "🔓" emoji used as the next-year button when Pro is not enabled is playful but slightly inconsistent with the otherwise professional aesthetic.

**Improvements**
- Add a **sticky "Jump to Action Plan"** button or section anchor link near the top of the dashboard — this is the section users should see first.
- Increase "PAUL" / "LISA" labels to at least `text-xs`, use `font-semibold`, and ensure contrast ≥ 4.5:1.
- On the Spending card, add a coloured indicator: green if fully funded, amber if marginal, red if shortfall.
- Move the Pro upsell for year navigation out of the descriptor text — instead, show a clean "🔓 Upgrade to see all years" button below the year navigator, separate from the section description.

---

### 12. Drawdown Detail By Year Table

**What works**
- The table header (Tax year / Age / Pension / ISA / GIA / Cash / Tax) is clear
- The "Show breakdown" and "Show all optimiser years" toggles are well-positioned
- The data density is appropriate for this level of detail

**Issues**
- The table appears only after the user has scrolled to the very bottom of a 6000px page, immediately above the footer. It has no visual weight or heading prominence commensurate with the rich data it contains.
- Column headers "Pension / ISA / GIA / Cash" are jargon. While the target user likely understands these, a first-time user will not know what "GIA" means. A tooltip on each header would help.
- Numbers in the table are right-aligned which is correct, but the column widths look inconsistent — Tax column appears wider than necessary, Strategy column narrower.

**Improvements**
- Add a section intro: _"Year-by-year breakdown of where your income comes from and what tax you'll pay."_
- Add `title` attribute or tooltip on abbreviated column headers (GIA, DC, UFPLS) explaining the abbreviation.
- Ensure consistent column widths, with numeric columns fixed-width.

---

### 13. Footer Action Bar

**What works**
- Three clear CTAs at the bottom: ← Edit income & assets · Save scenario · Export PDF
- Orange "Export PDF" button is the correct primary CTA weight

**Issues**
- The footer bar appears only at the very bottom — after 6000px of scroll. For a user who wants to export immediately, there is no accessible shortcut.
- "Save scenario" uses a floppy disk icon (💾) — extremely dated. Use a cloud/save icon or none.
- "← Edit income & assets" as left-navigation text looks like a breadcrumb, not a button. Its affordance is unclear.

**Improvements**
- Add the Export PDF button to the sticky header, visible at all times.
- Replace the floppy disk with a bookmark or cloud-upload icon.
- Style "← Edit income & assets" as an explicit `< Back` button.

---

## Priority Matrix

| Priority | Issue | Section | Effort |
|----------|-------|---------|--------|
| P0 | No in-page navigation — 6000px single scroll | Global | Medium |
| P0 | Action Plan buried at 4500px — primary content inaccessible | Action Plan | Low |
| P1 | Misleading sign convention on Tax Impact metric card | Optimiser | Low |
| P1 | KPI card colour system is semantically arbitrary | Overview | Low |
| P1 | "PAUL"/"LISA" person labels too small — accessibility fail | Action Plan | Low |
| P1 | IHT section appears before income planning — wrong priority | Global | Low |
| P2 | Withdrawal strategy active state barely distinguishable | Strategy selector | Low |
| P2 | Age stepper visible even when PCLS strategy inactive | Strategy selector | Low |
| P2 | Tax layer stacked above income bars is counter-intuitive | Income chart | Medium |
| P2 | Strategy comparison table — enormous default height | Optimiser | Low |
| P2 | No "You are here" marker on life stage timeline | Life stages | Low |
| P2 | Footer CTA bar visible only at page end | Footer | Low |
| P3 | Demo/Reset buttons visible in production header | Header | Low |
| P3 | IHT estate table has no visual sub-grouping | IHT | Low |
| P3 | Income chart legend items too small | Charts | Low |
| P3 | Floppy disk save icon is dated | Footer | Low |
| P3 | Chart Y-axis intervals not evenly rounded | Charts | Low |
| Nit | Strategy Guide box lacks distinct visual container | Optimiser | Low |
| Nit | "🔓" emoji on Pro gate button slightly off-brand | Action Plan | Low |
| Nit | RNRB tab buttons have no active-state indicator | IHT | Low |

---

## Proposed Page Structure (Redesign Target)

The current structure:

```
Header
Step nav
─── Strategy selector
─── 4 KPI cards
─── Life stage timeline
─── IHT Estate Planning (huge)
─── IHT Charts
─── Income vs Spending chart
─── Investment Balances chart
─── Withdrawal Optimisation
─── Strategy Comparison table
─── Your Action Plan
─── Drawdown Detail
Footer
```

Proposed structure with section navigation:

```
Header (sticky) + Export PDF button always visible
Section nav: Overview · Spending · Optimiser · Action Plan · IHT · Full Detail

═══ OVERVIEW ═══════════════════════════
  Strategy selector (compact)
  4 KPI cards (redesigned, semantic colours)
  Life stage timeline (with "you are here")
  ↓ Jump to Action Plan  [prominent CTA]

═══ YOUR ACTION PLAN ══════════════════  ← MOVED UP
  Year navigator
  4 action cards (with accessibility fixes)

═══ WITHDRAWAL OPTIMISATION ══════════
  3 metric cards (reframed sign conventions)
  Strategy Guide
  Strategy comparison (collapsed by default)
  Explain this recommendation

═══ INCOME & ASSET CHARTS ════════════
  Gross income vs spending
  Investment balances over time

═══ IHT ESTATE PLANNING ══════════════  ← MOVED DOWN
  Estate breakdown
  IHT charts
  RNRB scenarios

═══ FULL DETAIL ══════════════════════
  Drawdown by year table

Footer bar (← Back · Save · Export PDF)
```

---

## Quick Wins (implement without design system changes)

These can all be shipped in a single PR with no visual redesign risk:

1. **Anchor links in page header** — add `id="action-plan"`, `id="optimiser"` etc. to section divs and render anchor pills at the top of the dashboard
2. **Increase person label font size** from ~8px to `text-xs font-semibold` (`12px`)  
3. **Move Action Plan above the strategy comparison table** — reorder JSX only
4. **Collapse strategy comparison by default** — change `useState(true)` to `useState(false)` for `showStrategyComparison`
5. **Relabel Tax Impact card** — change the green colour to neutral slate and add a parenthetical clarification to the description
6. **Hide Demo/Reset from header** — gate behind `process.env.NODE_ENV === 'development'` or a user flag
7. **Add chart Y-axis forced rounding** — pass `tickCount` and `domain` to Recharts `YAxis`
8. **Add plain-English caption under income chart** — one-sentence `<p>` element below the chart component
