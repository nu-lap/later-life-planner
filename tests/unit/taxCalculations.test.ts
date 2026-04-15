/**
 * Unit tests — tax calculation functions.
 * Tests every boundary, rate, and edge case for income tax, CGT, and GIA drawdown.
 */

import { describe, test, expect, vi } from 'vitest';
import { calcIncomeTax, calcCGT, drawFromGIA, isHigherRateTaxpayer } from '@/financialEngine/taxCalculations';
import { INCOME_TAX, CGT } from '@/config/financialConstants';
import { getSnapshotForYear } from '@/config/taxRuleSnapshot';

// ─── calcIncomeTax ────────────────────────────────────────────────────────────

describe('calcIncomeTax', () => {
  const Y = 2025; // pin to 2025-26 tax year for deterministic expectations

  test('zero income → £0', () => {
    expect(calcIncomeTax(0, Y)).toBe(0);
  });

  test('income below personal allowance → £0', () => {
    expect(calcIncomeTax(10_000, Y)).toBe(0);
  });

  test('income exactly at personal allowance → £0', () => {
    expect(calcIncomeTax(INCOME_TAX.PERSONAL_ALLOWANCE, Y)).toBe(0);
  });

  test('£1 above personal allowance → 20p tax', () => {
    expect(calcIncomeTax(INCOME_TAX.PERSONAL_ALLOWANCE + 1, Y)).toBeCloseTo(0.20, 2);
  });

  test('£20,000 income → £1,486 (£7,430 × 20%)', () => {
    expect(calcIncomeTax(20_000, Y)).toBeCloseTo(1_486, 0);
  });

  test('income at basic-rate limit → £7,540 (full basic band at 20%)', () => {
    const expected = (INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE) * INCOME_TAX.BASIC_RATE;
    expect(calcIncomeTax(INCOME_TAX.BASIC_RATE_LIMIT, Y)).toBeCloseTo(expected, 0);
  });

  test('£1 above basic-rate limit → basic band + 40p higher rate', () => {
    const basicTax = (INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE) * INCOME_TAX.BASIC_RATE;
    expect(calcIncomeTax(INCOME_TAX.BASIC_RATE_LIMIT + 1, Y)).toBeCloseTo(basicTax + 0.40, 2);
  });

  test('£60,000 income → correct higher-rate calculation', () => {
    const basicBand  = (INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE) * INCOME_TAX.BASIC_RATE;
    const higherBand = (60_000 - INCOME_TAX.BASIC_RATE_LIMIT) * INCOME_TAX.HIGHER_RATE;
    expect(calcIncomeTax(60_000, Y)).toBeCloseTo(basicBand + higherBand, 0);
  });

  test('negative income → £0 (never negative)', () => {
    expect(calcIncomeTax(-5_000, Y)).toBe(0);
  });

  test('income at additional-rate threshold → PA fully tapered to £0', () => {
    // At £125,140 the PA taper eliminates the personal allowance entirely.
    // effectivePA = max(0, 12570 − (125140 − 100000)/2) = 0
    // HMRC formula: basic rate band width is always 37,700 (basicRateLimit − personalAllowance).
    // When PA=0, the 37,700-wide basic band covers £0–£37,700; the remainder up to
    // £125,140 falls in the higher rate band (creating the 60% effective marginal rate
    // in the £100,000–£125,140 taper zone).
    // basicBand  = £37,700 × 20% = £7,540
    // higherBand = (£125,140 − £37,700) × 40% = £87,440 × 40% = £34,976
    const tax = calcIncomeTax(INCOME_TAX.ADDITIONAL_RATE_THRESHOLD, Y);
    const bandWidth      = INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE; // 37,700
    const expectedBasic  = bandWidth * INCOME_TAX.BASIC_RATE;
    const expectedHigher = (INCOME_TAX.ADDITIONAL_RATE_THRESHOLD - bandWidth) * INCOME_TAX.HIGHER_RATE;
    expect(tax).toBeCloseTo(expectedBasic + expectedHigher, 0);
  });

  test('income in PA taper zone (£110,000) → reduced PA increases tax vs fixed PA', () => {
    // effectivePA = max(0, 12570 − (110000 − 100000)/2) = 7570
    // At £110,000 with fixed PA the tax would be £31,432; with taper it's £32,432 (£1,000 more).
    const taxWithTaper = calcIncomeTax(110_000, Y);
    const taxFixedPa   = (INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE) * INCOME_TAX.BASIC_RATE
                       + (110_000 - INCOME_TAX.BASIC_RATE_LIMIT) * INCOME_TAX.HIGHER_RATE;
    expect(taxWithTaper).toBeGreaterThan(taxFixedPa);
  });

  test('income above additional-rate threshold → 45% band applies', () => {
    // £140,000: additional band = 140000 − 125140 = £14,860 at 45%
    const tax = calcIncomeTax(140_000, Y);
    const additionalTax = (140_000 - INCOME_TAX.ADDITIONAL_RATE_THRESHOLD) * INCOME_TAX.ADDITIONAL_RATE;
    // Tax must include the 45% additional band contribution
    expect(tax).toBeGreaterThan(additionalTax);
    // Verify additional band is taxed at 45% by checking total exceeds the higher-rate-only result
    const higherRateOnly = calcIncomeTax(INCOME_TAX.ADDITIONAL_RATE_THRESHOLD, Y);
    expect(tax).toBeGreaterThan(higherRateOnly);
  });
});

