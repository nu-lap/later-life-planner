# AI-Enabled Optimizer — Implementation Plan

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-05
- Last reviewed: 2026-04-07
- Review cadence: On phase completion or architecture change

This document is the implementation plan for delivering the full AI-enabled drawdown
optimizer described in `docs/optimizer-architecture-reconciled.md`.

It translates the reconciled architecture into a phased delivery sequence with concrete
files, dependencies, and acceptance criteria for each work item.

---

## Current State

| Component | Status | Location |
|---|---|---|
| HMRC tax snapshot | ✅ Live | `src/config/taxRuleSnapshot.ts` |
| Financial constants | ✅ Live | `src/config/financialConstants.ts` |
| Projection engine | ✅ Live | `src/financialEngine/projectionEngine.ts` |
| Tax calculations | ✅ Live | `src/financialEngine/taxCalculations.ts` |
| Auth (Clerk), persistence (Cosmos DB), encryption | ✅ Live | `src/lib/`, `src/app/api/` |
| Waterfall optimizer logic | ⚠️ Script only | `scripts/combined-strategy.ts` |
| `src/financialEngine/withdrawalOptimizer.ts` | ❌ Not yet | — |
| `POST /api/optimizer-explain` | ❌ Not yet | — |
| `src/lib/llm.ts` (provider-agnostic wrapper) | ❌ Not yet | — |
| `src/lib/hmrcRag.ts` (Cosmos vector retrieval) | ❌ Not yet | — |
| `GET /api/tax-trace` (audit route) | ❌ Not yet | — |
| Goal orchestration | ❌ Future | — |
| Scotland jurisdiction support | ❌ Not yet | — |

---

## Architecture Invariants

These constraints must not be violated in any phase of delivery. See
`docs/optimizer-architecture-reconciled.md` for the full rationale.

```
Layer 1: Tax rules      — committed snapshot; deterministic; no network; no LLM
Layer 2: Optimizer core — pure TS; no LLM; no network; browser-safe
Layer 3: Explanation    — server-side API route only; LLM + MCP + RAG context
Layer 4: Goal orch.     — LLM maps preferences → optimizer config (later)
```

**Key decisions:**

| Decision | Choice | Upgrade path |
|---|---|---|
| RAG retrieval | Cosmos DB DiskANN vector search | Azure AI Search S1 (semantic reranker) |
| LLM provider (MVP) | Azure OpenAI `gpt-4.1-mini` | Higher-capacity Azure OpenAI model if quality or latency requires it |
| LLM abstraction | `src/lib/llm.ts` — swap via `LLM_PROVIDER` env var | — |
| Live MCP calls | Explanation and audit only — never in hot path | — |
| LLP MCP server | Deferred — not an MVP requirement | — |

---

## Delivery Sequence

```
Phase 1 (Optimizer Core)    → Phase 2 (UI Panel)
Phase 1                     → Phase 3 (Explain Route) → Phase 4 (RAG)
Phase 3                     → Phase 6 (Goal Orchestration)
Phase 5 (Audit Route)       — unblocked; deliver any time
Phase 7 (Scotland)          — unblocked; deliver in parallel
```

---

## Phase 1 — Optimizer Core Port

**Goal:** Move `scripts/combined-strategy.ts` into `src/financialEngine/` as a pure,
deterministic, browser-safe function. Replace all hardcoded HMRC constants with
`taxRuleSnapshot` lookups.

**Unblocked — no dependencies.**

### 1.1 Define optimizer types

File: `src/financialEngine/types.ts` (new)

