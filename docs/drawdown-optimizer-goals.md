# Drawdown Optimiser — Goals, Objectives and Flexibility Design

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-03
- Last reviewed: 2026-04-05
- Review cadence: Quarterly and on product strategy changes

---

## Purpose

This document defines the full set of goals a later-life drawdown optimiser should be capable of pursuing. Its primary purpose is to ensure the LLP engine is architected for **flexibility from the outset** — so that users can express their own priority order across multiple goals rather than being locked into a single hard-coded objective (e.g. tax minimisation).

It complements:

- `withdrawal-optimizer-mcp-design.md` — optimizer framing and solver design
- `hmrc-tax-mcp-integration-plan.md` — HMRC rule integration

---

## Core Design Principle

> LLP is a tool to optimise later-life drawdown for *user-defined goals in user-defined priority order*. The engine computes; the user chooses what matters most.

Tax efficiency is the most *calculable* goal but is rarely the most *important* one for a given household. A strategy that minimises lifetime tax but leaves a surviving spouse without independent income is a bad strategy. An optimizer that cannot express this trade-off is not fit for purpose.

Flexibility is therefore a first-class architectural requirement — not a future enhancement.

---

## Drawdown Strategy Goals

### Goal 1 — Longevity Protection *(avoid running out of money)*

**Description:** Ensure the plan does not exhaust assets before the planning horizon, typically set to life expectancy plus a margin.

**Why it matters:** This is the primary anxiety of later-life financial planning. A plan that optimises tax but fails at 87 has failed. All other goals are secondary to this unless explicitly overridden.

**Measurable objective:**
```
Depletion age > planning horizon (hard constraint by default)
P(depletion before horizon) < ε under scenario set Ω
```

**Key risks:**
- Longevity tail: living significantly beyond expected lifespan
- Sequence-of-returns: a market crash early in retirement (e.g. 62–65) forces sales at depressed prices and is never recovered; a crash at 80 has far less impact because the remaining pot is smaller
- Draw rate mismatch: spending path grows faster than investment returns

**Strategy implications:**
- Sequencing risk management: draw liquid/stable assets first in down-market years; let growth assets (DC/equities) recover
- Maintain a floor of guaranteed income (SP + DB + annuity) that covers essential spending regardless of market conditions
- Set a conservative upper bound on draw rate; never withdraw beyond the plan's sustainable rate

---

### Goal 2 — Spending Floor Guarantee *(essential needs met under any scenario)*

**Description:** Essential spending (housing, food, utilities, healthcare, insurance) must be guaranteed regardless of market conditions or longevity. Aspirational spending (travel, hobbies, gifts) can flex.

**Why it matters:** The distinction between essential and aspirational spending is the foundation of resilient decumulation. If essential needs are met by guaranteed income, the rest of the plan can take appropriate investment risk.

**Measurable objective:**
```
P(essential_spending_met[t]) = 1.0 for all t in [FI_age, horizon]
```

**Key mechanism — liability matching:**
- Match guaranteed income streams (SP, DB pension, annuity) to essential spending
- If guaranteed income > essential spending: surplus flows into aspirational budget
- If guaranteed income < essential spending: bridge gap with lowest-risk liquid assets (cash, ISA) not growth assets (DC)
- Only draw from growth assets (DC pension, GIA equities) for aspirational spending

**Data required from user:**
- Spending categorised by tier: `essential | aspirational` (LLP already has `tier` field in spending categories)
- Guaranteed income sources: SP, DB, annuity start ages and amounts

---

### Goal 3 — Aspirational Spending Achievement *(fund the retirement you planned)*

**Description:** Beyond essential floor, fund the aspirational lifestyle (travel, hobbies, family support, experiences) as fully as possible across the retirement horizon.

**Why it matters:** Most retirees significantly underspend relative to what their assets could support — not because they can't afford it, but because they fear running out. A well-calibrated plan gives permission to spend.