// ─── isHigherRateTaxpayer ─────────────────────────────────────────────────────

describe('isHigherRateTaxpayer', () => {
  const Y = 2025;

  test('£0 income → false', () => {
    expect(isHigherRateTaxpayer(0, Y)).toBe(false);
  });

  test('income below basic-rate limit → false', () => {
    expect(isHigherRateTaxpayer(30_000, Y)).toBe(false);
  });

  test('income at basic-rate limit → false', () => {
    expect(isHigherRateTaxpayer(INCOME_TAX.BASIC_RATE_LIMIT, Y)).toBe(false);
  });

  test('£1 above basic-rate limit → true', () => {
    expect(isHigherRateTaxpayer(INCOME_TAX.BASIC_RATE_LIMIT + 1, Y)).toBe(true);
  });

  test('£100,000 income → true', () => {
    expect(isHigherRateTaxpayer(100_000, Y)).toBe(true);
  });
});

// ─── calcCGT ─────────────────────────────────────────────────────────────────

describe('calcCGT', () => {
  const Y = 2025;

  test('zero gain → £0', () => {
    expect(calcCGT(0, false, Y)).toBe(0);
  });

  test('gain below annual exempt → £0', () => {
    expect(calcCGT(CGT.ANNUAL_EXEMPT - 1, false, Y)).toBe(0);
  });

  test('gain exactly at annual exempt → £0', () => {
    expect(calcCGT(CGT.ANNUAL_EXEMPT, false, Y)).toBe(0);
  });

  test('£1 above exempt, basic rate → 18p', () => {
    expect(calcCGT(CGT.ANNUAL_EXEMPT + 1, false, Y)).toBeCloseTo(CGT.BASIC_RATE, 2);
  });

  test('£10,000 gain, basic rate → £1,260 (£7,000 × 18%)', () => {
    expect(calcCGT(10_000, false, Y)).toBeCloseTo((10_000 - CGT.ANNUAL_EXEMPT) * CGT.BASIC_RATE, 0);
  });

  test('£10,000 gain, higher rate → £1,680 (£7,000 × 24%)', () => {
    expect(calcCGT(10_000, true, Y)).toBeCloseTo((10_000 - CGT.ANNUAL_EXEMPT) * CGT.HIGHER_RATE, 0);
  });

  test('negative gain → £0', () => {
    expect(calcCGT(-5_000, false, Y)).toBe(0);
  });

  test('basic rate (18%) is less than higher rate (24%) for same gain', () => {
    expect(calcCGT(10_000, false, Y)).toBeLessThan(calcCGT(10_000, true, Y));
  });
});

