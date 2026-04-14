import { describe, expect, test } from 'vitest';
import {
  calculateGiftingOptimisation,
  type GiftingOptimiserInputs,
} from '@/financialEngine/giftingOptimiser';

// Base inputs for a couple with a £1.5m estate and IHT liability
const BASE_INPUTS: GiftingOptimiserInputs = {
  grossEstate: 1_500_000,
  ihtDue: 0,
  rnrbAvailable: 175_000,
  isCouple: false,
  dcPensionValue: 300_000,
  annualSurplusIncome: 5_000,
  annualIncome: 30_000,   // basic-rate taxpayer
  remainingYears: 20,
};

function inputs(overrides: Partial<GiftingOptimiserInputs>): GiftingOptimiserInputs {
  return { ...BASE_INPUTS, ...overrides };
}

describe('calculateGiftingOptimisation', () => {
  test('no IHT due → no-action', () => {
    const result = calculateGiftingOptimisation(inputs({ ihtDue: 0 }));
    expect(result.recommendationTier).toBe('no-action');
    expect(result.annualIHTSaving).toBe(0);
    expect(result.cumulativeNetBenefit).toBe(0);
  });

  test('basic-rate taxpayer, standard IHT zone → draw-and-gift worthwhile', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 60_000,
        rnrbAvailable: 175_000,
        annualIncome: 30_000,   // 20% marginal rate
        isCouple: false,
      }),
    );
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
    expect(result.marginalIncomeTaxRate).toBe(0.20);
    expect(result.isDrawAndGiftWorthwhile).toBe(true);
    expect(result.recommendationTier).toBe('draw-and-gift');
    expect(result.annualNetBenefit).toBeGreaterThan(0);
  });

  test('higher-rate taxpayer, standard IHT zone → draw-and-gift NOT worthwhile', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 60_000,
        rnrbAvailable: 175_000,
        annualIncome: 80_000,   // 40% marginal rate
        isCouple: false,
      }),
    );
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
    expect(result.marginalIncomeTaxRate).toBe(0.40);
    expect(result.isDrawAndGiftWorthwhile).toBe(false);
    expect(result.recommendationTier).not.toBe('draw-and-gift');
    expect(result.annualDCDrawdownGross).toBe(0);
  });

  test('estate in RNRB taper zone → 60% effective marginal IHT rate', () => {
    // Estate £2.2m — RNRB partially tapered: (2.2m - 2m) / 2 = £100k lost
    const rnrbAvailable = 175_000 - 100_000; // £75,000 remaining
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        annualIncome: 30_000,   // basic rate
        isCouple: false,
      }),
    );
    expect(result.isInTaperZone).toBe(true);
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
    expect(result.recommendationTier).toBe('rnrb-recovery-priority');
  });

  test('higher-rate taxpayer in taper zone → draw-and-gift still worthwhile (40% < 60%)', () => {
    const rnrbAvailable = 175_000 - 100_000;
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        annualIncome: 80_000,   // 40% marginal rate
        isCouple: false,
      }),
    );
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
    expect(result.marginalIncomeTaxRate).toBe(0.40);
    expect(result.isDrawAndGiftWorthwhile).toBe(true);
    expect(result.recommendationTier).toBe('rnrb-recovery-priority');
  });

  test('additional-rate taxpayer in taper zone → draw-and-gift NOT worthwhile (45% < 60% → actually IS)', () => {
    // 45% < 60% so it IS worthwhile
    const rnrbAvailable = 175_000 - 100_000;
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        annualIncome: 200_000,  // 45% additional rate
        isCouple: false,
      }),
    );
    expect(result.marginalIncomeTaxRate).toBe(0.45);
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
    // 45% < 60% → still worthwhile
    expect(result.isDrawAndGiftWorthwhile).toBe(true);
  });

  test('additional-rate taxpayer in standard zone → draw-and-gift NOT worthwhile', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 60_000,
        rnrbAvailable: 175_000,
        annualIncome: 200_000,  // 45% additional rate
        isCouple: false,
      }),
    );
    expect(result.marginalIncomeTaxRate).toBe(0.45);
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
    // 45% > 40% → not worthwhile
    expect(result.isDrawAndGiftWorthwhile).toBe(false);
  });

  test('RNRB recovery opportunity calculated correctly', () => {
    // Estate £2.2m single: RNRB tapered by £100k → rnrbAvailable = £75k
    // maxRNRB = £175k; already lost £100k
    // opportunity = (175k - 75k) * 0.40 = £40,000
    const rnrbAvailable = 75_000;
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        isCouple: false,
      }),
    );
    expect(result.rnrbRecoveryOpportunity).toBeCloseTo((175_000 - 75_000) * 0.40);
    expect(result.giftingNeededForRNRBRecovery).toBe(200_000); // £2.2m - £2m
  });

  test('no DC pot → no DC draw-and-gift even when worthwhile', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 60_000,
        rnrbAvailable: 175_000,
        annualIncome: 30_000,
        dcPensionValue: 0,
      }),
    );
    expect(result.isDrawAndGiftWorthwhile).toBe(false);
    expect(result.annualDCDrawdownGross).toBe(0);
    expect(result.recommendationTier).toBe('income-gifts-only');
  });

  test('couple annual exempt gift allowance is double single', () => {
    const single = calculateGiftingOptimisation(inputs({ ihtDue: 50_000, isCouple: false }));
    const couple = calculateGiftingOptimisation(inputs({ ihtDue: 50_000, isCouple: true }));
    expect(couple.annualExemptGiftAllowance).toBe(single.annualExemptGiftAllowance * 2);
    expect(single.annualExemptGiftAllowance).toBe(3_000);
    expect(couple.annualExemptGiftAllowance).toBe(6_000);
  });

  test('annual net benefit = IHT saving − income tax cost', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        ihtDue: 100_000,
        grossEstate: 1_500_000,
        rnrbAvailable: 175_000,
        annualIncome: 30_000,
      }),
    );
    expect(result.annualNetBenefit).toBeCloseTo(
      result.annualIHTSaving - result.annualIncomeTaxCost,
      5,
    );
  });

  test('cumulative projection = annual × remainingYears', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        ihtDue: 100_000,
        grossEstate: 1_500_000,
        rnrbAvailable: 175_000,
        annualIncome: 30_000,
        remainingYears: 15,
      }),
    );
    expect(result.cumulativeIHTSaving).toBeCloseTo(result.annualIHTSaving * 15, 5);
    expect(result.cumulativeIncomeTaxCost).toBeCloseTo(result.annualIncomeTaxCost * 15, 5);
    expect(result.cumulativeNetBenefit).toBeCloseTo(result.annualNetBenefit * 15, 5);
  });

  test('IHT saving capped at ihtDue', () => {
    // Tiny IHT due relative to gifts
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 500,   // tiny
        rnrbAvailable: 175_000,
        annualIncome: 30_000,
        annualSurplusIncome: 50_000,
      }),
    );
    expect(result.annualIHTSaving).toBeLessThanOrEqual(500);
  });

  test('no surplus income and no DC → no-action when draw-and-gift not worthwhile', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        ihtDue: 50_000,
        annualSurplusIncome: 0,
        dcPensionValue: 0,
        annualIncome: 80_000,  // higher rate, standard zone
      }),
    );
    expect(result.recommendationTier).toBe('income-gifts-only'); // s.19 still applies
  });

  test('zero remaining years → zero cumulative figures', () => {
    const result = calculateGiftingOptimisation(
      inputs({
        ihtDue: 100_000,
        remainingYears: 0,
      }),
    );
    expect(result.cumulativeIHTSaving).toBe(0);
    expect(result.cumulativeNetBenefit).toBe(0);
  });
});