**Measurable objective:**
```
Maximise P(aspirational_spending_met[t]) for all t in [FI_age, slo_go_end]
Subject to: longevity constraint satisfied, essential floor guaranteed
```

**Strategy implications:**
- Go-Go years (60–70) are the highest-value spending window: good health, high mobility
- Underspending in Go-Go to "preserve assets" is a common regret; the optimizer should surface this explicitly
- Life-stage spending profiles (Go-Go / Slo-Go / No-Go) must be user-configurable, not hard-coded

---

### Goal 4 — Tax Efficiency *(minimise lifetime tax paid)*

**Description:** Among strategies that satisfy goals 1–3, prefer the one that minimises total tax paid over the planning horizon.

**Why it matters:** Tax is the one leakage from a retirement plan that can be systematically reduced with the right strategy. For a couple with large DC pots, poor ordering of withdrawals can cost £30,000–£100,000 in unnecessary tax over 35 years.

**Measurable objective:**
```
Minimise Σ_t (income_tax[t] + CGT[t])
Subject to: goals 1–3 satisfied
```

**Key mechanisms (from combined-strategy analysis):**
- **DC split between partners:** After state pensions fill both Personal Allowances, drawing DC from one person only pushes them into the higher-rate band. Equal splitting keeps both in the basic-rate band and saves ~£430/year × 20+ years = £8,600+
- **GIA CGT harvesting:** Annual CGT exempt (£3,000 per person) is use-it-or-lose-it. Crystallising gains up to the exempt amount before ISA each year steps up the cost base at zero tax cost
- **UFPLS within Personal Allowance:** Each DC withdrawal is 25% tax-free / 75% taxable. Drawing just enough to fill the PA generates 0% effective income tax on that portion
- **ISA timing:** ISA is always tax-free but the right time to draw depends on what else is available — it should be drawn after DC-within-PA and GIA-within-exempt, not before

**HMRC rule dependency:** Tax efficiency goals must be computed using authoritative, versioned HMRC rules from `hmrc-tax-mcp`, not hardcoded constants that go stale each April.

---

### Goal 5 — Flexibility and Liquidity Preservation *(keep options open)*

**Description:** Preserve access to liquid, flexible assets for unplanned events: care costs, health shocks, lump-sum needs, family support.

**Why it matters:** Later life is unpredictable. A strategy that is tax-optimal but concentrates all remaining wealth in illiquid DC pension by age 80 is fragile. The ISA wrapper is uniquely valuable: no tax, no compulsory withdrawal, accessible at any time.

**Measurable objective:**
```
Maintain liquid_assets[t] >= flexibility_reserve  for all t in [FI_age, care_risk_age]
Where liquid_assets = ISA + cash + accessible GIA
Where flexibility_reserve = user-defined or system default (e.g. 2× essential annual spending)
```

**Asset liquidity tiers:**
| Tier | Assets | Characteristics |
|---|---|---|
| Immediately liquid | Cash, current account | Zero growth; no tax |
| High liquidity | ISA | Tax-free growth; no withdrawal tax; no minimum age |
| Accessible | GIA | Taxable gains on disposal; no minimum age |
| Accessible with tax | DC pension (UFPLS) | 75% taxable; accessible from 57 (rising to 58 in 2028) |
| Illiquid until event | Property | Requires sale or equity release; transaction costs |

**Strategy implications:**
- Preserve ISA balance as the primary liquidity reserve; draw GIA and DC before ISA where tax allows
- A care reserve (e.g. £150K–£300K) should be ring-fenced and excluded from spending draws unless explicitly unlocked

---

### Goal 6 — Couple Survivorship Resilience *(protect the surviving partner)*

**Description:** Ensure the surviving partner can maintain financial independence after the first death, accounting for the loss of one State Pension and any reduction in DB pension income.

**Why it matters:** Survivor income shocks are one of the most underestimated risks in couple planning. The survivor typically loses one SP, loses 50% of a partner's DB pension, faces higher fixed costs as a single household, and is taxed as a single person (Personal Allowance not doubled).