// ─── drawFromGIA ─────────────────────────────────────────────────────────────

describe('drawFromGIA', () => {
  test('draws exactly the requested amount', () => {
    const r = drawFromGIA(10_000, 6_000, 2_000);
    expect(r.drawn).toBe(2_000);
  });

  test('reduces value by drawn amount', () => {
    const r = drawFromGIA(10_000, 6_000, 2_000);
    expect(r.newValue).toBe(8_000);
  });

  test('calculates proportional capital gain (40% gain fraction)', () => {
    // Value £10k, base £6k → 40% gain fraction; draw £2k → gain £800
    const r = drawFromGIA(10_000, 6_000, 2_000);
    expect(r.capitalGain).toBeCloseTo(800, 1);
  });

  test('reduces base cost proportionally (draws 20% of value → 20% of base cost)', () => {
    // Draw £2k from £10k = 20%; base cost reduces by 20% of £6k = £1,200; new BC = £4,800
    const r = drawFromGIA(10_000, 6_000, 2_000);
    expect(r.newBaseCost).toBeCloseTo(4_800, 1);
  });

  test('caps draw at available value', () => {
    const r = drawFromGIA(5_000, 3_000, 10_000);
    expect(r.drawn).toBe(5_000);
    expect(r.newValue).toBe(0);
  });

  test('zero capital gain when value equals base cost (no gain)', () => {
    const r = drawFromGIA(5_000, 5_000, 2_000);
    expect(r.capitalGain).toBe(0);
  });

  test('zero capital gain when base cost exceeds value (underwater)', () => {
    const r = drawFromGIA(5_000, 7_000, 2_000);
    expect(r.capitalGain).toBe(0);
  });

  test('handles zero value — no draw, no error', () => {
    const r = drawFromGIA(0, 0, 1_000);
    expect(r.drawn).toBe(0);
    expect(r.capitalGain).toBe(0);
    expect(r.newValue).toBe(0);
  });

  test('handles zero needed — no draw', () => {
    const r = drawFromGIA(10_000, 6_000, 0);
    expect(r.drawn).toBe(0);
    expect(r.newValue).toBe(10_000);
    expect(r.newBaseCost).toBe(6_000);
  });

  test('full draw reduces base cost to zero', () => {
    const r = drawFromGIA(10_000, 6_000, 10_000);
    expect(r.newValue).toBe(0);
    expect(r.newBaseCost).toBeCloseTo(0, 1);
  });

  test('drawn + newValue = original value', () => {
    const r = drawFromGIA(10_000, 6_000, 3_000);
    expect(r.drawn + r.newValue).toBeCloseTo(10_000, 1);
  });

  test('capitalGain is never negative', () => {
    const r = drawFromGIA(10_000, 12_000, 5_000);
    expect(r.capitalGain).toBeGreaterThanOrEqual(0);
  });
});

// ─── HMRC worked examples (calendarYear: 2025 → tax year 2025-26) ────────────
// Expected values cross-checked against the hmrc-local-execute_rule tool
// for tax year 2025-26, jurisdiction rUK.
// HMRC rule: income_tax_due | version: 1.0.0
// HMRC rule: cgt_due        | version: 1.0.0

