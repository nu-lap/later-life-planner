# Optimizer, HMRC MCP, RAG, and LLM Architecture

## Document Control

- Status: Active
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-05
- Last reviewed: 2026-04-05
- Review cadence: On any architecture or implementation milestone change

This document is the reconciled source of truth for how Later Life Planner should use:

- the `hmrc-tax-mcp` rule engine
- build-time tax snapshots inside LLP
- live MCP access for audit and explanation
- RAG over HMRC guidance
- LLMs for explanation and orchestration

It supersedes the historical documents now retained in `docs/superseded/`:

- `docs/superseded/withdrawal-optimizer-mcp-design.md`
- `docs/superseded/hmrc-tax-mcp-integration-plan.md`
- `docs/superseded/hmrc-tax-mcp-implementation.md`
- `docs/superseded/drawdown-optimizer-goals.md`

Those historical documents remain useful for rationale and design history, but this file is the canonical integration view.

## Executive Summary

The architecture is four layers with different runtime rules:

1. HMRC tax rules: deterministic, versioned, consumed in LLP via a committed build-time snapshot
2. Optimizer core: deterministic TypeScript, no LLM and no network in the hot path
3. Explanation layer: server-side API route that combines deterministic outputs with HMRC citations and RAG context
4. Goal orchestration: optional later layer where an LLM helps map user priorities into optimizer settings

The key reconciliation is:

- LLP is already using a tax snapshot in the runtime engine
- LLP is not yet calling `hmrc-tax-mcp` live at request time
- LLP does not yet expose its own MCP server
- RAG retrieval should assume Cosmos DB vector search for MVP and Azure AI Search as an upgrade path, not as the current baseline
- The explanation endpoint should be provider-agnostic, with Anthropic acceptable for MVP and Azure OpenAI the preferred production target if quota and operations align
- For Azure OpenAI, the current recommended low-cost chat model is `gpt-4.1-mini`

## Current State

| Area | Current state in LLP | Notes |
|---|---|---|
| HMRC tax constants replacement | Implemented | `src/config/taxRuleSnapshot.ts`, `src/config/financialConstants.ts`, `src/financialEngine/taxCalculations.ts`, `src/financialEngine/projectionEngine.ts` |
| Snapshot generation | Implemented as committed code generation | `scripts/gen-tax-snapshot.ts` emits known verified values; it does not call MCP directly at runtime or in CI today |
| Tax-year-aware projection engine | Implemented | Per-year snapshot lookup and fallback warnings exist |
| Live HMRC MCP calls from LLP | Not implemented | No `tax-trace` or `optimizer-explain` route yet |
| Deterministic withdrawal optimizer in app runtime | Not implemented | Strategy work exists in scripts, not yet as supported engine module |
| LLP-owned MCP server | Not implemented | Defer until optimizer core and API contracts stabilize |
| RAG retrieval in LLP runtime | Not implemented | Cosmos-backed corpus may exist operationally, but LLP has no retrieval route yet |
| LLM explanation endpoint | Not implemented | Anthropic streaming pattern exists elsewhere in app and can be reused |
| Goal orchestration | Not implemented | Still future design work |

## Resolved Architecture Decisions

### 1. HMRC rules in the planner

Decision:
- LLP uses a committed build-time tax snapshot for planner runtime calculations.

Why:
- browser-side simulations must stay fast, deterministic, and offline from external services
- the app must not depend on MCP or network availability while projecting plans
- this keeps the calculation path auditable and testable

Implementation status:
- live now via `src/config/taxRuleSnapshot.ts`
- consumed by `src/config/financialConstants.ts`
- consumed by `src/financialEngine/taxCalculations.ts`
- used per simulation year in `src/financialEngine/projectionEngine.ts`

Important clarification:
- current `scripts/gen-tax-snapshot.ts` is a snapshot emitter with verified values embedded in code
- it is not yet a true MCP-backed generator that executes `hmrc-tax-mcp` live in CI or at build time
- the docs must treat direct MCP-backed generation as a later hardening step, not as already implemented behaviour

### 2. Live MCP usage inside LLP

Decision:
- live MCP access is for audit and explanation only, not for the planner hot path.

Allowed future uses:
- `GET /api/tax-trace` or similar developer/audit route
- `POST /api/optimizer-explain` to fetch live rule metadata, rule citations, and explanation context

Not allowed:
- calling MCP from the browser simulation loop
- using LLMs or MCP responses as the numerical source of truth for projections

### 3. LLP-owned MCP server

Decision:
- do not treat an LLP-owned MCP server as an MVP requirement.

Reasoning:
- the immediate value is in making the optimizer deterministic inside the app and exposing one or two internal API routes
- an LLP MCP layer only becomes useful once there is a stable optimizer engine and a real external-agent consumer
- building an MCP surface too early risks freezing the wrong contract

Result:
- HMRC MCP is an external dependency LLP consumes
- LLP internal APIs come before any LLP-specific MCP server
- an LLP MCP facade remains a later packaging option, not a prerequisite

### 4. RAG backend choice

Decision:
- canonical MVP retrieval path is Cosmos DB vector search
- Azure AI Search is an upgrade path for retrieval quality, not the current baseline

Reasoning:
- `hmrc-tax-mcp` already has Cosmos-oriented indexing and provisioning material
- Cosmos avoids standing up another service for MVP
- Azure AI Search remains attractive when semantic reranking quality justifies the cost and service overhead