**Measurable objective:**
```
For each person p in {P1, P2}:
  income_if_p_dies[t] >= essential_spending[t] * survivorship_ratio
  for all t in [FI_age, horizon_p2]
Where survivorship_ratio = user-defined (e.g. 0.80)
```

**Strategy implications:**
- Do not deplete one partner's DC/ISA aggressively while the other's remains large — the smaller pot may be the survivor's primary income source
- Lisa's DC (£234K) vs Paul's DC (£1.3M): drawing Lisa's first may leave her vulnerable if Paul dies at 75
- Joint GIA passed outside pension can fund the survivor's immediate cash needs
- Run survivorship scenarios as a standard output: "If Paul dies at 75, Lisa's income is £X from guaranteed sources, £Y from remaining assets"

---

### Goal 7 — Inflation Resilience *(maintain real spending power)*

**Description:** Ensure spending power in real terms does not erode significantly over a 35-year retirement under realistic inflation scenarios.

**Why it matters:** At 2.5% inflation, £66,000 in today's money requires £135,000 in nominal terms at Paul's age 85. A plan funded primarily by fixed-rate assets (cash, fixed annuity, fixed DB) loses real purchasing power. Growth assets (DC, ISA in equities) are needed to offset this — but they add volatility.

**Measurable objective:**
```
real_spending[t] / real_spending[FI_age] >= inflation_floor  for all t
Where inflation_floor = user-defined (e.g. 0.85 — accept up to 15% real reduction)
```

**Strategy implications:**
- Growth assets must remain a significant part of the portfolio throughout retirement, not just pre-retirement
- The "bond tent" or "glide path" approach (reduce equity exposure gradually over retirement) helps manage both inflation risk and sequencing risk
- Inflation-linked annuities provide guaranteed real income but at a significant upfront cost

---

### Goal 8 — Bequest and Inheritance Tax Efficiency *(leave what you choose to leave)*

**Description:** Where the user has a bequest motive, structure drawdown to maximise the after-IHT estate passed to beneficiaries.

**Why it matters:** The 2027 pension IHT reform changes the analysis fundamentally. DC pensions (currently outside the estate) will be brought into scope. ISA balances are in-estate but grow tax-free for the holder. GIA is in-estate and taxed on disposal.

**Current position (pre-April 2027):**
- DC pension: outside estate → draw ISA/GIA first; let DC grow and pass IHT-free
- ISA: inside estate at death → draw ISA before GIA if no bequest motive; preserve GIA for step-up cost base

**Post-April 2027 (pension IHT reform):**
- DC pension: inside estate at 40% above NRB → the former advantage is eliminated
- Optimal order changes significantly; may favour drawing DC earlier and giving from ISA/GIA
- Requires a jurisdiction-aware, year-aware rule engine (another reason HMRC MCP matters)

**Measurable objective:**
```
estate_value_after_IHT[death_age] >= bequest_target
Subject to: all other goals satisfied
```

**User inputs required:**
- Bequest motive: yes / no
- Target estate value (or "maximise remainder")
- Named beneficiaries and their tax position (relevant for IHT planning)

---

### Goal 9 — Healthcare and Care Cost Resilience *(fund long-term care if needed)*

**Description:** Ring-fence assets sufficient to fund residential or domiciliary care if required in later life, without disrupting the rest of the drawdown plan.

**Why it matters:** UK residential care costs £50,000–£100,000 per year. The average duration is 2–3 years, but significant tail risk exists (5–10 years for dementia). Social care is means-tested: assets above ~£23,500 are not state-funded. Most people assume the NHS will cover care; it does not.

**Measurable objective:**
```
care_reserve[care_risk_age] >= care_cost_estimate
Where care_risk_age = typically 80+ (configurable)
Where care_cost_estimate = user-defined or default (e.g. £150,000 per person)
```

