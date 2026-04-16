import { describe, expect, test } from 'vitest';
import {
  calculateGiftingOptimisation,
  calculateRNRBScenarios,
  type GiftingOptimiserInputs,
  type RNRBScenarioInputs,
} from '@/financialEngine/giftingOptimiser';
import { INCOME_TAX, PENSION_RULES } from '@/config/financialConstants';

// Base inputs for a couple with a £1.5m estate and IHT liability
const BASE_INPUTS: GiftingOptimiserInputs = {
  grossEstate: 1_500_000,
  ihtDue: 0,
  rnrbAvailable: 175_000,
  rnrbEligible: true,
  rnrbBase: 175_000,
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
        rnrbEligible: true,
        rnrbBase: 175_000,
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
        rnrbEligible: true,
        rnrbBase: 175_000,
        annualIncome: 80_000,   // 40% marginal rate
        isCouple: false,
      }),
    );
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
    expect(result.marginalIncomeTaxRate).toBe(0.40);
    expect(result.isDrawAndGiftWorthwhile).toBe(true);
    expect(result.recommendationTier).toBe('rnrb-recovery-priority');
  });

  test('additional-rate taxpayer in taper zone → draw-and-gift IS worthwhile because 45% < 60%', () => {
    // 45% < 60% so it IS worthwhile
    const rnrbAvailable = 175_000 - 100_000;
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        rnrbEligible: true,
        rnrbBase: 175_000,
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
    // rnrbBase = £175k (full eligible pre-taper base); already lost £100k
    // opportunity = (175k - 75k) * 0.40 = £40,000
    const rnrbAvailable = 75_000;
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable,
        rnrbEligible: true,
        rnrbBase: 175_000,
        isCouple: false,
      }),
    );
    expect(result.rnrbRecoveryOpportunity).toBeCloseTo((175_000 - 75_000) * 0.40);
    expect(result.giftingNeededForRNRBRecovery).toBe(200_000); // £2.2m - £2m
  });

  test('RNRB ineligible (residence not left to descendants) → no taper-zone logic', () => {
    // Estate £2.2m — would be in taper zone, but RNRB is not eligible.
    // Gifting should save at standard 40% only; no recovery opportunity.
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable: 0,    // not claimed
        rnrbEligible: false, // residence not left to descendants
        rnrbBase: 0,
        annualIncome: 30_000,
        isCouple: false,
      }),
    );
    expect(result.isInTaperZone).toBe(false);
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
    expect(result.rnrbRecoveryOpportunity).toBe(0);
    expect(result.recommendationTier).not.toBe('rnrb-recovery-priority');
  });

  test('estate above taper ceiling → RNRB fully tapered, reverts to standard 40% rate', () => {
    // Estate £2.4m — above RNRB_TAPER_END_SINGLE (£2.35m).
    // RNRB is completely tapered away; no recovery is possible via gifting.
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_400_000,
        ihtDue: 260_000,
        rnrbAvailable: 0,   // fully tapered away
        rnrbEligible: true,
        rnrbBase: 175_000,
        annualIncome: 30_000,
        isCouple: false,
      }),
    );
    expect(result.isInTaperZone).toBe(false);
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
    expect(result.rnrbRecoveryOpportunity).toBe(0);
    expect(result.giftingNeededForRNRBRecovery).toBe(0);
  });

  test('rnrbBase caps recovery opportunity when residence value < full RNRB', () => {
    // Estate £2.2m, residence worth only £100k (less than full £175k RNRB).
    // rnrbBase = £100k; after taper from £2.2m: rnrbAvailable = 100k - 100k = £0k
    // opportunity = (100k - 0) * 0.40 = £40,000 (not 175k × 0.40 = £70k)
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_200_000,
        ihtDue: 200_000,
        rnrbAvailable: 0,
        rnrbEligible: true,
        rnrbBase: 100_000,   // low-value residence
        isCouple: false,
      }),
    );
    expect(result.isInTaperZone).toBe(true);
    expect(result.rnrbRecoveryOpportunity).toBeCloseTo(100_000 * 0.40);
  });

  test('DC drawdown capped when exempt gifts already cover IHT liability', () => {
    // Exempt gifts cover all IHT → DC drawdown should be zero to avoid
    // paying income tax with no IHT benefit.
    // ihtDue = £1,000; annualExemptGiftAllowance = £3,000 → exemptIHTSaving = £1,200 > £1,000
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 1_500_000,
        ihtDue: 1_000,
        rnrbAvailable: 175_000,
        rnrbEligible: true,
        rnrbBase: 175_000,
        annualIncome: 30_000,   // basic rate — DC draw-and-gift would normally be worthwhile
        dcPensionValue: 300_000,
        annualSurplusIncome: 0,
      }),
    );
    // Exempt gift (s.19 = £3k) saves £1,200 in IHT — exceeds the £1k liability.
    // DC drawdown would incur income tax with no IHT payback → should be 0.
    expect(result.annualDCDrawdownGross).toBe(0);
    expect(result.annualNetBenefit).toBeGreaterThanOrEqual(0);
    // s.19 gifts still recommended
    expect(result.recommendationTier).toBe('income-gifts-only');
  });

  test('taper zone: s.21/s.19 exempt gifts use 60% effective rate — DC drawdown suppressed when not needed', () => {
    // Estate £2.1m single; annualSurplusIncome £5k + s.19 £3k = £8k total exempt gifts
    // At 60%: exemptIHTSaving = £4,800 > ihtDue £4,000 → DC drawdown = 0
    // Regression for bug where 40% was used: exemptIHTSaving = £3,200 < £4,000
    // → DC drawdown incorrectly recommended, incurring income tax with no benefit
    const result = calculateGiftingOptimisation(
      inputs({
        grossEstate: 2_100_000,
        ihtDue: 4_000,
        rnrbAvailable: 75_000,      // (2.1m - 2m) / 2 = £50k lost → 175k - 50k = £125k
        rnrbEligible: true,
        rnrbBase: 175_000,
        isCouple: false,
        annualIncome: 30_000,       // basic rate — DC draw-and-gift would normally be worthwhile
        annualSurplusIncome: 5_000,
        dcPensionValue: 300_000,
        remainingYears: 15,
      }),
    );
    // Exempt gifts (£5k s.21 + £3k s.19) at 60% = £4,800 saving > £4k liability
    // DC drawdown must be zero — no residual IHT left to recover
    expect(result.isInTaperZone).toBe(true);
    expect(result.annualDCDrawdownGross).toBe(0);
    expect(result.annualIHTSaving).toBeLessThanOrEqual(4_000);
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

// ─── Post-freeze RNRB taper escalation ───────────────────────────────────────

describe('calculateGiftingOptimisation — post-freeze calendarYear escalation', () => {
  // For an estate of £2.05m in 2030 (frozen threshold £2m), the estate is in the taper zone.
  // In 2041 (10 years post-freeze), the taper threshold is ~£2.56m, so the same estate is
  // no longer in the taper zone — effective marginal rate drops from 60% to 40%.
  const taperInputs: GiftingOptimiserInputs = {
    grossEstate: 2_050_000,
    ihtDue: 200_000,
    rnrbAvailable: 150_000,
    rnrbEligible: true,
    rnrbBase: 175_000,
    isCouple: false,
    dcPensionValue: 500_000,
    annualSurplusIncome: 5_000,
    annualIncome: 40_000,
    remainingYears: 10,
  };

  test('defaults to current year when calendarYear omitted (frozen values)', () => {
    const result = calculateGiftingOptimisation(taperInputs);
    // Current year 2025 is during freeze — threshold £2m, estate £2.05m → in taper zone
    expect(result.isInTaperZone).toBe(true);
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
  });

  test('estate £2.05m in 2030 is in taper zone (frozen threshold)', () => {
    const result = calculateGiftingOptimisation({ ...taperInputs, calendarYear: 2030 });
    expect(result.isInTaperZone).toBe(true);
    expect(result.effectiveMarginalIHTRate).toBe(0.60);
  });

  test('same estate in 2041 exits taper zone as escalated threshold exceeds estate value', () => {
    // After 10 years at 2.5%: taper threshold ≈ £2,000,000 × 1.025^10 ≈ £2,560,169 > £2,050,000
    const result = calculateGiftingOptimisation({ ...taperInputs, calendarYear: 2041 });
    expect(result.isInTaperZone).toBe(false);
    expect(result.effectiveMarginalIHTRate).toBe(0.40);
  });

  test('giftingNeededForRNRBRecovery uses escalated threshold in post-freeze year', () => {
    // In 2030 (frozen £2m): giftingNeeded = £2.05m - £2m = £50k
    const frozen = calculateGiftingOptimisation({ ...taperInputs, calendarYear: 2030 });
    expect(frozen.giftingNeededForRNRBRecovery).toBe(50_000);

    // In 2032 (£2m × 1.025^2 ≈ £2,100,625): same estate £2.05m is below threshold → not in taper
    const escalated = calculateGiftingOptimisation({ ...taperInputs, calendarYear: 2032 });
    expect(escalated.isInTaperZone).toBe(false);
    expect(escalated.giftingNeededForRNRBRecovery).toBe(0);
  });
});

// ─── calculateRNRBScenarios ─────────────────────────────────────────────────

// Baseline: couple with £9m estate, fully-tapered RNRB (grossEstate >> £2.7m ceiling).
// NRB available = 2×£325k = £650k. IHT rate = 40%.
// ihtDue = (£9m - £650k - £0 rnrb) * 0.40 = £3.34m
const RNRB_SCENARIO_BASE: RNRBScenarioInputs = {
  grossEstate: 9_000_000,
  ihtDue: 3_340_000,
  ihtRate: 0.40,
  nrbAvailable: 650_000,
  maxPreTaperRNRB: 350_000,   // 2×£175k, fully tapered to 0 at this estate level
  p1DcAtRetirement: 1_440_000,
  p2DcAtRetirement: 360_000,
  yearsInRetirement: 36,
  isCouple: true,
  deathYear: 2061,
};

describe('calculateRNRBScenarios', () => {
  test('returns three scenarios: B1, B2, C2', () => {
    const scenarios = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map(s => s.id)).toEqual(['B1', 'B2', 'C2']);
  });

  test('B1 — PCLS only, no annual drawdown', () => {
    const [b1] = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    const expectedPCLS = Math.min(RNRB_SCENARIO_BASE.p1DcAtRetirement * 0.25, PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE);
    expect(b1.upfrontPCLS).toBeCloseTo(expectedPCLS, 0);
    expect(b1.annualDrawdown).toBe(0);
    expect(b1.annualIncomeTaxCost).toBe(0);
    expect(b1.totalEstateReduction).toBeCloseTo(expectedPCLS, 0);
    expect(b1.totalIncomeTaxCost).toBe(0);
    expect(b1.ihtSaving).toBeGreaterThan(0);
    expect(b1.netBenefit).toBe(b1.ihtSaving);
  });

  test('B1 — PCLS is capped at the LSA (£268,275)', () => {
    const [b1] = calculateRNRBScenarios({
      ...RNRB_SCENARIO_BASE,
      p1DcAtRetirement: 2_000_000,  // 25% = £500k > LSA
    });
    expect(b1.upfrontPCLS).toBe(PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE);
  });

  test('B2 — includes both PCLS and annual drawdown', () => {
    const [, b2] = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    const p1PCLS = Math.min(RNRB_SCENARIO_BASE.p1DcAtRetirement * 0.25, PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE);
    const p2PCLS = Math.min(RNRB_SCENARIO_BASE.p2DcAtRetirement * 0.25, PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE);
    expect(b2.upfrontPCLS).toBeCloseTo(p1PCLS + p2PCLS, 0);
    expect(b2.annualDrawdown).toBe(50_000);
    expect(b2.annualIncomeTaxCost).toBeCloseTo(50_000 * INCOME_TAX.BASIC_RATE, 0);
    expect(b2.annualGift).toBeCloseTo(50_000 * (1 - INCOME_TAX.BASIC_RATE), 0);
    const expectedEstateDelta = b2.upfrontPCLS + 50_000 * RNRB_SCENARIO_BASE.yearsInRetirement;
    expect(b2.totalEstateReduction).toBeCloseTo(expectedEstateDelta, 0);
  });

  test('C2 — no PCLS, uses default basic-rate band capacity', () => {
    const [, , c2] = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    const expectedC2Drawdown = INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE;
    expect(c2.upfrontPCLS).toBe(0);
    expect(c2.annualDrawdown).toBe(expectedC2Drawdown);
    expect(c2.totalEstateReduction).toBeCloseTo(expectedC2Drawdown * RNRB_SCENARIO_BASE.yearsInRetirement, 0);
  });

  test('income tax cost is basic-rate fraction of drawdown × years', () => {
    const [, b2, c2] = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    expect(b2.totalIncomeTaxCost).toBeCloseTo(b2.annualIncomeTaxCost * RNRB_SCENARIO_BASE.yearsInRetirement, 0);
    expect(c2.totalIncomeTaxCost).toBeCloseTo(c2.annualIncomeTaxCost * RNRB_SCENARIO_BASE.yearsInRetirement, 0);
  });

  test('net benefit = iht saving − income tax cost', () => {
    const scenarios = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    for (const s of scenarios) {
      expect(s.netBenefit).toBeCloseTo(s.ihtSaving - s.totalIncomeTaxCost, 2);
    }
  });

  test('iht saving ≥ 0 for all scenarios', () => {
    const scenarios = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    for (const s of scenarios) {
      expect(s.ihtSaving).toBeGreaterThanOrEqual(0);
    }
  });

  test('newGrossEstate < grossEstate for all scenarios', () => {
    const scenarios = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    for (const s of scenarios) {
      expect(s.newGrossEstate).toBeLessThan(RNRB_SCENARIO_BASE.grossEstate);
    }
  });

  test('scenarios that cross £2m threshold set breachesRNRBTaperThreshold', () => {
    // Estate just above £2m — use deathYear within the freeze (£2m flat threshold).
    // B1 PCLS = £100k brings estate from £2.1m to £2.0m → crosses threshold.
    const nearThreshold: RNRBScenarioInputs = {
      ...RNRB_SCENARIO_BASE,
      grossEstate: 2_100_000,
      ihtDue: 200_000,
      p1DcAtRetirement: 400_000,  // PCLS = min(100k, LSA) = 100k → estate drops to £2m exactly
      p2DcAtRetirement: 0,
      yearsInRetirement: 5,
      deathYear: 2029,  // within the NRB/RNRB freeze — threshold stays at £2m
    };
    const [b1] = calculateRNRBScenarios(nearThreshold);
    expect(b1.upfrontPCLS).toBe(100_000);
    expect(b1.breachesRNRBTaperThreshold).toBe(true);
  });

  test('B2 and C2 have larger estate reduction than B1', () => {
    const [b1, b2, c2] = calculateRNRBScenarios(RNRB_SCENARIO_BASE);
    expect(b2.totalEstateReduction).toBeGreaterThan(b1.totalEstateReduction);
    expect(c2.totalEstateReduction).toBeGreaterThan(b1.totalEstateReduction);
  });

  test('custom drawdown overrides are respected', () => {
    const [, b2, c2] = calculateRNRBScenarios({
      ...RNRB_SCENARIO_BASE,
      b2AnnualDrawdown: 30_000,
      c2AnnualDrawdown: 20_000,
    });
    expect(b2.annualDrawdown).toBe(30_000);
    expect(c2.annualDrawdown).toBe(20_000);
  });

  test('single person plan — P2 PCLS is zero', () => {
    const [, b2] = calculateRNRBScenarios({
      ...RNRB_SCENARIO_BASE,
      isCouple: false,
      p2DcAtRetirement: 200_000,
    });
    // B2 PCLS should only include P1
    const p1PCLS = Math.min(RNRB_SCENARIO_BASE.p1DcAtRetirement * 0.25, PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE);
    expect(b2.upfrontPCLS).toBeCloseTo(p1PCLS, 0);
  });

  test('returns empty array is never returned — 3 scenarios always', () => {
    // Even with zero DC pots, 3 scenarios are returned (B1/B2 PCLS = 0, C2 drawdown)
    const scenarios = calculateRNRBScenarios({
      ...RNRB_SCENARIO_BASE,
      p1DcAtRetirement: 0,
      p2DcAtRetirement: 0,
    });
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].upfrontPCLS).toBe(0);
    expect(scenarios[1].upfrontPCLS).toBe(0);
  });
});
