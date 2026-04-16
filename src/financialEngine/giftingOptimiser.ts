/**
 * IHT Gifting Optimiser — Phase IHT-5
 *
 * Pure function that analyses whether an annual gifting strategy reduces total
 * lifetime tax (income tax on withdrawals + IHT on estate).
 *
 * Key insight: the effective marginal IHT rate is 60% when the estate sits in the
 * RNRB taper zone (£2m–£2.35m single / £2.7m couple), because each £2 gifted also
 * recovers £1 of RNRB worth 40% IHT — so the combined saving is 60p/£ not 40p/£.
 *
 * HMRC citations:
 * - IHTA 1984 s.19  — Annual exempt gift (£3,000/donor/year; carry forward 1 year)
 * - IHTA 1984 s.21  — Normal expenditure out of income (unlimited if from surplus)
 * - IHTA 1984 s.8D(5) — RNRB taper at £1 per £2 over £2,000,000
 */

import {
  IHT,
  INCOME_TAX,
  PENSION_RULES,
  CURRENT_TAX_YEAR_START,
  getRNRBForYear,
  getRNRBTaperThresholdForYear,
} from '@/config/financialConstants';
import { getSnapshotForYear } from '@/config/taxRuleSnapshot';

export interface GiftingOptimiserInputs {
  /** Total gross estate from IHT projection. */
  grossEstate: number;
  /** Current IHT liability. */
  ihtDue: number;
  /** RNRB actually available after taper (may be 0 if estate > taper ceiling). */
  rnrbAvailable: number;
  /**
   * True if the qualifying residence is left to lineal descendants (condition for RNRB
   * eligibility). When false, no taper-zone 60% rate or RNRB recovery logic applies.
   */
  rnrbEligible: boolean;
  /**
   * Pre-taper eligible RNRB base: min(maxRNRB, residenceValue).
   * Used to compute the true recovery opportunity — avoids overstating savings when the
   * qualifying residence is worth less than the nominal RNRB cap.
   * Should be 0 when rnrbEligible is false.
   */
  rnrbBase: number;
  /** True if couple (affects RNRB cap and annual gift allowance). */
  isCouple: boolean;
  /** Combined DC pension value — source of additional gifting via drawdown. */
  dcPensionValue: number;
  /** Annual surplus income after normal living expenditure (s.21 capacity). */
  annualSurplusIncome: number;
  /** Gross annual income — used to estimate marginal income tax band on extra DC withdrawals. */
  annualIncome: number;
  /** Remaining years until projected death (planning horizon). */
  remainingYears: number;
  /**
   * Calendar year of projected death — used to apply post-freeze RNRB and taper threshold
   * escalation. Defaults to current year if omitted (uses frozen 2025 values).
   */
  calendarYear?: number;
}

export interface GiftingOptimiserResult {
  // ── Tax rate context ──────────────────────────────────────────────────────
  /** Effective marginal IHT rate: 0.60 in RNRB taper zone, 0.40 otherwise. */
  effectiveMarginalIHTRate: number;
  /** Estimated marginal income tax rate on additional DC withdrawals. */
  marginalIncomeTaxRate: number;
  /**
   * True if a DC draw-and-gift reduces total tax.
   * Requires: marginalIncomeTaxRate < effectiveMarginalIHTRate.
   */
  isDrawAndGiftWorthwhile: boolean;

  // ── RNRB taper recovery ────────────────────────────────────────────────────
  /** True if estate is above the £2m RNRB taper threshold. */
  isInTaperZone: boolean;
  /** Maximum additional IHT saving from recovering full RNRB (£0 if not in taper zone). */
  rnrbRecoveryOpportunity: number;
  /** Total gifting required to bring estate down to £2m taper floor (0 if already below). */
  giftingNeededForRNRBRecovery: number;

  // ── Annual gifting breakdown ───────────────────────────────────────────────
  /** s.21 — from surplus income (immediately IHT-exempt, no 7-year rule). */
  annualExemptFromIncome: number;
  /** s.19 — annual exempt gift allowance (£3k/person; £6k couple). */
  annualExemptGiftAllowance: number;
  /**
   * Gross DC amount to draw down and gift as a PET each year.
   * Only non-zero when isDrawAndGiftWorthwhile is true and DC pot is available.
   */
  annualDCDrawdownGross: number;
  /** Income tax cost of the DC drawdown. */
  annualDCDrawdownIncomeTaxCost: number;
  /** Net gift amount from DC drawdown after income tax. */
  annualDCDrawdownGiftNet: number;
  /** Total net gift amount per year across all strategies. */
  annualTotalGift: number;

