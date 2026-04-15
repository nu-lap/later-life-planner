import { describe, it, expect } from 'vitest';
import { calculateIHTProjection, IHTProjectionInputs } from '@/financialEngine/ihtProjection';
import { IHT, getNRBForYear, getRNRBForYear, getRNRBTaperThresholdForYear, IHT_FREEZE_END_YEAR, IHT_ESCALATION_RATE } from '@/config/financialConstants';

/** Minimal valid inputs — all assets zero, single, no charity, no gifting surplus.
 * deathYear 2028 is within the freeze (NRB/RNRB frozen at £325k/£175k). */
const base: IHTProjectionInputs = {
  deathYear: 2028,
  primaryResidenceNetValue: 0,
  residenceLeavesToDescendants: false,
  isaValue: 0,
  giaValue: 0,
  cashValue: 0,
  dcPensionValue: 0,
  investmentPropertyValue: 0,
  unusedNrbFraction: 0,
  isCouple: false,
  charitableEstate: false,
  annualIncome: 30_000,
  annualSpending: 28_000,
  remainingYears: 10,
};

describe('calculateIHTProjection', () => {
  it('estate below NRB — single: ihtDue is 0', () => {
    const result = calculateIHTProjection({
      ...base,
      isaValue: 100_000,
      cashValue: 50_000,
    });
    // grossEstate £150k < NRB £325k
    expect(result.ihtDue).toBe(0);
    expect(result.chargeableEstate).toBe(0);
  });

  it('estate below combined NRB+RNRB — couple: ihtDue is 0', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0, // full NRB transfer
      primaryResidenceNetValue: 400_000,
      residenceLeavesToDescendants: true,
      isaValue: 200_000,
      cashValue: 100_000,
    });
    // grossEstate £700k; nrb £650k; rnrb £350k (transferable) → chargeable = max(0, 700k-650k-350k) = 0
    expect(result.ihtDue).toBe(0);
  });

  it('basic couple: £1.6m estate, full RNRB — ihtDue is £240,000', () => {
    // Couple, full NRB transfer → nrb £650k; transferable RNRB (IHTA 1984 s.8D) → rnrb £350k
    // grossEstate = 500k + 300k + 300k + 500k = 1,600,000
    // chargeable = 1,600,000 - 650,000 - 350,000 = 600,000; iht = 240,000
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 500_000,
      residenceLeavesToDescendants: true,
      isaValue: 300_000,
      giaValue: 300_000,
      cashValue: 500_000,
    });
    expect(result.grossEstate).toBe(1_600_000);
    expect(result.nrbAvailable).toBe(650_000);
    expect(result.rnrbAvailable).toBe(350_000);
    expect(result.chargeableEstate).toBe(600_000);
    expect(result.ihtDue).toBe(240_000);
    expect(result.ihtRate).toBe(IHT.RATE);
  });

  it('estate £2.05m — RNRB partially tapered: RNRB < £350k (couple), IHT increases vs untapered', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 800_000,
      residenceLeavesToDescendants: true,
      isaValue: 800_000,
      cashValue: 450_000,
    });
    // grossEstate = 2,050,000; taper reduction = (2,050,000 - 2,000,000)/2 = 25,000
    // rnrb base (couple) = 350,000; rnrb available = 350,000 - 25,000 = 325,000
    expect(result.grossEstate).toBe(2_050_000);
    expect(result.rnrbAvailable).toBe(325_000);
    expect(result.rnrbTaperWarning).toBe(true);
    expect(result.ihtDue).toBeGreaterThan(0);
  });

  it('estate £2.7m — couple RNRB fully tapered to zero', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 900_000,
      residenceLeavesToDescendants: true,
      isaValue: 900_000,
      cashValue: 900_000,
    });
    // grossEstate = 2,700,000; taper reduction = (2,700,000 - 2,000,000)/2 = 350,000
    // rnrb base (couple) = 350,000; rnrb available = 350,000 - 350,000 = 0
    expect(result.grossEstate).toBe(2_700_000);
    expect(result.rnrbAvailable).toBe(0);
  });

  it('pension excluded before 2027: pensionInEstate is 0, no delta', () => {
    const result = calculateIHTProjection({
      ...base,
      deathYear: 2026,
      dcPensionValue: 200_000,
      isaValue: 100_000,
    });
    expect(result.pensionInEstate).toBe(0);
    expect(result.pensionIHTDelta).toBe(0);
    expect(result.grossEstate).toBe(100_000); // pension excluded
  });

  it('pension included from 2027: pensionInEstate equals dcPensionValue, delta > 0', () => {
    const resultWith = calculateIHTProjection({
      ...base,
      deathYear: 2027,
      dcPensionValue: 200_000,
      isaValue: 500_000, // enough to make estate chargeable
      cashValue: 500_000,
    });
    expect(resultWith.pensionInEstate).toBe(200_000);
    expect(resultWith.pensionIHTDelta).toBeGreaterThan(0);
    // delta = 200,000 × 40% = 80,000
    expect(resultWith.pensionIHTDelta).toBe(80_000);
  });

  it('charitable legacy ≥10%: ihtRate is 0.36', () => {
    const result = calculateIHTProjection({
      ...base,
      isaValue: 500_000,
      cashValue: 200_000,
      charitableEstate: true,
    });
    expect(result.ihtRate).toBe(IHT.CHARITY_RATE);
    expect(result.ihtRate).toBe(0.36);
  });

  it('below 10% charity threshold: ihtRate is 0.40', () => {
    const result = calculateIHTProjection({
      ...base,
      isaValue: 500_000,
      cashValue: 200_000,
      charitableEstate: false,
    });
    expect(result.ihtRate).toBe(IHT.RATE);
    expect(result.ihtRate).toBe(0.40);
  });

  it('annual gifting capacity: equals income minus spending', () => {
    const result = calculateIHTProjection({
      ...base,
      isaValue: 1_000_000, // ensure ihtDue > 0 so cap logic is exercised
      annualIncome: 50_000,
      annualSpending: 35_000,
      remainingYears: 10,
    });
    expect(result.annualGiftingCapacity).toBe(15_000);
    // ihtDue = (1,000,000 - 325,000) × 40% = 270,000
    // rawSaving = 15,000 × 10 × 0.40 = 60,000 < ihtDue → saving = 60,000
    expect(result.cumulativeGiftingIHTSaving).toBe(60_000);
  });

  it('no gifting capacity when spending >= income', () => {
    const result = calculateIHTProjection({
      ...base,
      annualIncome: 20_000,
      annualSpending: 25_000,
    });
    expect(result.annualGiftingCapacity).toBe(0);
    expect(result.cumulativeGiftingIHTSaving).toBe(0);
  });

  it('unusedNrbFraction > 1 is clamped to 1: same result as fraction = 1', () => {
    const inputsClamped = { ...base, isCouple: true, unusedNrbFraction: 1.5, isaValue: 1_000_000 };
    const inputsOne = { ...base, isCouple: true, unusedNrbFraction: 1.0, isaValue: 1_000_000 };
    const resultClamped = calculateIHTProjection(inputsClamped);
    const resultOne = calculateIHTProjection(inputsOne);
    expect(resultClamped.nrbAvailable).toBe(resultOne.nrbAvailable);
    expect(resultClamped.ihtDue).toBe(resultOne.ihtDue);
  });

  it('single mode RNRB is £175k (not doubled)', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: false,
      unusedNrbFraction: 0,
      primaryResidenceNetValue: 200_000,
      residenceLeavesToDescendants: true,
      isaValue: 300_000,
    });
    expect(result.rnrbAvailable).toBe(IHT.RNRB); // £175,000 only
  });

  it('RNRB is 0 when primaryResidenceNetValue is 0, even if residenceLeavesToDescendants is true', () => {
    const result = calculateIHTProjection({
      ...base,
      primaryResidenceNetValue: 0,
      residenceLeavesToDescendants: true,
      isaValue: 500_000,
    });
    expect(result.rnrbAvailable).toBe(0);
  });

  it('RNRB is 0 when primaryResidenceNetValue is 0 for a couple', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 0,
      residenceLeavesToDescendants: true,
      isaValue: 500_000,
    });
    expect(result.rnrbAvailable).toBe(0);
  });

  it('RNRB is capped to net residence value when residence < RNRB (single)', () => {
    const result = calculateIHTProjection({
      ...base,
      primaryResidenceNetValue: 80_000, // less than RNRB of £175,000
      residenceLeavesToDescendants: true,
      isaValue: 500_000,
    });
    // rnrbBase = min(175k, 80k) = 80k; no taper (estate < 2m)
    expect(result.rnrbAvailable).toBe(80_000);
  });

  it('RNRB is capped to net residence value when residence < 2×RNRB (couple)', () => {
    const result = calculateIHTProjection({
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 200_000, // less than 2×RNRB = £350,000
      residenceLeavesToDescendants: true,
      isaValue: 500_000,
    });
    // rnrbBase = min(350k, 200k) = 200k; no taper (estate < 2m)
    expect(result.rnrbAvailable).toBe(200_000);
  });

  it('returns zero gifting saving when ihtDue is 0', () => {
    // Estate below NRB so ihtDue = 0; saving should not show a phantom benefit.
    const result = calculateIHTProjection({
      ...base,
      isaValue: 100_000, // grossEstate 100k < NRB 325k → ihtDue = 0
      annualIncome: 50_000,
      annualSpending: 35_000,
      remainingYears: 10,
    });
    expect(result.ihtDue).toBe(0);
    expect(result.cumulativeGiftingIHTSaving).toBe(0);
  });

  it('cumulativeGiftingIHTSaving is capped to ihtDue when raw saving would exceed it', () => {
    // Modest IHT liability with large annual surplus so raw saving > ihtDue.
    const result = calculateIHTProjection({
      ...base,
      isaValue: 400_000, // chargeable = 400k - 325k = 75k; ihtDue = 75k × 40% = 30,000
      annualIncome: 100_000,
      annualSpending: 50_000, // surplus = 50k; raw saving = 50k × 10 × 40% = 200k >> 30k
      remainingYears: 10,
    });
    expect(result.ihtDue).toBe(30_000);
    expect(result.cumulativeGiftingIHTSaving).toBe(30_000); // capped at ihtDue
  });
});

