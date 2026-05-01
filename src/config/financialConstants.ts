/**
 * Central configuration for all UK financial constants and assumptions.
 *
 * RULE: No financial value should be hardcoded in any component or engine.
 *       All values are defined here with source, reason, and adjustability notes.
 *
 * CGT, pension LSA, and UFPLS fraction values are now sourced from the HMRC
 * tax rule snapshot (src/config/taxRuleSnapshot.ts) for the current tax year.
 * Run `npm run gen:tax-snapshot` to refresh the snapshot when HMRC publishes new rates.
 */

import { getSnapshotForYear, TAX_BAND_FREEZE_END_YEAR, TAX_BAND_ESCALATION_RATE, ISA_ANNUAL_ALLOWANCE_BASE } from './taxRuleSnapshot';

// Re-export so callers only need to import from financialConstants.
export { TAX_BAND_FREEZE_END_YEAR, TAX_BAND_ESCALATION_RATE, ISA_ANNUAL_ALLOWANCE_BASE };

// Snapshot for the current tax year — used to initialise constants below.
// Pinned to a specific calendar year so values are deterministic across server/client
// and independent of the user's system clock. Bump CURRENT_TAX_YEAR_START each April
// alongside running `npm run gen:tax-snapshot`.
export const CURRENT_TAX_YEAR_START = 2025; // 2025-26 tax year
const _currentYearSnapshot = getSnapshotForYear(CURRENT_TAX_YEAR_START);

// ─── UK Income Tax 2024/25 ────────────────────────────────────────────────────
// Source: HMRC — https://www.gov.uk/income-tax-rates
// User-adjustable: No (HMRC-defined). Update annually.

export const INCOME_TAX = {
  /** Personal allowance: income below this is tax-free. */
  PERSONAL_ALLOWANCE: 12_570,
  /** Top of basic-rate band. Income between personal allowance and this is taxed at BASIC_RATE. */
  BASIC_RATE_LIMIT: 50_270,
  /** Income tax rate on income within the basic-rate band. */
  BASIC_RATE: 0.20,
  /** Income tax rate on income above the basic-rate limit. */
  HIGHER_RATE: 0.40,
  /** Additional-rate threshold. */
  ADDITIONAL_RATE_THRESHOLD: 125_140,
  /** Additional-rate tax rate. */
  ADDITIONAL_RATE: 0.45,
  /**
   * Income above this threshold tapers the personal allowance by £1 for every £2,
   * reducing it to £0 at ADDITIONAL_RATE_THRESHOLD (£125,140).
   */
  PA_TAPER_THRESHOLD: 100_000,
} as const;

// ─── Capital Gains Tax ────────────────────────────────────────────────────────
// Source: hmrc-tax-mcp rule `cgt_due` — values from taxRuleSnapshot for current year.
// Rates on non-property assets raised in Autumn Budget 30 Oct 2024.
// Annual exempt cut from £6,000 (2023/24) to £3,000 (2024/25 onwards).
// User-adjustable: No (HMRC-defined). Update via `npm run gen:tax-snapshot`.

export const CGT = {
  /** Annual exempt amount per person. Gains below this are not taxed. */
  ANNUAL_EXEMPT: _currentYearSnapshot.cgt.exemptAmount,
  /** CGT rate for basic-rate taxpayers on non-property assets (from 30 Oct 2024). */
  BASIC_RATE: _currentYearSnapshot.cgt.basicRate,
  /** CGT rate for higher-rate taxpayers on non-property assets (from 30 Oct 2024). */
  HIGHER_RATE: _currentYearSnapshot.cgt.higherRate,
  /** CGT rate for basic-rate taxpayers on residential property gains. */
  PROPERTY_BASIC_RATE: 0.18,
  /** CGT rate for higher-rate taxpayers on residential property gains. */
  PROPERTY_HIGHER_RATE: 0.24,
} as const;

// ─── State Pension 2024/25 ───────────────────────────────────────────────────
// Source: DWP — https://www.gov.uk/new-state-pension
// User-adjustable: Yes — users input their own personal forecast.

export const STATE_PENSION = {
  /** Full new State Pension weekly amount 2024/25 (after triple lock). */
  FULL_NEW_WEEKLY: 221.20,
  /** Current minimum State Pension age for people already in scope today. */
  CURRENT_MIN_AGE: 66,
  /** Years of National Insurance needed for the full new State Pension. */
  QUALIFYING_YEARS_FULL: 35,
  /** Minimum NI years to receive any new State Pension. */
  MIN_QUALIFYING_YEARS: 10,
  /** Current State Pension age. Rising to 67 between 2026–2028. */
  DEFAULT_AGE: 67,
  /** Published rise to age 67 is due by this year. */
  RISE_TO_67_BY_YEAR: 2028,
} as const;