  // ── Annual net benefit ─────────────────────────────────────────────────────
  /** Direct IHT reduction from annual gifting (× effective marginal rate). */
  annualIHTSaving: number;
  /** Total income tax paid on DC drawdown this year. */
  annualIncomeTaxCost: number;
  /** Net annual benefit = IHT saving − income tax cost. Negative means not worthwhile. */
  annualNetBenefit: number;

  // ── Cumulative projection (over remainingYears) ────────────────────────────
  cumulativeIHTSaving: number;
  cumulativeIncomeTaxCost: number;
  cumulativeNetBenefit: number;

  // ── Recommendation ─────────────────────────────────────────────────────────
  /**
   * Recommendation tier:
   * - `no-action`: IHT due is zero or no actionable gifting capacity.
   * - `income-gifts-only`: surplus income gifts worthwhile; DC draw-and-gift is not.
   * - `rnrb-recovery-priority`: estate in taper zone — prioritise gifting to £2m first.
   * - `draw-and-gift`: drawing from DC and gifting is tax-efficient (standard zone).
   */
  recommendationTier: 'no-action' | 'income-gifts-only' | 'draw-and-gift' | 'rnrb-recovery-priority';
}

/**
 * Estimate the marginal income tax rate for an additional DC withdrawal,
 * given the person's current gross annual income.
 *
 * Uses the current tax year snapshot for all band thresholds.
 * The personal allowance taper (income between paTaperThreshold and
 * additionalRateThreshold) creates an effective ~60% marginal rate
 * because each £2 of extra income loses £1 of personal allowance, making
 * 40p of previously tax-free income taxable alongside the normal 40p on the
 * marginal pound.
 */
function estimateMarginalIncomeTaxRate(annualIncome: number): number {
  // Note: always uses CURRENT_TAX_YEAR_START snapshot.
  // Future band changes (e.g. threshold adjustments) are not modelled — intentional simplification.
  const snapshot = getSnapshotForYear(CURRENT_TAX_YEAR_START);
  const { personalAllowance, basicRateLimit, additionalRateThreshold, paTaperThreshold } =
    snapshot.incomeTaxBands;

  if (annualIncome <= personalAllowance) return 0;
  if (annualIncome <= basicRateLimit) return 0.20;
  if (annualIncome < paTaperThreshold) return 0.40;
  if (annualIncome <= additionalRateThreshold) return 0.60; // PA taper effective rate
  return 0.45;
}

/**
 * Calculate an optimised annual gifting strategy that minimises total tax
 * (income tax on DC withdrawals + IHT on estate).
 */