**Strategy implications:**
- Care reserve should be held in liquid, accessible assets (ISA preferred — no withdrawal tax when needed urgently)
- The reserve is excluded from spending draws unless explicitly unlocked by the user
- Care costs trigger a life-stage change: No-Go spending profile plus care premium
- LLP already has a `careReserve` field in the plan model; this goal formalises its integration into the optimizer

---

### Goal 10 — Behavioural Sustainability *(a plan the user will actually follow)*

**Description:** The optimal strategy is the one the user will stick to, not the one that is theoretically optimal on paper. Complexity, volatility, and frequent active decisions increase the risk of abandonment.

**Why it matters:** The biggest risk in retirement drawdown is not a suboptimal tax choice — it is the user panic-selling equities in a crash, spending too much in the Go-Go years because the plan is unclear, or doing nothing because the optimal action requires too much cognitive effort.

**Design implications (not a numeric objective):**
- Strategies should be explainable in plain English: "Draw £15,000 from your DC each year until state pension starts; then draw from both equally"
- Fewer, larger draws beat many small ones (less decision fatigue)
- Stable, predictable "income" framing beats volatile "withdrawals" framing — even if mathematically equivalent
- The LLM explanation layer is not a nice-to-have; it is essential for behavioural sustainability
- Cognitive decline at 75–80 makes simplification increasingly important: fewer accounts, more automation, guaranteed income preference

---

## Objective Hierarchy and Priority Stack

The optimizer must apply goals in a strict priority order. Lower-priority goals are only optimised once all higher-priority constraints are satisfied.

```
Priority 1 (hard constraint):
  Essential spending met every year, no exceptions
  → P(essential_spending_met) = 1.0

Priority 2 (hard constraint):
  Depletion age > planning horizon
  → P(assets_exhausted_before_horizon) < ε

Priority 3 (hard constraint, user-configurable):
  Care reserve preserved
  → liquid_assets[care_risk_age] >= care_reserve_target

Priority 4 (hard constraint, user-configurable):
  Survivorship floor maintained
  → survivor_income >= survivorship_floor

Priority 5 (soft constraint, optimise subject to 1–4):
  Aspirational spending achieved as fully as possible
  → maximise P(aspirational_spending_met)

Priority 6 (optimisation target, subject to 1–5):
  Lifetime tax minimised
  → minimise Σ_t (income_tax[t] + CGT[t])

Priority 7 (secondary optimisation, subject to 1–6):
  Bequest / estate value
  → maximise estate_value_after_IHT[horizon] given bequest preference
```

Users may unlock or reweight any priority:

- A user with no bequest motive removes goal 7
- A user who prioritises experiences in the Go-Go years may raise goal 5 above goal 6
- A user with a long-term care insurance policy may reduce or remove goal 9

---

## Flexibility Architecture Requirements

To support this goal framework, the optimizer engine must be designed with the following properties:

### 1. Goal registry
Goals are registered, not hardcoded. Each goal has:
- A type (`hard_constraint | soft_constraint | optimise_target`)
- A priority rank (user-adjustable)
- A measurement function (pure function of state, rules, year)
- A violation penalty or objective weight

### 2. Parameterised withdrawal policy
The optimizer searches over policy parameters, not individual year-by-year draws. Policy parameters include:
- DC split mode per life stage (paul-first / equal / proportional / lisa-first)
- GIA harvest target (opportunistic / proactive / none)
- ISA timing (now / defer)
- Care reserve protection level
- Aspirational spending flex budget (% reduction allowed in bad years)

### 3. Scenario set
The optimizer evaluates each candidate policy across a scenario set, not a single deterministic path. Minimum scenario set:
- Base case (4% growth, 2.5% inflation)
- Conservative markets (2% growth, 2.5% inflation)
- Inflation shock (4% growth, 4% inflation)
- Sequence-of-returns shock (−20% at year 3, then base case)
- Longevity extension (planning horizon extended to 100)

