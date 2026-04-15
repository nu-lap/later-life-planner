'use client';

import { useMemo } from 'react';
import { PlannerState } from '@/models/types';
import { YearlyProjection } from '@/models/types';
import { calculateIHTProjection } from '@/financialEngine/ihtProjection';
import { calculateGiftingOptimisation } from '@/financialEngine/giftingOptimiser';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { DEFAULT_ASSUMPTIONS, IHT } from '@/config/financialConstants';

interface IHTOutlookPanelProps {
  state: PlannerState;
  projections: YearlyProjection[];
}

/**
 * Computes the calendar year of projected death for person1.
 * Falls back to current year + remaining life expectancy if DOB is unavailable.
 */
function estimateDeathYear(state: PlannerState): number {
  const configuredLifeExpectancy = state.assumptions.lifeExpectancy;
  const lifeExpectancy =
    typeof configuredLifeExpectancy === 'number' && Number.isFinite(configuredLifeExpectancy)
      ? configuredLifeExpectancy
      : DEFAULT_ASSUMPTIONS.LIFE_EXPECTANCY;
  const dob = state.person1.dateOfBirth;
  if (dob) {
    const birthYear = new Date(dob).getFullYear();
    return birthYear + lifeExpectancy;
  }
  return new Date().getFullYear() + (lifeExpectancy - state.person1.currentAge);
}

