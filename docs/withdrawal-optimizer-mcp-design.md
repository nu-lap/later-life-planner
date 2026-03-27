# Withdrawal Optimizer and MCP Design

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Last reviewed: 2026-03-27
- Review cadence: Quarterly and on optimizer-architecture changes

This document captures the current assessment of the later-life-planner withdrawal engine and the proposed next-step architecture for a tax-aware optimizer exposed through an MCP server.

## Problem Statement

The current app uses a deterministic, hardcoded withdrawal waterfall to fund a spending target. That is appropriate for the MVP, but it is not a true optimizer and cannot compare alternative withdrawal policies against multiple objectives.

The key correction for this product is:

- spending requirements are determined outside the financial engine
- the engine is not choosing how much to spend
- the engine is choosing how to fund a required spending path

That means the optimization problem is not "spend less efficiently". It is:

1. meet the externally defined spending requirement
2. minimize probability of depletion while doing so
3. minimize lifetime tax among strategies with acceptable depletion risk

"Maximize sustainable post-tax spending" remains important, but it should be treated as a separate analysis mode rather than the default planner objective.

## Current Engine Assessment

The current engine is a fixed yearly waterfall, not an optimizer.

Relevant code:

- `src/financialEngine/projectionEngine.ts`
- `src/financialEngine/taxCalculations.ts`
- `src/config/financialConstants.ts`
- `tests/integration/drawdownWaterfall.test.ts`
- `src/components/steps/Step4Dashboard.tsx`

### What the current approach does well

- deterministic and easy to test
- fast enough for browser-side use
- auditable withdrawal ordering
- clear coupling between engine behavior and UI explanations
- good MVP fit for a simplified UK planning model

### What the current approach actually is

The engine uses a hardcoded strategy ordering inside the projection loop:

1. DC pension within personal allowance
2. GIA within annual CGT budget
3. ISA
4. remaining GIA
5. cash
6. DC pension above personal allowance

This is implemented directly in `src/financialEngine/projectionEngine.ts` and is also baked into tests and user-facing explanatory copy.

### Main limitation

The system evaluates one strategy path only. It does not search over alternative strategies and therefore cannot answer questions like:

- is a different wrapper preservation policy better?
- should the household crystallize more or less CGT now to reduce later tax?
- what is the depletion-risk impact of preserving the pension longer?
- which strategy best funds the same spending path across adverse return scenarios?

## Current Model Limitations

The main blocker is not just hardcoded constants. It is a simplified financial and tax domain model.

### Simplified tax model

Current simplifications include:

- tax constants manually embedded in `src/config/financialConstants.ts`
- simplified CGT calculation in `src/financialEngine/taxCalculations.ts`
- fixed UFPLS assumptions in `src/config/financialConstants.ts`
- a hidden `statePensionSoleIncomeExempt` assumption in `src/models/types.ts` and `src/financialEngine/projectionEngine.ts`

These simplifications are acceptable for an MVP but not for an optimizer that claims HMRC-aware tax efficiency.

### Missing data required for a stronger optimizer

The planner currently does not capture several fields a more realistic UK tax optimizer would need, including:

- jurisdiction or tax residence, including Scottish income tax handling
- savings interest
- dividend income
- pension contribution behavior after flexible access
- MPAA-trigger state
- protected pension age or protected lump-sum cases
- operational effects such as emergency pension tax and reclaim timing

The GIA model today captures:

- total value
- base cost
- growth rate

That is not enough to model a broader tax character for taxable investments.

### Deterministic returns are not enough

The current engine uses a single deterministic growth and inflation path from `src/config/financialConstants.ts`.

That means it can estimate whether a plan depletes under one assumed path, but it cannot estimate probability of depletion. A defensible depletion metric requires scenario analysis or Monte Carlo simulation.

## Recommended Architecture

The recommended design is:

- deterministic tax and withdrawal evaluation core
- deterministic or stochastic optimizer on top
- MCP server as an interface layer for AI agents
- LLMs used for orchestration and explanation, not as the calculation engine

### Why not let Codex or Claude do the calculation directly

An AI model can help:

- compare strategies
- explain tradeoffs
- recommend which optimization mode to run
- surface missing inputs

An AI model should not be the source of truth for:

- tax calculations
- policy constraint enforcement
- optimization scoring
- auditability

The correct pattern is:

- deterministic service computes
- MCP server exposes tools
- Codex or Claude calls those tools and explains results

## Optimization Framing

Two solver modes are recommended.

### Mode 1: Required Spending

This is the main product mode.

Input:

- household state
- required annual spending path
- tax rules by year and jurisdiction
- market and longevity scenarios
- policy constraints

Objective stack:

1. satisfy required net spending each year
2. minimize depletion probability
3. minimize expected lifetime tax among strategies with acceptable depletion risk

Representative formulation:

```text
Given:
- initial household state sigma_0
- required net spending path s[t]
- tax rule set R[t]
- scenario set Omega

Choose a policy pi_theta that maps:
  (state sigma[t,omega], rules R[t]) -> actions u[t,omega]

Subject to:
- net_cash_after_tax[t,omega] >= s[t]
- no negative balances
- pension access rules respected
- allowance and band rules respected
- care reserve preserved unless explicitly allowed

Primary objective:
- minimize depletion_probability(pi_theta)

Secondary objective:
- minimize E_omega[sum_t tax_paid[t,omega]]
  subject to depletion_probability(pi_theta) <= epsilon
```

Here "depletion" means either:

- spendable assets exhausted before the planning horizon, or
- the required spending path cannot be met net of tax

### Mode 2: Max Affordable Spending

This is a separate planning analysis mode, not the default engine objective.

Use it to answer:

- what level of spending is supportable with acceptable depletion risk?
- how much can the user safely increase or decrease their target lifestyle?

Representative formulation:

```text
maximize lambda

subject to:
- net_cash_after_tax[t,omega] >= lambda * baseline_spending[t]
- depletion_probability(pi_theta) <= epsilon
```

Outputs should include:

- maximum sustainable spending multiplier
- maximum sustainable real annual spending path
- depletion-risk and tax metrics for that solution

## Solver Design

Do not optimize every yearly withdrawal as a free variable. That will be fragile, slow, and hard to explain.

Instead, optimize a parameterized withdrawal policy.

### Policy parameter examples

- target taxable-income band per person before State Pension starts
- target taxable-income band per person after State Pension starts
- annual CGT harvesting target
- ISA preservation weight
- pension preservation weight
- cash buffer floor
- couple balancing policy
- care reserve protection behavior

The solver then:

1. generates candidate policy parameters
2. simulates each candidate against the tax engine and scenario set
3. ranks candidates by depletion probability first, tax second

This gives a practical "optimal within policy family" result while remaining explainable.

## MCP Server Role

The MCP server should be a thin, deterministic tool layer over the optimizer and rule engine.

It should not contain business logic that differs from the app's calculation core.

### Design principles

- same domain engine used by the web app and the MCP server
- explicit tax-year and jurisdiction inputs
- structured outputs only
- traceable rule versions and citations
- deterministic replay where possible

## Proposed MCP Tool Contract

### `tax.get_rule_snapshot`

Purpose:

- return the exact rule set used for a given tax year and jurisdiction

Input:

```json
{
  "tax_year": "2025-26",
  "jurisdiction": "rUK"
}
```

Output:

```json
{
  "tax_year": "2025-26",
  "jurisdiction": "rUK",
  "income_tax": {
    "personal_allowance": 12570,
    "bands": []
  },
  "capital_gains_tax": {
    "annual_exempt_amount": 3000,
    "bands": []
  },
  "pension_rules": {
    "ufpls_tax_free_fraction": 0.25,
    "lump_sum_allowance": 268275
  },
  "rule_version": "2025-26.ruk.v1",
  "citations": [
    {
      "label": "Income tax rates",
      "url": "https://www.gov.uk/income-tax-rates"
    }
  ]
}
```

### `planner.validate_household`

Purpose:

- validate whether the current planner state contains enough information for the requested optimization mode

Input:

```json
{
  "household": {},
  "spending_plan": {},
  "mode": "required_spending"
}
```

Output:

```json
{
  "valid": false,
  "errors": [],
  "warnings": [],
  "missing_fields_for_optimization": [
    "tax_residence",
    "savings_interest",
    "dividend_income"
  ]
}
```

### `strategy.optimize_required_spending`

Purpose:

- find the best funding strategy for an externally defined spending path

Input:

```json
{
  "household": {},
  "spending_plan": {
    "years": [
      { "age": 65, "required_net_spending": 42000 }
    ]
  },
  "tax_context": {
    "tax_year": "2025-26",
    "jurisdiction": "rUK"
  },
  "market_model": {
    "type": "monte_carlo",
    "scenario_count": 5000,
    "seed": 42
  },
  "constraints": {
    "preserve_care_reserve": true,
    "max_depletion_probability": 0.05,
    "allowed_draw_methods": ["ufpls", "isa", "gia", "cash"]
  }
}
```

Output:

```json
{
  "strategy_id": "uuid",
  "status": "ok",
  "objective_mode": "required_spending",
  "summary": {
    "depletion_probability": 0.034,
    "expected_lifetime_tax": 182400,
    "median_terminal_assets": 610000,
    "p10_terminal_assets": 90000
  },
  "policy_parameters": {},
  "representative_path": [],
  "citations": []
}
```

### `strategy.max_affordable_spending`

Purpose:

- compute the highest sustainable spending level for a given household and risk tolerance

Input:

```json
{
  "household": {},
  "baseline_spending_plan": {},
  "tax_context": {
    "tax_year": "2025-26",
    "jurisdiction": "rUK"
  },
  "market_model": {
    "type": "monte_carlo",
    "scenario_count": 5000,
    "seed": 42
  },
  "constraints": {
    "max_depletion_probability": 0.05
  }
}
```

Output:

```json
{
  "status": "ok",
  "objective_mode": "max_affordable_spending",
  "max_spending_multiplier": 1.12,
  "max_real_spending_path": [],
  "summary": {
    "depletion_probability": 0.05,
    "expected_lifetime_tax": 205100
  }
}
```

### `strategy.compare`

Purpose:

- compare multiple candidate strategies side by side

Output should include:

- depletion probability
- expected lifetime tax
- representative drawdown pattern
- dominant or non-dominant status
- key tradeoffs in structured form

### `strategy.explain`

Purpose:

- generate a structured explanation of why a strategy was chosen

This tool should explain:

- which tax rules mattered
- which constraints were binding
- what drove depletion risk
- what tradeoffs were accepted

## Domain Model Changes Required

Before an HMRC-aware optimizer is credible, the planner state needs more tax-relevant inputs.

Minimum additions to consider:

- tax jurisdiction or residence
- savings interest
- dividend income
- pension contribution behavior after flexible access
- MPAA-triggered status
- protected pension age
- protected tax-free cash or allowance conditions
- explicit treatment of taxable account income character where relevant

Without these inputs, the optimizer can only operate in a simplified tax world.

## Recommended Build Sequence

### Phase 1: Rule Engine

Build a versioned tax rule package that:

- stores tax rules by year and jurisdiction
- applies deterministic tax calculations
- records source citations and rule versions

### Phase 2: Strategy Evaluator

Refactor the current withdrawal engine so that:

- the existing waterfall becomes a baseline strategy
- alternative parameterized policies can be evaluated through the same interface

### Phase 3: Scenario Engine

Add scenario-based simulation for:

- market returns
- inflation
- planning horizon or longevity assumptions

### Phase 4: Optimizer

Implement policy search over strategy parameters with objective ranking:

1. meet required spending
2. minimize depletion probability
3. minimize expected lifetime tax

### Phase 5: MCP Layer

Expose the deterministic engine through MCP tools for:

- rule lookup
- household validation
- optimization
- comparison
- explanation

## Recommendation

The current hardcoded withdrawal algorithm should not be replaced by a free-form AI approach. It should be replaced or supplemented by:

- a deterministic tax and decumulation engine
- a scenario-aware optimizer
- an MCP interface used by Codex or Claude for orchestration and explanation

That architecture is consistent with the product's corrected framing:

- required spending is an external constraint
- the engine's job is to fund that spending
- depletion risk and lifetime tax are the key optimization outputs

## External Reference URLs

These should be treated as source references for future implementation and annual rule updates:

- Income tax rates: https://www.gov.uk/income-tax-rates
- Scottish income tax: https://www.gov.uk/scottish-income-tax
- Tax on pensions and State Pension income: https://www.gov.uk/tax-on-pension
- New State Pension amount: https://www.gov.uk/new-state-pension/what-youll-get
- Pension overpayment reclaim after flexible access: https://www.gov.uk/guidance/claim-back-tax-on-a-flexibly-accessed-pension-overpayment-p55
- Pension scheme rates and allowances: https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates
- HMRC Individual Calculations API: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0