### 4. HMRC rule versioning
Every tax calculation is year-and-jurisdiction-aware, sourced from the `hmrc-tax-mcp` rule snapshot. No constants are hardcoded. Rules are regenerated each tax year via CI.

### 5. Explanation layer
Every optimizer output is accompanied by a plain-English explanation that:
- States which goal drove the recommendation
- Quantifies the benefit (e.g. "£34,066 lifetime tax saving")
- Explains the action in concrete terms (e.g. "Split DC withdrawals equally between you and your partner from April 2036")
- Flags any trade-offs accepted (e.g. "Lisa's ISA balance is lower at 80; flexibility reserve may be needed")

---

## Current State vs Target State

| Capability | Current (MVP) | Target (Optimizer) |
|---|---|---|
| Withdrawal ordering | Fixed waterfall (one strategy) | 5+ parameterised candidates evaluated per year |
| Tax rules | Hardcoded constants (one tax year) | HMRC MCP snapshot (multi-year, versioned, auditable) |
| Scenario analysis | Single deterministic path | 5+ scenarios including sequence-of-returns |
| Goals | Implicitly: avoid depletion + rough tax efficiency | Explicit goal registry with user-defined priority |
| Couple optimisation | Paul draws DC first | Optimal split evaluated per year |
| Survivorship modelling | Not modelled | Survivor income scenarios as standard output |
| Care cost modelling | Reserve field (no optimizer integration) | Ring-fenced reserve, excluded from spending draws |
| Bequest modelling | Not modelled | Estate projection with IHT, post-2027 pension reform |
| Explanation | None | LLM-generated plain-English rationale per recommendation |
| Behavioural support | None | Stable income framing, simplified action list, cognitive-decline progression |

---

## Tax Efficiency Analysis — Quantified Results

The following results were computed from Paul and Lisa's plan (`lifeplan.json`) using the proof-of-concept optimizer (`scripts/combined-strategy.ts`):

| Metric | LLP Waterfall | Combined Optimizer | Saving |
|---|---|---|---|
| Lifetime tax (35 years) | £461,810 | £427,744 | **£34,066 (7.4%)** |
| Go-Go tax (60–70) | £43,182 | £39,860 | £3,322 |
| Slo-Go tax (71–80) | £128,303 | £120,935 | £7,368 |
| No-Go tax (81–95) | £290,325 | £266,949 | £23,375 |

**Dominant strategy:** Equal DC split between Paul and Lisa (10 of 35 years). Wins every year after both state pensions are in payment because it prevents Paul tipping into the 40% higher-rate band.

**Root cause of LLP waterfall suboptimality:** Paul draws all above-PA DC by default. After SP starts (Paul 67), his taxable income reaches £52,424 — £2,154 above the £50,270 basic-rate limit — incurring 40% on the excess. Equal split keeps both partners at ~£34K taxable: fully basic-rate.

This is goal 4 (tax efficiency) in isolation. The saving grows further once goals 5–7 are incorporated (care reserve, survivorship, bequest).

---

## Architecture: Static vs Dynamic

A critical design question is whether the optimizer relies on statically baked rules or a dynamic architecture driven by live MCP rule data and LLM/RAG-based analysis. The answer is: **it depends on the layer**. Each of the four layers has a different optimal point on the static–dynamic spectrum.

### The Four Layers

#### Layer 1 — Tax Rules
*Source of HMRC thresholds, rates, and exemptions*

| | Current (proof of concept) | Phase 1 (planned) | Target |
|---|---|---|---|
| Source | Hardcoded constants in TypeScript | `gen-tax-snapshot.ts` → `taxRuleSnapshot.ts` at build time | hmrc-local MCP, called at build time and on audit request |
| Freshness | Stale until a developer manually updates | Auto-refreshed in CI each tax year | Versioned, citable, regenerated on rule-set changes |
| Who calls MCP? | Developer, manually during session | CI pipeline | CI pipeline + API route for audit traces |
| Latency impact | None | None | Cached — near zero for browser-side simulation |