export function calculateGiftingOptimisation(
  inputs: GiftingOptimiserInputs,
): GiftingOptimiserResult {
  const {
    grossEstate,
    ihtDue,
    rnrbAvailable,
    rnrbEligible,
    rnrbBase,
    isCouple,
    dcPensionValue,
    annualSurplusIncome,
    annualIncome,
    remainingYears,
    calendarYear = CURRENT_TAX_YEAR_START,
  } = inputs;

  // Year-specific RNRB and taper threshold — escalate at CPI after 2030 freeze.
  const rnrbForYear = getRNRBForYear(calendarYear);
  const rnrbTaperThreshold = getRNRBTaperThresholdForYear(calendarYear);
  const taperEnd = isCouple
    ? rnrbTaperThreshold + 4 * rnrbForYear   // couple: 2×RNRB fully withdrawn at threshold + 4×RNRB
    : rnrbTaperThreshold + 2 * rnrbForYear;  // single: RNRB fully withdrawn at threshold + 2×RNRB
  // ── 1. Effective marginal IHT rate ──────────────────────────────────────────
  // Taper zone: estate is above the (year-specific) threshold AND below the ceiling
  // where RNRB is fully withdrawn, AND RNRB is actually eligible.
  // Outside these conditions, gifting saves at the standard 40% rate only.
  const isInTaperZone =
    rnrbEligible &&
    grossEstate > rnrbTaperThreshold &&
    grossEstate < taperEnd;
  const effectiveMarginalIHTRate = isInTaperZone ? 0.60 : IHT.RATE;

  const marginalIncomeTaxRate = estimateMarginalIncomeTaxRate(annualIncome);
  const isDrawAndGiftWorthwhile =
    ihtDue > 0 && marginalIncomeTaxRate < effectiveMarginalIHTRate && dcPensionValue > 0;

  // ── 2. RNRB taper recovery opportunity ──────────────────────────────────────
  // Only meaningful when in the taper zone. The recoverable RNRB is bounded by the
  // pre-taper eligible base (rnrbBase = min(maxRNRB, residenceValue)) rather than
  // the nominal maxRNRB, to avoid overstating the opportunity when the residence
  // value caps the allowance.
  const giftingNeededForRNRBRecovery = isInTaperZone
    ? Math.max(0, grossEstate - rnrbTaperThreshold)
    : 0;
  const rnrbRecoveryOpportunity = isInTaperZone
    ? Math.max(0, rnrbBase - rnrbAvailable) * IHT.RATE
    : 0;

  // ── 3. Annual gifting tiers ─────────────────────────────────────────────────
  const annualExemptFromIncome = Math.max(0, annualSurplusIncome);
  // s.19: £3k per donor. Couple has two donors.
  const annualExemptGiftAllowance = isCouple ? IHT.ANNUAL_GIFT_EXEMPTION * 2 : IHT.ANNUAL_GIFT_EXEMPTION;

  // Compute exempt gift IHT saving early so we can cap DC drawdown appropriately.
  // Exempt gifts (s.21, s.19) reduce the gross estate — in the taper zone they also
  // recover RNRB at the same 60% effective marginal rate as PETs, so we must use
  // effectiveMarginalIHTRate here rather than the fixed 40% rate to avoid
  // overstating the IHT remaining for DC drawdown to address.
  const exemptGiftIHTSaving = (annualExemptFromIncome + annualExemptGiftAllowance) * effectiveMarginalIHTRate;
  // DC drawdown can only recover IHT liability that the exempt gifts haven't already covered.
  const remainingIHTForDC = Math.max(0, ihtDue - exemptGiftIHTSaving);
  // Maximum net DC gift amount whose IHT saving does not exceed the remaining liability.
  const maxDCGiftNetForIHTBenefit =
    effectiveMarginalIHTRate > 0 ? remainingIHTForDC / effectiveMarginalIHTRate : 0;

  // DC draw-and-gift: pace to recover RNRB over the planning horizon when in
  // taper zone; otherwise draw a steady annual amount.
  let annualDCDrawdownGross = 0;
  if (isDrawAndGiftWorthwhile && remainingYears > 0) {
    if (isInTaperZone && giftingNeededForRNRBRecovery > 0) {
      // Spread RNRB recovery gifting evenly over remaining years.
      // The gross amount drawn must cover the net gift target (after income tax).
      const netGiftNeededPerYear = giftingNeededForRNRBRecovery / remainingYears;
      // Gross = net / (1 - marginalRate); capped by DC pot spread over years
      const grossFromTaper = marginalIncomeTaxRate < 1
        ? netGiftNeededPerYear / (1 - marginalIncomeTaxRate)
        : 0;
      const maxAnnualGrossFromDC = dcPensionValue / remainingYears;
      annualDCDrawdownGross = Math.min(grossFromTaper, maxAnnualGrossFromDC);
    } else {
      // Standard zone: spread the whole DC pot steadily over remaining years as the baseline.
      // The IHT cap below (maxGrossForIHTBenefit) trims this to the amount that actually reduces
      // the remaining IHT liability — avoiding income tax cost with no offsetting IHT benefit.
      annualDCDrawdownGross = dcPensionValue / remainingYears;
    }
    annualDCDrawdownGross = Math.max(0, annualDCDrawdownGross);

    // Cap drawdown so the IHT saving from the net gift cannot exceed the remaining
    // IHT liability after exempt gifts. Without this cap, the optimiser would
    // recommend drawdown that produces income tax cost with no corresponding IHT
    // benefit when the remaining liability is small.
    const maxGrossForIHTBenefit =
      marginalIncomeTaxRate < 1
        ? maxDCGiftNetForIHTBenefit / (1 - marginalIncomeTaxRate)
        : maxDCGiftNetForIHTBenefit;
    annualDCDrawdownGross = Math.min(annualDCDrawdownGross, maxGrossForIHTBenefit);
  }

  const annualDCDrawdownIncomeTaxCost = annualDCDrawdownGross * marginalIncomeTaxRate;
  const annualDCDrawdownGiftNet = annualDCDrawdownGross - annualDCDrawdownIncomeTaxCost;
  const annualTotalGift = annualExemptFromIncome + annualExemptGiftAllowance + annualDCDrawdownGiftNet;

  // ── 4. Annual net benefit ────────────────────────────────────────────────────
  // DC gifts (PETs) save at effective marginal rate (40% or 60% in taper zone).
  const dcGiftIHTSaving = annualDCDrawdownGiftNet * effectiveMarginalIHTRate;
  // Cap total saving at current IHT liability (cannot save more than the bill).
  const rawAnnualIHTSaving = exemptGiftIHTSaving + dcGiftIHTSaving;
  const annualIHTSaving = ihtDue > 0 ? Math.min(ihtDue, rawAnnualIHTSaving) : 0;
  const annualIncomeTaxCost = annualDCDrawdownIncomeTaxCost;
  const annualNetBenefit = annualIHTSaving - annualIncomeTaxCost;

  // ── 5. Cumulative projection ─────────────────────────────────────────────────
  const years = Math.max(0, remainingYears);
  const cumulativeIHTSaving = annualIHTSaving * years;
  const cumulativeIncomeTaxCost = annualIncomeTaxCost * years;
  const cumulativeNetBenefit = annualNetBenefit * years;

  // ── 6. Recommendation tier ───────────────────────────────────────────────────
  let recommendationTier: GiftingOptimiserResult['recommendationTier'];

  if (ihtDue === 0) {
    recommendationTier = 'no-action';
  } else if (isInTaperZone && isDrawAndGiftWorthwhile && annualDCDrawdownGross > 0) {
    recommendationTier = 'rnrb-recovery-priority';
  } else if (!isInTaperZone && isDrawAndGiftWorthwhile && annualDCDrawdownGross > 0) {
    recommendationTier = 'draw-and-gift';
  } else if (annualSurplusIncome > 0 || annualExemptGiftAllowance > 0) {
    recommendationTier = 'income-gifts-only';
  } else {
    recommendationTier = 'no-action';
  }

  return {
    effectiveMarginalIHTRate,
    marginalIncomeTaxRate,
    isDrawAndGiftWorthwhile,
    isInTaperZone,
    rnrbRecoveryOpportunity,
    giftingNeededForRNRBRecovery,
    annualExemptFromIncome,
    annualExemptGiftAllowance,
    annualDCDrawdownGross,
    annualDCDrawdownIncomeTaxCost,
    annualDCDrawdownGiftNet,
    annualTotalGift,
    annualIHTSaving,
    annualIncomeTaxCost,
    annualNetBenefit,
    cumulativeIHTSaving,
    cumulativeIncomeTaxCost,
    cumulativeNetBenefit,
    recommendationTier,
  };
}

