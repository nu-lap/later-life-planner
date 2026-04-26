# Income & Assets UI Review — April 2026

**Reviewer Persona:** Senior fintech product designer, 15 years SaaS, specialized in information hierarchy, accessibility, UK financial UX, and complex form patterns.

**Date:** 26 April 2026  
**Page:** Step 4 — Income & Assets (Live: `ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io`)  
**Viewport:** 1440×900  
**Scope:** Visual hierarchy, accessibility, form usability, UK financial terminology clarity, visual consistency.

---

## Executive Summary

The Income & Assets page presents a well-structured wizard step with clear sectioning and good use of visual cues (toggles, icons, color coding). However, several accessibility, spacing, and terminology issues limit clarity and usability, particularly around:
- **Label alignment and truncation** in toggle groups
- **Visual hierarchy of growth rates** vs. primary values
- **Inconsistent spacing** in multi-field layouts (e.g., Annual growth + unit dropdowns)
- **CGT calculation warnings** need clearer positioning and hierarchy
- **UK tax jargon** (LSA, RNRB, CGT, UFPLS) introduced without consistent glossary support
- **Repetitive model assumptions** section duplication across tabs

**Priority:** 8 quick-win fixes (P2–Nit severity) can be addressed in a single PR. No P0/P1 blockers identified.

---

## Detailed Findings

### § 1. Information Hierarchy & Content Ordering

#### 1.1 — "First time here?" callout positioning (P3)
**Issue:** The yellow "First time here?" banner is positioned early but could be more subtle; it competes visually with the main heading "Where will the money come from?"

**Impact:** Users may skip step 3 guidance if they've already read it; the banner takes up valuable above-fold real estate on a dense form.

**Recommendation:** Move to a collapsed accordion or footnote after the main heading, or reduce prominence (lighter background, smaller text).

---

#### 1.2 — Person selector (Paul / Lisa) clarity (P2)
**Issue:** The "Paul" / "Lisa" buttons at the top of the form are not clearly labeled as "Viewing income for: Paul" or similar—they appear as generic navigation buttons.

**Impact:** New users may not immediately understand they're switching person context within a joint plan. Unclear whether changes apply to one or both partners.

**Recommendation:** Add helper text below the buttons: "Viewing income for:" or similar. Consider a subtle background shade to the active person's section.

---

#### 1.3 — Income vs. Assets tab labels (P3 / Nit)
**Issue:** The emoji-prefixed tabs ("💷 Income" / "🏦 Assets") are clear but the short labels may conflict with screen reader announcements. No visible text-only alternative.

**Impact:** Users on mobile or with assistive technology may get confusing tab announcements.

**Recommendation:** Ensure ARIA labels on tab buttons explicitly state "Income tab" / "Assets tab" (beyond emoji). Consider adding small text label underneath emoji on tablet/mobile.

---

### § 2. Form Label & Input Alignment

#### 2.1 — Toggle labels truncation (P2)
**Issue:** On several toggles (e.g., "Guaranteed & Secure Income", "Property Income"), the label text does not align consistently with the toggle switch. Some labels appear to wrap unexpectedly, and the alignment between label and toggle is off by ~2–3px in places.

**Impact:** Reduces visual hierarchy clarity; makes it harder to scan which section is active/inactive.

**Examples:**
- "Guaranteed & Secure Income" label–toggle pairing
- "Flexible Income" section
- Primary Residence toggle

**Recommendation:** 
1. Ensure all toggle labels use flexbox with consistent vertical centering (align-items: center)
2. Add 12px gap between label text and toggle switch
3. Verify line-height matches between label text and toggle height

---

#### 2.2 — "Annual income (today's £)" label clarity (P3)
**Issue:** Labels like "Annual income (today's £)" and "Weekly amount" are positioned above the input field, but the note "(today's £)" could be misinterpreted as a unit label.

**Impact:** Users may not immediately understand that "(today's £)" refers to inflation adjustment, not a formatting instruction.

**Recommendation:** Rephrase to "Annual income (in today's money)" or add a small info icon with tooltip: "Amounts are shown in today's purchasing power. The engine adjusts for inflation year-by-year."

---

#### 2.3 — Age spinner controls (Start age, From age, To age) spacing (P2)
**Issue:** The "Start age" / "From age" / "To age" spinners (with − / + buttons) have tight spacing between the label, input field, and buttons. Buttons are small (~32px) and could be missed by touch or imprecise mouse users.

**Impact:** Difficult to interact on mobile; low visual clarity for the age value.

**Recommendation:**
1. Increase button size to 40–44px (meets touch target guidelines)
2. Add 8px padding inside buttons
3. Use aria-label="Increase age" / "Decrease age" for screen readers

---

### § 3. Color, Contrast & Visual Consistency

