# LLP Exploratory Testing — Charter 11 Bug Report
**Session:** 2026-05-14 21:00
**Target:** https://ca-later-life-planner.salmonstone-6e18fbe9.uksouth.azurecontainerapps.io
**Charter run:** 11 (New User Persona Journey Tests)
**Tests executed:** 7 / 7 passed
**Tester:** Claude Code (automated exploratory session)

---

## Personas tested

| Persona | Mode | Age | Net Worth | FI Age |
|---------|------|-----|-----------|--------|
| Margaret | Single | 62 | Low | 67 |
| David | Single | 58 | Medium | 63 |
| Helen & Robert | Couple | 63/61 | High | 63/65 |
| Patricia & James | Couple | 55/57 | Low-medium | 67/67 |
| Raj | Single | 57 | Very high | 57 |

---

## Summary

| Priority | Count |
|----------|-------|
| P2 | 2 |
| P3 | 5 |
| Noise (known infrastructure) | widespread |
| Known bug (BUG-003 reconfirmed) | 1 |

---

## P2 — Feature correctness / Missing functionality

### BUG-012: FI age slider default is always 67 regardless of user's current age
- **Affected feature:** Step 1 — Financial Independence age slider
- **Personas affected:** David (58 targeting 63), Raj (57 already FI)
- **Steps to reproduce:**
  1. Start fresh (disclaimer accepted, no plan state)
  2. Enter any DOB under 67
  3. Observe the default FI age slider value
- **Expected:** Default FI age updates to reflect a reasonable suggestion based on current age (e.g., current age or current age + 5)
- **Actual:** Default FI age = 67 for all users regardless of DOB
- **Evidence:** All 5 personas show `default FI age on fresh load = 67`
- **Impact:** Users planning to retire before SPA (e.g., at 58 or 60) must drag the slider down from 67. This is a friction point that creates a misleading first impression: the app implies 67 is the "right" answer rather than a starting point.
- **Note:** The slider _does_ accept lower values when dragged. This is a defaults issue, not a data-entry bug.

### BUG-013: FI age slider does not react to DOB entry
- **Affected feature:** Step 1 — FI age slider after DOB change
- **Personas affected:** All
- **Steps to reproduce:**
  1. Enter a DOB that places the user at age 58 (current age well below 67)
  2. Observe FI age slider
- **Expected:** FI age slider minimum and/or default value updates to reflect the current age calculated from the new DOB
- **Actual:** FI age remains at 67 after DOB entry. For Raj (DOB 1969-11-22, current age ~56), the slider minimum appears clamped but the default does not shift to reflect that he is already past 55.
- **Evidence:** `FI age after DOB entry = 67` for all 5 personas
- **Impact:** A 58-year-old planning to retire at 60 must notice and manually adjust the slider — the app does not guide them toward a realistic default.

---

## P3 — Minor UX / Flow issues

### BUG-014: "Financial Independence age" label is jargon — no plain-English alternative shown
- **Affected feature:** Step 1 — FI age section heading
- **Personas affected:** Margaret (low literacy), Patricia & James (very low literacy)
- **Observation:** The section heading uses "Financial Independence age" with no tooltip, alternative label, or inline explanation of what this means in plain terms. "The age from which work becomes a choice" helper text IS present but appears below the heading.
- **Evidence:** `UX OBSERVATION [margaret]: "Financial Independence age" jargon used on step 0`
- **Suggested priority rationale:** Most target users (50–75) are not familiar with "FI" terminology from the FIRE movement. "Retirement age" or "age you want to stop working" would be more accessible. Alternatively, the helper text could be promoted above the slider.

### BUG-015: Minimum RLSS selection produces no visible change in spend total — default already equals minimum
- **Affected feature:** Step 3 — RLSS spending tier selection
- **Personas affected:** Margaret (single, minimum), Patricia & James (couple, minimum)
- **Observation:** For single mode, default spend = £13.4k and clicking "Minimum" also = £13.4k. For couple mode, default = £21.6k and clicking "Minimum" = £21.6k. The selection appears to have no effect.
- **Evidence:**
  - `default spend before RLSS selection = "£13.4k"` → `spend after selecting minimum RLSS = "£13.4k"` (margaret)
  - `default spend before RLSS selection = "£21.6k"` → `spend after selecting minimum RLSS = "£21.6k"` (patricia-james)
- **Suggested priority rationale:** A new user clicking "Minimum" expects something to happen. The visual feedback (the card gets selected/highlighted) may update but the number doesn't change. This could make users think the click didn't register, leading to confusion about what the spending step is doing.

