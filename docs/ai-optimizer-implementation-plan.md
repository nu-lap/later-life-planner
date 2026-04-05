# AI-Enabled Optimizer — Implementation Plan

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-05
- Last reviewed: 2026-04-05
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

export interface OptimizationResult {
  recommendedStrategy: WaterfallConfig;
  baselineStrategy: WaterfallConfig;
  lifetimeTaxSaving: number;
  assetDepletionAge: number | null;
  yearRecords: YearRecord[];
  taxRuleVersions: Record<string, string>; // rule_id → version used
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
- Records `taxRuleVersions` from the snapshot for auditability

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
`src/financialEngine/withdrawalOptimizer.ts` produces the same headline tax saving
as `scripts/combined-strategy.ts` for the same plan input.

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
- Accepts: `{ optimizationResult, planSummary }`
- Calls `streamExplanation()` → streams response
- LLM role: explain and contextualise only — never computes tax

### 3.3 Hydrate live HMRC MCP citations

In the route handler, for each `rule_id` in `optimizationResult.taxRuleVersions`:
- Call `hmrc-tax-mcp` `explain_rule` to fetch rule metadata and HMRC citations
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
  manual_ref: string;
  section_title: string;
  text: string;
  rule_ids: string[];
}

export async function retrieveHmrcChunks(
  ruleIds: string[],
  queryText: string,
  topK = 5
): Promise<HmrcChunk[]>
```

Implementation:
1. Embed `queryText` using Azure OpenAI `text-embedding-3-large` (3072 dims)
2. Vector query `hmrc-chunks` container, filtered by `rule_ids ARRAY_CONTAINS`
3. Return top-K chunks ordered by cosine similarity

Authentication: `DefaultAzureCredential` (managed identity in ACA; `az login` locally).

### 4.2 Wire into `optimizer-explain` route

- Call `retrieveHmrcChunks(ruleIds, planContextQuery)`
- Add returned chunks to `ExplanationContext.ragChunks`
- Handle Cosmos unavailability gracefully — skip RAG, proceed with MCP citations only

**Acceptance criteria for Phase 4:** Explanation generated for a pension drawdown
scenario includes a quoted HMRC PTM or IHTM excerpt sourced from the RAG corpus.

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
```

Default priority stack matches `docs/optimizer-architecture-reconciled.md` §Canonical Layer Model.

### 6.2 Goal preference UI

- Add goal priority panel (Step 5 or dedicated Goals step)
- Drag-and-drop reordering or ranked sliders
- Store `GoalRegistry` in `PlannerState`

### 6.3 `POST /api/goal-orchestrate`

File: `src/app/api/goal-orchestrate/route.ts`

- Accepts: `{ planSummary, goalRegistry, naturalLanguageInput? }`
- Uses `llm.ts` wrapper to map inputs → `Partial<WaterfallConfig>`
- Returns structured config override — not prose
- Downstream: `optimizeWithdrawals(state, { configOverride })`

**Acceptance criteria for Phase 6:** Given `goalRegistry` with `bequest` at
priority 1, the orchestrator returns a `WaterfallConfig` that favours ISA-preserve
and deferring DC drawdown.

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
