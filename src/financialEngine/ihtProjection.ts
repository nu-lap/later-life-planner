/**
 * IHT projection engine — pure, deterministic, no network calls.
 *
 * Computes the projected Inheritance Tax liability at death based on:
 * - Primary residence (RNRB eligibility)
 * - Savings, ISA, GIA, cash
 * - DC pension pots (included in estate from 6 April 2027 per Finance Act 2025)
 * - Couple vs single (transferable NRB)
 * - Annual surplus income available for normal-expenditure gift exemption (IHTA 1984 s.21)
 *
 * Sources: IHTA 1984 ss.7, 8D, 8H, 19, 20, 21; Finance Act 2025.
 */

import { IHT } from '@/config/financialConstants';

export interface IHTProjectionInputs {
  /** Calendar year of projected death (used for pension inclusion threshold). */
  deathYear: number;
  /** Net value of primary residence (currentValue − mortgageOutstanding). */
  primaryResidenceNetValue: number;
  /** True if residence passes to direct descendants (RNRB eligibility). */
  residenceLeavesToDescendants: boolean;
  /** Combined ISA balance at death. */
  isaValue: number;
  /** Combined GIA balance at death. */
  giaValue: number;
  /** Combined cash savings at death. */
  cashValue: number;
  /** Combined DC pension pot at death (included in estate from 2027). */
  dcPensionValue: number;
  /** BTL/investment property net value at death (if applicable). */
  investmentPropertyValue: number;
  /** Fraction of first spouse's NRB unused at their death (0–1). */
  unusedNrbFraction: number;
  /** True for couple mode — enables transferable NRB. */
  isCouple: boolean;
  /** True if ≥10% of net estate is earmarked for charity. */
  charitableEstate: boolean;
  /** Annual net income during projection years (for s.21 gift capacity). */
  annualIncome: number;
  /** Annual spending during projection years. */
  annualSpending: number;
  /** Years remaining until projected death (for cumulative gifting calculation). */
  remainingYears: number;
}

export interface IHTProjectionResult {
  /** Total gross estate value (all assets including pension from 2027). */
  grossEstate: number;
  /** DC pension contribution to estate (0 before 2027). */
  pensionInEstate: number;
  /** Effective NRB available (including transferable NRB if couple). */
  nrbAvailable: number;
  /** Effective RNRB after taper. */
  rnrbAvailable: number;
  /** Net chargeable estate (grossEstate − nrbAvailable − rnrbAvailable). */
  chargeableEstate: number;
  /** IHT payable in pounds. */
  ihtDue: number;
  /** IHT rate applied (0.36 if charitable, else 0.40). */
  ihtRate: number;
  /** IHT that would apply if pension were excluded (pre-2027 comparison). */
  ihtDueExcludingPension: number;
  /** Extra IHT caused by pension inclusion. */
  pensionIHTDelta: number;
  /** True if estate is above RNRB taper threshold. */
  rnrbTaperWarning: boolean;
  /** Annual surplus income available for s.21 normal-expenditure gifts. */
  annualGiftingCapacity: number;
  /** Cumulative IHT saving over remainingYears from annual gifting. */
  cumulativeGiftingIHTSaving: number;
  /** Years used for cumulative gifting projection. */
  remainingYears: number;
}

/**
 * Calculate projected IHT liability at death.
 *
 * All values are in pounds sterling. This function is pure — safe to call
 * in any context (browser, server, tests) with no side effects.
 */
export function calculateIHTProjection(inputs: IHTProjectionInputs): IHTProjectionResult {
  const {
    deathYear,
    primaryResidenceNetValue,
    residenceLeavesToDescendants,
    isaValue,
    giaValue,
    cashValue,
    dcPensionValue,
    investmentPropertyValue,
    unusedNrbFraction,
    isCouple,
    charitableEstate,
    annualIncome,
    annualSpending,
    remainingYears,
  } = inputs;

  // Pension in estate: only from the inclusion year onwards.
  const pensionInEstate = deathYear >= IHT.PENSION_ESTATE_INCLUSION_YEAR ? dcPensionValue : 0;

  const grossEstate =
    Math.max(0, primaryResidenceNetValue) +
    isaValue +
    giaValue +
    cashValue +
    pensionInEstate +
    investmentPropertyValue;

  // Transferable NRB for couples (IHTA 1984 s.8A).
  // unusedNrbFraction is 0–1; full transfer = 1.0 → doubles the NRB.
  const nrbAvailable = isCouple
    ? IHT.NRB * (1 + Math.min(1, Math.max(0, unusedNrbFraction)))
    : IHT.NRB;

  // RNRB taper: reduces by £1 for every £2 the gross estate exceeds the threshold.
  // IHTA 1984 s.8D(5).
  // RNRB requires a qualifying residence passing to direct descendants; it is also
  // capped to the net residence value (IHTA 1984 s.8D(2)).
  const rnrbBase = residenceLeavesToDescendants
    ? Math.min(IHT.RNRB, Math.max(0, primaryResidenceNetValue))
    : 0;
  const rnrbTaperReduction = Math.max(0, grossEstate - IHT.RNRB_TAPER_THRESHOLD) / 2;
  const rnrbAvailable = Math.max(0, rnrbBase - rnrbTaperReduction);

  const chargeableEstate = Math.max(0, grossEstate - nrbAvailable - rnrbAvailable);

  // Charitable estate rate (IHTA 1984 s.7A): 36% if qualifying, else 40%.
  const ihtRate = charitableEstate ? IHT.CHARITY_RATE : IHT.RATE;

  const ihtDue = chargeableEstate * ihtRate;

  // Pre-2027 comparison: same calculation but without pension in estate.
  const grossEstateExcPension = grossEstate - pensionInEstate;
  const rnrbTaperReductionExcPension =
    Math.max(0, grossEstateExcPension - IHT.RNRB_TAPER_THRESHOLD) / 2;
  const rnrbAvailableExcPension = Math.max(0, rnrbBase - rnrbTaperReductionExcPension);
  const chargeableEstateExcPension = Math.max(
    0,
    grossEstateExcPension - nrbAvailable - rnrbAvailableExcPension,
  );
  const ihtDueExcludingPension = chargeableEstateExcPension * ihtRate;
  const pensionIHTDelta = ihtDue - ihtDueExcludingPension;

  const rnrbTaperWarning = grossEstate > IHT.RNRB_TAPER_THRESHOLD;

  // Annual gifting capacity: surplus income eligible for IHTA 1984 s.21 exemption.
  const annualGiftingCapacity = Math.max(0, annualIncome - annualSpending);
  const years = Math.max(0, remainingYears);
  // Base the saving on the applicable IHT rate and never show a benefit
  // larger than the currently projected IHT liability.
  const rawCumulativeGiftingIHTSaving = annualGiftingCapacity * years * ihtRate;
  const cumulativeGiftingIHTSaving =
    ihtDue > 0 ? Math.min(ihtDue, rawCumulativeGiftingIHTSaving) : 0;

  return {
    grossEstate,
    pensionInEstate,
    nrbAvailable,
    rnrbAvailable,
    chargeableEstate,
    ihtDue,
    ihtRate,
    ihtDueExcludingPension,
    pensionIHTDelta,
    rnrbTaperWarning,
    annualGiftingCapacity,
    cumulativeGiftingIHTSaving,
    remainingYears: years,
  };
}