// ─── UK Retirement Living Standards (RLSS) 2024 ──────────────────────────────
// Source: Pensions and Lifetime Savings Association (PLSA) — https://www.retirementlivingstandards.org.uk
// User-adjustable: These are starting templates only; users customise category amounts.

export const RLSS = {
  single: {
    minimum:     { annual: 13_400, label: 'Minimum',     emoji: '🏠', description: 'Covers basic needs with a little flexibility' },
    moderate:    { annual: 31_700, label: 'Moderate',    emoji: '🌿', description: 'More financial security and comfort' },
    comfortable: { annual: 43_900, label: 'Comfortable', emoji: '⭐', description: 'More freedom and some luxuries' },
  },
  couple: {
    minimum:     { annual: 21_600, label: 'Minimum',     emoji: '🏠', description: 'Covers basic needs with a little flexibility' },
    moderate:    { annual: 43_900, label: 'Moderate',    emoji: '🌿', description: 'More financial security and comfort' },
    comfortable: { annual: 60_600, label: 'Comfortable', emoji: '⭐', description: 'More freedom and some luxuries' },
  },
} as const;

// ─── DC Pension: UFPLS rules ──────────────────────────────────────────────────
// Source: hmrc-tax-mcp rules `pension_lsa`, `pension_ufpls_tax_free_fraction`,
//         `pension_ufpls_taxable_fraction` — values from taxRuleSnapshot for current year.
// Update via `npm run gen:tax-snapshot` when HMRC revises these figures.
// The app uses a pure UFPLS (Uncrystallised Funds Pension Lump Sum) strategy.
// No upfront PCLS lump sum is taken at crystallisation — each withdrawal spreads
// the 25% tax-free entitlement across the drawdown period, leaving the full pot
// invested and tax-sheltered for longer.

export const PENSION_RULES = {
  /**
   * Fraction of each UFPLS withdrawal that is tax-free.
   * Source: HMRC rule `pension_ufpls_tax_free_fraction` — 25% of each UFPLS is tax-free.
   * The remaining 75% is taxable as income in the year of withdrawal.
   * Before State Pension age, the 75% taxable portion can often be absorbed
   * by the personal allowance, making early UFPLS draws highly tax-efficient.
   */
  UFPLS_TAX_FREE_FRACTION: _currentYearSnapshot.pension.ufplsTaxFreeFraction,
  /**
   * Lifetime Lump Sum Allowance (LSA) — the maximum total tax-free cash a person
   * can take from all pension schemes in their lifetime.
   * Source: HMRC rule `pension_lsa` (Finance Act 2024).
   * £268,275 = 25% of the former standard Lifetime Allowance (£1,073,100).
   * The 25% tax-free UFPLS portion of each withdrawal accumulates against this limit.
   * Once the LSA is exhausted, subsequent DC withdrawals are fully taxable.
   */
  PCLS_LUMP_SUM_ALLOWANCE: _currentYearSnapshot.pension.lsa,
  /** Minimum age at which DC pension can be accessed before April 2028. */
  MIN_ACCESS_AGE: 55,
  /** Normal Minimum Pension Age from April 2028 onwards. */
  MIN_ACCESS_AGE_POST_2028: 57,
  /** Calendar year in which the NMPA rises from 55 to 57. */
  NMPA_RISE_YEAR: 2028,
} as const;

// ─── Gap-period salary net factor ────────────────────────────────────────────
// Applied to P2's gross workplace salary during the gap period (P1 retired, P2
// still working) to estimate the take-home net amount used in the projection.
// Approximation: 20% basic-rate income tax + 12% employee NI Class 1 → ~32%
// combined deduction → ~68% retained (1 – 0.20 – 0.12 = 0.68).
// This is intentionally a simple estimate; the engine does not run a full
// marginal-tax simulation for gap-period earnings.
// Source: HMRC income tax (INCOME_TAX.BASIC_RATE = 0.20) +
//         NI Class 1 employee rate 12% (HMRC NIC Schedule — effective for
//         earnings between the primary threshold and upper earnings limit).
// User-adjustable: No (reflect UK statutory deductions).

/**
 * Fraction of a P2 gross salary retained as take-home during the gap period.
 * Approximation: basic-rate income tax (20%) + employee NI Class 1 (12%) = 32%
 * deduction, leaving 68% net.
 */
export const GAP_PERIOD_NET_SALARY_FACTOR = 0.68;

// ─── Default projection assumptions ─────────────────────────────────────────
// User-adjustable: Yes — displayed in Step 3 and overrideable via env vars.
// Source: UK long-run market averages and OBR inflation forecasts.

