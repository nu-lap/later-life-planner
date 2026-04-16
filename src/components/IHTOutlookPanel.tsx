'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { PlannerState } from '@/models/types';
import { YearlyProjection } from '@/models/types';
import { calculateIHTProjection } from '@/financialEngine/ihtProjection';
import {
  calculateGiftingOptimisation,
  calculateRNRBScenarios,
  RNRBScenarioResult,
} from '@/financialEngine/giftingOptimiser';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { DEFAULT_ASSUMPTIONS, IHT, getRNRBForYear, getRNRBTaperThresholdForYear } from '@/config/financialConstants';

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

    // Project residence value forward to death using Voyant-aligned 3 %/yr nominal growth.
    // At death the mortgage is assumed fully repaid, so we compound the full current value
    // and preserve any residual equity.
    const yearsToDeathFromNow = Math.max(0, estimateDeathYear(state) - new Date().getFullYear());
    const residenceGrowthFactor = Math.pow(1 + DEFAULT_ASSUMPTIONS.HOUSE_PRICE_GROWTH / 100, yearsToDeathFromNow);
    const projectedResidenceValue = state.primaryResidence.enabled
      ? Math.round(state.primaryResidence.currentValue * residenceGrowthFactor)
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
      primaryResidenceNetValue: projectedResidenceValue,
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
      // rnrbBase: eligible RNRB before taper = min(maxRNRB, qualifying residence value at death).
      // Bounds the recovery opportunity to what is genuinely recoverable.
      rnrbBase: (state.primaryResidence.enabled && state.primaryResidence.leavesToDescendants)
        ? Math.min(mode === 'couple' ? IHT.RNRB * 2 : IHT.RNRB, projectedResidenceValue)
        : 0,
      isCouple: mode === 'couple',
      dcPensionValue,
      annualSurplusIncome: result.annualGiftingCapacity,
      annualIncome,
      remainingYears,
      calendarYear: deathYear,
    });

    // ── Gifting comparison chart data ────────────────────────────────────────────
    // Annual financial-asset reduction from the gifting strategy:
    //  - surplusIncome + annualExempt: cash that would otherwise have been reinvested
    //  - DCDrawdownGross: full gross DC amount leaves the pension pot
    //    (income tax evaporates to HMRC; net proceeds are gifted away)
    const annualAssetReduction =
      gifting.annualExemptFromIncome +
      gifting.annualExemptGiftAllowance +
      gifting.annualDCDrawdownGross;

    // Only chart when there is meaningful gifting to show and projections exist.
    const giftingChartData =
      gifting.recommendationTier !== 'no-action' && annualAssetReduction > 0 && projections.length > 0
        ? projections.map((p, i) => ({
            age: p.p1Age,
            current: Math.round(p.totalAssets),
            withGifting: Math.max(0, Math.round(p.totalAssets - annualAssetReduction * i)),
          }))
        : null;

    // ── RNRB taper clawback scenarios ────────────────────────────────────────────
    // Use the first projection at or after FI age as the retirement-start snapshot.
    // Projections begin at "today", so projections[0] can be pre-retirement.
    const retirementStartIndex = projections.findIndex((p) => p.p1Age >= state.fiAge);
    const retirementStartProjection =
      retirementStartIndex >= 0 ? projections[retirementStartIndex] : null;
    const p1DcAtRetirement = retirementStartProjection?.p1DcBalance ?? 0;
    const p2DcAtRetirement =
      (mode === 'couple' && retirementStartProjection?.p2DcBalance)
        ? retirementStartProjection.p2DcBalance
        : 0;
    const yearsInRetirement =
      retirementStartIndex >= 0 ? projections.length - retirementStartIndex : 0;

    // Recompute maxPreTaperRNRB: the RNRB before any taper reduction at the baseline estate.
    // Gate on RNRB eligibility — if the residence is not left to descendants, no RNRB recovery
    // is possible and maxPreTaperRNRB must be 0 to avoid falsely showing IHT savings.
    const isRnrbEligible = state.primaryResidence.enabled && state.primaryResidence.leavesToDescendants;
    const maxPreTaperRNRB = isRnrbEligible
      ? Math.min(getRNRBForYear(deathYear) * (mode === 'couple' ? 2 : 1), residenceValue)
      : 0;

    // Projected RNRB taper threshold and taper-end values at death (post-2030 escalation applied).
    const projectedRNRBPerPerson = getRNRBForYear(deathYear);
    const projectedTaperEndSingle = taperThreshold + 2 * projectedRNRBPerPerson;
    const projectedTaperEndCouple = taperThreshold + 4 * projectedRNRBPerPerson;

    const rnrbScenarios = result.ihtDue > 0
      ? calculateRNRBScenarios({
          grossEstate: result.grossEstate,
          ihtDue: result.ihtDue,
          ihtRate: result.ihtRate,
          nrbAvailable: result.nrbAvailable,
          maxPreTaperRNRB,
          p1DcAtRetirement,
          p2DcAtRetirement,
          yearsInRetirement,
          isCouple: mode === 'couple',
          deathYear,
          p1Name: state.person1.name || 'Person 1',
          p2Name: (mode === 'couple' && state.person2?.name) ? state.person2.name : 'Person 2',
        })
      : null;

    return { result, gifting, mode, residenceValue, projectedResidenceValue, isaValue, giaValue, cashValue, dcPensionValue, giftingChartData, rnrbScenarios, deathYear, taperThreshold, projectedTaperEndSingle, projectedTaperEndCouple };
  }, [state, projections]);

  const [activeScenario, setActiveScenario] = useState<'B1' | 'B2' | 'C2' | null>(null);

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

  const { result, gifting, mode, residenceValue, projectedResidenceValue, isaValue, giaValue, cashValue, dcPensionValue, giftingChartData, rnrbScenarios, taperThreshold, projectedTaperEndSingle, projectedTaperEndCouple } = computed;

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
          {projectedResidenceValue > 0 && (
            <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
              <span className="text-slate-600">
                Primary residence
                <span className="ml-1.5 text-xs text-slate-400">(projected at death)</span>
              </span>
              <span className="font-bold text-slate-900">{formatCurrency(projectedResidenceValue, true)}</span>
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
        {/* Amber: approaching taper zone — estate between warning threshold and taper threshold */}
        {result.rnrbTaperWarning && result.grossEstate <= IHT.RNRB_TAPER_THRESHOLD && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              Approaching RNRB taper threshold
            </p>
            <p className="text-xs text-amber-700">
              Your projected estate is approaching the RNRB taper threshold. The RNRB begins tapering
              at {formatCurrency(taperThreshold, true)} at death (today: {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)}) and is fully
              withdrawn at{' '}
              {formatCurrency(projectedTaperEndSingle, true)} (single) or{' '}
              {formatCurrency(projectedTaperEndCouple, true)} (couple with full transfer).
            </p>
          </div>
        )}
        {/* Amber: taper is actively reducing RNRB — estate above projected threshold */}
        {result.grossEstate > IHT.RNRB_TAPER_THRESHOLD && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              ⚠️ RNRB taper applies above {formatCurrency(taperThreshold, true)} at death
            </p>
            <p className="text-xs text-amber-700">
              Your projected estate exceeds the RNRB taper threshold (today: {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)},
              projected at death: {formatCurrency(taperThreshold, true)}). The Residence Nil-Rate Band is being
              reduced and tapers away completely at{' '}
              {formatCurrency(projectedTaperEndSingle, true)} (single) or{' '}
              {formatCurrency(projectedTaperEndCouple, true)} (couple with full transfer).
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
              <span
                className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5"
                title="60% is the effective marginal rate before any gifting strategy is applied — £1 gifted saves 40p IHT directly, plus recovers £1 of RNRB worth another 20p"
              >
                60% marginal rate (before strategy)
              </span>
            )}
          </div>

          {/* RNRB taper recovery callout */}
          {gifting.isInTaperZone && gifting.rnrbRecoveryOpportunity > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-bold text-amber-800 mb-1">
                Priority: recover RNRB by bringing estate below {formatCurrency(taperThreshold, true)} at death
              </p>
              <p className="text-xs text-amber-700">
                Your estate is{' '}
                <span className="font-bold">{formatCurrency(gifting.giftingNeededForRNRBRecovery, true)}</span>{' '}
                above the projected RNRB taper threshold at death ({formatCurrency(taperThreshold, true)};
                today&apos;s value {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)}). Gifting to get below this level saves{' '}
                <span className="font-bold">{formatCurrency(gifting.rnrbRecoveryOpportunity, true)}</span>{' '}
                in additional IHT via RNRB recovery — on top of the direct 40% IHT saving.
                The effective marginal rate in this zone is 60p per £1 gifted, before strategy is applied.
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

          {/* Comparison chart: total assets with vs without gifting strategy */}
          {giftingChartData && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                Asset trajectory comparison
              </p>
              <p className="text-xs text-slate-400 mb-3">
                Approximate — assumes consistent annual gifting of{' '}
                {formatCurrency(
                  gifting.annualExemptFromIncome +
                    gifting.annualExemptGiftAllowance +
                    gifting.annualDCDrawdownGross,
                  true,
                )}{' '}
                per year. Does not re-run the full projection engine.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={giftingChartData}
                  margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="age"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => {
                      if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
                      if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}k`;
                      return `£${v}`;
                    }}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconType="line" iconSize={14} />
                  <ReferenceLine
                    y={0}
                    stroke="#94a3b8"
                    strokeDasharray="2 2"
                    strokeWidth={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Current path"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="withGifting"
                    name="With gifting strategy"
                    stroke="#16a34a"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Section 5 — RNRB Taper Clawback Scenarios */}
      {rnrbScenarios && rnrbScenarios.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
            RNRB Taper Clawback Scenarios
          </h4>
          <p className="text-xs text-slate-400 mb-3">
            Directional estimates — does not re-run the full projection engine.
            All scenarios assume DC lump sums / drawdown proceeds are gifted as PETs (&gt;7 yrs
            before death).
          </p>

          {/* Scenario toggle buttons */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {rnrbScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveScenario(activeScenario === s.id ? null : s.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  activeScenario === s.id
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-700'
                }`}
              >
                {s.label}
                {s.breachesRNRBTaperThreshold && (
                  <span className="ml-1 text-amber-300" title={`Estate drops below the ${formatCurrency(taperThreshold, true)} projected RNRB taper threshold at death`}>★</span>
                )}
              </button>
            ))}
            <span className="text-xs text-slate-400 self-center ml-1">
              ★ = estate drops below {formatCurrency(taperThreshold, true)} RNRB threshold at death
            </span>
          </div>

          {/* Active scenario detail */}
          {activeScenario && (() => {
            const s = rnrbScenarios.find((x: RNRBScenarioResult) => x.id === activeScenario);
            if (!s) return null;
            return (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-bold text-violet-900">{s.label}</p>
                  <p className="text-xs text-violet-700 mt-0.5">{s.description}</p>
                </div>

                {/* Actions */}
                <div className="space-y-1.5">
                  {s.upfrontPCLS > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Tax-free PCLS at retirement</span>
                      <span className="font-bold text-violet-800">{formatCurrency(s.upfrontPCLS, true)}</span>
                    </div>
                  )}
                  {s.annualDrawdown > 0 && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Annual DC drawdown (gross)</span>
                        <span className="font-bold text-slate-700">{formatCurrency(s.annualDrawdown, true)}/yr</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Income tax on drawdown (20%)</span>
                        <span className="font-bold text-red-600">−{formatCurrency(s.annualIncomeTaxCost, true)}/yr</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Net annual gift (PET)</span>
                        <span className="font-bold text-green-700">{formatCurrency(s.annualGift, true)}/yr</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Estate outcome */}
                <div className="rounded-lg bg-white border border-violet-100 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Estate outcome</p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Total estate reduction</span>
                    <span className="font-bold text-violet-800">−{formatCurrency(s.totalEstateReduction, true)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">New gross estate</span>
                    <span className="font-bold text-slate-800">{formatCurrency(s.newGrossEstate, true)}</span>
                  </div>
                  {s.rnrbRecovered > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">RNRB recovered</span>
                      <span className="font-bold text-green-700">+{formatCurrency(s.rnrbRecovered, true)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm border-t border-violet-100 pt-1.5">
                    <span className="text-slate-600">New IHT liability</span>
                    <span className="font-bold text-slate-800">{formatCurrency(s.newIHTDue, true)}</span>
                  </div>
                </div>

                {/* Net benefit */}
                <div className="rounded-lg bg-white border border-violet-100 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Net benefit</p>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">IHT saving</span>
                    <span className="font-bold text-green-700">+{formatCurrency(s.ihtSaving, true)}</span>
                  </div>
                  {s.totalIncomeTaxCost > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Total income tax cost</span>
                      <span className="font-bold text-red-600">−{formatCurrency(s.totalIncomeTaxCost, true)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm border-t border-violet-100 pt-1.5">
                    <span className={`font-black text-base ${s.netBenefit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      Net benefit: {s.netBenefit >= 0 ? '+' : ''}{formatCurrency(s.netBenefit, true)}
                    </span>
                  </div>
                </div>

                {s.breachesRNRBTaperThreshold && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ★ This scenario brings the estate below the projected RNRB taper threshold at death
                    ({formatCurrency(taperThreshold, true)}; today&apos;s value {formatCurrency(IHT.RNRB_TAPER_THRESHOLD, true)}) — the full
                    RNRB is recovered, saving an additional{' '}
                    <span className="font-bold">{formatCurrency(s.rnrbRecovered * result.ihtRate, true)}</span> in IHT.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Accuracy disclaimer */}
      <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-600 mb-1">📋 About these projections</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          These figures are illustrations only. Over a long planning horizon the results
          are sensitive to assumptions about property growth, investment returns, inflation,
          and future tax threshold changes — all of which carry significant uncertainty.
          Tax rules and thresholds may change; projections assume current legislation
          continues or escalates in line with stated assumptions.{' '}
          <strong>These calculations are not financial advice.</strong>{' '}
          Before making any significant planning decisions, please seek guidance from a
          qualified financial adviser.
        </p>
      </div>
    </div>
  );
}