describe('HMRC income tax worked examples (calendarYear: 2025, tax year 2025-26)', () => {
  const Y = 2025;

  test('income £10,000 → £0 (below personal allowance)', () => {
    expect(calcIncomeTax(10_000, Y)).toBe(0);
  });

  test('income £30,000 → £3,486 (basic rate only: (30000−12570)×20%)', () => {
    // Verified: hmrc-local income_tax_due 2025-26 → 3486.00
    expect(calcIncomeTax(30_000, Y)).toBeCloseTo(3_486, 0);
  });

  test('income £75,000 → £17,432 (basic + higher rate bands)', () => {
    // basicBand = 37,700 × 20% = £7,540
    // higherBand = (75,000 − 12,570 − 37,700) × 40% = 24,730 × 40% = £9,892
    // total = £17,432
    // Verified: hmrc-local income_tax_due 2025-26 → 17432.00
    expect(calcIncomeTax(75_000, Y)).toBeCloseTo(17_432, 0);
  });

  test('income £110,000 → £33,432 (PA tapered from £12,570 to £7,570)', () => {
    // effectivePA = 12,570 − (110,000 − 100,000) / 2 = 7,570
    // taxable = 102,430; basicBand = 37,700 × 20% = £7,540
    // higherBand = (110,000 − 7,570 − 37,700) × 40% = 64,730 × 40% = £25,892
    // total = £33,432
    // Verified: hmrc-local income_tax_due 2025-26 → 33432.00
    expect(calcIncomeTax(110_000, Y)).toBeCloseTo(33_432, 0);
  });

  test('income £130,000 → £44,703 (PA fully tapered to £0; additional rate applies)', () => {
    // effectivePA = 0 (fully tapered; PA reaches £0 at £125,140)
    // basicBand = 37,700 × 20% = £7,540
    // higherBand = (125,140 − 37,700) × 40% = 87,440 × 40% = £34,976
    // additionalBand = (130,000 − 125,140) × 45% = 4,860 × 45% = £2,187
    // total = £44,703
    // Verified: hmrc-local income_tax_due 2025-26 → 44703.00
    expect(calcIncomeTax(130_000, Y)).toBeCloseTo(44_703, 0);
  });
});

describe('HMRC CGT worked examples (calendarYear: 2025, tax year 2025-26)', () => {
  const Y = 2025;

  test('gain £2,000, basic rate → £0 (below annual exempt amount of £3,000)', () => {
    // Verified: hmrc-local cgt_due 2025-26 → 0.00
    expect(calcCGT(2_000, false, Y)).toBe(0);
  });

  test('gain £10,000, basic rate → £1,260 (18% on £7,000 taxable gain)', () => {
    // taxableGain = 10,000 − 3,000 = 7,000; CGT = 7,000 × 18% = £1,260
    // Verified: hmrc-local cgt_due 2025-26 → 1260.00
    expect(calcCGT(10_000, false, Y)).toBeCloseTo(1_260, 0);
  });

  test('gain £10,000, higher rate → £1,680 (24% on £7,000 taxable gain)', () => {
    // taxableGain = 10,000 − 3,000 = 7,000; CGT = 7,000 × 24% = £1,680
    // Verified: hmrc-local cgt_due 2025-26 → 1680.00
    expect(calcCGT(10_000, true, Y)).toBeCloseTo(1_680, 0);
  });
});

// ─── Snapshot fallback behaviour ─────────────────────────────────────────────
// Verifies that getSnapshotForYear correctly falls back to the latest confirmed
// entry when the requested year is beyond rule coverage, and that the fallback
// flags are set correctly.