// ─── Post-freeze NRB/RNRB escalation ─────────────────────────────────────────

describe('NRB/RNRB helper functions', () => {
  it('getNRBForYear returns frozen value on and before freeze end year', () => {
    expect(getNRBForYear(2025)).toBe(IHT.NRB);
    expect(getNRBForYear(2030)).toBe(IHT.NRB);
  });

  it('getNRBForYear escalates at IHT_ESCALATION_RATE after freeze', () => {
    const expected = Math.round(IHT.NRB * Math.pow(1 + IHT_ESCALATION_RATE, 5));
    expect(getNRBForYear(IHT_FREEZE_END_YEAR + 5)).toBe(expected);
  });

  it('getRNRBForYear returns frozen value on and before freeze end year', () => {
    expect(getRNRBForYear(2025)).toBe(IHT.RNRB);
    expect(getRNRBForYear(2030)).toBe(IHT.RNRB);
  });

  it('getRNRBForYear escalates at IHT_ESCALATION_RATE after freeze', () => {
    const expected = Math.round(IHT.RNRB * Math.pow(1 + IHT_ESCALATION_RATE, 5));
    expect(getRNRBForYear(IHT_FREEZE_END_YEAR + 5)).toBe(expected);
  });

  it('getRNRBTaperThresholdForYear returns frozen value during freeze', () => {
    expect(getRNRBTaperThresholdForYear(2030)).toBe(IHT.RNRB_TAPER_THRESHOLD);
  });

  it('getRNRBTaperThresholdForYear escalates after freeze', () => {
    const expected = Math.round(IHT.RNRB_TAPER_THRESHOLD * Math.pow(1 + IHT_ESCALATION_RATE, 10));
    expect(getRNRBTaperThresholdForYear(IHT_FREEZE_END_YEAR + 10)).toBe(expected);
  });
});