```typescript
export type DCOrder = 'paul-first' | 'equal' | 'proportional' | 'lisa-first';
export type ISAMode = 'now' | 'defer';

export interface WaterfallConfig {
  dcOrder: DCOrder;
  isaMode: ISAMode;
  label: string;
}

export interface WaterfallResult {
  totalTax: number;
  feasible: boolean;
  // per-person and per-source breakdown
}

export interface YearRecord {
  year: number;
  paulAge: number;
  lisaAge: number;
  waterfallConfig: WaterfallConfig;
  result: WaterfallResult;
}

/**
 * Per-rule provenance captured during optimizer execution.
 * Required by the explanation route to hydrate accurate HMRC MCP citations.
 */
export interface RuleProvenance {
  rule_id: string;
  version: string;
  tax_year_requested: string;
  tax_year_used: string;       // may differ from requested if fallback was applied
  jurisdiction: TaxJurisdiction;
  is_fallback: boolean;        // true when snapshot fell back to a prior year
}

export interface OptimizationResult {
  recommendedStrategy: WaterfallConfig;
  baselineStrategy: WaterfallConfig;
  lifetimeTaxSaving: number;
  assetDepletionAge: number | null;
  terminalAssets: number;          // total assets at end of projection
  yearRecords: YearRecord[];
  ruleProvenance: RuleProvenance[];  // replaces taxRuleVersions; one entry per rule used
}
```

### 1.2 Port `runWaterfall()`

File: `src/financialEngine/withdrawalOptimizer.ts`

- Port the waterfall function from `scripts/combined-strategy.ts`
- Replace all hardcoded PA / rates / LSA with `getSnapshotForYear(year)`
- Keep the same 7-step waterfall order:
  1. Fixed income (DB, State Pension)
  2. DC within Personal Allowance — UFPLS (25% TF / 75% taxable)
  3. GIA within per-person CGT exempt (£3,000 each)
  4. ISA (tax-free) — or defer for ISA-preserve candidate
  5. Remaining GIA (gains now taxable)
  6. DC above Personal Allowance (marginal rate)
  7. ISA as last resort if deferred in step 4

### 1.3 Port `optimizeYear()` and `simulate()`

Main export:

```typescript
export function optimizeWithdrawals(
  state: PlannerState,
  options?: { baselineOnly?: boolean }
): OptimizationResult
```

- Evaluates 5 candidates per year: LLP-Baseline, Couple-equal, Proportional, Lisa-first, ISA-preserve
- Returns the lowest-tax feasible strategy for each year
- Records `ruleProvenance: RuleProvenance[]` from the snapshot for each rule consumed

### 1.4 Unit tests

File: `tests/financialEngine/withdrawalOptimizer.test.ts`

Coverage required:
- Waterfall ordering (UFPLS within PA before GIA, GIA before ISA)
- CGT harvest up to exempt amount per person
- UFPLS 25%/75% split and LSA tracking
- Couple-equal vs lisa-first tax comparison
- ISA-preserve candidate defers ISA correctly
- Output matches known values from `scripts/combined-strategy.ts` runs

**Acceptance criteria for Phase 1:** `optimizeWithdrawals()` imported from
`src/financialEngine/withdrawalOptimizer.ts` passes golden fixture tests covering:
- Headline lifetime tax saving matches `scripts/combined-strategy.ts` for the same plan input.
- Per-year totals: `totalTax`, `feasible` flag, and running asset balances match the script output year-by-year.
- Asset depletion year (or `null`) matches.
- Terminal asset value (`terminalAssets`) matches to within £1 (rounding).
- The strategy sequence (best candidate per year) matches the script's selection.
- No regression in UFPLS 25%/75% split, CGT harvest, or LSA tracking across years.

Golden fixtures are stored in `tests/financialEngine/fixtures/` as JSON and version-controlled.

---

## Phase 2 — Optimizer UI Panel

**Goal:** Surface optimizer output in the Step 4 dashboard without disrupting
the existing projection display.

**Depends on:** Phase 1 complete.

### 2.1 Build `OptimizerPanel.tsx`

File: `src/components/OptimizerPanel.tsx`

Display:
- Recommended strategy name (e.g. "Couple-equal DC drawdown")
- Lifetime tax saving vs LLP-Baseline (£ nominal)
- Projected asset depletion age (or "assets last to horizon")
- Year-by-year comparison table: top 2 strategies, columns = age / tax / net income

