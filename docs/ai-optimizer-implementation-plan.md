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
Phase 1                     → Phase 5 (Year-by-Year Drawdown Breakdown)
Phase 3                     → Phase 7 (Goal Orchestration)
Phase 6 (Audit Route)       — unblocked; deliver any time
Phase 8 (Scotland)          — unblocked; deliver in parallel
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
- Accepts a client-submitted explanation payload built from locally decrypted plan
  state and locally computed optimizer output
- The route does **not** fetch planner plaintext by `planId` and does **not**
  re-run the optimizer server-side in MVP
- The client is responsible for:
  - decrypting planner state locally
  - running `optimizeWithdrawals()` locally
  - deriving a minimised explanation payload
  - collecting explicit user consent before submission
- The server is responsible for:
  - authenticating the user
  - validating payload schema, version, and consent metadata
  - hydrating HMRC MCP citations and optional RAG guidance
  - calling `streamExplanation()` and streaming the response
- LLM role: explain and contextualise only — never computes tax

Suggested request shape:

```typescript
/**
 * Minimised summary of the optimizer output sent to the server.
 * yearRecords is deliberately excluded — per-year breakdowns contain
 * detailed asset and income data and are not needed to generate an explanation.
 * The server uses only aggregated figures and ruleProvenance.
 */
export interface OptimizationSummary {
  recommendedStrategy: WaterfallConfig;
  baselineStrategy: WaterfallConfig;
  lifetimeTaxSaving: number;
  assetDepletionAge: number | null;
  terminalAssets: number;
  ruleProvenance: RuleProvenance[];
}

/**
 * Vocabulary of data categories the user consents to share.
 * Each value maps to a human-readable label shown in the consent dialog.
 * Extend this enum — do not use free strings — so the server can whitelist
 * known scope values and reject unknown ones.
 */
export type ConsentScope =
  | 'household-demographics'  // householdType, ages, jurisdiction
  | 'financial-summary'       // anonymised DC/ISA/GIA totals, target spend
  | 'optimization-result'     // recommendedStrategy, lifetimeTaxSaving, etc.
  | 'rule-provenance'         // HMRC rule IDs, versions, tax-years used
  | 'mcp-citations'           // server will fetch live HMRC MCP citations
  | 'rag-guidance';           // server will retrieve RAG guidance chunks

export interface OptimizerExplainRequest {
  requestId: string;
  /**
   * Opaque revision token bound to the plan state used for this optimizer run.
   * Must be the Cosmos DB ETag (or SHA-256 of the encrypted plan blob) for the
   * document version from which the optimizer input was decrypted.
   * Free strings are rejected: the server validates that the value matches the
   * pattern /^(etag:[0-9a-f-]+|sha256:[0-9a-f]{64})$/.
   */
  planRevision: string;
  schemaVersion: string;
  consent: {
    grantedAt: string;          // ISO-8601 timestamp of user approval
    scope: ConsentScope[];      // typed enum — no free strings
    // Note: LLM provider is NOT in the client consent struct.
    // The actual provider used is selected and recorded server-side in the
    // audit record so client-supplied values cannot influence routing.
  };
  subject: {
    householdType: 'single' | 'couple';
    ages: number[];
    jurisdiction: TaxJurisdiction;
  };
  financialSummary: {
    guaranteedIncomeAnnual: number;
    dcTotal: number;
    isaTotal: number;
    giaTotal: number;
    targetSpendingAnnual: number;
  };
  optimizationResult: OptimizationSummary;  // yearRecords excluded
}
```

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
streaming plain-English explanation for a client-computed optimization result,
uses only the submitted minimised payload, and references at least one HMRC rule
citation for a test request.

### 3.4 Client-side consented explain workflow

To preserve LLP's current browser-encryption model, keep optimizer computation
and plan decryption in the browser. The explanation flow sends only a minimised,
consented payload to the server.

High-level flow

1. Local compute and payload derivation
   - Decrypt planner state in the browser.
   - Run `optimizeWithdrawals()` locally (returns full `OptimizationResult` including `yearRecords`).
   - Derive an `OptimizationSummary` from the result — copy the aggregated fields
     (`recommendedStrategy`, `baselineStrategy`, `lifetimeTaxSaving`, `assetDepletionAge`,
     `terminalAssets`, `ruleProvenance`) and **explicitly drop `yearRecords`**. Per-year
     breakdowns contain detailed asset and income data that is not needed for explanation
     and must not leave the browser.
   - Exclude direct identifiers and unnecessary raw account detail.