describe('calculateIHTProjection — post-freeze escalation', () => {
  it('NRB is higher in 2041 than in 2030 (10 years of CPI growth)', () => {
    const frozen = calculateIHTProjection({ ...base, deathYear: 2030, isaValue: 400_000 });
    const escalated = calculateIHTProjection({ ...base, deathYear: 2040, isaValue: 400_000 });
    // Higher NRB in 2040 means less chargeable estate and less IHT.
    expect(escalated.nrbAvailable).toBeGreaterThan(frozen.nrbAvailable);
    expect(escalated.ihtDue).toBeLessThan(frozen.ihtDue);
  });

  it('estate just above 2030 taper threshold is in the taper zone; same estate is not in taper zone post-escalation', () => {
    // In 2030 (frozen): estate £2.05m is above £2m threshold → rnrbTaperWarning = true
    const frozenResult = calculateIHTProjection({
      ...base,
      deathYear: 2030,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 700_000,
      residenceLeavesToDescendants: true,
      isaValue: 800_000,
      cashValue: 550_000, // total = 2,050,000 — just above £2m
    });
    expect(frozenResult.rnrbTaperWarning).toBe(true);
    expect(frozenResult.rnrbAvailable).toBeLessThan(350_000);

    // In 2041 (10 years post-freeze): taper threshold ≈ £2.56m, same estate is below threshold
    const escalatedResult = calculateIHTProjection({
      ...base,
      deathYear: 2040,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 700_000,
      residenceLeavesToDescendants: true,
      isaValue: 800_000,
      cashValue: 550_000,
    });
    expect(escalatedResult.rnrbTaperWarning).toBe(false);
    expect(escalatedResult.rnrbAvailable).toBeGreaterThan(frozenResult.rnrbAvailable);
  });

  it('IHT liability is lower for 2041 death than 2030 death on same nominal estate value', () => {
    const inputs = {
      ...base,
      isCouple: true,
      unusedNrbFraction: 1.0,
      primaryResidenceNetValue: 600_000,
      residenceLeavesToDescendants: true,
      isaValue: 700_000,
      cashValue: 700_000, // gross £2m
    };
    const iht2030 = calculateIHTProjection({ ...inputs, deathYear: 2030 }).ihtDue;
    const iht2040 = calculateIHTProjection({ ...inputs, deathYear: 2040 }).ihtDue;
    // Escalated NRB + RNRB in 2040 → lower IHT on same nominal estate
    expect(iht2040).toBeLessThan(iht2030);
  });
});
