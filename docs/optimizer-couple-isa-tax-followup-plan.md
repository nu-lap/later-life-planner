# Optimizer Couple ISA and Tax-Dominance Follow-up Plan

## Goal

Fix the current couple-plan optimizer limitation where ISA drawdown always uses
person 1's ISA first, and prevent tax-minimising strategies from leaving an
available tax-free ISA bucket unused while incurring avoidable tax.

This follow-up also includes two small breakdown-panel copy updates:
- replace `PCLS` with `25% Tax Free`
- simplify the `Year-by-year drawdown breakdown` title

## Problem Summary

Current optimizer strategies vary:
- `dcOrder`
- `isaMode`

They do **not** vary:
- `isaOrder`

So in couple plans, ISA withdrawals are always applied in this fixed sequence:
- person 1 ISA first
- person 2 ISA only if person 1 ISA is exhausted

That logic is hard-coded in `src/financialEngine/withdrawalOptimizer.ts`.

This creates two issues:
- couple strategies do not differ in ISA behavior in a meaningful way
- a tax-minimising strategy can still leave a tax-free ISA bucket unused while
  incurring avoidable tax elsewhere

## Implementation Plan

### 1. Extend strategy semantics

Update `src/financialEngine/types.ts`:
- add `ISAOrder`
- extend strategy config with `isaOrder`

Suggested shape:

```typescript
export type ISAOrder = 'p1-first' | 'p2-first' | 'equal' | 'proportional';
```

Update:
- `WithdrawalStrategy`
- `OptimizerPolicyOverride`

Reason:
- current strategies only control `dcOrder` and `isaMode`
- couple ISA behavior is currently hard-coded, not strategy-driven

### 2. Make baseline strategies explicit about ISA order

Update the strategy set in `src/financialEngine/withdrawalOptimizer.ts`.

Recommended mapping:
- `1-LLP-Baseline`
  - `isaOrder: 'equal'` for couple plans
  - `isaOrder: 'p1-first'` only in single-person mode where there is one ISA bucket
- `2-Couple-equal`
  - `isaOrder: 'equal'`
- `3-Proportional`
  - `isaOrder: 'proportional'`
- `4-Lisa-first`
  - `isaOrder: 'p2-first'`
- `5-ISA-preserve`
  - `isaOrder: 'equal'`

Reason:
- current labels imply broader household behavior than the code actually implements

### 3. Replace hard-coded ISA drawdown order with a helper

Add a helper in `src/financialEngine/withdrawalOptimizer.ts`:

```typescript
function allocateIsaDrawdown(
  isaOrder: ISAOrder,
  remaining: number,
  p1Isa: number,
  p2Isa: number,
): { p1: number; p2: number }
```

Behavior:
- `p1-first`
- `p2-first`
- `equal`
- `proportional`

Use it in both:
- ISA-now block
- ISA-defer block

Reason:
- current code always drains `p1Isa` before `p2Isa`

### 4. Add a tax-dominance rule

Add a year-level rule during candidate evaluation in `simulateCandidatePass()`
or immediately after candidate construction.

Rule:
- if `strategy.isaMode === 'now'`
- and a candidate creates avoidable incremental tax
- while ISA remains available
- and no higher-priority constraint is improved
- then penalize or reject that candidate

Practical MVP version:
- compute remaining ISA capacity before taxable-above-allowance withdrawals
- if a candidate ends with:
  - positive income tax or CGT above the allowance-managed portions, and
  - unused ISA capacity
- mark the candidate as dominated or add a very large score penalty

Reason:
- a minimise-tax strategy should not choose avoidable tax while tax-free ISA remains available

### 5. Scope the dominance rule carefully

Do **not** block all tax while ISA exists.

Allow tax where it is structurally expected:
- DC within the personal allowance
- GIA within the CGT allowance
- cases where ISA is intentionally deferred by strategy (`isaMode === 'defer'`)
- future goal overrides that explicitly prefer preserving ISA

So the MVP dominance rule should apply only when:
- `isaMode === 'now'`
- tax arises from withdrawals that could have been met by available ISA instead

### 6. Keep single-mode behavior simple

In single mode:
- ignore `isaOrder`
- always use `p1Isa`

Reason:
- no need to complicate single-plan logic

### 7. Update UI strategy definitions

Update:
- `src/lib/strategyDefinitions.ts`
- `src/lib/llm.ts`

So the strategy text explains both:
- pension ordering
- ISA ordering

Examples:
- `LLP baseline waterfall`
  - LaterLifePlan's standard order ... use both partners' ISAs evenly once ISA withdrawals begin in a couple plan.
- `Couple-equal DC drawdown`
  - split pension withdrawals evenly and use both ISAs evenly where ISA withdrawals are needed.
- `Partner 2-first DC drawdown`
  - draw Partner 2's pension and ISA before Partner 1's where applicable.

Reason:
- otherwise the UI still will not match optimizer behavior

### 8. Update the breakdown panel wording

Update `src/components/OptimizerPanel.tsx`:
- replace `PCLS` with `25% Tax Free`
- simplify the `Year-by-year drawdown breakdown` title to a shorter plain-English heading

Reason:
- these labels are currently more technical than they need to be

### 9. Add targeted tests

In `tests/unit/withdrawalOptimizer.test.ts`:

Add cases for:
1. couple plan with both ISAs and `isaMode: now`
   - verify `p1-first` uses only `p1Isa` first
   - verify `p2-first` uses only `p2Isa` first
2. `equal` ISA allocation
   - verify both ISAs are used in the same year when needed
3. `proportional` ISA allocation
   - verify withdrawals track starting ISA balances
4. dominance rule
   - construct a case where a candidate would otherwise incur tax while ISA remains
   - assert a tax-minimising candidate is preferred
5. regression for couple-plan ISA use
   - partner 2 ISA is no longer stranded forever when strategy semantics say it should be available for use

In `tests/ui/optimizerPanel.test.tsx`:
- verify the breakdown label is `25% Tax Free`
- verify the simplified breakdown heading renders correctly

## Recommended Delivery Order

1. add `isaOrder` types
2. add ISA allocation helper
3. wire strategies to `isaOrder`
4. add tests for spouse ISA usage
5. add dominance rule
6. add tests for avoidable-tax rejection
7. update UI and explanation wording
8. update breakdown copy

## Acceptance Criteria

- For a couple plan with both ISAs enabled, the optimizer can use either person's
  ISA according to the selected strategy, and the baseline waterfall treats ISA
  drawdown as a household tax-minimising bucket rather than `partner 1 first forever`.
- Equal and proportional strategies use both ISA buckets rather than always
  draining person 1 first.
- A tax-minimising strategy does not pay avoidable tax while an available ISA
  bucket remains.
- The breakdown UI uses `25% Tax Free` instead of `PCLS`.
- The yearly breakdown heading is simplified to a shorter plain-English title.
- Strategy definitions and explanation wording stay aligned with the new ISA semantics.


## Future Feature Note

For now, the optimizer and projection engine should treat FI start as a household start for couple plans. Split retirement start ages should be added later as a separate app feature rather than folded into this tax-minimisation fix.