### 2.2 Wire into Step 4 dashboard

- Add `OptimizerPanel` to the Step 4 dashboard layout
- Gate behind `NEXT_PUBLIC_OPTIMIZER_ENABLED=true` feature flag for MVP
- `optimizeWithdrawals()` called inside `runSimulation()` or lazily on demand

**Acceptance criteria for Phase 2:** Optimizer panel renders correct strategy name
and tax saving for a test plan without breaking existing projection display.

---

## Phase 3 — Explanation API Route

**Goal:** Server-side streaming explanation of optimizer output using a
provider-agnostic LLM wrapper.

**Depends on:** Phase 1 complete.

### 3.1 LLM provider wrapper

File: `src/lib/llm.ts`

```typescript
export interface ExplanationContext {
  optimizationResult: OptimizationResult;
  planSummary: PlanSummary;
  mcpCitations?: RuleCitation[];
  ragChunks?: HmrcChunk[];
}

export async function* streamExplanation(
  context: ExplanationContext
): AsyncGenerator<string>
```

Provider selection via env var:

| `LLM_PROVIDER` | Model | Notes |
|---|---|---|
| `azure-openai` (default) | `gpt-4.1-mini` | MVP default; shares Azure identity and operational surface with Cosmos |
| `anthropic` | `claude-haiku-4-5` | Optional fallback/provider alternative |

### 3.2 `POST /api/optimizer-explain`

File: `src/app/api/optimizer-explain/route.ts`

- Auth-gated via `requireUser()`
- Rate-limited (reuse `src/lib/rateLimit.ts` pattern)
- Accepts: `{ planId: string }` — the persisted plan identifier stored in Cosmos DB
- **Never accepts client-supplied optimization results.** The route re-runs
  `optimizeWithdrawals()` server-side from the canonical persisted plan state fetched
  by `planId`. This preserves the "deterministic and auditable" contract: the LLM
  explains results computed from trusted server state only.
- Calls `streamExplanation()` → streams response
- LLM role: explain and contextualise only — never computes tax

### 3.3 Hydrate live HMRC MCP citations

In the route handler, for each entry in `optimizationResult.ruleProvenance`:
- Call `hmrc-tax-mcp` `explain_rule` with `rule_id`, `version`, `tax_year_used`,
  and `jurisdiction` from the `RuleProvenance` entry
- Do not reference a generic `tax_year` field here: `RuleProvenance` distinguishes
  between `tax_year_requested` and `tax_year_used`, and MCP citation hydration should
  use `tax_year_used` so the cited rule version matches the rule actually applied
- Add citations to `ExplanationContext.mcpCitations`
- Graceful fallback: if MCP unavailable, proceed without citations

**Acceptance criteria for Phase 3:** `POST /api/optimizer-explain` returns a
streaming plain-English explanation that references at least one HMRC rule citation
for a test optimization result.

---

## Phase 4 — Cosmos RAG Retrieval

**Goal:** Retrieve relevant HMRC guidance chunks from the indexed corpus and inject
into the explanation context.

**Depends on:** Phase 3 complete.
**External dependency:** `hmrc-tax-mcp` indexing pipeline has populated `hmrc-chunks`
container in `cosmos-llp-uks` (Cosmos DB account in `rg-shared-resources-uks`).

### 4.1 Retrieval function

File: `src/lib/hmrcRag.ts`

```typescript
export interface HmrcChunk {
  id: string;
  manual_ref: string;         // e.g. "PTM063010", "IHTM14811"
  section_title: string;      // human-readable section label
  text: string;
  rule_ids: string[];
  source_url: string;         // canonical HMRC.gov.uk URL for this section
  applicable_tax_year: string; // e.g. "2025-26" — chunk is valid for this year
  jurisdiction: TaxJurisdiction; // 'rUK' | 'scotland'
}

export async function retrieveHmrcChunks(
  ruleIds: string[],
  queryText: string,
  taxYear: string,
  jurisdiction: TaxJurisdiction,
  topK = 5
): Promise<HmrcChunk[]>
```