// ─── RNRB Taper Clawback Scenario Analysis ──────────────────────────────────

/**
 * Inputs for the three RNRB taper clawback scenarios.
 *
 * These are directional estimates — the simplified delta model does not
 * re-run the full projection engine. Results are intended to guide planning
 * decisions, not replace a full re-projection.
 */
export interface RNRBScenarioInputs {
  /** Total gross estate from the baseline IHT projection. */
  grossEstate: number;
  /** Baseline IHT liability. */
  ihtDue: number;
  /** IHT rate applied in baseline (0.36 if charitable, else 0.40). */
  ihtRate: number;
  /**
   * Effective NRB in baseline (includes transferable NRB if couple).
   * Used unchanged across all scenarios since NRB is not affected by estate size.
   */
  nrbAvailable: number;
  /**
   * Pre-taper maximum RNRB eligible for the plan (may be capped by residence value).
   * This is rnrbAvailable + taper_reduction_already_applied at the baseline estate level.
   * Pass 0 when the residence is not left to descendants (no RNRB eligibility).
   */
  maxPreTaperRNRB: number;
  /** Projected DC balance for person 1 at the start of the retirement phase (for PCLS calculation). */
  p1DcAtRetirement: number;
  /** Projected DC balance for person 2 at the start of the retirement phase (0 if single). */
  p2DcAtRetirement: number;
  /** Number of years from retirement start to projected death (projection length). */
  yearsInRetirement: number;
  /** True if couple plan (affects PCLS eligibility for P2). */
  isCouple: boolean;
  /**
   * Calendar year of projected death — used for year-specific RNRB taper threshold.
   * Defaults to current year.
   */
  deathYear?: number;
  /**
   * Override gross annual DC drawdown for the B2 scenario.
   * Defaults to £50,000 (basic-rate drawdown target per user brief).
   */
  b2AnnualDrawdown?: number;
  /**
   * Override gross annual DC drawdown for the C2 scenario.
   * Defaults to the full basic-rate band capacity (BASIC_RATE_LIMIT − PERSONAL_ALLOWANCE = £37,700).
   */
  c2AnnualDrawdown?: number;
  /**
   * Display name for person 1 — used in scenario labels and descriptions.
   * Defaults to "Person 1" when omitted.
   */
  p1Name?: string;
  /**
   * Display name for person 2 — used in scenario labels and descriptions.
   * Defaults to "Person 2" when omitted. Only relevant when isCouple is true.
   */
  p2Name?: string;
}