**Target:** Build-time snapshot for the projection engine (keeps browser-side zero-latency) plus live MCP call in the API route for audit traces and the explanation endpoint. Not fully static, not fully dynamic — **refresh-at-build with live audit fallback**.

#### Layer 2 — The Optimizer Core
*Evaluates candidate strategies, selects the lowest-cost feasible option*

This layer **must stay deterministic and rule-based**. It must not involve an LLM in the hot path.

```
optimizeWithdrawals(state, taxRules) → OptimizationResult

  ← Pure function
  ← No network calls
  ← No LLM in the calculation path
  ← Runs in the browser at zero latency
  ← Fully auditable: same inputs → same output, every time
```

This is a firm design principle established in `withdrawal-optimizer-mcp-design.md`:

> *"An AI model should not be the source of truth for tax calculations, policy constraint enforcement, optimization scoring, or auditability."*

An LLM computing tax is unpredictable, hallucination-prone, and cannot be independently verified by a regulator or auditor. The optimizer must be a deterministic engine fed by authoritative rule data.

#### Layer 3 — LLM / RAG Explanation
*Explains, contextualises, and personalises the recommendation in plain English*

This layer **should be fully dynamic** — called at request time, using live MCP rule citations and RAG-retrieved regulatory context.

```
POST /api/optimizer-explain

  1. API route receives OptimizationResult + PlanSummary
  2. Fetches relevant HMRC rule excerpts from hmrc-local MCP
     (e.g. DSL source for income_tax_bands, cgt_exempt, ufpls)
     ← MCP call: live, versioned, citable
  3. Retrieves regulatory context via RAG
     (HMRC internal manuals: PTM, IHTM, CG, PIM, IPTM, EIM, SAIM, SDLTM —
      indexed, chunked, and stored in Azure Cosmos DB `hmrc-chunks` container;
      each chunk is tagged with the `rule_id` values it governs via `citation_map.json`)
     ← MVP retrieval: Cosmos DB native vector search
       (DiskANN index on `/embedding` — text-embedding-3-large, 3072 dims; zero extra infra)
     ← Future upgrade: Azure AI Search S1 — adds semantic re-ranker for higher-quality
       results on natural-language financial queries; ~£250/month vs ~£10–20 for Cosmos DB
     ← Note: also covers forthcoming regulatory changes (e.g. 2027 pension IHT reform)
  4. Calls Anthropic with:
     - structured optimizer result (deterministic)
     - live HMRC rule citations (from MCP)
     - RAG-retrieved regulatory context
     - user's plan summary and stated goals
  5. Streams back plain-English explanation
     ← LLM role: explain and contextualise only
```

The LLM's role is strictly to **explain and contextualise** using authoritative rule data retrieved live. It does not compute, decide, or score.

#### Layer 4 — Goal Orchestration
*Decides which goals to pursue and in what priority order, based on user preferences*

This is the most dynamic layer and the one least built today. It is also the most differentiating.

```
User expresses preferences (natural language or structured UI):
  "I care most about: leaving something for my children,
   not running out of money, funding care if needed,
   and tax efficiency is nice but not the priority."

LLM orchestrator:
  ← Parses goal priority from user input
  ← Maps to structured GoalRegistry config
  ← Retrieves relevant regulatory context (IHT reform, care funding rules)
  ← Calls optimizer with that goal stack
  ← Interprets results against user's stated priorities
  ← Explains trade-offs in the user's own language
```

This is the genuine RAG + LLM layer. The model must understand the user's life situation, relate it to current and forthcoming regulation (e.g. pension IHT reform implications for their estate size), and configure the optimizer accordingly. No part of this is built yet.

### Architecture Spectrum Summary

