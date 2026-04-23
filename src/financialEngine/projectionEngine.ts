/**
 * Core lifetime projection engine.
 *
 * Calculates year-by-year income, spending, asset drawdowns, and tax
 * from the current age to life expectancy.
 *
 * Architecture notes:
 * - All financial constants imported from /config/financialConstants
 * - Tax calculations delegated to /financialEngine/taxCalculations
 * - No React imports — this module is pure TypeScript
 * - Exported helpers (formatCurrency, etc.) are used by UI components
 *
 * DC Pension drawdown model — UFPLS (Uncrystallised Funds Pension Lump Sum):
 *   The engine uses a pure UFPLS strategy. No upfront PCLS lump sum is taken
 *   at crystallisation. Instead, each DC pension withdrawal is 25% tax-free
 *   and 75% taxable, spread naturally over the drawdown period.
 *
 *   Rationale:
 *   - Leaves the full pension pot invested (tax-free growth environment) for longer.
 *   - Before the State Pension starts, the 75% taxable UFPLS portion can be
 *     absorbed within the personal allowance (£12,570), making early draws
 *     highly tax-efficient or completely tax-free.
 *   - Avoids a large one-off lump sum being parked in cash where it earns less
 *     and loses the pension's tax-free growth wrapper.
 *
 *   LSA tracking:
 *   The Lump Sum Allowance (£268,275 per person) limits the total tax-free cash
 *   taken from pensions in a lifetime (Finance Act 2024). The 25% tax-free
 *   portion of each UFPLS withdrawal accumulates against the LSA. Once the LSA
 *   is exhausted, subsequent DC withdrawals become fully taxable.
 *
 * Joint GIA:
 *   When a GIA has owner = 'joint', capital gains are split equally
 *   between both persons for CGT purposes, allowing each person's
 *   annual CGT exempt amount (£3,000) to be used efficiently.
 */

import type {
  PlannerState, YearlyProjection, LifeStage,
  PersonIncomeSources, PersonAssets, SimulationResult,
  GamificationMetrics,
} from '@/models/types';
import { CGT, PENSION_RULES, RLSS, CURRENT_TAX_YEAR_START } from '@/config/financialConstants';
import { getSnapshotForYear } from '@/config/taxRuleSnapshot';
import { calcIncomeTax, calcCGT, drawFromGIA, isHigherRateTaxpayer } from './taxCalculations';

// ─── Per-person income aggregator ────────────────────────────────────────────

function personIncome(
  src: PersonIncomeSources,
  assets: PersonAssets,
  personAge: number,
  yearIndex: number,
  inflRate: number,
): { sp: number; db: number; ptw: number; other: number; rent: number } {
  // Inflation factor from year 0 (today) — consistent with spending inflation.
  // Income amounts are entered in today's money; nominal values grow from now.
  const inflFactor = Math.pow(1 + inflRate / 100, yearIndex);

  // State Pension — in today's money, grows with inflation from year 0
  const sp = src.statePension.enabled && personAge >= src.statePension.startAge
    ? src.statePension.weeklyAmount * 52 * inflFactor : 0;

  // DB Pension — in today's money, grows with inflation from year 0
  const db = src.dbPension.enabled && personAge >= src.dbPension.startAge
    ? src.dbPension.annualIncome * inflFactor : 0;

  // Annuity — in today's money, grows with inflation from year 0
  const annuity = src.annuity?.enabled && personAge >= (src.annuity?.startAge ?? 999)
    ? src.annuity.annualIncome * inflFactor : 0;

  // Part-time work — not inflation-linked (nominal income)
  const ptw = src.partTimeWork.enabled && personAge < src.partTimeWork.stopAge
    ? src.partTimeWork.annualIncome : 0;

  // Other income (trusts, gifts, etc.) — not inflation-linked
  const otherBase = src.otherIncome.enabled &&
    personAge >= src.otherIncome.startAge &&
    (src.otherIncome.stopAge === 0 || personAge < src.otherIncome.stopAge)
    ? src.otherIncome.annualAmount : 0;

  // Property rental income — runs for durationYears from year 0
  // For joint property, both persons can have the same property; only count once (handled at call site)
  const rent = assets.property.enabled &&
    assets.property.annualRent > 0 &&
    yearIndex < assets.property.durationYears
    ? assets.property.annualRent : 0;

  return { sp, db, ptw, other: otherBase + annuity, rent };
}

// ─── Stage lookup ─────────────────────────────────────────────────────────────

function getStageForAge(stages: LifeStage[], age: number): LifeStage {
  return (
    stages.find(s => age >= s.startAge && age <= s.endAge) ??
    // Pre-FI working years use the first stage's spending as a baseline
    (age < stages[0].startAge ? stages[0] : stages[stages.length - 1])
  );
}

function getAnnualDcContribution(
  dcPension: PersonIncomeSources['dcPension'],
  yearIndex: number,
  inflationRate: number,
): number {
  const inflFactor = Math.pow(1 + inflationRate / 100, yearIndex);
  const workplaceSalary = Math.max(0, dcPension.workplaceSalary ?? 0);
  const workplaceContributionPercent = Math.max(0, dcPension.workplaceContributionPercent ?? 0);
  const sippContributionAnnualGross = Math.max(0, dcPension.sippContributionAnnualGross ?? 0);

  const workplaceContribution = workplaceSalary > 0 && workplaceContributionPercent > 0
    ? workplaceSalary * inflFactor * (workplaceContributionPercent / 100)
    : 0;
  const sippContribution = sippContributionAnnualGross > 0
    ? sippContributionAnnualGross * inflFactor
    : 0;

  return workplaceContribution + sippContribution;
}

// ─── Main projection loop ─────────────────────────────────────────────────────