export interface RNRBScenarioResult {
  /** Scenario identifier. */
  id: 'B1' | 'B2' | 'C2';
  /** Short display label. */
  label: string;
  /** One-sentence description for the tooltip / plan description. */
  description: string;

  // ── What the scenario does ────────────────────────────────────────────────
  /** Tax-free lump sum (PCLS) taken at retirement start. */
  upfrontPCLS: number;
  /** Gross DC amount drawn down annually for gifting (0 for B1). */
  annualDrawdown: number;
  /** Income tax cost on annual drawdown. */
  annualIncomeTaxCost: number;
  /** Net annual gift (after income tax). */
  annualGift: number;

  // ── Cumulative totals over yearsInRetirement ──────────────────────────────
  /** Total reduction in gross estate (PCLS + full gross drawdown). */
  totalEstateReduction: number;
  /** Total income tax paid on drawdown over the period. */
  totalIncomeTaxCost: number;

  // ── Resulting estate and IHT ──────────────────────────────────────────────
  /** Gross estate after scenario actions. */
  newGrossEstate: number;
  /** RNRB available after recomputing taper on new estate. */
  newRNRBAvailable: number;
  /** IHT due on new estate. */
  newIHTDue: number;

  // ── Savings ───────────────────────────────────────────────────────────────
  /** RNRB recovered vs baseline (0 when estate remains above taper threshold). */
  rnrbRecovered: number;
  /** Total IHT saving vs baseline. */
  ihtSaving: number;
  /** Net benefit: ihtSaving − totalIncomeTaxCost. */
  netBenefit: number;
  /** True if this scenario brings the estate below the RNRB taper threshold. */
  breachesRNRBTaperThreshold: boolean;
}

/**
 * Helper: recompute IHT on a new gross estate after a scenario's estate reduction.
 * Uses the same NRB / RNRB rules as calculateIHTProjection.
 */
function computeScenarioIHT(
  newGrossEstate: number,
  maxPreTaperRNRB: number,
  nrbAvailable: number,
  ihtRate: number,
  deathYear: number,
): { newRNRBAvailable: number; newIHTDue: number } {
  const taperThreshold = getRNRBTaperThresholdForYear(deathYear);
  const rnrbTaperReduction = Math.max(0, newGrossEstate - taperThreshold) / 2;
  const newRNRBAvailable = Math.max(0, maxPreTaperRNRB - rnrbTaperReduction);
  const chargeableEstate = Math.max(0, newGrossEstate - nrbAvailable - newRNRBAvailable);
  const newIHTDue = chargeableEstate * ihtRate;
  return { newRNRBAvailable, newIHTDue };
}

/**
 * Calculate directional IHT savings for three RNRB taper clawback scenarios:
 *
 *  B1 — Person 1 crystallises PCLS (25% tax-free cash) at retirement; gifts proceeds.
 *  B2 — Both people crystallise PCLS at retirement, then draw ~£50k/yr DC to gift.
 *  C2 — No upfront PCLS; draw DC at basic-rate ceiling annually and gift proceeds.
 *
 * Income tax on DC drawdown is assumed at the basic rate (20%).
 * Full gross drawdown reduces the DC balance at death, which reduces the gross estate.
 * Gifted proceeds are treated as PETs that clear the estate (7-year rule assumed satisfied
 * given a typical 30+ year retirement horizon).
 *
 * Results are directional — the simplified delta model does not re-run the full
 * projection engine.
 */
