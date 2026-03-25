# Later Life Planner (LifePlan)

A UK later-life planning tool for people aged 50–75. Aspiration-first: define the life you want, then see how your income and assets can fund it.

Built with Next.js 14, TypeScript, TailwindCSS, and Recharts.

This repo includes authenticated, encrypted plan persistence:

- Clerk sign-in/sign-up for authenticated sessions.
- Encrypted plan storage in Azure Cosmos DB (server stores ciphertext only).
- Browser-side encryption/decryption and device-to-device key approval when signing in on a new device.

---

## What it does

A five-step wizard that takes you from life vision to a full lifetime financial dashboard:

**Step 1 — Household Setup**
Choose individual or couple mode. Capture names, current ages, and financial independence (FI) age — the age from which work becomes optional.

**Step 2 — Life Vision**
Set your later-life aspirations and define up to three life stages (Go-Go Years, Slo-Go Years, No-Go Years) with age boundaries and spending multipliers for each stage.

**Step 3 — Spending Goals**
Set target annual spending in today's £. Choose a starting point from UK Retirement Living Standards (PLSA 2024), then refine by category:

| Household | Minimum | Moderate | Comfortable |
|-----------|---------|----------|-------------|
| Single    | £13,400 | £31,700  | £43,900     |
| Couple    | £21,600 | £43,900  | £60,600     |

21 spending categories across four tiers: Essential, Enjoyment, Aspirational, and Life-Stage/Variable.

**Step 4 — Income & Assets**
Capture all income streams and assets per person. A guided setup wizard is available for first-time users. Income sources:

- State Pension (weekly forecast amount, start age)
- DB pension (annual income, start age)
- Annuity (annual income, start age)
- DC pension (pot value, growth rate)
- Part-time work (annual income, stop age)
- Other income (trusts, gifts, fixed-term income)

Assets per person: Cash savings, ISA, General Investments / GIA (value + base cost for CGT), Property (value, rental income, base cost). Plus a joint GIA (couple mode only) and an optional Care Reserve earmarked for late-life costs.

**Step 5 — Lifetime Dashboard**
A full projection from FI age to life expectancy showing:
- Income vs spending chart (stacked bars by source + spending line)
- Asset balance trajectory
- Key metrics: total assets at FI, projected surplus/depletion age, lifetime tax, tax-free years, effective tax rate
- Simplified tax-efficient withdrawal strategy panel
- Year-by-year projection table (income, tax, net income, total assets)

---

## Tax modelling

All tax is modelled per person. UK-specific figures live in `src/config/financialConstants.ts`.

### Income Tax

- Personal allowance: £12,570
- Basic rate: 20% on income £12,571–£50,270
- Higher rate: 40% on income above £50,270

### Capital Gains Tax

- Annual exempt amount: £3,000 per person (2024/25)
- Basic-rate taxpayers: 18% on gains above the exempt amount
- Higher-rate taxpayers: 24% on gains above the exempt amount
- Proportional disposal method: gains calculated as `drawn × (value − baseCost) / value`; base cost reduced proportionally on each withdrawal

### DC Pension — UFPLS strategy

Each drawdown uses the Uncrystallised Funds Pension Lump Sum (UFPLS) method:
- 25% of each withdrawal is tax-free
- 75% is taxable as income in the year of withdrawal
- The 25% tax-free portion accumulates against the Lump Sum Allowance (LSA: £268,275 per person lifetime cap). Once exhausted, DC withdrawals become fully taxable.

UFPLS is preferred over a one-off PCLS lump sum because it leaves the full pot invested and tax-sheltered for longer, and the 75% taxable portion can be absorbed within the personal allowance in pre-State-Pension years.

### Drawdown waterfall

The engine applies this order each year to fund the spending gap after fixed income:

1. **DC within personal allowance** — UFPLS up to the point where the 75% taxable portion fills remaining personal allowance headroom (accounts for DB, other income, and State Pension already using the allowance). Effective tax rate: 0%.
2. **GIA within per-person CGT budget** — individual GIA drawn first, then joint GIA, capped so each person's total capital gain stays within their £3,000 annual exempt. The CGT exempt is use-it-or-lose-it: drawing GIA here steps up the base cost at zero tax cost each year.
3. **ISA** — fully tax-free, drawn after the GIA CGT-free slice to ensure the annual exempt is always utilised while GIA gains exist.
4. **Remaining GIA** — any further GIA needed; gains above the CGT exempt are taxable.
5. **Cash savings** — tax-free withdrawal.
6. **DC above personal allowance** — further DC if all other sources are exhausted; taxed at marginal income tax rate.

