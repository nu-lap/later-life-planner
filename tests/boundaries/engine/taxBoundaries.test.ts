import { describe, test, expect } from 'vitest';
import { calcIncomeTax, calcCGT, drawFromGIA } from '@/financialEngine/taxCalculations';
import { INCOME_TAX, CGT } from '@/config/financialConstants';

// All tests use 2025 tax year (CURRENT_TAX_YEAR_START default).
// Key 2025-26 values: PA = £12,570, basic limit = £50,270,
// additional threshold = £125,140, PA taper starts at £100,000.

describe('calcIncomeTax — rate band boundaries', () => {
  test('income at personal allowance: zero tax', () => {
    expect(calcIncomeTax(INCOME_TAX.PERSONAL_ALLOWANCE)).toBe(0);
  });

  test('income just above PA: only basic rate applies', () => {
    const income = INCOME_TAX.PERSONAL_ALLOWANCE + 1000;
    const expected = 1000 * INCOME_TAX.BASIC_RATE;
    expect(calcIncomeTax(income)).toBeCloseTo(expected, 0);
  });

  test('income at top of basic rate band: only 20% on the taxable slice', () => {
    const income = INCOME_TAX.BASIC_RATE_LIMIT;
    const expected = (income - INCOME_TAX.PERSONAL_ALLOWANCE) * INCOME_TAX.BASIC_RATE;
    expect(calcIncomeTax(income)).toBeCloseTo(expected, 0);
  });

  test('income £1 above basic rate limit: higher rate begins on the excess', () => {
    const atLimit = calcIncomeTax(INCOME_TAX.BASIC_RATE_LIMIT);
    const oneLess  = calcIncomeTax(INCOME_TAX.BASIC_RATE_LIMIT - 1);
    expect(atLimit - oneLess).toBeCloseTo(INCOME_TAX.BASIC_RATE, 2);

    const justOver = calcIncomeTax(INCOME_TAX.BASIC_RATE_LIMIT + 1);
    expect(justOver - atLimit).toBeCloseTo(INCOME_TAX.HIGHER_RATE, 2);
  });

  test('income at £150,000: additional rate (45%) applies above £125,140', () => {
    const additional = 150_000 - INCOME_TAX.ADDITIONAL_RATE_THRESHOLD;
    const tax = calcIncomeTax(150_000);
    const atThreshold = calcIncomeTax(INCOME_TAX.ADDITIONAL_RATE_THRESHOLD);
    expect(tax - atThreshold).toBeCloseTo(additional * INCOME_TAX.ADDITIONAL_RATE, 0);
  });
});

describe('calcIncomeTax — personal allowance taper (£100k–£125,140)', () => {
  test('income at exactly £100,000: PA not yet tapered (taper starts above threshold)', () => {
    const atThreshold = calcIncomeTax(INCOME_TAX.PA_TAPER_THRESHOLD);
    const justBelow   = calcIncomeTax(INCOME_TAX.PA_TAPER_THRESHOLD - 1);
    // The taper starts at income > £100,000, so marginal rate at exactly £100k is 40%
    expect(atThreshold - justBelow).toBeCloseTo(INCOME_TAX.HIGHER_RATE, 2);
  });

  test('effective marginal rate in taper zone is ~60%', () => {
    // In the taper zone (£100k–£125,140), each £1 of income:
    //   • costs £0.40 higher-rate tax on the new income
    //   • reduces PA by £0.50, shifting £0.50 from tax-free to 40% = £0.20 extra tax
    //   • combined marginal rate = 60%
    const income      = 110_000;
    const delta       = 1_000;
    const taxAt       = calcIncomeTax(income + delta);
    const taxBefore   = calcIncomeTax(income);
    const effectiveRate = (taxAt - taxBefore) / delta;
    expect(effectiveRate).toBeCloseTo(0.60, 2);
  });

  test('income at £112,570: PA halved to £6,285', () => {
    // effectivePA = 12570 - (112570 - 100000)/2 = 12570 - 6285 = 6285
    // tax on the lower-PA income should exceed the no-taper case
    const withTaper    = calcIncomeTax(112_570);
    const noTaperApprox = calcIncomeTax(100_000) + 12_570 * INCOME_TAX.HIGHER_RATE;
    // withTaper should be higher because PA has been reduced
    expect(withTaper).toBeGreaterThan(noTaperApprox);
  });

  test('income at £125,140: PA fully tapered to zero', () => {
    // effectivePA = 0 at ADDITIONAL_RATE_THRESHOLD (£125,140)
    // All income is taxable; basic band = first 37700, rest higher
    const fullTaperTax = calcIncomeTax(INCOME_TAX.ADDITIONAL_RATE_THRESHOLD);
    const bandWidth = INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE;
    const expected =
      bandWidth * INCOME_TAX.BASIC_RATE +
      (INCOME_TAX.ADDITIONAL_RATE_THRESHOLD - bandWidth) * INCOME_TAX.HIGHER_RATE;
    expect(fullTaperTax).toBeCloseTo(expected, 0);
  });
});