2. User consent
   - Before submission, show a consent dialog listing exactly what will be sent.
   - The dialog must state:
     - which data categories leave the browser
     - that LLP will use the payload only for explanation generation
     - which **provider category** will process the explanation request (e.g. "a cloud AI service"); the exact provider is not disclosed client-side to prevent client-influenced routing
     - whether HMRC citations and RAG guidance may be fetched server-side
   - The user must explicitly approve the submission.

3. Server-side explanation
   - The client submits the minimised explanation payload to
     `POST /api/optimizer-explain`.
   - The server validates the payload and consent record.
   - The server enriches the request with HMRC MCP citations and optional RAG chunks.
   - The server streams the explanation response.

4. Audit and retention
   - Store only lightweight request metadata needed for diagnostics or audit.
   - Do not persist full planner plaintext as part of the explanation workflow.
   - Any retained record should be limited to:
     `{ requestId, planRevision, schemaVersion, consentScope, provider, payloadHash, timestamp, ruleProvenance }`.
     - `provider`: the **server-selected** LLM provider (e.g. `'azure-openai'`), recorded
       here — not taken from the client payload.
     - `payloadHash`: SHA-256 of the canonical JSON-serialised `OptimizerExplainRequest`,
       computed server-side before processing. This makes the audit record verifiable —
       a client can re-hash its original submission and confirm the server saw the same
       payload.
   - Audit records must not be retained longer than **90 days**. Implement a TTL index
     on the audit collection (or equivalent) to enforce automatic expiry.
   - Users may request deletion of their audit records under GDPR Article 17. The API
     must expose a deletion path for records tied to the authenticated user's `userId`.

5. In-memory lifecycle
   - The decrypted `PlannerState` and derived `OptimizationSummary` must not be held in
     any server-side memory or variable after the streaming response is complete.
   - Route handler implementation must: (a) derive all LLM context within a single
     request closure, (b) not assign plan data to module-level or singleton variables,
     (c) rely on the JS GC to collect the closure once the response stream ends.
   - Required test: a unit test that mocks the route handler, captures the request closure,
     and asserts that no reference to `financialSummary` or `optimizationResult` is
     exported or persisted after the handler resolves.

Design constraints

- Treat the payload as de-identified and minimised, not truly anonymous.
- Keep names, addresses, account numbers, and free-text notes out of the payload.
- Use a versioned payload schema so the client and server evolve safely.
- Bind the request to the optimizer result revision so the explanation matches the
  visible dashboard state (`planRevision` must be a Cosmos ETag or SHA-256 blob hash —
  see `OptimizerExplainRequest.planRevision` doc comment above).
- Keep MCP and RAG enrichment server-side so API credentials and retrieval logic do
  not move into the browser.
- **Prompt injection:** all string fields from the client that enter LLM prompts must
  be validated as typed enums before reaching the prompt builder. Fields such as
  `WaterfallConfig.dcOrder`, `WaterfallConfig.isaMode`, `subject.jurisdiction`, and
  `consent.scope[]` must be whitelisted against their declared enum values.
  Free-text fields must not be accepted by the schema. The route handler must call
  a `sanitiseForPrompt(payload: OptimizerExplainRequest): void` helper that throws
  `400 Bad Request` on any value that does not match its declared type.

API contract (suggested endpoint)

- POST `/api/optimizer-explain`
  - Input: `OptimizerExplainRequest`
  - Output: streaming plain-English explanation

Acceptance criteria for the consented workflow

- Minimal disclosure: explanation uses only the submitted minimised payload.
- Explicit consent: submission is blocked until the user approves the disclosure.
- No planner plaintext persistence: the explanation workflow does not store the
  full decrypted plan on the server.
- Provider transparency: the consent dialog tells the user which LLM provider
  **category** will process the request (e.g. "a cloud AI service"); the exact
  provider is recorded server-side in the audit record, not in the client consent struct.
- Prompt injection prevention: `sanitiseForPrompt()` is called before any prompt
  construction and rejects any payload with non-enum string values.
- Audit verifiability: `payloadHash` in the audit record matches a client-computed
  SHA-256 of the submitted payload.

Testing and integration

- Unit tests for payload derivation so sensitive fields (including `yearRecords`) are excluded.
- Unit test for `sanitiseForPrompt()` covering both valid and injection-attempt inputs.
- Unit test for in-memory lifecycle: asserts no plan data escapes the request closure.
- Route tests for schema validation, consent enforcement, and MCP fallback.
- Route test: submitting a payload with a non-enum string in any typed field returns `400`.
- Integration test: decrypted plan in browser → local optimizer run → consented
  payload submission → streamed explanation with citations.