#### 3.1 — "Unrealised gain" warning color (P2)
**Issue:** The orange text "Unrealised gain: £28,901" and similar warnings are displayed in the same orange (#FF9500) as the primary brand color. They should use a darker or contrasting color (e.g., red or dark orange) to signal caution.

**Impact:** Users may not perceive these as warnings; they look like normal data labels.

**Examples:**
- "Unrealised gain: £28,901. CGT applies on gains above the £3,000 annual exempt amount."
- "Gains split equally across both persons' CGT allowances."

**Recommendation:** Change warning text to #D97706 (amber-600) or #DC2626 (red-600). Add a subtle left border (4px) in the warning color to increase visual hierarchy.

---

#### 3.2 — Toggle switch active color consistency (P3 / Nit)
**Issue:** All toggles use the same orange (#FF9500) when active. No visual distinction between "enabled" (income/asset is being used in projections) vs. "disabled" (excluded from projections). Disabled state should be clearly greyed out.

**Impact:** Users may be unsure which income/asset categories are active in the financial projection.

**Recommendation:**
1. Ensure disabled toggles are clearly greyed (e.g., #CCCCCC for switch body, #999999 for label text)
2. Add aria-checked="true/false" attributes
3. Consider a faded background (opacity 0.5) for disabled cards

---

#### 3.3 — Percentage inputs (Annual growth rate %) styling (P3 / Nit)
**Issue:** Percentage inputs ("Annual growth rate 4 %") have the "%" unit displayed inline, but alignment with number input is inconsistent across sections. Some have the input as a tight 2–3 character box; others are wider.

**Impact:** Visual inconsistency; unclear if the narrow fields are intentional constraints.

**Recommendation:** Standardize all percentage inputs to a fixed width (e.g., 80px) and position the "%" suffix outside the input with 4px margin.

---

### § 4. UK Financial Terminology & Clarity

#### 4.1 — Undefined jargon: LSA, CGT, RNRB, UFPLS (P2)
**Issue:** The page introduces UK tax terminology ("LSA" in SIPP section, "CGT" in GIA sections, "RNRB" in Primary Residence section, "UFPLS" in drawdown sections) without inline definitions or glossary links.

**Impact:** Users unfamiliar with UK pension rules may misunderstand whether they're configured correctly.

**Examples:**
- "SIPP contribution (gross / year)" — no definition
- "Unrealised gain" vs. "Chargeable gains" vs. "CGT" — mixed terminology
- "Passes to direct descendants?" (RNRB implication) — unclear what this means

**Recommendation:**
1. Add info icon (ℹ️) next to each acronym, with tooltip on hover
2. Tooltip text: "LSA: Lifetime Savings Allowance (SIPP)", "CGT: Capital Gains Tax", "RNRB: Residence Nil-Rate Band", "UFPLS: Uncrystallised Funds Pension Lump Sum"
3. Or create a single glossary card at the bottom of Model assumptions section

---

#### 4.2 — "Workplace pension contribution" copy (P3 / Nit)
**Issue:** Label reads "Workplace pension contribution" but the form allows future workplace contributions (after FI age) which is unlikely in real user scenarios. The label should clarify this is historical/ongoing workplace pension, not retiree pension saving.

**Impact:** Confuses users about whether this field is relevant to their retirement planning.

**Recommendation:** Rephrase to "Workplace pension contributions (up to FI age)" or add helper text: "Only contributions until your financial independence date are projected."

---

### § 5. Form Layout & Density

#### 5.1 — "Current market value" + "Purchase price / base cost" stacking (P3)
**Issue:** In the Assets tab, cards show multiple fields stacked vertically with no breathing room:
- Current market value
- Purchase price / base cost
- Annual growth rate

The fields are all left-aligned with no visual grouping, making the card feel dense and hard to scan.

**Impact:** Users must read each label carefully; values are hard to compare at a glance.

**Recommendation:**
1. Use a 2-column grid on larger screens (Current value | Purchase price)
2. Place Annual growth rate in a lighter background sub-section below
3. Ensure 16px vertical spacing between field groups

---

#### 5.2 — Model assumptions section repetition (P3 / Nit)
**Issue:** The "Model assumptions" section appears identically at the bottom of both Income and Assets tabs, showing the same "Investment growth" and "Inflation" fields.

**Impact:** Users see duplicate content; wastes vertical space on an already-long form.

**Recommendation:** 
1. Move "Model assumptions" to a single collapsible section that spans both tabs
2. Or, show model assumptions only on the first tab (Income), and link to it from Assets
3. Consider a "Model assumptions" button in the sidebar that opens a modal

---

### § 6. Accessibility

#### 6.1 — Color contrast on helper text (P2)
**Issue:** Some helper text (e.g., "Original cost — for CGT calculation", "Reduce net IHT value") is displayed in a light grey (#999999 or similar) which may not meet WCAG AA standards (4.5:1 minimum for normal text).

**Impact:** Users with low vision or color blindness may struggle to read helper text.

**Recommendation:**
1. Audit all secondary text against WCAG AA (use WebAIM Contrast Checker)
2. Increase text color saturation to #666666 or darker
3. Ensure all helper text ≥ 12px font size

---

#### 6.2 — Spinner button accessibility (P2)
**Issue:** Age spinners (− / +) use small text characters with minimal padding. No visible focus state documented.

**Impact:** Keyboard users may struggle to tab through all controls; focus state may be hard to see.

**Recommendation:**
1. Add CSS focus-visible pseudo-class with clear outline (3px, #FF9500)
2. Ensure buttons are at least 44px × 44px (touch-friendly)
3. Add aria-label attributes: aria-label="Increase age", aria-label="Decrease age"
4. Ensure aria-label updates with current value: aria-label="Current age: 67, press to increase"

---

#### 6.3 — Heading hierarchy (P2)
**Issue:** The page structure is:
- h2: "Where will the money come from?"
- No h3 headings for sections like "Guaranteed & Secure Income", "Property Income", etc.
- Only h3 for "Model assumptions"

**Impact:** Screen reader users can't navigate section-by-section; heading outline is unclear.

**Recommendation:**
1. Promote section titles to `<h3>` tags: "Guaranteed & Secure Income", "Property Income", "Flexible Income"
2. Keep "Model assumptions" as h3 for consistency
3. Ensure heading hierarchy is h2 > h3 (no h4 jumps)

---

### § 7. Mobile & Responsive Behavior

#### 7.1 — Multi-field layouts on mobile (P3)
**Issue:** The "Annual growth rate" + "%" unit displayed side-by-side will wrap awkwardly on mobile. No responsive grid defined.

**Impact:** Mobile users see misaligned fields; growth rate inputs are hard to use.

**Recommendation:**
1. On screens < 768px: Stack inputs vertically
2. On screens ≥ 768px: Use 2-column grid (value | unit)
3. Ensure inputs are 100% width on mobile

---

#### 7.2 — Toggle label truncation on mobile (P2)
**Issue:** Long labels like "Guaranteed & Secure Income" will truncate on mobile (<375px viewport).

**Impact:** Labels are incomplete; users can't tell which asset/income they're configuring.

**Recommendation:**
1. Test all labels on iPhone SE (375px) viewport
2. If truncation occurs, stack label above toggle (instead of inline)
3. Use `word-break: break-word` or reduce font size on mobile (to 14px)

---

### § 8. Quick Wins (6–8 implementable items)

| ID | Title | Severity | Effort | Impact |
|---|---|---|---|---|
| QW-1 | Fix toggle label–switch alignment | P2 | 1h | High — improves form usability across 10+ toggles |
| QW-2 | Add aria-label and focus states to age spinners | P2 | 1h | High — improves keyboard/screen reader accessibility |
| QW-3 | Rephrase "Annual income (today's £)" to "in today's money" | P3 | 30m | Medium — clarifies inflation adjustment |
| QW-4 | Change "Unrealised gain" text color to amber-600 for warning emphasis | P2 | 30m | High — users now perceive warnings visually |
| QW-5 | Add info icon + tooltip for jargon (LSA, CGT, RNRB, UFPLS) | P2 | 2h | High — reduces user confusion on tax rules |
| QW-6 | Increase age spinner button size to 44px (touch-friendly) | P2 | 1h | High — improves mobile usability |
| QW-7 | Promote section headings (Guaranteed & Secure Income, etc.) to `<h3>` tags | P2 | 1h | Medium — improves screen reader navigation |
| QW-8 | Consolidate "Model assumptions" section (remove duplication across tabs) | P3 | 1.5h | Medium — reduces cognitive load, saves vertical space |

**Total estimated effort:** 8–9 hours. **Recommended grouping:** Single PR with 4–5 logical commits (layout fixes, accessibility, terminology, content).

---

## References

- **Dashboard UI Review (April 2026):** `docs/reviews/dashboard-ui-improvement-plan-2026-04-24.md`
- **UI Review Process (runbook):** `docs/operations/ui-review-process.md`
- **WCAG 2.1 AA Standards:** https://www.w3.org/WAI/WCAG21/quickref/
- **UK Financial Terminology:** HMRC guidance, FCA jargon buster

---

## Approval & Next Steps

- [ ] Review document approved by product team
- [ ] Quick wins prioritized and estimated
- [ ] PR #xxx created with quick-win implementation
- [ ] Validate on live build post-merge
- [ ] Screenshot cleanup (delete all *.png files)