export const DEFAULT_ASSUMPTIONS = {
  /**
   * Expected annual nominal investment return.
   * Source: long-run UK equity average ~7%; net of charges ~4–5%.
   * Override via env: NEXT_PUBLIC_INVESTMENT_RETURN
   */
  INVESTMENT_GROWTH: parseFloat(process.env.NEXT_PUBLIC_INVESTMENT_RETURN ?? '4'),

  /**
   * Expected annual CPI inflation rate.
   * Source: Bank of England 2% target; historical average ~2.5%.
   * Override via env: NEXT_PUBLIC_DEFAULT_INFLATION
   */
  INFLATION: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_INFLATION ?? '2.5'),

  /**
   * Default planning horizon (life expectancy).
   * Source: ONS UK life expectancy at 65; planning to 95 is prudent.
   * User-adjustable in Step 1.
   */
  LIFE_EXPECTANCY: parseInt(process.env.NEXT_PUBLIC_DEFAULT_LIFE_EXPECTANCY ?? '95'),

  /**
   * Default primary user age when no age is stored.
   */
  DEFAULT_AGE: 57,

  /**
   * Default financial independence age — the age from which work becomes a choice.
   * Life stages (Go-Go Years, Slo-Go Years, No-Go Years) start from this age.
   * Everything before this is the building phase, still fully modelled in projections.
   */
  FI_AGE: 65,

  /**
   * Annual nominal house price growth rate used for IHT estate projections.
   * Source: Voyant Adviser UK default (3 %/yr nominal). Consistent with long-run
   * UK historic average of c.3–3.5 % and OBR medium-term house price forecasts.
   * Override via env: NEXT_PUBLIC_HOUSE_PRICE_GROWTH
   */
  HOUSE_PRICE_GROWTH: parseFloat(process.env.NEXT_PUBLIC_HOUSE_PRICE_GROWTH ?? '3'),
} as const;

// ─── Care Reserve ────────────────────────────────────────────────────────────
// An optional earmarked capital reserve for late-life care costs.
// Excluded from the normal drawdown waterfall; grows at the portfolio growth rate.

export const CARE_RESERVE = {
  /**
   * Default suggested amount.
   * Source: UK care home costs average c.£35k–£50k/yr; a £100k reserve
   * covers roughly 2–3 years of residential care (Laing Buisson 2024 estimates).
   */
  DEFAULT_AMOUNT: 100_000,
  /** Maximum slider value. */
  MAX_AMOUNT: 500_000,
  /** Step size for the care reserve amount input (£10,000 increments). */
  STEP_AMOUNT: 10_000,
} as const;

// ─── Goal panel UI defaults ───────────────────────────────────────────────────
// Fallback slider bounds used in the Goal Priority panel when live plan values
// are unavailable (e.g., no projections yet or first render).

export const GOAL_PANEL = {
  /**
   * Minimum slider-max for annual-income goals (longevity protection, spending floor).
   * Ensures the slider is wide enough even if the user's annual spend is very low.
   * £100k covers a comfortable RLSS couple income with headroom for adjustment.
   */
  ANNUAL_TARGET_FLOOR: 100_000,
  /**
   * Minimum slider-max for capital goals (bequest, capital-reserve style goals).
   * Provides a sensible lower bound when total assets are not yet populated.
   */
  CAPITAL_TARGET_FLOOR: 250_000,
} as const;

// ─── Inheritance Tax ──────────────────────────────────────────────────────────
// All thresholds frozen until at least 5 April 2030 (Finance Act 2021, Autumn Budget 2024).
// Source: HMRC IHT rates and thresholds; IHTA 1984 ss. 7, 8A, 8D.