Implementation:
1. Embed `queryText` using Azure OpenAI `text-embedding-3-large` (3072 dims)
2. Vector query `hmrc-chunks` container filtered by:
   - `rule_ids ARRAY_CONTAINS` any of `ruleIds`
   - `applicable_tax_year = taxYear`
   - `jurisdiction = jurisdiction`
3. Return top-K chunks ordered by cosine similarity

Authentication: `DefaultAzureCredential` (managed identity in ACA; `az login` locally).

### 4.2 Wire into `optimizer-explain` route

- Call `retrieveHmrcChunks(ruleIds, planContextQuery, taxYear, jurisdiction)`
- Add returned chunks to `ExplanationContext.ragChunks`
- Handle Cosmos unavailability gracefully — skip RAG, proceed with MCP citations only

**Acceptance criteria for Phase 4:** Explanation generated for a pension drawdown
scenario includes a quoted HMRC PTM or IHTM excerpt sourced from the RAG corpus,
with `source_url` surfaced in the response. Retrieval is filtered to the correct
`applicable_tax_year` and `jurisdiction` — cross-year leakage is a test failure.

---

## Phase 5 — Audit/Trace Route

**Goal:** Developer and auditor tool to inspect exact rule execution for a given
projection year.

**Unblocked — no dependencies. Deliver any time.**

### 5.1 `GET /api/tax-trace`

File: `src/app/api/tax-trace/route.ts`

- Auth-gated via `requireUser()`
- Query params: `rule_id`, `inputs` (JSON), `tax_year`, `jurisdiction`
- Calls `hmrc-tax-mcp` `trace_execution` tool
- Returns structured trace (step-by-step evaluation)
- Not user-facing in MVP — for developer and audit use

**Acceptance criteria for Phase 5:** Route returns a valid trace for
`income_tax_bands` with `{ taxable_income: 35000 }` and `tax_year: "2025-26"`.

---

## Phase 6 — Goal Orchestration

**Goal:** Allow users to express goal priorities in natural language or structured UI;
an LLM maps these into a `WaterfallConfig` override for the optimizer.

**Depends on:** Phase 3 complete. Deliver after optimizer output contracts are stable.

### 6.1 Goal registry types

Add to `src/models/types.ts`:

```typescript
export type GoalId =
  | 'longevity_protection'
  | 'spending_floor'
  | 'aspirational_spending'
  | 'tax_efficiency'
  | 'liquidity_preservation'
  | 'survivorship'
  | 'care_reserve'
  | 'bequest'
  | 'inflation_resilience';

export interface GoalConfig {
  id: GoalId;
  priority: number;        // 1 = highest
  userWeight?: number;     // 0–1, optional override
  enabled: boolean;
}

export type GoalRegistry = GoalConfig[];

/**
 * Structured output from the goal-orchestrate route.
 * Richer than a waterfall config override — captures constraint thresholds
 * and objective adjustments that the optimizer consumes as constraints,
 * not just ordering hints.
 */
export interface OptimizerPolicyOverride {
  // Waterfall ordering hints (may be absent if goals don't imply an order)
  dcOrder?: DCOrder;
  isaMode?: ISAMode;

  // Constraint thresholds derived from goals
  minAnnualIncome?: number;        // spending floor (£/year) — longevity_protection / spending_floor
  careReserveTarget?: number;      // capital to protect — care_reserve
  bequestTarget?: number;          // estate value floor — bequest
  inflationAdjustSpending?: boolean; // inflation_resilience

  // Rationale returned alongside override for UI display
  rationale: string;
}
```

Default priority stack matches `docs/optimizer-architecture-reconciled.md` §Canonical Layer Model.

