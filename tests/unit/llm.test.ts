import { describe, expect, test } from 'vitest';
import { buildPrompt } from '@/lib/llm';
import type { ExplanationContext } from '@/lib/llm';

function sampleContext(): ExplanationContext {
  return {
    planSummary: {
      householdType: 'couple',
      ages: [56, 57],
      jurisdiction: 'rUK',
      guaranteedIncomeAnnual: 24029,
      dcTotal: 1200000,
      isaTotal: 165000,
      giaTotal: 20000,
      targetSpendingAnnual: 66891,
      planRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    optimizationResult: {
      recommendedStrategy: { dcOrder: 'paul-first', isaMode: 'now', label: '2-Paul-DC-First-ISA-Now' },
      baselineStrategy: { dcOrder: 'paul-first', isaMode: 'now', label: '1-LLP-Baseline' },
      lifetimeTaxSaving: 24219,
      assetDepletionAge: null,
      terminalAssets: 1913496,
      ruleProvenance: [
        {
          rule_id: 'cgt_rates',
          version: '2026-27.1',
          tax_year_requested: '2029-30',
          tax_year_used: '2026-27',
          jurisdiction: 'rUK',
          is_fallback: true,
        },
      ],
    },
  };
}

describe('buildPrompt', () => {
  test('uses plain-English wording for the optimizer explanation context', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).toContain('England, Wales or Northern Ireland');
    expect(prompt).toContain("first projected year's target");
    expect(prompt).toContain('State Pension');
    expect(prompt).toContain('only starts from State Pension age');
    expect(prompt).toContain("app's standard starting strategy");
    expect(prompt).toContain('Use ISA withdrawals from the start of the plan where needed.');
  });

  test('does not expose raw internal strategy codes in the explanation context', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).not.toContain('paul-first');
    expect(prompt).not.toContain('2-Paul-DC-First-ISA-Now');
    expect(prompt).not.toContain('1-LLP-Baseline');
    expect(prompt).not.toContain('rUK');
  });
});