```
STATIC ◄─────────────────────────────────────────────────────► DYNAMIC

Layer 1 — Tax Rules:
  [NOW: fully static]──────────[TARGET: build-time snapshot + live audit]

Layer 2 — Optimizer Core:
  [NOW: static scripts]──[TARGET: stays deterministic, rules from snapshot]

Layer 3 — LLM Explanation:
  [RAG corpus: LIVE in Cosmos DB]────[TARGET: fully dynamic, MCP + RAG]
                                    (API endpoint: not yet built)

Layer 4 — Goal Orchestration:
  [NOW: not built]────────────────────────────[TARGET: LLM-driven, dynamic]
```

### What the Fully Dynamic Architecture Looks Like

```
User → LLP UI
         │
         ▼
   Goal Orchestrator (LLM)
         │  ← reads user goals and plan state
         │  ← retrieves HMRC rules via hmrc-local MCP (live, versioned)
         │  ← retrieves regulatory context via RAG
         │    (IHT reform, triple-lock, care funding rules, etc.)
         │
         ▼
   Optimizer Engine (deterministic TypeScript)
         │  ← receives: state + goal config + hydrated tax rules
         │  ← returns: OptimizationResult (fully auditable)
         │
         ▼
   Explanation Generator (LLM)
         │  ← receives: OptimizationResult + HMRC citations + user goals
         │  ← returns: plain-English rationale + concrete action list
         │
         ▼
   User sees:
     "Draw £23,992 from both your DC pots equally from April 2036.
      This saves £34,066 over your retirement by keeping you both
      in the basic-rate band. HMRC income tax bands confirmed for
      2025-26 to 2030-31 (income_tax_bands v2.0.0, hmrc-local).
      Note: the 2027 pension IHT reform means your DC pot will be
      brought into your estate — we'll revisit your drawdown order
      when that change takes effect."
```

**The rules are live and versioned. The optimizer is deterministic. The LLM explains and configures. That is the target architecture.**

### Current Gap

| Layer | Built | Gap |
|---|---|---|
| Tax rules | Constants embedded in proof-of-concept scripts | Need `gen-tax-snapshot.ts` + live MCP audit route |
| Optimizer core | Working in `scripts/combined-strategy.ts` | Needs porting to `src/financialEngine/withdrawalOptimizer.ts` |
| LLM explanation | RAG corpus live in Cosmos DB (8 HMRC manuals, DiskANN vector search); `POST /api/optimizer-explain` endpoint not yet built | Build API route wiring Anthropic + MCP citations + Cosmos DB vector retrieval (MVP); upgrade to Azure AI Search S1 for semantic re-ranking when quality matters |
| Goal orchestration | Not built | Needs goal registry + LLM orchestration layer |

The build-time snapshot (Phase 1 HMRC work) closes the Layer 1 gap. Layers 3 and 4 are the genuine product innovation — and the most differentiating capability LLP can deliver.

---

## Next Steps

1. **Phase 1 (prerequisite):** HMRC tax rule snapshot generation — `scripts/gen-tax-snapshot.ts` → `src/config/taxRuleSnapshot.ts`. Unblocks all subsequent phases.

2. **Phase 2:** Port `scripts/combined-strategy.ts` to `src/financialEngine/withdrawalOptimizer.ts`. Implement the goal registry (goals 1–4 minimum). Unit tested.

3. **Phase 3:** Store integration and `OptimizerPanel` UI in Step 4 Dashboard. Show lifetime tax saving and strategy recommendation.

4. **Phase 4:** LLM explanation via `POST /api/optimizer-explain`. Plain-English rationale, concrete action list.
   RAG data layer is **live** (8 HMRC manuals in Azure Cosmos DB `hmrc-chunks`, citation metadata in `citation_map.json`).
   Remaining work: build the API route in LLP to wire Anthropic + MCP rule citations + Cosmos DB RAG retrieval.

5. **Phase 5:** Scenario set integration. Evaluate each candidate policy across 5 scenarios. Surface depletion probability and robustness metrics.

6. **Phase 6:** Full goal registry. Add goals 5–10 (survivorship, care, bequest, inflation, behavioural). User preference UI for goal priority.
