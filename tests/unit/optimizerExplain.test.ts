import { describe, expect, test } from 'vitest';
import { paulAndLisaState } from '../fixtures/states';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import {
  buildOptimizationSummary,
  buildOptimizerExplainRequest,
  REQUIRED_EXPLAIN_CONSENT_SCOPES,
} from '@/lib/optimizerExplain';

describe('optimizer explain payload helpers', () => {
  test('buildOptimizationSummary strips year-level detail from the optimizer result', () => {
    const result = optimizeWithdrawals(paulAndLisaState());
    const summary = buildOptimizationSummary(result);

    expect(summary).not.toHaveProperty('yearRecords');
    expect(summary.recommendedStrategy).toEqual(result.recommendedStrategy);
    expect(summary.ruleProvenance).toEqual(result.ruleProvenance);
  });

  test('buildOptimizerExplainRequest produces a minimised payload without personal names', () => {
    const plannerState = paulAndLisaState();
    const request = buildOptimizerExplainRequest({
      plannerState,
      optimizationResult: optimizeWithdrawals(plannerState),
      planRevision: `sha256:${'a'.repeat(64)}`,
      consentScope: [...REQUIRED_EXPLAIN_CONSENT_SCOPES, 'mcp-citations'],
      requestId: 'req_optimizer_explain_1',
      grantedAt: '2026-04-06T10:30:00.000Z',
    });

    const serialized = JSON.stringify(request);

    expect(request.subject).toEqual({
      householdType: 'couple',
      ages: [plannerState.person1.currentAge, plannerState.person2.currentAge],
      jurisdiction: 'rUK',
    });
    expect(request.financialSummary.targetSpendingAnnual).toBeGreaterThan(0);
    expect(request.optimizationResult).not.toHaveProperty('yearRecords');
    expect(serialized).not.toContain(plannerState.person1.name);
    expect(serialized).not.toContain(plannerState.person2.name);
  });

  test('buildOptimizerExplainRequest rejects missing required consent scopes', () => {
    const plannerState = paulAndLisaState();

    expect(() => buildOptimizerExplainRequest({
      plannerState,
      optimizationResult: optimizeWithdrawals(plannerState),
      planRevision: 'etag:abc-123',
      consentScope: ['optimization-result'],
      requestId: 'req_optimizer_explain_2',
      grantedAt: '2026-04-06T10:30:00.000Z',
    })).toThrow(/Missing required consent scope/);
  });
});
