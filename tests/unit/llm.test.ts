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

function singleSampleContext(): ExplanationContext {
  return {
    planSummary: {
      householdType: 'single',
      ages: [65],
      jurisdiction: 'rUK',
      guaranteedIncomeAnnual: 12531,
      dcTotal: 450000,
      isaTotal: 110000,
      giaTotal: 25000,
      targetSpendingAnnual: 48457,
      planRevision: 'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    },
    optimizationResult: {
      recommendedStrategy: { dcOrder: 'proportional', isaMode: 'now', label: '3-Proportional' },
      baselineStrategy: { dcOrder: 'paul-first', isaMode: 'now', label: '1-LLP-Baseline' },
      lifetimeTaxSaving: 0,
      assetDepletionAge: null,
      terminalAssets: 2100000,
      ruleProvenance: [],
    },
  };
}

describe('buildPrompt', () => {
  test('uses plain-English wording for the optimizer explanation context', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).toContain('England, Wales or Northern Ireland');
    expect(prompt).toContain("first projected year's target");
    expect(prompt).toContain("LaterLifePlan's usual starting approach");
    expect(prompt).toMatch(/State Pension.*start from State Pension age/i);
    expect(prompt).toMatch(/starting strategy/i);
    expect(prompt).toContain('Use ISA withdrawals from the start of the plan where needed.');
    expect(prompt).toContain('Treat required spending as a net cash target.');
  });


  test('requires a fixed bullet-led explanation structure and forbids internal labels', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).toContain('The final answer must use exactly these headings: Recommendation, Why this fits, Points to note.');
    expect(prompt).toContain('Under each heading, use bullet points rather than dense prose.');
    expect(prompt).toContain('Do not say things like ISA mode, baseline, fallback version, payload, schema, technical guidance retrieval terms, or raw strategy labels.');
    expect(prompt).toContain("app's usual starting approach");
  });

  test('does not expose raw internal strategy codes in the explanation context', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).not.toContain('paul-first');
    expect(prompt).not.toContain('2-Paul-DC-First-ISA-Now');
    expect(prompt).not.toContain('1-LLP-Baseline');
    expect(prompt).not.toContain('rUK');
  });

  test('uses the single-person baseline description for single plans', () => {
    const prompt = buildPrompt(singleSampleContext());

    expect(prompt).toContain('One person aged 65 living in England, Wales or Northern Ireland');
    expect(prompt).toContain("LaterLifePlan's standard order is DC pension within the personal allowance plus 25% PCLS, then GIA within the CGT allowance, then ISA, then remaining GIA, then DC pension above the personal allowance.");
    expect(prompt).not.toContain('each person’s personal allowance');
  });
});
