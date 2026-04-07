# Product Prompt — Later-Life Planner

> Stored as required by engineering standards. This is the source specification for the build.

## Overview

You are an expert fintech software engineer and product designer.

You are building a Phase 1 MVP web application for a UK later-life lifestyle planning platform.

**Goal:** help users plan the life they want, define desired spending, and generate a tax-efficient income plan from their assets.

Avoid the term "retirement".

**User journey:** Life Vision → Spending Goals → Income Sources → Assets → Tax-Efficient Income Plan

Support single users or couples. Capture all income streams individually per person. For taxable assets, capture base cost for CGT calculation.

---

## UI / Design

- Modern, clean, friendly, slightly gamified UI
- Inspiration: life simulation dashboards, modern fintech dashboards
- Reference images are in /docs/ui-reference-images/ (do NOT copy exactly, just inspiration)
- Layout: card-based panels, visual controls, timeline views, interactive sliders, progress bars
- Avoid outdated 2000s Sims-style graphics

---

## Tech Stack

- **Frontend:** Next.js + React + TypeScript
- **Styling:** TailwindCSS
- **Charts:** Recharts or Chart.js
- **Icons:** Lucide or Heroicons
- **Backend:** Node.js API routes
- **Deployment:** Vercel compatible

---

## Engineering Standards

- No hardcoded financial values (tax allowances, thresholds, inflation, growth, RLSS values)
- Use central configuration system (e.g., /config/financialConstants.ts)
- Allow environment-driven configuration (NEXT_PUBLIC_DEFAULT_INFLATION, NEXT_PUBLIC_INVESTMENT_RETURN)
- Strong TypeScript typing for User, Person, IncomeSource, Asset, Property, SpendingCategory, LifeStage, ProjectionResult
- Modular architecture: /components, /charts, /config, /models, /services, /utils, /financialEngine, /tests, /docs
- Financial logic in /financialEngine only
- Reusable helpers for tax calculations, withdrawal sequencing, income aggregation, asset projections, inflation adjustments
- Inline documentation for all formulas, assumptions, purpose

---

## Unit Tests

- Use Jest or Vitest
- Test: tax calculations, withdrawal ordering, projection engine, CGT calculations, joint GIA drawdown
- Validate edge cases and calculation accuracy
- Tests stored in /tests/financialEngine.test.ts

---

## Git Workflow

- Use feature branch (e.g., feature/life-planning-mvp)
- Meaningful commit messages
- No direct commits to main

---

## Documentation

- Maintain README.md with project overview, architecture, configuration, calculation engine, setup instructions
- Store original build prompt in /docs/prompts/product_prompt.md
- UI reference images stored in /docs/ui-reference-images/

---

## Product Features

### Step 1 — Household Setup
- Single or Couple
- Each person captured individually (name, date of birth)
- **Financial independence age** (FI age): the age from which work becomes a choice, not a necessity.
  Language must reflect agency and options — avoid phrases like "when do you plan to stop working".
  Frame this as: "the age from which work is optional", "freedom phase", or "when you have the choice to step back".
  Life stages (Go-Go Years, Slo-Go Years, No-Go Years) are anchored to this age —
  they do NOT start from current age. The building phase (current age → FI age - 1) is
  still fully modelled in projections (income, asset growth) using Go-Go Years spending
  as a baseline. Default FI age: 65. FI age must be > current age and < life expectancy.

### Step 2 — Life Vision
- Capture life goals: travel, family, hobbies, learning, giving, property changes
- Represent visually using cards or tiles

### Step 3 — Spending Goals (today's money)
- Default to the PLSA **Minimum** standard on first load (single household).
- Primary UI: choose a UK Retirement Living Standard (Minimum / Moderate / Comfortable, single or couple).
  Selecting a standard scales all spending categories proportionally.
- **Advanced planning option** (collapsed by default): customise spending by category:
  - Essential (housing, food, utilities, transport, insurance, healthcare)
  - Lifestyle (travel, dining, hobbies)
  - Family & Giving (family support, charity, gifts)
  - Other (home improvements, major purchases, contingency buffer)
- Total spending updates dynamically. Benchmark bar and tier breakdown shown inside the advanced section.

#### Retirement Spending Smile
The existing three-stage spending model (Go-Go → Slo-Go → No-Go) is presented as the **Retirement Spending Smile**.
Research shows spending typically peaks in early active years and naturally declines — forming a smile-shaped curve.
The UI includes an explanatory panel communicating this concept, empowering users to spend more confidently
in early years knowing the model already accounts for natural decline. The spending line in the lifetime chart
is labelled **"Spending Smile"** rather than "desired spending".
No new spending mechanics are required — this is purely a framing and education layer over the existing model.

