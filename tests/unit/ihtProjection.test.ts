import { describe, it, expect } from 'vitest';
import { calculateIHTProjection, IHTProjectionInputs } from '@/financialEngine/ihtProjection';
import { IHT } from '@/config/financialConstants';

/** Minimal valid inputs — all assets zero, single, no charity, no gifting surplus. */
const base: IHTProjectionInputs = {
  deathYear: 2040,
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
      annualIncome: 50_000,
      annualSpending: 35_000,
      remainingYears: 10,
    });
    expect(result.annualGiftingCapacity).toBe(15_000);
    // cumulative saving = 15,000 × 10 × 0.40 = 60,000
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
});
