import { describe, expect, test } from 'vitest';
import { buildPrompt, generateGoalPolicyOverride } from '@/lib/llm';
import type { ExplanationContext } from '@/lib/llm';
import type { GoalOrchestrationContext } from '@/lib/llm';

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
      timelineFacts: {
        planStartAges: [60, 61],
        statePensionStartAges: [67],
        dbPensionStartAges: [65],
        annuityStartAges: [],
      },
    },
    optimizationResult: {
      recommendedStrategy: { dcOrder: 'equal', isaMode: 'now', label: '2-Couple-equal' },
      baselineStrategy: { dcOrder: 'paul-first', isaMode: 'now', label: '1-LLP-Baseline' },
      lifetimeTaxSaving: 24219,
      assetDepletionAge: null,
      terminalAssets: 1913496,
      firstYearSpending: 66891,
      firstYearNetIncome: 66891,
      firstYearTax: 0,
      laterYearTaxApplies: true,
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
      timelineFacts: {
        planStartAges: [65],
        statePensionStartAges: [67],
        dbPensionStartAges: [],
        annuityStartAges: [],
      },
    },
    optimizationResult: {
      recommendedStrategy: { dcOrder: 'proportional', isaMode: 'now', label: '3-Proportional' },
      baselineStrategy: { dcOrder: 'paul-first', isaMode: 'now', label: '1-LLP-Baseline' },
      lifetimeTaxSaving: 0,
      assetDepletionAge: null,
      terminalAssets: 2100000,
      firstYearSpending: 48457,
      firstYearNetIncome: 48457,
      firstYearTax: 0,
      laterYearTaxApplies: false,
      ruleProvenance: [],
    },
  };
}

describe('buildPrompt', () => {
  test('uses plain-English wording for the optimizer explanation context', () => {
    const prompt = buildPrompt(sampleContext());

    expect(prompt).toContain('You are a couple aged 56 and 57 living in England, Wales or Northern Ireland');
    expect(prompt).toContain("Your first projected year's spending target");
    expect(prompt).toContain('Your plan starts at ages 60 and 61.');
    expect(prompt).toContain('Both of your State Pensions are set to start at age 67.');
    expect(prompt).toContain('A defined benefit pension in your plan starts at age 65.');
    expect(prompt).toContain('Couple-equal DC drawdown is being compared against LLP baseline waterfall.');
    expect(prompt).toMatch(/starting strategy/i);
    expect(prompt).toContain('Use ISA withdrawals from the start of the plan where needed.');
    expect(prompt).toContain('Treat required spending as a net cash target.');
    expect(prompt).toContain('Couple-equal DC drawdown');
    expect(prompt).toContain('Split taxable pension withdrawals evenly between both partners where possible, and split ISA withdrawals evenly when ISA money is needed.');
    expect(prompt).toContain("Comparison strategy: LaterLifePlan's standard order is DC pension within each person's personal allowance plus 25% tax-free, then GIA within the CGT allowance, then ISA, then remaining GIA, then DC pension above the personal allowance. Once ISA withdrawals are needed in a couple plan, both ISAs are used evenly as household tax-free savings");
    expect(prompt).toContain('Recommended approach: Couple-equal DC drawdown.');
    expect(prompt).toContain('The first projected year meets the spending target of £66,891 with no tax due in that year.');
    expect(prompt).toContain('Address the user as you and your.');
    expect(prompt).toContain('Do not refer to the user or the household as the couple, they, them, or their.');
    expect(prompt).toContain('When exact plan start ages or pension start ages are provided, use those exact ages in the explanation.');
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

    expect(prompt).toContain('You are aged 65 and living in England, Wales or Northern Ireland');
    expect(prompt).toContain('Your plan starts at age 65.');
    expect(prompt).toContain('Your State Pension is set to start at age 67.');
    expect(prompt).toContain("LaterLifePlan's standard order is DC pension within the personal allowance plus 25% tax-free, then GIA within the CGT allowance, then ISA, then remaining GIA, then DC pension above the personal allowance.");
    expect(prompt).not.toContain('each person’s personal allowance');
  });
});

describe('generateGoalPolicyOverride', () => {
  function sampleGoalContext(enabledIds: string[]): GoalOrchestrationContext {
    return {
      planSummary: {
        householdType: 'couple',
        ages: [56, 57],
        jurisdiction: 'rUK',
        targetSpendingAnnual: 60600,
        guaranteedIncomeAnnual: 24029,
        dcTotal: 1200000,
        isaTotal: 165000,
        giaTotal: 20000,
        careReserveAmount: 0,
      },
      goalRegistry: [
        { id: 'tax_efficiency', priority: 1, enabled: enabledIds.includes('tax_efficiency') },
        { id: 'spending_floor', priority: 2, enabled: enabledIds.includes('spending_floor'), targetValue: 70000 },
        { id: 'longevity_protection', priority: 3, enabled: enabledIds.includes('longevity_protection'), targetValue: 40000 },
      ],
    };
  }

  test('does not add a spending floor when only tax efficiency is enabled', async () => {
    const policyOverride = await generateGoalPolicyOverride(sampleGoalContext(['tax_efficiency']));

    expect(policyOverride.minAnnualIncome).toBeUndefined();
  });

  test('keeps the fallback spending floor for income-floor goals without an explicit target', async () => {
    const policyOverride = await generateGoalPolicyOverride({
      ...sampleGoalContext(['spending_floor']),
      goalRegistry: [
        { id: 'spending_floor', priority: 1, enabled: true },
      ],
    });

    expect(policyOverride.minAnnualIncome).toBe(60600);
  });
});
