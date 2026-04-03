/**
 * UK tax calculation helpers.
 *
 * All thresholds and rates are sourced from the HMRC tax rule snapshot
 * (src/config/taxRuleSnapshot.ts) via getSnapshotForYear(calendarYear).
 * Each function accepts an optional calendarYear parameter (defaults to the
 * current calendar year) so multi-year projections can use the correct
 * rule snapshot for each simulation year.
 *
 * HMRC rule references:
 *   calcIncomeTax       → rule_id: income_tax_due  | version: 1.0.0+
 *   isHigherRateTaxpayer → rule_id: is_higher_rate_taxpayer | version: 1.0.0+
 *   calcCGT             → rule_id: cgt_due          | version: 1.0.0+
 */

import { getSnapshotForYear } from '@/config/taxRuleSnapshot';
import { CURRENT_TAX_YEAR_START } from '@/config/financialConstants';

/**
 * Calculate UK income tax for a given adjusted net income figure.
 * Uses HMRC rule `income_tax_due` bands for the specified calendar year.
 *
 * Handles:
 * - Personal allowance taper: PA reduces by £1 per £2 above £100,000, reaching £0 at £125,140.
 * - Three rate bands: basic (20%), higher (40%), additional (45% above £125,140).
 *
 * The basic rate band is always 37,700 wide (basicRateLimit − personalAllowance).
 * When the PA is tapered, additional income is absorbed into the higher rate band,
 * creating an effective 60% marginal rate in the £100,000–£125,140 taper zone.
 *
 * @param taxableIncome  - Adjusted net income before personal allowance (£)
 * @param calendarYear   - Calendar year for rule lookup (default: current year)
 * @returns Income tax due (£)
 */
export function calcIncomeTax(taxableIncome: number, calendarYear?: number): number {
  if (taxableIncome <= 0) return 0;

  const s = getSnapshotForYear(calendarYear ?? CURRENT_TAX_YEAR_START);
  const bands = s.incomeTaxBands;

  // Personal allowance tapers by £1 for every £2 above paTaperThreshold (£100,000),
  // reaching £0 at additionalRateThreshold (£125,140).
  const effectivePA = Math.max(
    0,
    bands.personalAllowance - Math.max(0, taxableIncome - bands.paTaperThreshold) / 2,
  );

  if (taxableIncome <= effectivePA) return 0;

  const taxable = taxableIncome - effectivePA;

  // The basic rate band width is always (basicRateLimit − personalAllowance) = £37,700.
  // When PA is tapered below the original allowance, additional taxable income
  // above the band cap flows into the higher rate band (HMRC rule: income_tax_due).
  const bandWidth = bands.basicRateLimit - bands.personalAllowance;
  const basicBand = Math.min(taxable, bandWidth);
  const higherBand = Math.max(
    0,
    Math.min(taxableIncome, bands.additionalRateThreshold) - effectivePA - basicBand,
  );
  const additionalBand = Math.max(0, taxableIncome - bands.additionalRateThreshold);

  return (
    basicBand      * bands.basicRate +
    higherBand     * bands.higherRate +
    additionalBand * bands.additionalRate
  );
}

/**
 * Returns true if this taxable income level pushes the person into the higher-rate band.
 * Used to determine which CGT rate applies.
 * rule_id: is_higher_rate_taxpayer | version: 1.0.0+
 *
 * @param taxableIncome  - Adjusted net income (£)
 * @param calendarYear   - Calendar year for rule lookup (default: current year)
 */
export function isHigherRateTaxpayer(taxableIncome: number, calendarYear?: number): boolean {
  const s = getSnapshotForYear(calendarYear ?? CURRENT_TAX_YEAR_START);
  return taxableIncome > s.incomeTaxBands.basicRateLimit;
}

/**
 * Calculate CGT due on a capital gain using the proportional disposal method.
 * Annual exempt amount is applied per person.
 * rule_id: cgt_due | version: 1.0.0+
 *
 * @param capitalGain    - Total gain realised this year (£)
 * @param higherRate     - True if the person is a higher-rate taxpayer
 * @param calendarYear   - Calendar year for rule lookup (default: current year)
 * @returns CGT due (£)
 */
export function calcCGT(capitalGain: number, higherRate: boolean, calendarYear?: number): number {
  const s = getSnapshotForYear(calendarYear ?? CURRENT_TAX_YEAR_START);
  const taxableGain = Math.max(0, capitalGain - s.cgt.exemptAmount);
  return taxableGain * (higherRate ? s.cgt.higherRate : s.cgt.basicRate);
}

/**
 * Calculate the tax-free and taxable portions of a GIA disposal
 * using the proportional method (not FIFO).
 *
 * The gain fraction is spread proportionally across each £1 of value.
 * Base cost is reduced by the non-gain (capital return) portion of the withdrawal.
 *
 * @param value    - Current market value of the GIA (£)
 * @param baseCost - Purchase price / base cost (£)
 * @param needed   - Amount needed from the GIA (£)
 */
export function drawFromGIA(
  value: number,
  baseCost: number,
  needed: number,
): { drawn: number; capitalGain: number; newValue: number; newBaseCost: number } {
  if (value <= 0 || needed <= 0) {
    return { drawn: 0, capitalGain: 0, newValue: value, newBaseCost: baseCost };
  }

  const drawn          = Math.min(value, needed);
  const gainFraction   = value > baseCost ? (value - baseCost) / value : 0;
  const capitalGain    = drawn * gainFraction;
  const capitalReturn  = drawn - capitalGain;

  return {
    drawn,
    capitalGain,
    newValue:    value    - drawn,
    newBaseCost: Math.max(0, baseCost - capitalReturn),
  };
}