export const IHT = {
  /** Standard IHT rate on estate above nil-rate bands. IHTA 1984 s.7. */
  RATE: 0.40,
  /** Reduced rate when ≥10% of net estate left to charity. IHTA 1984 s.7A. */
  CHARITY_RATE: 0.36,
  /** Nil-Rate Band — frozen to April 2030. Use getNRBForYear() for year-specific projections. */
  NRB: 325_000,
  /** Residence Nil-Rate Band — frozen to April 2030. Use getRNRBForYear() for year-specific projections. IHTA 1984 s.8D. */
  RNRB: 175_000,
  /**
   * Estate value above which RNRB tapers at £1 per £2 of excess (frozen to 2030).
   * Use getRNRBTaperThresholdForYear() for year-specific projections. IHTA 1984 s.8D(5).
   */
  RNRB_TAPER_THRESHOLD: 2_000_000,
  /** Estate value at which a single person's RNRB is fully tapered to zero (£2m + 2×£175k). */
  RNRB_TAPER_END_SINGLE: 2_350_000,
  /** Estate value at which a couple's full transferable RNRB is tapered to zero (£2m + 2×£350k). */
  RNRB_TAPER_END_COUPLE: 2_700_000,
  /**
   * Estate value above which the RNRB taper warning is shown to users.
   * Set below the actual £2m cliff to give an early amber alert.
   * Estates between £1.8m and £2m are approaching the taper zone.
   */
  RNRB_TAPER_WARNING_THRESHOLD: 1_800_000,
  /**
   * Tax year from which unspent DC pension pots are included in the IHT estate.
   * Finance Act 2025 (prospective); effective 6 April 2027.
   */
  PENSION_ESTATE_INCLUSION_YEAR: 2027,
  /** Annual gift exemption per person. IHTA 1984 s.19. */
  ANNUAL_GIFT_EXEMPTION: 3_000,
  /** Small gifts exemption per recipient per year. IHTA 1984 s.20. */
  SMALL_GIFT_EXEMPTION: 250,
  /** Minimum charity fraction of net estate to qualify for reduced IHT rate. */
  CHARITY_THRESHOLD_FRACTION: 0.10,
} as const;

// ─── IHT post-freeze escalation ───────────────────────────────────────────────
// NRB and RNRB are frozen until 5 April 2030. Per IHTA 1984 legislative intent,
// they should subsequently increase with CPI. Voyant models this as CPI-linked
// escalation from 2031 using a plan-level CPI assumption (default ~2.5%).
// The RNRB taper threshold (£2m) is also escalated at the same CPI rate to maintain
// consistent proportionality between the bands and the taper ceiling.
//
// Source: Voyant UK — NRB Escalation % and IHT Property Exemption settings.

/** Last calendar year in which NRB and RNRB are legislatively frozen (tax year 2030-31). */
export const IHT_FREEZE_END_YEAR = 2030;

/**
 * Annual escalation rate applied to NRB, RNRB, and RNRB taper threshold after the freeze.
 * Matches Voyant's default CPI assumption (~2.5%), consistent with the legislative intent
 * that these thresholds should increase with the Consumer Price Index from April 2030.
 */
export const IHT_ESCALATION_RATE = 0.025;

/**
 * Returns the NRB for a given calendar year.
 * Frozen at £325,000 through 2030; escalates at IHT_ESCALATION_RATE from 2031.
 */
export function getNRBForYear(calendarYear: number): number {
  if (calendarYear <= IHT_FREEZE_END_YEAR) return IHT.NRB;
  const yearsPost = calendarYear - IHT_FREEZE_END_YEAR;
  return Math.round(IHT.NRB * Math.pow(1 + IHT_ESCALATION_RATE, yearsPost));
}

/**
 * Returns the RNRB for a given calendar year.
 * Frozen at £175,000 through 2030; escalates at IHT_ESCALATION_RATE from 2031.
 */
export function getRNRBForYear(calendarYear: number): number {
  if (calendarYear <= IHT_FREEZE_END_YEAR) return IHT.RNRB;
  const yearsPost = calendarYear - IHT_FREEZE_END_YEAR;
  return Math.round(IHT.RNRB * Math.pow(1 + IHT_ESCALATION_RATE, yearsPost));
}

/**
 * Returns the RNRB taper threshold for a given calendar year.
 * Frozen at £2,000,000 through 2030; escalates at IHT_ESCALATION_RATE from 2031.
 */
export function getRNRBTaperThresholdForYear(calendarYear: number): number {
  if (calendarYear <= IHT_FREEZE_END_YEAR) return IHT.RNRB_TAPER_THRESHOLD;
  const yearsPost = calendarYear - IHT_FREEZE_END_YEAR;
  return Math.round(IHT.RNRB_TAPER_THRESHOLD * Math.pow(1 + IHT_ESCALATION_RATE, yearsPost));
}

// ─── Withdrawal order ─────────────────────────────────────────────────────────
// The app follows this UK tax-efficient ordering.
// Source: Standard UK financial planning practice.

export const WITHDRAWAL_ORDER = [
  'personal_allowance', // Guaranteed income fills personal allowance first
  'cgt_allowance',      // GIA within per-person CGT budget (individual + joint share ≤ £3,000 each)
  'isa',                // ISA — fully tax-free; drawn after the CGT-free GIA slice
  'gia',                // GIA — CGT on gains above annual exempt
  'cash',               // Cash savings — no tax on withdrawal
  'ufpls',              // DC pension via UFPLS — 25% tax-free per withdrawal, 75% taxable income
] as const;

export type WithdrawalStep = typeof WITHDRAWAL_ORDER[number];