### Per-person CGT budget coordination (joint GIA)

For couples with a joint GIA, capital gains are split 50/50. Individual GIAs are drawn first, reducing each person's remaining CGT budget. The joint GIA is then capped by `min(p1RemainingBudget, p2RemainingBudget) × 2`, ensuring neither person inadvertently exceeds their £3,000 exempt amount from the combination of individual and joint GIA draws.

### Gross-up iteration

Tax is not known until the gross withdrawal amount is known, which depends on the tax. The engine converges this with up to four iterations:

```
grossTarget₀ = spending
grossTargetₙ₊₁ = spending + taxFromIterationₙ
```

Converges in 2–3 passes. When ISA or Cash cover the extra tax draw, convergence is exact in a single extra iteration.

### State Pension sole-income exemption

Per UK government policy, State Pension is not taxed when it is the person's only income source in a year (configurable via `statePensionSoleIncomeExempt` assumption).

---

## Tech stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 14 (App Router)             |
| Language    | TypeScript                          |
| Styling     | TailwindCSS                         |
| Charts      | Recharts                            |
| State       | Zustand                             |
| Auth        | Clerk                               |
| Storage     | Azure Cosmos DB                     |
| Crypto      | Web Crypto (browser-side)           |
| Deployment  | Azure Container Apps                |

---

## Getting started

Create a local env file based on `.env.example` (Clerk and Azure persistence are optional for local-only work).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
```

---

## Encrypted sync and conflicts

- The app saves an encrypted planner blob for each user (ciphertext + metadata). The server never decrypts planner content.
- Saves use a `revision` for optimistic concurrency. If the server returns a revision conflict (HTTP 409), sync pauses and the UI prompts you to **Reload remote**.

---

## Device-to-device key approval (new device sign-in)

If you sign in on a new browser/device that does not have the local encryption key, the app will prompt for an approval from an already-authorized device.

High level:

- The new device registers a per-device public key with the server and shows an approval link/code.
- An authorized device approves by wrapping the user DEK to the new device (HPKE), then stores the wrapped package for pickup.
- The new device unwraps the DEK locally and can decrypt the remote plan.

---

## Project structure

```
src/
  app/                        # Next.js App Router (layout, page, globals.css)
  components/
    steps/                    # Step1HouseholdSetup, Step1LifeVision, Step2SpendingGoals,
    │                         #   Step3IncomeSources, Step4Dashboard
    charts/                   # LifetimeChart, AssetChart (Recharts)
    ui/                       # Card, Toggle, CurrencyInput, SliderInput, ConfirmModal
    GuidedSetupWizard.tsx     # First-time setup wizard for income & assets
    Header.tsx
    StepIndicator.tsx
    SummaryBar.tsx            # Sticky bottom bar with live spend/income/gap
    DisclaimerGate.tsx
  config/
    financialConstants.ts     # All UK tax rates, RLSS standards, pension rules, defaults
  financialEngine/
    projectionEngine.ts       # Core year-by-year projection loop and drawdown waterfall
    taxCalculations.ts        # Income tax, CGT, UFPLS helpers
  hooks/
    usePlanSync.ts            # Authenticated load/decrypt/hydrate + debounced encrypt/save
  lib/
    cosmos.ts                 # Cosmos DB persistence layer (ciphertext only)
    crypto.ts                 # Planner blob encryption helpers (browser-side)
    rateLimit.ts              # In-memory rate limiting (server runtime)
  models/
    types.ts                  # All TypeScript interfaces (PlannerState, YearlyProjection, …)
  store/
    plannerStore.ts           # Zustand store with persist middleware
```

---

## Financial constants

All UK-specific values (tax rates, allowances, pension rules, RLSS standards) are centralised in `src/config/financialConstants.ts`. Update this file annually when HMRC/DWP figures change — no other file needs editing for tax-year updates.

---

## Deployment

This app is designed to run on Azure Container Apps with managed identity access to Cosmos DB (and a reserved Key Vault for future envelope-key integration).

See the current reference architecture and operational notes in:

- `docs/auth-plan.md`
- `docs/storage-plan.md`
- `docs/security-decisions.md`
- `docs/azure-architecture.md`
