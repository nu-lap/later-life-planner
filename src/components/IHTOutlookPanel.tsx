'use client';

import { useMemo } from 'react';
import { PlannerState } from '@/models/types';
import { YearlyProjection } from '@/models/types';
import { calculateIHTProjection } from '@/financialEngine/ihtProjection';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { DEFAULT_ASSUMPTIONS } from '@/config/financialConstants';

interface IHTOutlookPanelProps {
  state: PlannerState;
  projections: YearlyProjection[];
}

/**
 * Computes the calendar year of projected death for person1.
 * Falls back to current year + life expectancy if DOB is unavailable.
 */
function estimateDeathYear(state: PlannerState): number {
  const lifeExpectancy = DEFAULT_ASSUMPTIONS.LIFE_EXPECTANCY;
  const dob = state.person1.dateOfBirth;
  if (dob) {
    const birthYear = new Date(dob).getFullYear();
    return birthYear + lifeExpectancy;
  }
  return new Date().getFullYear() + (lifeExpectancy - state.person1.currentAge);
}

export default function IHTOutlookPanel({ state, projections }: IHTOutlookPanelProps) {
  const result = useMemo(() => {
    const mode = state.mode;    const finalYear = projections[projections.length - 1];

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

    const primaryResidenceNetValue = state.primaryResidence.enabled
      ? Math.max(0, state.primaryResidence.currentValue - state.primaryResidence.mortgageOutstanding)
      : 0;

    // Annual income/spending from the final projection year for gifting capacity.
    const annualIncome = finalYear?.totalIncome ?? 0;
    const annualSpending = finalYear?.spending ?? 0;
    const deathYear = estimateDeathYear(state);
    const currentYear = new Date().getFullYear();
    const remainingYears = Math.max(0, deathYear - currentYear);

    return calculateIHTProjection({
      deathYear,
      primaryResidenceNetValue,
      residenceLeavesToDescendants: state.primaryResidence.leavesToDescendants,
      isaValue,
      giaValue,
      cashValue,
      dcPensionValue,
      investmentPropertyValue: 0,
      unusedNrbFraction: 1.0, // Assume full NRB transfer for surviving spouse
      isCouple: mode === 'couple',
      charitableEstate: false,
      annualIncome,
      annualSpending,
      remainingYears,
    });
  }, [state, projections]);

  const mode = state.mode;
  const finalYear = projections[projections.length - 1];

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

  return (
    <div className="game-card border-violet-200 bg-violet-50/40">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl flex-shrink-0">🏛️</span>
        <div>
          <h3 className="font-black text-slate-900 text-base">IHT Estate Planning</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Projected inheritance tax at end of plan horizon
          </p>
        </div>
      </div>

      {/* Section 1 — Estate Breakdown */}
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

      {/* Section 2 — IHT Projection */}
      <div className="mb-5">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
          IHT Projection
        </h4>
        {result.rnrbTaperWarning && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              ⚠️ RNRB taper applies above £2m
            </p>
            <p className="text-xs text-amber-700">
              Your projected estate exceeds £2,000,000. The Residence Nil-Rate Band is being
              reduced — it tapers away completely at £2,350,000 (per person) or £2,700,000
              (transferable couple).
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

      {/* Section 3 — April 2027 Impact */}
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

      {/* Section 4 — Gifting Capacity */}
      {result.annualGiftingCapacity > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Gifting Capacity (IHTA 1984 s.21)
          </h4>
          <div className="rounded-xl bg-green-50 border border-green-200 p-4">
            <p className="text-sm text-slate-700 mb-2">
              You have an estimated{' '}
              <span className="font-bold text-green-800">
                {formatCurrency(result.annualGiftingCapacity, true)}/yr
              </span>{' '}
              surplus income available for IHT-exempt normal-expenditure gifts.
            </p>
            {result.remainingYears > 0 && (
              <p className="text-sm text-slate-600">
                Over {result.remainingYears} years this could save{' '}
                <span className="font-bold text-green-800">
                  {formatCurrency(result.cumulativeGiftingIHTSaving, true)}
                </span>{' '}
                in IHT.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