export function calculateRNRBScenarios(inputs: RNRBScenarioInputs): RNRBScenarioResult[] {
  const {
    grossEstate,
    ihtDue,
    ihtRate,
    nrbAvailable,
    maxPreTaperRNRB,
    p1DcAtRetirement,
    p2DcAtRetirement,
    yearsInRetirement,
    isCouple,
    deathYear = CURRENT_TAX_YEAR_START,
    b2AnnualDrawdown = 50_000,
    c2AnnualDrawdown = INCOME_TAX.BASIC_RATE_LIMIT - INCOME_TAX.PERSONAL_ALLOWANCE,
    p1Name = 'Person 1',
    p2Name = 'Person 2',
  } = inputs;

  // PCLS = 25% of DC pot at retirement, capped at the lifetime lump sum allowance.
  const lsa = PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE;
  const p1PCLS = Math.min(p1DcAtRetirement * 0.25, lsa);
  const p2PCLS = isCouple ? Math.min(p2DcAtRetirement * 0.25, lsa) : 0;

  const taperThreshold = getRNRBTaperThresholdForYear(deathYear);

  function buildScenario(
    id: RNRBScenarioResult['id'],
    label: string,
    description: string,
    upfrontPCLS: number,
    annualDrawdown: number,
  ): RNRBScenarioResult {
    const annualIncomeTaxCost = annualDrawdown * INCOME_TAX.BASIC_RATE;
    const annualGift = annualDrawdown - annualIncomeTaxCost;

    // Full gross drawdown (gifted + income-tax portions) leaves the DC pot and
    // thus reduces the gross estate.  PCLS also leaves the estate as a PET gift.
    const totalEstateReduction = upfrontPCLS + annualDrawdown * yearsInRetirement;
    const totalIncomeTaxCost = annualIncomeTaxCost * yearsInRetirement;

    const newGrossEstate = Math.max(0, grossEstate - totalEstateReduction);
    const { newRNRBAvailable, newIHTDue } = computeScenarioIHT(
      newGrossEstate,
      maxPreTaperRNRB,
      nrbAvailable,
      ihtRate,
      deathYear,
    );

    const rnrbRecovered = Math.max(0, newRNRBAvailable - (maxPreTaperRNRB - Math.max(0, grossEstate - taperThreshold) / 2));
    const ihtSaving = Math.max(0, ihtDue - newIHTDue);
    const netBenefit = ihtSaving - totalIncomeTaxCost;
    const breachesRNRBTaperThreshold = grossEstate > taperThreshold && newGrossEstate <= taperThreshold;

    return {
      id, label, description,
      upfrontPCLS, annualDrawdown, annualIncomeTaxCost, annualGift,
      totalEstateReduction, totalIncomeTaxCost,
      newGrossEstate, newRNRBAvailable, newIHTDue,
      rnrbRecovered, ihtSaving, netBenefit,
      breachesRNRBTaperThreshold,
    };
  }

  return [
    buildScenario(
      'B1',
      `${p1Name}'s tax-free lump sum`,
      `${p1Name} takes 25% tax-free cash (PCLS) at retirement and gifts it as a PET.`,
      p1PCLS,
      0,
    ),
    buildScenario(
      'B2',
      `Both tax-free cash${isCouple ? ' + drawdown' : ''}`,
      isCouple
        ? `${p1Name} and ${p2Name} both take 25% tax-free cash at retirement, then draw £${(b2AnnualDrawdown / 1000).toFixed(0)}k/yr from DC to gift.`
        : `${p1Name} takes 25% tax-free cash at retirement, then draws £${(b2AnnualDrawdown / 1000).toFixed(0)}k/yr from DC to gift.`,
      p1PCLS + p2PCLS,
      b2AnnualDrawdown,
    ),
    buildScenario(
      'C2',
      'Income drawdown only',
      `No upfront lump sums — draw £${(c2AnnualDrawdown / 1000).toFixed(0)}k/yr DC at basic rate and gift the net proceeds.`,
      0,
      c2AnnualDrawdown,
    ),
  ];
}