- Security test: reject oversized or over-disclosive payloads that violate the
  schema contract.

Trade-offs and notes

- This is an explanation workflow, not a server-authoritative recomputation flow.
- The trust model is: client computes, server explains, and the user consents to
  the disclosed payload.
- This is materially simpler than introducing cryptographic proof machinery and is
  aligned with LLP's existing encrypted-blob storage design.

---


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
   - `jurisdiction = <jurisdiction param>`
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

## Phase 5 — Year-by-Year Drawdown Breakdown

**Goal:** Add an auditable yearly withdrawal breakdown that shows, for each year of the
plan, exactly how much each person withdraws from each investment bucket and how much
tax is due on each taxable withdrawal.

**Depends on:** Phase 1 complete.
**Recommended dependency:** Phase 2 complete, so the breakdown can sit alongside the
optimizer UI rather than becoming a parallel one-off display.

### 5.1 Extend optimizer output contracts

File: `src/financialEngine/types.ts`

Add explicit per-person, per-bucket drawdown detail to `WaterfallResult` / `YearRecord`.
The shape should be explicit and numeric rather than embedded in display labels.

Suggested additions:

```typescript
export interface PensionWithdrawalBreakdown {
  grossAmount: number;
  pcls: number;              // tax-free UFPLS component
  taxableAmount: number;     // taxable UFPLS component
  taxDue: number;            // income tax due on the taxable component
}

export interface TaxableWithdrawalBreakdown {
  grossAmount: number;       // amount withdrawn from the bucket
  taxableAmount: number;     // amount subject to tax
  taxDue: number;            // tax due attributable to this withdrawal
}

export interface TaxFreeWithdrawalBreakdown {
  grossAmount: number;
}

export interface PersonDrawdownBreakdown {
  pension?: PensionWithdrawalBreakdown;
  isa?: TaxFreeWithdrawalBreakdown;
  gia?: TaxableWithdrawalBreakdown;
  cash?: TaxFreeWithdrawalBreakdown;
}

export interface JointDrawdownBreakdown {
  gia?: TaxableWithdrawalBreakdown;
}

export interface YearDrawdownBreakdown {
  person1: PersonDrawdownBreakdown;
  person2?: PersonDrawdownBreakdown;
  joint?: JointDrawdownBreakdown;
}

export interface YearRecord {
  // existing fields
  drawdownBreakdown: YearDrawdownBreakdown;
}
```

Rules:
- For pension withdrawals, always show:
  - `grossAmount`
  - `pcls`
  - `taxableAmount`
  - `taxDue` on the taxable amount
- For GIA withdrawals, show the gross disposal amount and the tax due attributable to
the taxable gain realised that year
- For ISA and cash withdrawals, show gross amount only (no tax field)
- For couples, keep person-level ownership explicit; do not collapse into a household total

### 5.2 Populate the breakdown in the waterfall engine

Files:
- `src/financialEngine/withdrawalOptimizer.ts`
- any shared helpers extracted into `src/financialEngine/`

Implementation requirements:
- Capture the actual withdrawal amounts chosen by the winning strategy for each year
- Preserve bucket ownership:
  - person 1 pension / ISA / GIA / cash
  - person 2 pension / ISA / GIA / cash
  - joint GIA where applicable
- For UFPLS pension withdrawals, split each gross withdrawal into:
  - 25% `pcls`
  - 75% `taxableAmount`
- Surface the tax due attributable to each taxable withdrawal source, rather than only
a year-level total tax number
- Keep the breakdown as deterministic engine output, not presentation logic

### 5.3 Add a yearly breakdown panel or table

Files:
- `src/components/OptimizerPanel.tsx`
- optional extracted component such as `src/components/optimizer/YearlyDrawdownBreakdown.tsx`

Display requirements:
- one row per year in the plan horizon
- columns grouped by person and bucket
- for each pension withdrawal show:
  - gross withdrawal
  - PCLS component
  - taxable component
  - tax due
- for each GIA withdrawal show:
  - gross withdrawal / disposal amount
  - taxable amount or taxable gain
  - tax due
- for each ISA / cash withdrawal show gross amount
- allow collapse/expand or pagination if needed; do not overwhelm the default dashboard view

### 5.4 Tests

