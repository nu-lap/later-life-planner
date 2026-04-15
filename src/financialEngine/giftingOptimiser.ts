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

import { IHT, CURRENT_TAX_YEAR_START } from '@/config/financialConstants';
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
  } = inputs;

  // ── 1. Effective marginal IHT rate ──────────────────────────────────────────
  // Taper zone: estate is above £2m threshold AND below the ceiling where RNRB is
  // fully withdrawn, AND RNRB is actually eligible (residence left to descendants).
  // Outside these conditions, gifting saves at the standard 40% rate only.
  const taperEnd = isCouple ? IHT.RNRB_TAPER_END_COUPLE : IHT.RNRB_TAPER_END_SINGLE;
  const isInTaperZone =
    rnrbEligible &&
    grossEstate > IHT.RNRB_TAPER_THRESHOLD &&
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
    ? Math.max(0, grossEstate - IHT.RNRB_TAPER_THRESHOLD)
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