### 6.2 Goal preference UI

- Add goal priority panel (Step 5 or dedicated Goals step)
- Drag-and-drop reordering or ranked sliders
- Store `GoalRegistry` in `PlannerState`

### 6.3 `POST /api/goal-orchestrate`

File: `src/app/api/goal-orchestrate/route.ts`

- Accepts: `{ planSummary, goalRegistry, naturalLanguageInput? }`
- Uses `llm.ts` wrapper to map inputs → `OptimizerPolicyOverride`
- Returns structured policy override — not prose. Phase 6 is explicitly designed to
  evolve **beyond** the 5-strategy waterfall family: `OptimizerPolicyOverride` expresses
  constraint thresholds (care reserve, bequest floor, spending floor) that the optimizer
  enforces as objective constraints, not just ordering preferences.
- Downstream: `optimizeWithdrawals(state, { policyOverride })`

**Acceptance criteria for Phase 6:** Given `goalRegistry` with `bequest` at
priority 1 and a target value, the orchestrator returns an `OptimizerPolicyOverride`
with `bequestTarget` set and `isaMode: 'defer'`. The optimizer respects the bequest
floor as a constraint — a solution that violates it is rejected as infeasible even if
it produces lower lifetime tax.

---

## Phase 7 — Scotland Jurisdiction

**Goal:** Support Scottish taxpayers correctly through the optimizer and projection engine.

**Unblocked — deliver in parallel with any phase.**

### 7.1 Capture `taxJurisdiction` in plan model

Add to `src/models/types.ts`:

```typescript
export type TaxJurisdiction = 'rUK' | 'scotland';
```

Add to `PersonalDetails` or top-level `PlannerState`. Capture in Step 1 UI (radio select,
default `'rUK'`).

### 7.2 Extend tax snapshot for Scotland

- Update `scripts/gen-tax-snapshot.ts` to emit Scotland bands (6 bands: nil, starter,
  basic, intermediate, higher, advanced, top)
- Update `src/config/taxRuleSnapshot.ts` to include Scotland entries
- Update `getSnapshotForYear(year, jurisdiction?)` signature

### 7.3 Pass jurisdiction through engine

- Update `optimizeWithdrawals(state)` — reads `state.taxJurisdiction`
- Update `calculateProjections(state)` — use jurisdiction-aware snapshot lookup
- Scotland savings and dividend allowances are UK-wide — no change needed there

**Acceptance criteria for Phase 7:** Scottish taxpayer at £35,000 income produces
£4,532.82 income tax (6-band Scottish calculation) matching `hmrc-tax-mcp` output.

---

## Open Gaps and Decision Triggers

| Decision trigger | Impact |
|---|---|
| Cosmos RAG retrieval quality insufficient | Upgrade to Azure AI Search S1 (semantic reranker) |
| `gpt-4.1-mini` quality or throughput insufficient | Move to a larger Azure OpenAI deployment behind the same `llm.ts` abstraction |
| External agent workflow (e.g. Copilot in VS Code) needs LLP tools | Consider LLP-owned MCP server surface |
| Scotland support landed | Revisit jurisdiction model for Wales/NI (both use rUK rates currently) |
| Pension IHT reform (April 2027) approaches | Add `pension_estate_inclusion_2027` rule to hmrc-tax-mcp; wire into optimizer IHT goal |

---

## References

| Document | Purpose |
|---|---|
| `docs/optimizer-architecture-reconciled.md` | Canonical architecture decisions |
| `docs/superseded/drawdown-optimizer-goals.md` | Goal stack rationale and priority hierarchy |
| `docs/superseded/withdrawal-optimizer-mcp-design.md` | Historical optimizer design rationale |
| `docs/architecture/vector-search-options.md` (hmrc-tax-mcp) | RAG backend decision (Cosmos vs AI Search) |
| `scripts/combined-strategy.ts` | Proof-of-concept optimizer — source for Phase 1 port |