export default function IHTOutlookPanel({ state, projections }: IHTOutlookPanelProps) {
  // All calculations including display values derived once to avoid duplicating
  // asset extraction logic between useMemo and the render path.
  const computed = useMemo(() => {
    const mode = state.mode;
    const finalYear = projections.length > 0 ? projections[projections.length - 1] : null;

    const residenceValue = state.primaryResidence.enabled
      ? Math.max(0, state.primaryResidence.currentValue - state.primaryResidence.mortgageOutstanding)
      : 0;
    const isaValue = finalYear
      ? finalYear.p1IsaBalance + (mode === 'couple' ? finalYear.p2IsaBalance : 0)
      : 0;
    const giaValue = finalYear
      ? finalYear.p1GiaValue +
        (mode === 'couple' ? finalYear.p2GiaValue : 0) +
        finalYear.jointGiaValue
      : 0;
    const cashValue = finalYear
      ? finalYear.p1CashBalance + (mode === 'couple' ? finalYear.p2CashBalance : 0)
      : 0;
    const dcPensionValue = finalYear
      ? finalYear.p1DcBalance + (mode === 'couple' ? finalYear.p2DcBalance : 0)
      : 0;

    const annualIncome = finalYear?.totalIncome ?? 0;
    const annualSpending = finalYear?.spending ?? 0;
    const deathYear = estimateDeathYear(state);
    const currentYear = new Date().getFullYear();
    const remainingYears = Math.max(0, deathYear - currentYear);

    const result = calculateIHTProjection({
      deathYear,
      primaryResidenceNetValue: residenceValue,
      residenceLeavesToDescendants: state.primaryResidence.leavesToDescendants,
      isaValue,
      giaValue,
      cashValue,
      dcPensionValue,
      investmentPropertyValue: 0,
      unusedNrbFraction: 1.0,
      isCouple: mode === 'couple',
      charitableEstate: false,
      annualIncome,
      annualSpending,
      remainingYears,
    });

    const gifting = calculateGiftingOptimisation({
      grossEstate: result.grossEstate,
      ihtDue: result.ihtDue,
      rnrbAvailable: result.rnrbAvailable,
      rnrbEligible: state.primaryResidence.enabled && state.primaryResidence.leavesToDescendants,
      // rnrbBase: eligible RNRB before taper = min(maxRNRB, qualifying residence value).
      // Bounds the recovery opportunity to what is genuinely recoverable.
      rnrbBase: (state.primaryResidence.enabled && state.primaryResidence.leavesToDescendants)
        ? Math.min(mode === 'couple' ? IHT.RNRB * 2 : IHT.RNRB, residenceValue)
        : 0,
      isCouple: mode === 'couple',
      dcPensionValue,
      annualSurplusIncome: result.annualGiftingCapacity,
      annualIncome,
      remainingYears,
    });

    return { result, gifting, mode, residenceValue, isaValue, giaValue, cashValue, dcPensionValue };
  }, [state, projections]);

  // Guard after hooks — projections may be empty on first render
  if (!projections.length) {
    return (
      <div className="game-card border-violet-200 bg-violet-50/40">
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">&#127963;</span>
          <p className="text-sm text-slate-500">Calculating estate projection&hellip;</p>
        </div>
      </div>
    );
  }

  const { result, gifting, mode, residenceValue, isaValue, giaValue, cashValue, dcPensionValue } = computed;

  return (
    <div className="game-card border-violet-200 bg-violet-50/40">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl flex-shrink-0">&#127963;</span>
        <div>
          <h3 className="font-black text-slate-900 text-base">IHT Estate Planning</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Projected inheritance tax at end of plan horizon
          </p>
        </div>
      </div>

      {/* Section 1 - Estate Breakdown */}
      <div className="mb-5">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
          Estate Breakdown
        </h4>
        <div className="space-y-1.5">
          {residenceValue > 0 && (
            <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Primary residence (net of mortgage)</span>
              <span className="font-bold text-slate-900">{formatCurrency(residenceValue, true)}</span>
            </div>
          )}
          {(isaValue + giaValue + cashValue) > 0 && (
            <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
              <span className="text-slate-600">Savings, ISAs &amp; investments</span>
              <span className="font-bold text-slate-900">
                {formatCurrency(isaValue + giaValue + cashValue, true)}
              </span>
            </div>
          )}
          {dcPensionValue > 0 && (
            <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
              <span className="text-slate-600">
                DC pension
                <span className="ml-1.5 text-xs text-amber-600 font-semibold">
                  included from April 2027
                </span>
              </span>
              <span className="font-bold text-slate-900">{formatCurrency(dcPensionValue, true)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm py-1.5 font-bold">
            <span className="text-slate-800">Gross estate</span>
            <span className="text-slate-900">{formatCurrency(result.grossEstate, true)}</span>
          </div>
        </div>
      </div>

      {/* Section 2 - IHT Projection */}
      <div className="mb-5">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
          IHT Projection
        </h4>
        {/* Amber: approaching taper zone — estate between £1.8m and £2m */}
        {result.rnrbTaperWarning && result.grossEstate <= IHT.RNRB_TAPER_THRESHOLD && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              Approaching RNRB taper threshold
            </p>
            <p className="text-xs text-amber-700">
              Your projected estate is approaching{' '}
              {formatCurrency(IHT.RNRB_TAPER_WARNING_THRESHOLD, true)} — the RNRB begins tapering
              at {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)} and is fully withdrawn at{' '}
              {formatCurrency(IHT.RNRB_TAPER_END_SINGLE, true)} (single) or{' '}
              {formatCurrency(IHT.RNRB_TAPER_END_COUPLE, true)} (couple with full transfer).
            </p>
          </div>
        )}
        {/* Amber: taper is actively reducing RNRB — estate above £2m */}
        {result.grossEstate > IHT.RNRB_TAPER_THRESHOLD && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              ⚠️ RNRB taper applies above £2m
            </p>
            <p className="text-xs text-amber-700">
              Your projected estate exceeds {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)}. The
              Residence Nil-Rate Band is being reduced and tapers away completely at{' '}
              {formatCurrency(IHT.RNRB_TAPER_END_SINGLE, true)} (single) or{' '}
              {formatCurrency(IHT.RNRB_TAPER_END_COUPLE, true)} (couple with full transfer).
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1">NRB available</p>
            <p className="text-lg font-black text-slate-800">
              {formatCurrency(result.nrbAvailable, true)}
            </p>
            {mode === 'couple' && (
              <p className="text-xs text-slate-400 mt-0.5">Includes transferable NRB</p>
            )}
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1">RNRB available</p>
            <p className="text-lg font-black text-slate-800">
              {formatCurrency(result.rnrbAvailable, true)}
            </p>
            {mode === 'couple' && state.primaryResidence.leavesToDescendants && (
              <p className="text-xs text-slate-400 mt-0.5">Includes transferable RNRB</p>
            )}
            {!state.primaryResidence.leavesToDescendants && (
              <p className="text-xs text-amber-600 mt-0.5">Enable in Step 3 to claim</p>
            )}
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1">Chargeable estate</p>
            <p className="text-lg font-black text-slate-800">
              {formatCurrency(result.chargeableEstate, true)}
            </p>
          </div>
          <div
            className={`rounded-xl p-3 ${
              result.ihtDue > 0
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-50 border border-green-200'
            }`}
          >
            <p className="text-xs text-slate-500 mb-1">IHT due</p>
            <p
              className={`text-lg font-black ${
                result.ihtDue > 0 ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {formatCurrency(result.ihtDue, true)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">at {(result.ihtRate * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>

      {/* Section 3 - April 2027 Impact */}
      {dcPensionValue > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            April 2027 Pension Impact
          </h4>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">IHT without pension in estate</span>
              <span className="font-bold text-slate-800">
                {formatCurrency(result.ihtDueExcludingPension, true)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">IHT with pension (from 2027)</span>
              <span className="font-bold text-slate-800">{formatCurrency(result.ihtDue, true)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
              <span className="font-bold text-red-700">Additional IHT from pension</span>
              <span className="font-black text-red-700">
                +{formatCurrency(result.pensionIHTDelta, true)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section 4 - Gifting Optimiser */}
      {gifting.recommendationTier !== 'no-action' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Gifting Strategy
            </h4>
            {gifting.isInTaperZone && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
                60% effective IHT rate
              </span>
            )}
          </div>

          {/* RNRB taper recovery callout */}
          {gifting.isInTaperZone && gifting.rnrbRecoveryOpportunity > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-bold text-amber-800 mb-1">
                Priority: recover RNRB by bringing estate below £2m
              </p>
              <p className="text-xs text-amber-700">
                Your estate is{' '}
                <span className="font-bold">{formatCurrency(gifting.giftingNeededForRNRBRecovery, true)}</span>{' '}
                above the £2m RNRB taper threshold. Gifting to get below this level saves{' '}
                <span className="font-bold">{formatCurrency(gifting.rnrbRecoveryOpportunity, true)}</span>{' '}
                in additional IHT via RNRB recovery — on top of the direct 40% IHT saving.
                The effective marginal rate in this zone is 60p per £1 gifted.
              </p>
            </div>
          )}

          {/* Annual gifting breakdown */}
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-3">
            <p className="text-xs font-bold text-slate-600 mb-2">Annual gift capacity</p>
            <div className="space-y-1.5">
              {gifting.annualExemptFromIncome > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Surplus income gifts (s.21)</span>
                  <span className="font-bold text-green-800">
                    {formatCurrency(gifting.annualExemptFromIncome, true)}/yr
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">
                  Annual exempt allowance (s.19
                  {gifting.annualExemptGiftAllowance > IHT.ANNUAL_GIFT_EXEMPTION
                    ? ', both spouses'
                    : ''}
                  )
                </span>
                <span className="font-bold text-green-800">
                  {formatCurrency(gifting.annualExemptGiftAllowance, true)}/yr
                </span>
              </div>
              {gifting.annualDCDrawdownGiftNet > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">
                    DC drawdown &amp; gift (PET, net of{' '}
                    {(gifting.marginalIncomeTaxRate * 100).toFixed(0)}% income tax)
                  </span>
                  <span className="font-bold text-green-800">
                    {formatCurrency(gifting.annualDCDrawdownGiftNet, true)}/yr
                  </span>
                </div>
              )}
              {gifting.annualTotalGift > 0 && (
                <div className="flex justify-between items-center text-sm border-t border-green-200 pt-2 mt-1">
                  <span className="font-bold text-slate-700">Total annual gift</span>
                  <span className="font-black text-green-800">
                    {formatCurrency(gifting.annualTotalGift, true)}/yr
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Net benefit analysis */}
          {gifting.annualNetBenefit !== 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-3">
              <p className="text-xs font-bold text-slate-600 mb-2">Annual net benefit</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">IHT saving</span>
                  <span className="font-bold text-green-700">
                    +{formatCurrency(gifting.annualIHTSaving, true)}/yr
                  </span>
                </div>
                {gifting.annualIncomeTaxCost > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Income tax on DC drawdown</span>
                    <span className="font-bold text-red-600">
                      −{formatCurrency(gifting.annualIncomeTaxCost, true)}/yr
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
                  <span className="font-bold text-slate-700">Net benefit</span>
                  <span
                    className={`font-black ${gifting.annualNetBenefit > 0 ? 'text-green-700' : 'text-red-700'}`}
                  >
                    {gifting.annualNetBenefit > 0 ? '+' : ''}
                    {formatCurrency(gifting.annualNetBenefit, true)}/yr
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Cumulative saving */}
          {result.remainingYears > 0 && gifting.cumulativeNetBenefit > 0 && (
            <p className="text-sm text-slate-600">
              Over {result.remainingYears} years a consistent gifting strategy could deliver a{' '}
              <span className="font-bold text-green-800">
                {formatCurrency(gifting.cumulativeNetBenefit, true)}
              </span>{' '}
              net reduction in total tax.
            </p>
          )}

          {/* Income-only note when DC draw-and-gift is not recommended */}
          {gifting.recommendationTier === 'income-gifts-only' && (
            <p className="text-xs text-slate-500 mt-2">
              At your projected income level, drawing extra pension to gift would cost{' '}
              {(gifting.marginalIncomeTaxRate * 100).toFixed(0)}% income tax — more than the{' '}
              {(gifting.effectiveMarginalIHTRate * 100).toFixed(0)}% IHT saving. Only surplus-income
              and annual-exempt gifts are recommended.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