describe('calcCGT — annual exempt amount boundary', () => {
  test('gain exactly at exempt amount: CGT is zero', () => {
    expect(calcCGT(CGT.ANNUAL_EXEMPT, false)).toBe(0);
    expect(calcCGT(CGT.ANNUAL_EXEMPT, true)).toBe(0);
  });

  test('gain £1 above exempt: CGT due at basic rate (basic-rate taxpayer)', () => {
    const taxableGain = 1;
    expect(calcCGT(CGT.ANNUAL_EXEMPT + taxableGain, false)).toBeCloseTo(taxableGain * CGT.BASIC_RATE, 4);
  });

  test('gain £1 above exempt: CGT due at higher rate (higher-rate taxpayer)', () => {
    const taxableGain = 1;
    expect(calcCGT(CGT.ANNUAL_EXEMPT + taxableGain, true)).toBeCloseTo(taxableGain * CGT.HIGHER_RATE, 4);
  });

  test('gain below exempt amount: CGT is zero', () => {
    expect(calcCGT(CGT.ANNUAL_EXEMPT - 1, false)).toBe(0);
  });

  test('higher-rate CGT is greater than basic-rate CGT for same gain', () => {
    const gain = 10_000;
    expect(calcCGT(gain, true)).toBeGreaterThan(calcCGT(gain, false));
  });
});

describe('drawFromGIA — proportional gain calculation', () => {
  test('drawing entire GIA with 100% gain: capitalGain = drawn amount', () => {
    const { drawn, capitalGain, newValue, newBaseCost } = drawFromGIA(100, 0, 100);
    expect(drawn).toBe(100);
    expect(capitalGain).toBe(100);
    expect(newValue).toBe(0);
    expect(newBaseCost).toBe(0);
  });

  test('drawing half of a GIA with 50% gain: proportional gain returned', () => {
    const { drawn, capitalGain, newValue, newBaseCost } = drawFromGIA(100_000, 50_000, 50_000);
    expect(drawn).toBe(50_000);
    // gainFraction = (100k - 50k) / 100k = 0.5; gain on 50k drawn = 25k
    expect(capitalGain).toBeCloseTo(25_000, 0);
    expect(newValue).toBe(50_000);
    // capitalReturn = 25k; newBaseCost = 50k - 25k = 25k
    expect(newBaseCost).toBeCloseTo(25_000, 0);
  });

  test('GIA with baseCost = value: no capital gain on disposal', () => {
    const { capitalGain } = drawFromGIA(50_000, 50_000, 25_000);
    expect(capitalGain).toBe(0);
  });

  test('baseCost greater than value: gain fraction treated as zero (no negative gains)', () => {
    // If baseCost > value, gainFraction = 0 (loss scenario)
    const { capitalGain } = drawFromGIA(50_000, 70_000, 25_000);
    expect(capitalGain).toBe(0);
  });

  test('drawing nothing: no change to balances', () => {
    const result = drawFromGIA(100_000, 50_000, 0);
    expect(result.drawn).toBe(0);
    expect(result.capitalGain).toBe(0);
    expect(result.newValue).toBe(100_000);
    expect(result.newBaseCost).toBe(50_000);
  });
});