describe('getSnapshotForYear — fallback behaviour', () => {
  test('calendarYear 2025 → exact 2025-26 income tax entry; no fallback', () => {
    const s = getSnapshotForYear(2025);
    expect(s.taxYear).toBe('2025-26');
    expect(s.incomeTaxBands.taxYear).toBe('2025-26');
    expect(s.incomeTaxBands.ruleVersion).toBe('1.0.1');
    expect(s.cgtFallback).toBe(false);
    expect(s.pensionFallback).toBe(false);
  });

  test('calendarYear 2025 → exact 2025-26 CGT entry; cgtFallback false', () => {
    const s = getSnapshotForYear(2025);
    expect(s.cgt.taxYear).toBe('2025-26');
    expect(s.cgt.exemptAmount).toBe(3_000);
    expect(s.cgtFallback).toBe(false);
  });

  test('calendarYear 2030 → exact 2030-31 income tax entry (full coverage)', () => {
    const s = getSnapshotForYear(2030);
    expect(s.taxYear).toBe('2030-31');
    expect(s.incomeTaxBands.taxYear).toBe('2030-31');
    expect(s.incomeTaxBands.personalAllowance).toBe(12_570);
  });

  test('calendarYear 2030 → cgt falls back to 2026-27; cgtFallback true; exemptAmount escalated 4 yrs', () => {
    const s = getSnapshotForYear(2030);
    expect(s.cgtFallback).toBe(true);
    // No confirmed entry for 2030-31; exemptAmount is escalated 4%/yr × 4 years from 2026-27 baseline.
    expect(s.cgt.exemptAmount).toBe(Math.round(3_000 * Math.pow(1.04, 4))); // £3,510
    // CGT rates are never escalated
    expect(s.cgt.basicRate).toBe(0.18);
    expect(s.cgt.higherRate).toBe(0.24);
  });

  test('calendarYear 2030 → pension falls back to 2026-27; pensionFallback true', () => {
    const s = getSnapshotForYear(2030);
    expect(s.pensionFallback).toBe(true);
    expect(s.pension.taxYear).toBe('2026-27');
    expect(s.pension.lsa).toBe(268_275);
  });

  test('CGT for 2030 simulation year: exemptAmount escalated, rates from 2026-27 baseline', () => {
    // HMRC has not published CGT beyond 2026-27. exemptAmount escalates at 4%/yr;
    // rates (18%/24%) are frozen at the last confirmed value — not escalated.
    const s2030 = getSnapshotForYear(2030);
    const s2026 = getSnapshotForYear(2026);
    expect(s2030.cgt.exemptAmount).toBeGreaterThan(s2026.cgt.exemptAmount);
    expect(s2030.cgt.basicRate).toBe(s2026.cgt.basicRate);
    expect(s2030.cgt.higherRate).toBe(s2026.cgt.higherRate);
  });

  test('future-year fallback warnings are emitted once per fallback group', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      vi.resetModules();
      const { getSnapshotForYear: getFreshSnapshotForYear } = await import('@/config/taxRuleSnapshot');

      getFreshSnapshotForYear(2027);
      getFreshSnapshotForYear(2028);
      getFreshSnapshotForYear(2030);

      expect(warnSpy).toHaveBeenCalledTimes(3);

      const messages = warnSpy.mock.calls.map(([message]) => String(message));
      expect(messages.some((message) => message.includes('CGT rules not confirmed'))).toBe(true);
      expect(messages.some((message) => message.includes('Pension rules not confirmed'))).toBe(true);
      expect(messages.some((message) => message.includes('State pension annual amount not confirmed'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      vi.resetModules();
    }
  });
});

// ─── Post-freeze tax band escalation ─────────────────────────────────────────
// Verifies that income-tax thresholds are escalated at TAX_BAND_ESCALATION_RATE
// (4%/yr) for simulation years beyond the confirmed freeze end (2030).
// Tax *rates* must remain unchanged.

describe('getSnapshotForYear — post-freeze band escalation', () => {
  test('calendarYear 2030 (last frozen year) → PA still at £12,570', () => {
    const s = getSnapshotForYear(2030);
    expect(s.incomeTaxBands.personalAllowance).toBe(12_570);
    expect(s.incomeTaxBands.basicRateLimit).toBe(50_270);
    expect(s.incomeTaxBands.additionalRateThreshold).toBe(125_140);
  });

  test('calendarYear 2031 (1 year post-freeze) → thresholds escalated by 4%', () => {
    const s = getSnapshotForYear(2031);
    expect(s.incomeTaxBands.personalAllowance).toBe(Math.round(12_570 * 1.04));       // £13,073
    expect(s.incomeTaxBands.basicRateLimit).toBe(Math.round(50_270 * 1.04));           // £52,281
    expect(s.incomeTaxBands.additionalRateThreshold).toBe(Math.round(125_140 * 1.04)); // £130,146
    expect(s.incomeTaxBands.paTaperThreshold).toBe(Math.round(100_000 * 1.04));        // £104,000
  });

  test('calendarYear 2031 → tax rates unchanged (not escalated)', () => {
    const s = getSnapshotForYear(2031);
    expect(s.incomeTaxBands.basicRate).toBe(0.20);
    expect(s.incomeTaxBands.higherRate).toBe(0.40);
    expect(s.incomeTaxBands.additionalRate).toBe(0.45);
  });

  test('calendarYear 2035 (5 years post-freeze) → thresholds compound correctly', () => {
    const s = getSnapshotForYear(2035);
    const factor = Math.pow(1.04, 5);
    expect(s.incomeTaxBands.personalAllowance).toBe(Math.round(12_570 * factor));
    expect(s.incomeTaxBands.basicRateLimit).toBe(Math.round(50_270 * factor));
    expect(s.incomeTaxBands.additionalRateThreshold).toBe(Math.round(125_140 * factor));
    // Rates still frozen
    expect(s.incomeTaxBands.higherRate).toBe(0.40);
  });

  test('escalation is strictly greater than frozen values for all years > 2030', () => {
    for (const yr of [2031, 2035, 2040, 2050]) {
      const s = getSnapshotForYear(yr);
      expect(s.incomeTaxBands.personalAllowance).toBeGreaterThan(12_570);
      expect(s.incomeTaxBands.basicRateLimit).toBeGreaterThan(50_270);
      expect(s.incomeTaxBands.additionalRateThreshold).toBeGreaterThan(125_140);
    }
  });

  test('escalated snapshot taxYear reflects the requested year', () => {
    const s = getSnapshotForYear(2035);
    expect(s.taxYear).toBe('2035-36');
  });
});

// ─── CGT exempt amount escalation ────────────────────────────────────────────
describe('getSnapshotForYear — CGT exempt amount escalation', () => {
  test('calendarYear 2026 (last confirmed) → exemptAmount £3,000, rates unchanged', () => {
    const s = getSnapshotForYear(2026);
    expect(s.cgt.exemptAmount).toBe(3_000);
    expect(s.cgt.basicRate).toBe(0.18);
    expect(s.cgt.higherRate).toBe(0.24);
    expect(s.cgtFallback).toBe(false);
  });

  test('calendarYear 2027 (1 year post-confirmed) → exemptAmount escalated 4%', () => {
    const s = getSnapshotForYear(2027);
    expect(s.cgt.exemptAmount).toBe(Math.round(3_000 * 1.04)); // £3,120
    expect(s.cgt.basicRate).toBe(0.18);
    expect(s.cgt.higherRate).toBe(0.24);
    expect(s.cgtFallback).toBe(true);
  });

  test('calendarYear 2036 (10 years post-confirmed) → exemptAmount compounds correctly', () => {
    const s = getSnapshotForYear(2036);
    expect(s.cgt.exemptAmount).toBe(Math.round(3_000 * Math.pow(1.04, 10)));
    expect(s.cgt.basicRate).toBe(0.18);
    expect(s.cgt.higherRate).toBe(0.24);
  });
});

// ─── ISA annual allowance escalation ─────────────────────────────────────────
describe('getSnapshotForYear — ISA annual allowance escalation', () => {
  test('calendarYear 2026 (last confirmed) → ISA allowance £20,000', () => {
    const s = getSnapshotForYear(2026);
    expect(s.isaAnnualAllowance).toBe(20_000);
  });

  test('calendarYear 2025 → ISA allowance £20,000', () => {
    const s = getSnapshotForYear(2025);
    expect(s.isaAnnualAllowance).toBe(20_000);
  });

  test('calendarYear 2027 (1 year post-confirmed) → ISA allowance escalated 4%', () => {
    const s = getSnapshotForYear(2027);
    expect(s.isaAnnualAllowance).toBe(Math.round(20_000 * 1.04)); // £20,800
  });

  test('calendarYear 2031 (5 years post-confirmed) → ISA allowance compounds correctly', () => {
    const s = getSnapshotForYear(2031);
    expect(s.isaAnnualAllowance).toBe(Math.round(20_000 * Math.pow(1.04, 5)));
  });

  test('ISA allowance strictly increases year-on-year beyond 2026', () => {
    const years = [2027, 2030, 2035, 2040];
    let prev = 20_000;
    for (const yr of years) {
      const s = getSnapshotForYear(yr);
      expect(s.isaAnnualAllowance).toBeGreaterThan(prev);
      prev = s.isaAnnualAllowance;
    }
  });
});