export function calculateProjections(state: PlannerState): YearlyProjection[] {
  const { person1, person2, lifeStages, spendingCategories, assumptions, mode, fiAge, jointGia } = state;
  const { lifeExpectancy, inflation, investmentGrowth } = assumptions;
  const drawdownStrategy = state.drawdownStrategy ?? 'standard-ufpls';
  const isPclsBedIsa = drawdownStrategy === 'pcls-bed-isa';

  // Resolve the PCLS crystallisation age: user-specified (≥ current age and NMPA), else fiAge.
  // NMPA is 55 before calendar year 2028, rising to 57 from 2028 onwards.
  const rawPclsAge = state.pclsAge ?? fiAge;
  const pclsCalendarYear = CURRENT_TAX_YEAR_START + (rawPclsAge - person1.currentAge);
  const nmpa = pclsCalendarYear >= PENSION_RULES.NMPA_RISE_YEAR
    ? PENSION_RULES.MIN_ACCESS_AGE_POST_2028
    : PENSION_RULES.MIN_ACCESS_AGE;
  // Prevent the crystallisation event from being scheduled in the past.
  const resolvedPclsAge = Math.max(rawPclsAge, nmpa, person1.currentAge);

  // ── Initialise asset balances ──────────────────────────────────────────────
  let p1Isa   = person1.assets.isaInvestments.enabled     ? person1.assets.isaInvestments.totalValue     : 0;
  let p1GiaV  = person1.assets.generalInvestments.enabled ? person1.assets.generalInvestments.totalValue : 0;
  let p1GiaBC = person1.assets.generalInvestments.enabled ? person1.assets.generalInvestments.baseCost   : 0;
  let p1Cash  = person1.assets.cashSavings.enabled        ? person1.assets.cashSavings.totalValue        : 0;
  let p1Dc    = person1.incomeSources.dcPension.enabled   ? person1.incomeSources.dcPension.totalValue   : 0;

  let p2Isa   = (mode === 'couple' && person2.assets.isaInvestments.enabled)     ? person2.assets.isaInvestments.totalValue     : 0;
  let p2GiaV  = (mode === 'couple' && person2.assets.generalInvestments.enabled) ? person2.assets.generalInvestments.totalValue : 0;
  let p2GiaBC = (mode === 'couple' && person2.assets.generalInvestments.enabled) ? person2.assets.generalInvestments.baseCost   : 0;
  let p2Cash  = (mode === 'couple' && person2.assets.cashSavings.enabled)        ? person2.assets.cashSavings.totalValue        : 0;
  let p2Dc    = (mode === 'couple' && person2.incomeSources.dcPension.enabled)   ? person2.incomeSources.dcPension.totalValue   : 0;

  // ── Joint GIA (top-level shared asset, couple mode only) ─────────────────
  let jointGiaV  = (mode === 'couple' && jointGia.enabled) ? jointGia.totalValue : 0;
  let jointGiaBC = (mode === 'couple' && jointGia.enabled) ? jointGia.baseCost   : 0;

  // ── Per-asset growth rates (fall back to global investmentGrowth) ──────────
  const p1IsaG     = (person1.assets.isaInvestments.growthRate     ?? investmentGrowth) / 100;
  const p1GiaG     = (person1.assets.generalInvestments.growthRate ?? investmentGrowth) / 100;
  const p1DcG      = (person1.incomeSources.dcPension.growthRate   ?? investmentGrowth) / 100;
  const p2IsaG     = (person2.assets.isaInvestments.growthRate     ?? investmentGrowth) / 100;
  const p2GiaG     = (person2.assets.generalInvestments.growthRate ?? investmentGrowth) / 100;
  const p2DcG      = (person2.incomeSources.dcPension.growthRate   ?? investmentGrowth) / 100;
  const jointGiaG  = (jointGia.growthRate ?? investmentGrowth) / 100;

  // ── Care Reserve — earmarked capital, invested but not drawn for spending ─
  // Grows at the portfolio investment growth rate each year.
  // Never enters the drawdown waterfall; tracked separately in projections.
  let careReserveBalance = (state.careReserve?.enabled && state.careReserve.amount > 0)
    ? state.careReserve.amount : 0;

  // ── Lifetime tax-free UFPLS tracking — accumulates against the LSA ─────
  // The LSA (£268,275 per person) caps total tax-free cash from pensions.
  // Each year's DC withdrawal contributes 25% tax-free to this running total.
  // Once the LSA is exhausted, DC withdrawals become fully taxable.
  let p1LifetimePcls = 0;
  let p2LifetimePcls = 0;

  const maxYears   = lifeExpectancy - person1.currentAge;
  const projections: YearlyProjection[] = [];

  for (let y = 0; y <= maxYears; y++) {
    const p1Age      = person1.currentAge + y;
    const p2Age      = mode === 'couple' ? person2.currentAge + y : null;
    const inflFactor = Math.pow(1 + inflation / 100, y);
    const householdFiStarted = p1Age >= fiAge;

    // Calendar year for this simulation iteration — used to look up the correct
    // HMRC tax rule snapshot (income tax bands, CGT rates, pension LSA).
    const calendarYear   = CURRENT_TAX_YEAR_START + y;
    const yearSnapshot   = getSnapshotForYear(calendarYear);
    const yearPensionLsa = yearSnapshot.pension.lsa;
    const yearUfplsFrac  = yearSnapshot.pension.ufplsTaxFreeFraction;

    // ── Spending (inflation-adjusted from today's £) ───────────────────────
    const stage    = getStageForAge(lifeStages, p1Age);
    const spending = spendingCategories.reduce((s, c) => s + (c.amounts[stage.id] ?? 0), 0) * inflFactor;

    // ── Fixed income ──────────────────────────────────────────────────────
    const p1Inc = personIncome(person1.incomeSources, person1.assets, p1Age, y, inflation);
    const p2Inc = mode === 'couple' && p2Age !== null
      ? personIncome(person2.incomeSources, person2.assets, p2Age, y, inflation)
      : { sp: 0, db: 0, ptw: 0, other: 0, rent: 0 };

    // For joint property: avoid double-counting rent — use only person1's rent figure
    const jointPropP1 = person1.assets.property.owner === 'joint';
    const p2RentEffective = jointPropP1 ? 0 : p2Inc.rent; // already counted in p1Inc.rent

    const fixedIncome = p1Inc.sp + p1Inc.db + p1Inc.ptw + p1Inc.other + p1Inc.rent
                      + p2Inc.sp + p2Inc.db + p2Inc.ptw + p2Inc.other + p2RentEffective;

    // ── Asset growth (before drawdown) ────────────────────────────────────
    if (p1Isa            > 0) p1Isa            *= (1 + p1IsaG);
    if (p1GiaV           > 0) p1GiaV           *= (1 + p1GiaG);
    if (p1Dc             > 0) p1Dc             *= (1 + p1DcG);
    if (p2Isa            > 0) p2Isa            *= (1 + p2IsaG);
    if (p2GiaV           > 0) p2GiaV           *= (1 + p2GiaG);
    if (p2Dc             > 0) p2Dc             *= (1 + p2DcG);
    if (jointGiaV        > 0) jointGiaV        *= (1 + jointGiaG);
    // Care reserve grows at the global investment growth rate (it's invested within the portfolio)
    if (careReserveBalance > 0) careReserveBalance *= (1 + investmentGrowth / 100);

    if (!householdFiStarted) {
      if (person1.incomeSources.dcPension.enabled) {
        p1Dc += getAnnualDcContribution(person1.incomeSources.dcPension, y, inflation);
      }
      if (mode === 'couple' && person2.incomeSources.dcPension.enabled) {
        p2Dc += getAnnualDcContribution(person2.incomeSources.dcPension, y, inflation);
      }
    }

    // ── DC pension source handles ─────────────────────────────────────────
    const dc1 = person1.incomeSources.dcPension;
    const dc2 = person2.incomeSources.dcPension;

    // ── Taxable fixed income per person (constant regardless of draw amounts) ──
    const p1TaxableFixed = p1Inc.sp + p1Inc.db + p1Inc.ptw + p1Inc.other + p1Inc.rent;
    const p2TaxableFixed = p2Inc.sp + p2Inc.db + p2Inc.ptw + p2Inc.other + p2RentEffective;
    const spExempt = assumptions.statePensionSoleIncomeExempt ?? true;

    // ── PCLS + Bed & ISA strategy — pre-waterfall adjustments ─────────────
    // These modify asset balances BEFORE the gross-up snapshot so the changes
    // are permanent for the year and not repeated on each gross-up iteration.
    //
    // PCLS crystallisation (pcls-bed-isa strategy only):
    //   At resolvedPclsAge, take person1's maximum tax-free lump sum (up to LSA),
    //   reinvest into ISA wrappers then GIA. Mark p1LifetimePcls = LSA so all
    //   subsequent DC draws are 100% taxable.
    //
    // Annual Bed & ISA (all strategies, FI years only):
    //   Sell GIA assets (individual then joint) up to each person's remaining ISA
    //   annual allowance and repurchase inside the ISA wrapper. Triggers CGT on
    //   any embedded gains crystallised. Holding GIA when ISA allowance is unused
    //   is suboptimal — future growth in GIA is subject to CGT whereas ISA growth
    //   is tax-free.
    //
    //   Allowance order: p1 individual GIA → p1 ISA, p2 individual GIA → p2 ISA,
    //   joint GIA → p1 ISA (remaining allowance), joint GIA → p2 ISA (remaining).
    let p1PclsEvent = 0;
    // p1BedIsaTransfer / p1BedIsaCg: transfers into p1 ISA and their capital gains (individual p1 GIA).
    // p2BedIsaTransfer / p2IndivBedIsaCg: transfers into p2 ISA and individual p2 GIA gains (100% p2).
    // p2BedIsaCg: total joint GIA Bed & ISA gains (split 50/50 between persons for CGT).
    let p1BedIsaTransfer = 0, p1IndivBedIsaTransfer = 0, p1JointBedIsaTransfer = 0, p1BedIsaCg = 0;
    let p2BedIsaTransfer = 0, p2IndivBedIsaTransfer = 0, p2JointBedIsaTransfer = 0, p2IndivBedIsaCg = 0, p2BedIsaCg = 0;

    // Track how much of each person's ISA annual allowance has already been used
    // in this year (PCLS reinvestment counts toward the same subscription limit).
    let p1IsaAllowanceUsed = 0;
    let p2IsaAllowanceUsed = 0;

    if (isPclsBedIsa) {
      // Track remaining ISA capacity per person to prevent over-subscription
      // when PCLS reinvestment and Bed & ISA both fire in the same tax year.
      let p1IsaCapacity = yearSnapshot.isaAnnualAllowance;
      let p2IsaCapacity = yearSnapshot.isaAnnualAllowance;

      // ── PCLS crystallisation at resolvedPclsAge ───────────────────────
      if (p1Age === resolvedPclsAge && p1Dc > 0 && dc1.enabled) {
        const remainingPensionLsa = Math.max(0, yearPensionLsa - p1LifetimePcls);
        const pclsAmount = Math.min(p1Dc * yearUfplsFrac, remainingPensionLsa);
        if (pclsAmount > 0) {
          p1Dc -= pclsAmount;
          // Advance the lifetime PCLS usage by the amount actually crystallised,
          // clamping at the year's LSA so future p1 DC draws become fully taxable
          // once the allowance has been exhausted.
          p1LifetimePcls = Math.min(yearPensionLsa, p1LifetimePcls + pclsAmount);
          // Reinvest: up to the annual ISA allowance per person into ISA wrappers,
          // remainder into GIA (joint for couple, p1 for single).
          // Base cost = reinvested amount; no embedded gain at acquisition.
          const p1ToIsa = Math.min(pclsAmount, p1IsaCapacity);
          const afterP1Isa = pclsAmount - p1ToIsa;
          const p2ToIsa = (mode === 'couple' && afterP1Isa > 0)
            ? Math.min(afterP1Isa, p2IsaCapacity)
            : 0;
          const toGia = afterP1Isa - p2ToIsa;
          // Reduce remaining capacity so Bed & ISA later in the same year
          // cannot cause total ISA subscriptions to exceed the annual cap.
          p1IsaCapacity -= p1ToIsa;
          p2IsaCapacity -= p2ToIsa;
          p1Isa += p1ToIsa;
          p1IsaAllowanceUsed = p1ToIsa;
          if (p2ToIsa > 0) { p2Isa += p2ToIsa; p2IsaAllowanceUsed = p2ToIsa; }
          if (toGia > 0) {
            if (mode === 'couple') { jointGiaV += toGia; jointGiaBC += toGia; }
            else                   { p1GiaV    += toGia; p1GiaBC    += toGia; }
          }
          p1PclsEvent = pclsAmount;
        }
      }
    }

    // ── Annual Bed & ISA — all strategies, FI years ─────────────────────
    // Shelter GIA assets into ISA wrappers up to each person's remaining annual
    // ISA allowance (reduced by any PCLS reinvestment above).
    if (householdFiStarted) {
      // p1 individual GIA → p1 ISA
      const p1Allowance = yearSnapshot.isaAnnualAllowance - p1IsaAllowanceUsed;
      if (p1GiaV > 0 && p1Allowance > 0) {
        const biAmount = Math.min(p1GiaV, p1Allowance);
        if (biAmount > 0) {
          const r = drawFromGIA(p1GiaV, p1GiaBC, biAmount);
          p1BedIsaTransfer      += r.drawn;
          p1IndivBedIsaTransfer += r.drawn;
          p1BedIsaCg       += r.capitalGain;
          p1GiaV    = r.newValue;
          p1GiaBC   = r.newBaseCost;
          p1Isa    += r.drawn;
          p1IsaAllowanceUsed += r.drawn;
        }
      }

      // p2 individual GIA → p2 ISA (couple only)
      const p2Allowance = yearSnapshot.isaAnnualAllowance - p2IsaAllowanceUsed;
      if (mode === 'couple' && p2GiaV > 0 && p2Allowance > 0) {
        const biAmount = Math.min(p2GiaV, p2Allowance);
        if (biAmount > 0) {
          const r = drawFromGIA(p2GiaV, p2GiaBC, biAmount);
          p2BedIsaTransfer      += r.drawn;
          p2IndivBedIsaTransfer += r.drawn;
          p2IndivBedIsaCg   += r.capitalGain;
          p2GiaV    = r.newValue;
          p2GiaBC   = r.newBaseCost;
          p2Isa    += r.drawn;
          p2IsaAllowanceUsed += r.drawn;
        }
      }

      // joint GIA → p1 ISA (remaining p1 allowance)
      const p1JointAllow = yearSnapshot.isaAnnualAllowance - p1IsaAllowanceUsed;
      if (jointGiaV > 0 && p1JointAllow > 0) {
        const biAmount = Math.min(jointGiaV, p1JointAllow);
        if (biAmount > 0) {
          const r = drawFromGIA(jointGiaV, jointGiaBC, biAmount);
          p1BedIsaTransfer      += r.drawn;
          p1JointBedIsaTransfer += r.drawn;
          p2BedIsaCg       += r.capitalGain;   // joint disposal → 50/50 CGT split
          jointGiaV    = r.newValue;
          jointGiaBC   = r.newBaseCost;
          p1Isa       += r.drawn;
          p1IsaAllowanceUsed += r.drawn;
        }
      }

      // joint GIA → p2 ISA (remaining p2 allowance, couple only)
      if (mode === 'couple' && p2Age !== null) {
        const p2JointAllow = yearSnapshot.isaAnnualAllowance - p2IsaAllowanceUsed;
        if (jointGiaV > 0 && p2JointAllow > 0) {
          const biAmount = Math.min(jointGiaV, p2JointAllow);
          if (biAmount > 0) {
            const r = drawFromGIA(jointGiaV, jointGiaBC, biAmount);
            p2BedIsaTransfer      += r.drawn;
            p2JointBedIsaTransfer += r.drawn;
            p2BedIsaCg       += r.capitalGain;  // joint disposal → 50/50 CGT split
            jointGiaV    = r.newValue;
            jointGiaBC   = r.newBaseCost;
            p2Isa       += r.drawn;
            p2IsaAllowanceUsed += r.drawn;
          }
        }
      }
    }

    // ── Save asset state after growth (and after PCLS/B&I), before drawdown ──
    // Needed to restore between gross-up iterations.
    const preDrawSnap = {
      p1Isa, p1GiaV, p1GiaBC, p1Cash, p1Dc,
      p2Isa, p2GiaV, p2GiaBC, p2Cash, p2Dc,
      jointGiaV, jointGiaBC,
      p1LifetimePcls, p2LifetimePcls,
    };

    // ── Draw variables (declared outside loop; final-iteration values used below) ──
    let p1DcTaxFree = 0, p2DcTaxFree = 0;
    let p1IsaD = 0, p1GiaD = 0, p1GiaCG = 0, p1CashD = 0, p1DcD = 0;
    let p2IsaD = 0, p2GiaD = 0, p2GiaCG = 0, p2CashD = 0, p2DcD = 0;
    let jointGiaD = 0, jointGiaCG = 0;

    // ── Tax result variables (updated each iteration) ────────────────────────
    let totalIncome = 0;
    let jointGainEach = 0;
    let p1OtherTaxable = 0, p2OtherTaxable = 0;
    let p1SpTaxable = 0, p2SpTaxable = 0;
    let p1TaxBasis = 0, p2TaxBasis = 0;
    let p1IncomeTax = 0, p2IncomeTax = 0, incomeTaxPaid = 0;
    let p1TotalCG = 0, p2TotalCG = 0;
    let p1CgtPaid = 0, p2CgtPaid = 0, totalCgtPaid = 0;
    let totalTaxPaid = 0;

    // ── Gross-up iteration ────────────────────────────────────────────────
    // The waterfall draws enough gross income to cover the spending target.
    // But tax on those draws reduces net income below spending. We iterate:
    //   grossTarget = spending + taxFromPreviousPass
    // This converges in 2–3 passes. When ISA/Cash cover the extra draw the
    // tax is unchanged and convergence is exact in a single extra iteration.
    // Post-FI priority:
    //   1. DC within personal allowance  (UFPLS, 0% effective tax)
    //   2. GIA within per-person CGT budget (individual then joint; budgets coordinated
    //                                        so each person's total gain ≤ £3,000)
    //   3. ISA                           (always tax-free)
    //   4. Remaining GIA                 (CGT taxable above exempt)
    //   5. Cash                          (tax-free withdrawal)
    //   6. DC above personal allowance   (income tax at marginal rate)
    let grossTarget = spending;

    for (let grossIter = 0; grossIter < 4; grossIter++) {
      // ── Restore asset state ────────────────────────────────────────────
      ({ p1Isa, p1GiaV, p1GiaBC, p1Cash, p1Dc,
         p2Isa, p2GiaV, p2GiaBC, p2Cash, p2Dc,
         jointGiaV, jointGiaBC,
         p1LifetimePcls, p2LifetimePcls } = preDrawSnap);

      // ── Reset draw accumulators ────────────────────────────────────────
      p1DcTaxFree = 0; p2DcTaxFree = 0;
      p1IsaD = 0; p1GiaD = 0; p1GiaCG = 0; p1CashD = 0; p1DcD = 0;
      p2IsaD = 0; p2GiaD = 0; p2GiaCG = 0; p2CashD = 0; p2DcD = 0;
      jointGiaD = 0; jointGiaCG = 0;

      let remaining = grossTarget - fixedIncome;

      if (remaining > 0) {
        // ── Step 1: DC pension (UFPLS) up to personal allowance headroom ────
        // Before drawing tax-free ISA, use any unused personal allowance capacity.
        // Each UFPLS withdrawal is 75% taxable; drawing up to the headroom keeps
        // effective income tax at 0% and leaves the pension growing tax-free for longer.
        // Only draws what is actually needed to cover spending (remaining).
        if (p1Dc > 0 && dc1.enabled && householdFiStarted) {
          const p1Headroom = Math.max(0, yearSnapshot.incomeTaxBands.personalAllowance - p1TaxableFixed);
          const maxWithinAllowance = p1Headroom / (1 - yearUfplsFrac);
          const d = Math.min(maxWithinAllowance, p1Dc, remaining);
          if (d > 0) {
            p1DcD += d; p1Dc -= d; remaining -= d;
            const p1RemainingLsa = Math.max(0, yearPensionLsa - p1LifetimePcls);
            const tf = Math.min(d * yearUfplsFrac, p1RemainingLsa);
            p1DcTaxFree += tf; p1LifetimePcls += tf;
          }
        }
        if (mode === 'couple' && remaining > 0 && p2Age !== null && p2Dc > 0 && dc2.enabled && householdFiStarted) {
          const p2Headroom = Math.max(0, yearSnapshot.incomeTaxBands.personalAllowance - p2TaxableFixed);
          const maxWithinAllowance = p2Headroom / (1 - yearUfplsFrac);
          const d = Math.min(maxWithinAllowance, p2Dc, remaining);
          if (d > 0) {
            p2DcD += d; p2Dc -= d; remaining -= d;
            const p2RemainingLsa = Math.max(0, yearPensionLsa - p2LifetimePcls);
            const tf = Math.min(d * yearUfplsFrac, p2RemainingLsa);
            p2DcTaxFree += tf; p2LifetimePcls += tf;
          }
        }

        // ── Step 2: GIA within per-person CGT budget ────────────────────────
        // Crystallises gains up to each person's annual CGT exempt amount (£3,000).
        // This is a "use it or lose it" allowance — drawing GIA here steps up the
        // base cost at zero tax cost, reducing future CGT liability. Done before ISA
        // so the exempt amount is always utilised while GIA gains exist.
        // Per-person budgets are tracked so that joint GIA gains (split 50/50) don't
        // push either person above their exempt amount — individual GIA is drawn first,
        // then joint GIA is capped by whichever person has less budget remaining.
        // Bed & ISA transfers earlier in the year may have already consumed part of
        // each person's annual CGT exempt amount — subtract those gains so the
        // waterfall doesn't over-use an allowance that is already committed.
        const biJointGainEach = p2BedIsaCg / 2;
        let p1CgBudget = Math.max(0, CGT.ANNUAL_EXEMPT - p1BedIsaCg - biJointGainEach);
        let p2CgBudget = mode === 'couple'
          ? Math.max(0, CGT.ANNUAL_EXEMPT - p2IndivBedIsaCg - biJointGainEach)
          : 0;
        if (remaining > 0 && p1GiaV > 0 && householdFiStarted) {
          const gainFrac = p1GiaV > p1GiaBC ? (p1GiaV - p1GiaBC) / p1GiaV : 0;
          const maxForCgt = gainFrac > 0 ? p1CgBudget / gainFrac : p1GiaV;
          const d = Math.min(maxForCgt, p1GiaV, remaining);
          if (d > 0) {
            const r = drawFromGIA(p1GiaV, p1GiaBC, d);
            p1GiaD += r.drawn; p1GiaCG += r.capitalGain;
            p1GiaV = r.newValue; p1GiaBC = r.newBaseCost;
            remaining -= r.drawn;
            p1CgBudget -= r.capitalGain;
          }
        }
        if (remaining > 0 && p2GiaV > 0 && p2Age !== null && householdFiStarted) {
          const gainFrac = p2GiaV > p2GiaBC ? (p2GiaV - p2GiaBC) / p2GiaV : 0;
          const maxForCgt = gainFrac > 0 ? p2CgBudget / gainFrac : p2GiaV;
          const d = Math.min(maxForCgt, p2GiaV, remaining);
          if (d > 0) {
            const r = drawFromGIA(p2GiaV, p2GiaBC, d);
            p2GiaD += r.drawn; p2GiaCG += r.capitalGain;
            p2GiaV = r.newValue; p2GiaBC = r.newBaseCost;
            remaining -= r.drawn;
            p2CgBudget -= r.capitalGain;
          }
        }
        if (remaining > 0 && jointGiaV > 0 && householdFiStarted) {
          // Joint GIA gains split 50/50 — cap by whichever person has less CGT budget remaining,
          // so neither person exceeds their £3,000 annual exempt amount.
          const gainFrac = jointGiaV > jointGiaBC ? (jointGiaV - jointGiaBC) / jointGiaV : 0;
          const effectiveBudget = mode === 'couple' ? Math.min(p1CgBudget, p2CgBudget) * 2 : p1CgBudget;
          const maxForCgt = gainFrac > 0 ? effectiveBudget / gainFrac : jointGiaV;
          const d = Math.min(maxForCgt, jointGiaV, remaining);
          if (d > 0) {
            const r = drawFromGIA(jointGiaV, jointGiaBC, d);
            jointGiaD += r.drawn; jointGiaCG += r.capitalGain;
            jointGiaV = r.newValue; jointGiaBC = r.newBaseCost;
            remaining -= r.drawn;
          }
        }

        // ── Step 3: ISA ─────────────────────────────────────────────────────
        // Drawn after GIA CGT-free slice: ISA is always tax-free and preserves
        // the tax wrapper for longer, but the annual CGT exempt should be used first
        // to step up GIA base cost. Any remaining gap after GIA and DC draws is
        // covered here.
        if (remaining > 0 && p1Isa > 0 && householdFiStarted) {
          const d = Math.min(p1Isa, remaining); p1IsaD = d; p1Isa -= d; remaining -= d;
        }
        if (remaining > 0 && p2Isa > 0 && p2Age !== null && householdFiStarted) {
          const d = Math.min(p2Isa, remaining); p2IsaD = d; p2Isa -= d; remaining -= d;
        }

        // ── Step 4: Remaining GIA (gains above CGT allowance, now taxable) ──
        if (remaining > 0 && p1GiaV > 0 && householdFiStarted) {
          const r = drawFromGIA(p1GiaV, p1GiaBC, remaining);
          p1GiaD += r.drawn; p1GiaCG += r.capitalGain;
          p1GiaV = r.newValue; p1GiaBC = r.newBaseCost;
          remaining -= r.drawn;
        }
        if (remaining > 0 && p2GiaV > 0 && p2Age !== null && householdFiStarted) {
          const r = drawFromGIA(p2GiaV, p2GiaBC, remaining);
          p2GiaD += r.drawn; p2GiaCG += r.capitalGain;
          p2GiaV = r.newValue; p2GiaBC = r.newBaseCost;
          remaining -= r.drawn;
        }
        if (remaining > 0 && jointGiaV > 0 && householdFiStarted) {
          const r = drawFromGIA(jointGiaV, jointGiaBC, remaining);
          jointGiaD += r.drawn; jointGiaCG += r.capitalGain;
          jointGiaV = r.newValue; jointGiaBC = r.newBaseCost;
          remaining -= r.drawn;
        }

        // ── Step 5: Cash ────────────────────────────────────────────────────
        if (remaining > 0 && p1Cash > 0 && householdFiStarted) {
          const d = Math.min(p1Cash, remaining); p1CashD = d; p1Cash -= d; remaining -= d;
        }
        if (remaining > 0 && p2Cash > 0 && p2Age !== null && householdFiStarted) {
          const d = Math.min(p2Cash, remaining); p2CashD = d; p2Cash -= d; remaining -= d;
        }

        // ── Step 6: DC pension — remaining gap (above personal allowance) ───
        // For a couple where both have DC pension available, split equally to
        // avoid concentrating above-allowance draws on one person and pushing
        // them into higher-rate tax while the other's basic-rate band goes unused.
        // Falls back to sequential (p1 first) when only one person has DC.
        if (remaining > 0 && householdFiStarted) {
          const p1Avail = (p1Dc > 0 && dc1.enabled) ? p1Dc : 0;
          const p2Avail = (mode === 'couple' && p2Age !== null && p2Dc > 0 && dc2.enabled) ? p2Dc : 0;

          if (mode === 'couple' && p2Age !== null && p1Avail > 0 && p2Avail > 0) {
            // Equal split with spillover to the other if one pot is smaller
            const half = remaining / 2;
            const p1Draw = Math.min(p1Avail, half);
            const p2Draw = Math.min(p2Avail, half);
            const leftover = Math.max(0, remaining - p1Draw - p2Draw);
            const p1Extra = leftover > 0 ? Math.min(p1Avail - p1Draw, leftover) : 0;
            const p2Extra = leftover > 0 ? Math.min(p2Avail - p2Draw, leftover - p1Extra) : 0;
            const p1Total = p1Draw + p1Extra;
            const p2Total = p2Draw + p2Extra;

            if (p1Total > 0) {
              p1DcD += p1Total; p1Dc -= p1Total; remaining -= p1Total;
              const p1RemLsa = Math.max(0, yearPensionLsa - p1LifetimePcls);
              const tf = Math.min(p1Total * yearUfplsFrac, p1RemLsa);
              p1DcTaxFree += tf; p1LifetimePcls += tf;
            }
            if (p2Total > 0) {
              p2DcD += p2Total; p2Dc -= p2Total; remaining -= p2Total;
              const p2RemLsa = Math.max(0, yearPensionLsa - p2LifetimePcls);
              const tf = Math.min(p2Total * yearUfplsFrac, p2RemLsa);
              p2DcTaxFree += tf; p2LifetimePcls += tf;
            }
          } else {
            // Single person or only one of the couple has DC available — sequential
            if (p1Avail > 0) {
              const d = Math.min(p1Avail, remaining); p1DcD += d; p1Dc -= d; remaining -= d;
              const p1RemLsa = Math.max(0, yearPensionLsa - p1LifetimePcls);
              const tf = Math.min(d * yearUfplsFrac, p1RemLsa);
              p1DcTaxFree += tf; p1LifetimePcls += tf;
            }
            if (remaining > 0 && p2Avail > 0) {
              const d = Math.min(p2Avail, remaining); p2DcD += d; p2Dc -= d; remaining -= d;
              const p2RemLsa = Math.max(0, yearPensionLsa - p2LifetimePcls);
              const tf = Math.min(d * yearUfplsFrac, p2RemLsa);
              p2DcTaxFree += tf; p2LifetimePcls += tf;
            }
          }
        }
      } else {
        // Surplus (fixed income already exceeds gross target) — park in P1 cash
        p1Cash += Math.abs(remaining);
      }

      // ── Compute tax for this iteration ──────────────────────────────────
      totalIncome = fixedIncome
                  + p1IsaD + p1GiaD + p1CashD + p1DcD
                  + p2IsaD + p2GiaD + p2CashD + p2DcD
                  + jointGiaD;

      // UFPLS: each DC withdrawal is 25% tax-free (tracked per-year via p1DcTaxFree).
      // Once the LSA is exhausted, p1DcTaxFree = 0 and the full withdrawal is taxable.
      // Joint GIA: capital gain split equally between both persons' CGT allowances.
      // Bed & ISA gains (p1BedIsaCg / p2BedIsaCg) are added to each person's CGT base —
      // they are fixed regardless of waterfall draws, but the CGT rate correctly
      // reflects that iteration's income level.
      jointGainEach    = jointGiaCG / 2;
      p1OtherTaxable   = p1Inc.db + p1Inc.ptw + p1Inc.other + p1Inc.rent + (p1DcD - p1DcTaxFree);
      p2OtherTaxable   = p2Inc.db + p2Inc.ptw + p2Inc.other + p2RentEffective + (p2DcD - p2DcTaxFree);
      // State Pension sole-income exemption: per UK government policy (2024), SP is
      // not taxed when it is the person's only income source.
      p1SpTaxable      = (spExempt && p1OtherTaxable === 0) ? 0 : p1Inc.sp;
      p2SpTaxable      = (spExempt && p2OtherTaxable === 0) ? 0 : p2Inc.sp;
      p1TaxBasis       = p1SpTaxable + p1OtherTaxable;
      p2TaxBasis       = p2SpTaxable + p2OtherTaxable;
      p1IncomeTax      = calcIncomeTax(p1TaxBasis, calendarYear);
      p2IncomeTax      = calcIncomeTax(p2TaxBasis, calendarYear);
      incomeTaxPaid    = p1IncomeTax + p2IncomeTax;
      // Joint GIA Bed & ISA gains follow the same 50/50 CGT split as other joint
      // GIA disposals. p2IndivBedIsaCg is attributed wholly to p2 (individual GIA).
      const jointBedIsaGainEach = p2BedIsaCg / 2;
      p1TotalCG        = p1GiaCG + jointGainEach + p1BedIsaCg + jointBedIsaGainEach;
      p2TotalCG        = p2GiaCG + jointGainEach + p2IndivBedIsaCg + jointBedIsaGainEach;
      p1CgtPaid        = calcCGT(p1TotalCG, isHigherRateTaxpayer(p1TaxBasis, calendarYear), calendarYear);
      p2CgtPaid        = calcCGT(p2TotalCG, isHigherRateTaxpayer(p2TaxBasis, calendarYear), calendarYear);
      totalCgtPaid     = p1CgtPaid + p2CgtPaid;
      totalTaxPaid     = incomeTaxPaid + totalCgtPaid;

      // ── Convergence check ─────────────────────────────────────────────────
      // Once the target equals spending + this iteration's tax, net ≈ spending.
      const newTarget = spending + totalTaxPaid;
      if (Math.abs(newTarget - grossTarget) < 1) break;
      grossTarget = newTarget;
    }

    const netIncome = totalIncome - totalTaxPaid;

    const clamp = (v: number) => Math.max(0, v);

    projections.push({
      yearIndex: y,
      p1Age, p2Age,
      lifeStage: stage.label,
      spending,

      p1StatePension: p1Inc.sp, p1DbPension: p1Inc.db, p1PartTimeWork: p1Inc.ptw,
      p1OtherIncome: p1Inc.other, p1PropertyRent: p1Inc.rent,
      p2StatePension: p2Inc.sp, p2DbPension: p2Inc.db, p2PartTimeWork: p2Inc.ptw,
      p2OtherIncome: p2Inc.other, p2PropertyRent: p2RentEffective,

      p1IsaDrawdown: p1IsaD, p1GiaDrawdown: p1GiaD, p1CashDrawdown: p1CashD, p1DcDrawdown: p1DcD,
      p2IsaDrawdown: p2IsaD, p2GiaDrawdown: p2GiaD, p2CashDrawdown: p2CashD, p2DcDrawdown: p2DcD,

      isaDrawdown:  p1IsaD  + p2IsaD,
      giaDrawdown:  p1GiaD  + p2GiaD + jointGiaD,
      cashDrawdown: p1CashD + p2CashD,
      dcDrawdown:   p1DcD   + p2DcD,
      dcTaxFreeDrawdown: p1DcTaxFree + p2DcTaxFree,
      propertyRent: p1Inc.rent + p2RentEffective,

      p1CapitalGain: p1GiaCG, p2CapitalGain: p2GiaCG,
      p1CgtPaid, p2CgtPaid, totalCgtPaid,
      p1IncomeTax, p2IncomeTax, incomeTaxPaid,

      totalIncome, totalTaxPaid, netIncome,
      gap: totalIncome - spending,

      p1IsaBalance:  clamp(p1Isa),  p1GiaValue: clamp(p1GiaV), p1GiaBaseCost: clamp(p1GiaBC),
      p1CashBalance: clamp(p1Cash), p1DcBalance: clamp(p1Dc),
      p2IsaBalance:  clamp(p2Isa),  p2GiaValue: clamp(p2GiaV), p2GiaBaseCost: clamp(p2GiaBC),
      p2CashBalance: clamp(p2Cash), p2DcBalance: clamp(p2Dc),
      jointGiaValue: clamp(jointGiaV), jointGiaBaseCost: clamp(jointGiaBC),
      // totalAssets excludes care reserve — depletion logic should only fire when
      // spendable assets are exhausted, not earmarked capital.
      totalAssets: clamp(p1Isa) + clamp(p1GiaV) + clamp(p1Cash) + clamp(p1Dc)
                 + clamp(p2Isa) + clamp(p2GiaV) + clamp(p2Cash) + clamp(p2Dc)
                 + clamp(jointGiaV),
      // Care reserve tracked separately — earmarked, never drawn for spending.
      careReserveBalance: Math.round(careReserveBalance),

      // PCLS + Bed & ISA strategy tracking (zero in standard-ufpls mode)
      p1PclsEvent: Math.round(p1PclsEvent),
      p1IndivBedIsaTransfer: Math.round(p1IndivBedIsaTransfer),
      p1JointBedIsaTransfer: Math.round(p1JointBedIsaTransfer),
      p1BedIsaTransfer:      Math.round(p1IndivBedIsaTransfer) + Math.round(p1JointBedIsaTransfer),
      p2IndivBedIsaTransfer: Math.round(p2IndivBedIsaTransfer),
      p2JointBedIsaTransfer: Math.round(p2JointBedIsaTransfer),
      p2BedIsaTransfer:      Math.round(p2IndivBedIsaTransfer) + Math.round(p2JointBedIsaTransfer),
    });
  }

  return projections;
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function getStageTotals(
  state: PlannerState,
  stageId: string,
): { tier: string; total: number }[] {
  const tiers = ['essential', 'moderate', 'aspirational', 'variable'] as const;
  return tiers.map(tier => ({
    tier,
    total: state.spendingCategories
      .filter(c => c.tier === tier)
      .reduce((s, c) => s + (c.amounts[stageId] ?? 0), 0),
  }));
}

export function getStageTotalSpending(state: PlannerState, stageId: string): number {
  return state.spendingCategories.reduce((s, c) => s + (c.amounts[stageId] ?? 0), 0);
}

export function getAssetDepletionAge(projections: YearlyProjection[]): number | null {
  const found = projections.find(p => p.totalAssets <= 0);
  return found ? found.p1Age : null;
}

export function getTotalUnrealisedGain(state: PlannerState): number {
  const p1 = state.person1.assets.generalInvestments;
  const p2 = state.mode === 'couple' ? state.person2.assets.generalInvestments : null;
  const joint = state.mode === 'couple' ? state.jointGia : null;
  const p1Gain    = p1.enabled    ? Math.max(0, p1.totalValue    - p1.baseCost)    : 0;
  const p2Gain    = p2?.enabled   ? Math.max(0, p2.totalValue    - p2.baseCost)    : 0;
  const jointGain = joint?.enabled ? Math.max(0, joint.totalValue - joint.baseCost) : 0;
  return p1Gain + p2Gain + jointGain;
}

/**
 * Determine the highest RLSS standard the household can sustain to life expectancy.
 * "Sustain" = assets never depleted across the full projection.
 *
 * Income is deflated back to today's money before averaging so it can be compared
 * directly against the real-money RLSS thresholds. Without deflation, later years'
 * inflated nominal figures would systematically overstate the achievable standard.
 */
export function getSustainableRlssLevel(
  projections: YearlyProjection[],
  mode: 'single' | 'couple',
  inflation = 2.5,
): import('@/models/types').RlssStandard | null {
  const lastTotal = projections[projections.length - 1]?.totalAssets ?? 0;
  if (lastTotal <= 0) return null;

  // Deflate each year's nominal net income to today's money, then average.
  const realAvgIncome = projections.reduce((s, p) => {
    const inflFactor = Math.pow(1 + inflation / 100, p.yearIndex);
    return s + p.netIncome / inflFactor;
  }, 0) / projections.length;

  const standards = RLSS[mode];

  if (realAvgIncome >= standards.comfortable.annual) return 'comfortable';
  if (realAvgIncome >= standards.moderate.annual)    return 'moderate';
  if (realAvgIncome >= standards.minimum.annual)     return 'minimum';
  return null;
}

/**
 * Calculate gamification metrics for dashboard display.
 *
 * incomeStabilityScore:  average % of spending covered by guaranteed income across the full
 *                        post-FI projection. Using the average avoids a misleading 0% when
 *                        state pension or DB pension starts after the FI age.
 * spendingConfidenceScore: % of years in the projection where the plan is fully funded.
 * fundedGoalsCount: number of aspirational/lifestyle spending categories with non-zero amounts.
 */
export function calculateGamificationMetrics(state: PlannerState, projections?: YearlyProjection[]): GamificationMetrics {
  const resolvedProjections = projections ?? calculateProjections(state);
  const firstStageId = state.lifeStages[0]?.id ?? 'go-go';

  // Restrict to post-FI years only
  const postFiYears = resolvedProjections.filter(p => p.p1Age >= state.fiAge);
  const planYears = postFiYears.length > 0 ? postFiYears : resolvedProjections;

  // Income stability: average guaranteed income / average spending across all post-FI years.
  // This correctly reflects state pension and DB pension even when they start after FI age.
  const totalGuaranteed = planYears.reduce((sum, p) =>
    sum + (p.p1StatePension ?? 0) + (p.p1DbPension ?? 0)
        + (p.p2StatePension ?? 0) + (p.p2DbPension ?? 0)
        + (p.p1OtherIncome  ?? 0) + (p.p2OtherIncome  ?? 0), 0);
  const totalSpending = planYears.reduce((sum, p) => sum + (p.spending ?? 0), 0);
  const incomeStabilityScore = totalSpending > 0
    ? Math.min(100, Math.round((totalGuaranteed / totalSpending) * 100))
    : 0;

  // Spending confidence: funded years / total years
  const fundedYears = resolvedProjections.filter(p => p.totalAssets > 0).length;
  const spendingConfidenceScore = Math.round((fundedYears / resolvedProjections.length) * 100);

  // Funded goals: active-stage categories with amount > 0
  const goalTiers: Array<'moderate' | 'aspirational'> = ['moderate', 'aspirational'];
  const goalCats = state.spendingCategories.filter(c => goalTiers.includes(c.tier as 'moderate' | 'aspirational'));
  const fundedGoalsCount = goalCats.filter(c => (c.amounts[firstStageId] ?? 0) > 0).length;

  return {
    incomeStabilityScore,
    spendingConfidenceScore,
    fundedGoalsCount,
    totalGoalsCount: goalCats.length,
  };
}

/** Format a number as £ currency. compact=true gives £12.3k / £1.9m style. */
export function formatCurrency(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) return '£' + (value / 1_000_000).toFixed(1) + 'm';
  if (compact && Math.abs(value) >= 1000) return '£' + (value / 1000).toFixed(1) + 'k';
  return '£' + Math.round(value).toLocaleString('en-GB');
}

/** Run the full simulation and return a SimulationResult summary. */
export function runSimulation(state: PlannerState): SimulationResult {
  const projections = calculateProjections(state);
  return {
    projections,
    depletionAge:         getAssetDepletionAge(projections),
    lifetimeTaxPaid:      projections.reduce((s, p) => s + p.totalTaxPaid, 0),
    lifetimeCGT:          projections.reduce((s, p) => s + p.totalCgtPaid, 0),
    sustainableRlssLevel: getSustainableRlssLevel(projections, state.mode, state.assumptions.inflation),
  };
}