Files:
- `tests/unit/withdrawalOptimizer.test.ts`
- `tests/ui/optimizerPanel.test.tsx`
- fixture updates under `tests/fixtures/` if required

Coverage required:
- single-person plan with pension + ISA drawdown
- couple plan with both pensions active
- joint GIA drawdown with attributable tax
- UFPLS split correctness (`grossAmount = pcls + taxableAmount`)
- tax due shown against each taxable source, not only the annual total
- UI renders person-by-person bucket rows without dropping empty-but-relevant columns

**Acceptance criteria for Phase 5:** For a test plan, the optimizer exposes a yearly
drawdown breakdown showing, for each person and each year, withdrawals from pension,
ISA, GIA, and cash. Pension rows show `grossAmount`, `pcls`, `taxableAmount`, and
`taxDue`. Taxable GIA and pension withdrawals show attributable tax due. The UI renders
the breakdown in a readable year-by-year table without changing the optimizer decision logic.

---

## Phase 6 — Audit/Trace Route

**Goal:** Developer and auditor tool to inspect exact rule execution for a given
projection year.

**Unblocked — no dependencies. Deliver any time.**

### 6.1 `GET /api/tax-trace`

File: `src/app/api/tax-trace/route.ts`

- Auth-gated via `requireUser()`
- Query params: `rule_id`, `inputs` (JSON), `tax_year`, `jurisdiction`
- Calls `hmrc-tax-mcp` `trace_execution` tool
- Returns structured trace (step-by-step evaluation)
- Not user-facing in MVP — for developer and audit use

**Acceptance criteria for Phase 6:** Route returns a valid trace for
`income_tax_bands` with `{ taxable_income: 35000 }` and `tax_year: "2025-26"`.

---

## Phase 7 — Goal Orchestration

**Goal:** Allow users to express goal priorities in natural language or structured UI;
an LLM maps these into a `WaterfallConfig` override for the optimizer.

**Depends on:** Phase 3 complete. Deliver after optimizer output contracts are stable.

### 7.1 Goal registry types

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

### 7.2 Goal preference UI

- Add goal priority panel (Step 5 or dedicated Goals step)
- Drag-and-drop reordering or ranked sliders
- Store `GoalRegistry` in `PlannerState`

### 7.3 `POST /api/goal-orchestrate`

File: `src/app/api/goal-orchestrate/route.ts`

- Accepts: `{ planSummary, goalRegistry, naturalLanguageInput? }`
- Uses `llm.ts` wrapper to map inputs → `OptimizerPolicyOverride`
- Returns structured policy override — not prose. Phase 6 is explicitly designed to
  evolve **beyond** the 5-strategy waterfall family: `OptimizerPolicyOverride` expresses
  constraint thresholds (care reserve, bequest floor, spending floor) that the optimizer
  enforces as objective constraints, not just ordering preferences.
- Downstream: `optimizeWithdrawals(state, { policyOverride })`

**Acceptance criteria for Phase 7:** Given `goalRegistry` with `bequest` at
priority 1 and a target value, the orchestrator returns an `OptimizerPolicyOverride`
with `bequestTarget` set and `isaMode: 'defer'`. The optimizer respects the bequest
floor as a constraint — a solution that violates it is rejected as infeasible even if
it produces lower lifetime tax.

---

## Phase 8 — Scotland Jurisdiction

**Goal:** Support Scottish taxpayers correctly through the optimizer and projection engine.

**Unblocked — deliver in parallel with any phase.**

### 8.1 Capture `taxJurisdiction` in plan model

Add to `src/models/types.ts`:

```typescript
export type TaxJurisdiction = 'rUK' | 'scotland';
```

Add to `PersonalDetails` or top-level `PlannerState`. Capture in Step 1 UI (radio select,
default `'rUK'`).

### 8.2 Extend tax snapshot for Scotland

- Update `scripts/gen-tax-snapshot.ts` to emit Scotland bands (6 bands: nil, starter,
  basic, intermediate, higher, advanced, top)
- Update `src/config/taxRuleSnapshot.ts` to include Scotland entries
- Update `getSnapshotForYear(year, jurisdiction?)` signature

### 8.3 Pass jurisdiction through engine

- Update `optimizeWithdrawals(state)` — reads `state.taxJurisdiction`
- Update `calculateProjections(state)` — use jurisdiction-aware snapshot lookup
- Scotland savings and dividend allowances are UK-wide — no change needed there

**Acceptance criteria for Phase 8:** Scottish taxpayer at £35,000 income produces
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