### BUG-016: No "building phase" or "accumulation" indicator for users still years from retirement
- **Affected feature:** Step 1 / Dashboard — planning horizon context
- **Personas affected:** Patricia (55, FI age 67 → 12 years), James (57, FI age 67 → 10 years)
- **Observation:** The app shows life stages starting at the FI age but provides no visual indicator that the user is currently in a "building phase" pre-FI. The FI age slider shows "Building phase: age 55 → 62" on slider labels in the screenshot spec, but the step 0 body text does not surface this.
- **Evidence:** `no "building phase" label visible — users 10+ years from retirement may not understand where they are in the plan`
- **Suggested priority rationale:** For users 10+ years from retirement (a large portion of the 50–75 target market who start planning early), the plan focuses entirely on the post-FI spending phases. There is no UI guidance on savings rate, contribution top-ups, or accumulation strategy in the pre-FI years.

### BUG-017: GIA base cost (CGT field) not visible on assets tab default view
- **Affected feature:** Step 4 (Income & Assets) — Assets tab, GIA section
- **Personas affected:** Raj (high net worth, CGT-aware user)
- **Observation:** When navigating to the assets tab, the GIA base cost field is not immediately visible — it may be in a collapsed section, below the fold, or requires enabling the GIA toggle first.
- **Evidence:** `base cost field not immediately visible for GIA — high-literacy users may need to scroll or expand`
- **Suggested priority rationale:** CGT-aware users (anyone with GIA > £3k gain) need to enter a base cost for accurate tax projections. If this field is hidden, users may miss it and receive incorrect CGT calculations.

---

## Known bug reconfirmed

### BUG-003 (reconfirmed): `undefined` / `NaN` rendered on dashboard with no income enabled
- All 5 personas triggered this — `raw JS value (NaN/undefined/[object Object]) visible on dashboard` — because the income toggle proximity selector could not enable income sources through the UI in this session. The raw value render confirms BUG-003 remains open.

---

## Infrastructure / Noise (not app bugs)

### Test-infra: State pension toggle not findable via proximity selector
- `page.getByText('State Pension').locator('..').locator('..').getByRole('switch')` does not find the toggle in the deployed app's DOM structure. This means income sources were not enabled in these tests, causing the £0 income dashboard results. Root cause: the income section likely has more nesting levels between the label and the toggle button than the selector assumes.
- **Impact on findings:** Dashboard observations for all personas are based on zero income/assets. The FI data (spending amounts, couple mode gap period, etc.) remain valid.
- **Suggested fix:** Use `getByRole('switch').nth(N)` with documented index map: DB(0), Annuity(1), StatePension(2), DC(3), PartTime(4), Other(5).

### Test-infra: 404 console errors
- Every test logs `Failed to load resource: the server responded with a status of 404` from `apiMocks` GET `/api/data → 404`. This is intentional test infrastructure (prevents device-approval modal) and is not an app bug. See BUG-007.

---

## Positive findings (working correctly across all personas)

| Feature | Observation |
|---------|------------|
| Life stage bar (Go-Go/Slo-Go/No-Go) | Visible on Life Vision step for all personas ✓ |
| RLSS tiers (moderate/comfortable) | Correct values: moderate £31.7k single, comfortable £43.9k single, £60.6k couple ✓ |
| Couple mode default spend scaled | Default £21.6k for couple vs £13.4k single ✓ |
| Gap period section | Visible for Helen & Robert (FI ages 63/65) ✓ |
| Income step section structure | State Pension, DB/Guaranteed, DC/Flexible all present ✓ |
| 6 income toggles | Correct count for 6 income sources ✓ |
| Assets tab labels | Cash, ISA, GIA all visible by default ✓ |
| Life stage FI age propagation | Age 67 referenced in life stages for Patricia & James ✓ |
| Per-person names on dashboard | Helen / Robert names visible for couple mode dashboard ✓ |
| Strategy section on dashboard | "Strategy" text visible for Raj's high-net-worth scenario ✓ |
| Raj FI age 57 acceptance | Life stages correctly start at 57 when FI age set to 57 ✓ |

---

## UX flow observations (not bugs, but design input)

1. **RLSS selection UX**: Default spend = minimum spend for both single and couple. Selecting "minimum" produces no visible number change. "Moderate" and "comfortable" do produce a visible jump (£13.4k → £31.7k → £43.9k for single). The UI may benefit from explicitly showing "You're currently at the minimum level" before the tier buttons.

2. **FI age slider default**: 67 (SPA) is a defensible default since most users targeting state pension age will start there. But users who are already past 60 or are already retired have to drag the slider significantly. A prompt or auto-suggest would reduce friction.

3. **Couple mode FI age labels**: The two FI age sliders in couple mode are both present but the text pattern "Financial independence" appears to occur only once in the body, suggesting the labels may be compact ("Alex / Jordan" prefix rather than repeating the heading). A high-literacy user would understand; low-literacy users may not realise there are two independent sliders.

4. **"Depleted at age XX" before FI age**: Since no income was enabled in these tests, every persona showed "Depleted at age [current age]" (e.g., "Depleted at age 56" for Raj who is 57). While this is a test artefact, it surfaces a real UX question: what message does the app show when assets are £0 and income is £0? The current message ("Depleted at age 56") is technically correct but could be alarming to a new user who has filled in step 3 incorrectly.