Reconciled interpretation of the docs:
- `docs/architecture/vector-search-options.md` is the correct decision frame: Cosmos first, AI Search later if needed
- any Azure AI Search integration material should be treated as an optional target architecture, not proof that Azure AI Search is the chosen baseline

### 5. LLM provider choice

Decision:
- provider must be abstracted at the explanation layer
- Anthropic is acceptable for MVP because LLP already has SDK usage and streaming patterns
- Azure OpenAI is the preferred production target when quota, deployment, and operational ownership are in place
- when using Azure OpenAI, prefer `gpt-4.1-mini` as the low-cost chat deployment

Reasoning:
- this removes false conflict between the docs
- the real invariant is provider-independence of the explanation contract
- the deterministic engine and retrieval layer should not care which model provider generates the prose

### 6. Explanation layer scope

Decision:
- the LLM explains, contextualises, and prioritises tradeoffs
- it does not calculate tax, score strategies, or decide feasibility

The explanation route should receive:
- deterministic optimizer result
- tax snapshot metadata used by the run
- optional live MCP citations for the relevant rules
- RAG context chunks for broader guidance and upcoming rule changes
- user goals or planning context

## Canonical Layer Model

### Layer 1: Tax Rules

Canonical state:
- runtime source of truth in LLP is the committed snapshot
- future hardening target is MCP-assisted regeneration and audit verification

Contract:
- deterministic
- versioned
- year-aware
- jurisdiction-aware when Scotland is added

### Layer 2: Optimizer Core

Canonical state:
- not yet productized in `src/`
- existing scripts are proof-of-concept logic only

Contract:
- pure deterministic function over state, constraints, and tax rules
- no LLM
- no network
- suitable for browser or shared domain package execution

### Layer 3: Explanation and RAG

Canonical state:
- planned, not implemented in LLP

Contract:
- server-side API route
- may call live HMRC MCP tools
- may query Cosmos vector store
- may use Anthropic or Azure OpenAI
- output is explanation only, never source-of-truth computation

### Layer 4: Goal Orchestration

Canonical state:
- planned, not implemented

Contract:
- converts user preferences into structured optimization objectives and constraints
- may use an LLM
- must remain downstream of deterministic validation rules

## What Is Already Implemented vs Planned

### Implemented

- HMRC snapshot integrated into tax calculations and projection engine
- tax-year mapping and fallback behaviour
- committed generator for snapshot refresh
- CI drift check for `src/config/taxRuleSnapshot.ts`

### Planned next

1. Move optimizer logic from scripts into supported runtime code under `src/financialEngine/`
2. Add a server-side explanation route
3. Add retrieval over HMRC guidance corpus
4. Add optional live HMRC MCP audit route
5. Add Scotland and richer tax inputs
6. Revisit LLP-specific MCP interface only after the above stabilises

## Open Gaps and Corrections to Existing Docs

### Snapshot generation docs

Correction:
- current docs overstate snapshot generation as if `scripts/gen-tax-snapshot.ts` executes live MCP rules in CI
- in reality the generator emits committed values already verified against HMRC MCP outputs

Required wording going forward:
- current implementation: committed generator with verified values
- future enhancement: direct MCP-backed regeneration and verification

### `tax-trace` route

Correction:
- some docs describe `src/app/api/tax-trace/route.ts` as implemented
- it does not exist today

Required wording going forward:
- planned audit feature, not current capability

### RAG status

Correction:
- some docs speak as if LLP already has live explanation retrieval wired into runtime
- LLP does not currently expose a retrieval route or explanation route

Required wording going forward:
- corpus/indexing may exist outside LLP runtime, but LLP integration is still pending

### MCP scope

Correction:
- earlier wording can read as if LLP must become an MCP server in order to deliver the optimizer
- this is not required for the next meaningful product milestone

Required wording going forward:
- consume HMRC MCP first; defer LLP MCP exposure

## Recommended Delivery Sequence

1. Stabilise the tax snapshot path as the current production mechanism
2. Port strategy scripts into `src/financialEngine/withdrawalOptimizer.ts`
3. Add a provider-agnostic `POST /api/optimizer-explain` route
4. Implement Cosmos-backed retrieval for HMRC guidance chunks
5. Add optional live HMRC MCP calls for rule trace and citation hydration
6. Add goal orchestration only after optimizer output contracts are stable
7. Consider an LLP MCP surface only if there is a concrete external-agent workflow to support

## Current and Historical References

| Concern | Source of truth |
|---|---|
| Reconciled cross-cutting architecture | `docs/optimizer-architecture-reconciled.md` |
| Historical optimizer and MCP rationale | `docs/superseded/withdrawal-optimizer-mcp-design.md` |
| Historical HMRC integration scope and phasing | `docs/superseded/hmrc-tax-mcp-integration-plan.md` |
| Historical HMRC integration implementation notes | `docs/superseded/hmrc-tax-mcp-implementation.md` |
| Historical goal stack and optimizer product intent | `docs/superseded/drawdown-optimizer-goals.md` |

## Decision Triggers

Revisit these decisions when any of the following becomes true:

- LLP needs a public agent-facing interface beyond its own UI and API routes
- Cosmos retrieval quality is insufficient for explanation quality targets
- Azure OpenAI quota and deployment are available and operationally simpler than Anthropic
- Scotland support lands and drives a broader tax context model change
- direct MCP-backed snapshot generation becomes reliable enough for CI and developer workflows