#### Care Reserve
An optional earmarked capital reserve for potential late-life care costs — separate from normal spending.
- Toggle to enable/disable. Configurable amount (default £100,000, range £0–£500,000).
- **Excluded from the normal drawdown waterfall** — never automatically drawn to cover spending shortfalls.
- **Grows at the portfolio investment growth rate** — it remains invested within the portfolio.
- Shown as a separate area in the asset chart (teal dashed line) and a separate callout card on the dashboard.
- `totalAssets` in projections excludes the care reserve so depletion logic fires correctly on spendable assets only.
- A separate `careReserveBalance` field in `YearlyProjection` tracks its growth over time.
- If no care costs arise, the reserve remains part of final portfolio value (inheritance/estate).
- Configuration: `CARE_RESERVE.DEFAULT_AMOUNT` and `CARE_RESERVE.MAX_AMOUNT` in `/config/financialConstants.ts`.

### Step 4 — Income Sources
- Individual capture per person
- Guaranteed income: State Pension, Defined Benefit Pension, Annuities
- Property income (owner: A/B/Joint)
- Investment assets:
  - Pension (DC): owner, current value, growth.
    - **Drawdown strategy: pure UFPLS (Uncrystallised Funds Pension Lump Sum)** — no upfront PCLS lump sum is taken.
      Each withdrawal is 25% tax-free and 75% taxable income, spread naturally over the drawdown period.
      This leaves the full pot invested and growing in the tax-sheltered pension environment for longer.
      Before State Pension starts, the 75% taxable UFPLS portion can typically be absorbed within the
      personal allowance (£12,570), making early draws tax-efficient or completely free of income tax.
    - The **Lump Sum Allowance (LSA)** of £268,275 per person (Finance Act 2024) caps total lifetime
      tax-free cash from pensions. The 25% tax-free portion of each UFPLS withdrawal accumulates against
      this limit. Once the LSA is exhausted, subsequent DC withdrawals are fully taxable.
      Tracked cumulatively per person in the projection engine. Defined in `/config/financialConstants.ts`
      as `PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE`.
  - ISA: owner, value, growth
  - GIA: owner (A/B/Joint), current value, base cost, growth. If joint, allow drawdown individually to optimise CGT per person
  - Cash savings: owner, balance

### Step 5 — Tax-Efficient Income Strategy
- Withdrawal order (tax-optimised):
  1. **DC pension via UFPLS up to personal allowance headroom** — the 75% taxable UFPLS portion fills any unused personal allowance before touching the ISA. This is the highest-priority draw when allowance capacity exists, because it costs 0% effective tax and preserves the ISA for later.
  2. **GIA up to annual CGT exempt amount** (£3,000/person) — crystallises gains tax-free and steps up the base cost. Only draws what is needed.
  3. **ISA** — fully tax-free.
  4. **Remaining GIA** — gains above the CGT allowance are now taxable.
  5. **Cash savings** — tax-free on withdrawal.
  6. **DC pension (remaining gap)** — any amount above the personal allowance is taxable at marginal rate.
- No more net spending is drawn than required to cover the year's spending; gross withdrawals may exceed the spending figure because tax is not spendable.
- Optimised for couples: both personal allowances and CGT allowances used before taxable income.
- All allowances sourced from `/config/financialConstants.ts`, not hardcoded.
- Required spending is an absolute net cash target. The engine must gross up withdrawals so the plan still delivers the required spendable income after tax. If a year cannot fully meet the target, surface the shortfall explicitly rather than treating the year as solved.

### Step 6 — Dashboard / Lifetime Timeline
- Visualisation of income sources, spending, assets by age
- **Income and spending display starts from the Financial Independence (FI) age**, not current age.
  The projection engine still models asset growth from current age (to track portfolio value correctly),
  but all charts, tables, and stat cards show only data from the FI age onward.
  This reflects that the planning horizon is the post-work period.
- Life stage timeline, spending bars, income stacks, asset projections, lifestyle indicators
- Gamified progress bars and interactive UI elements
- Timeline sliders to adjust spending/income dynamically

### Step 7 — Gamification
- Life goal progress bars
- Income stability meter
- Spending confidence indicator
- Timeline life stages

---

## Output Requirements

- Full project folder structure
- All code files
- Example mock data
- Clear setup instructions
- Maintainable, modular, and testable code
- Inline documentation for all financial calculations
- Unit tests for all core engines
- README with project overview, setup, architecture, assumptions
- Original prompt stored in /docs/prompts/product_prompt.md
- UI reference images in /docs/ui-reference-images/
