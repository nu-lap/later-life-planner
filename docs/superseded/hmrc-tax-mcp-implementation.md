# HMRC Tax MCP — Implementation Guide

## Document Control

- Status: Superseded
- Owner: Later-Life Planner Engineering (`NxLap Ltd`)
- Created: 2026-04-03
- Last reviewed: 2026-04-05

This document records the HMRC integration that is actually implemented in LLP today.

Superseded by:

- `docs/optimizer-architecture-reconciled.md`

Use it with:

- `docs/optimizer-architecture-reconciled.md` for the canonical cross-cutting architecture
- `docs/superseded/hmrc-tax-mcp-integration-plan.md` for historical scope and phasing

## What Is Implemented

LLP now consumes HMRC tax rule data through a committed snapshot in the runtime planner path.

Implemented files:

| File | Status |
|---|---|
| `scripts/gen-tax-snapshot.ts` | Implemented generator for committed snapshot values |
| `src/config/taxRuleSnapshot.ts` | Implemented generated snapshot |
| `src/config/financialConstants.ts` | Implemented snapshot-backed constants |
| `src/financialEngine/taxCalculations.ts` | Implemented year-aware tax wrappers |
| `src/financialEngine/projectionEngine.ts` | Implemented per-year snapshot lookup |
| `tests/unit/taxCalculations.test.ts` | Implemented regression and worked-example coverage |
| `.github/workflows/ci-cd.yml` | Implemented snapshot drift validation |

Not yet implemented:

| File / capability | Status |
|---|---|
| `src/app/api/tax-trace/route.ts` | Planned only |
| live MCP calls from LLP runtime | Planned only |
| direct MCP-backed snapshot regeneration in CI | Planned only |
| Scotland-aware runtime selection | Planned only |

## Runtime Shape

```text
scripts/gen-tax-snapshot.ts
  -> emits src/config/taxRuleSnapshot.ts
  -> committed in repo

src/config/taxRuleSnapshot.ts
  -> consumed by src/config/financialConstants.ts
  -> consumed by src/financialEngine/taxCalculations.ts
  -> consumed by src/financialEngine/projectionEngine.ts
```

The projection engine remains browser-safe:

- no runtime network calls
- no LLM in the calculation path
- no live MCP dependency in projections

## Important Current-State Corrections

### Snapshot generation

The current generator does not execute `hmrc-tax-mcp` live from LLP code or CI.

What it does today:

- emits a typed snapshot file from committed values
- preserves rule-year coverage and fallback behaviour
- supports drift checking in CI

What it does not do yet:

- call MCP tools directly during generation
- require MCP availability in the LLP CI job

Direct MCP-backed regeneration remains a future hardening step.

### Audit route

Some earlier planning text described `src/app/api/tax-trace/route.ts` as if it already existed. It does not. Treat audit traces as planned work.

## Snapshot Responsibilities

The snapshot currently provides:

- income tax bands through `2030-31`
- CGT values through `2026-27`, with fallback thereafter
- pension and UFPLS values through `2026-27`, with fallback thereafter
- state pension annual values held in the snapshot, with fallback thereafter

The snapshot is used for:

- year-aware income tax calculations
- year-aware CGT calculations
- year-aware pension LSA and UFPLS assumptions inside the projection engine

## CI Contract

The LLP CI job validates that:

1. `npm run gen:tax-snapshot` reproduces `src/config/taxRuleSnapshot.ts`
2. the committed snapshot has not drifted from the generator
3. tax calculation tests still pass

This is a code-generation consistency check, not a live MCP integration check.

## Remaining Implementation Work

1. Add an audit route, likely `GET /api/tax-trace`, for developer and support diagnostics
2. Add an explanation route, likely `POST /api/optimizer-explain`, for cited natural-language summaries
3. Decide when to harden the generator to query `hmrc-tax-mcp` directly rather than emitting already-verified values
4. Add Scotland-aware snapshot selection once the planner data model supports jurisdiction
5. Port proof-of-concept strategy logic from scripts into supported runtime code

## Source of Truth

Use these documents together:

- `docs/optimizer-architecture-reconciled.md`: canonical cross-cutting architecture
- `docs/superseded/hmrc-tax-mcp-integration-plan.md`: historical scope and phasing
- `docs/superseded/hmrc-tax-mcp-implementation.md`: historical implementation notes
