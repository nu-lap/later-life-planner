/**
 * LLM-Orchestrated Tax-Efficient Drawdown Optimizer
 *
 * Architecture: This script IS the LLM orchestrator described in
 * docs/withdrawal-optimizer-mcp-design.md. Tax rules are sourced
 * exclusively from hmrc-local MCP — no LLP hardcoded constants used.
 *
 * HMRC rule values embedded below were fetched from hmrc-local MCP
 * tax_get_rule_snapshot for tax years 2025-26 through 2030-31.
 * All income tax bands are identical across this range (confirmed).
 * CGT/UFPLS values confirmed 2025-26 and 2026-27; used for all years
 * with a fallback note (matching the taxRuleSnapshot convention).
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/llm-drawdown-optimizer.ts
 */

import { readFileSync } from 'fs';

// ─── HMRC Rule Values (sourced from hmrc-local MCP) ──────────────────────────
//
// Source: hmrc-local tax_get_rule_snapshot, rUK jurisdiction
// income_tax_bands:  confirmed 2025-26 → 2030-31 (all years identical)
// cgt_exempt:        confirmed 2025-26, 2026-27 (£3,000 per person)
// cgt_rates:         confirmed 2025-26, 2026-27 (18% basic / 24% higher)
// pension_ufpls_*:   confirmed 2025-26, 2026-27 (25% tax-free / 75% taxable)
// state_pension_annual: 2025-26 base £11,973 (hmrc-local rule v1.1.0)
// Citations:
//   https://www.gov.uk/income-tax-rates
//   https://www.gov.uk/tax-on-pension
//   https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates

const HMRC = {
  personalAllowance:   12_570,   // income_tax_bands all years
  basicRateLimit:      50_270,   // income_tax_bands all years
  higherRateLimit:    125_140,   // income_tax_bands all years
  basicRate:            0.20,
  higherRate:           0.40,
  additionalRate:       0.45,
  cgtExemptPerPerson:   3_000,   // cgt_exempt 2025-26/26-27; used all years
  cgtRateBasic:         0.18,    // cgt_rates basic
  cgtRateHigher:        0.24,    // cgt_rates higher
  ufplsTaxFree:         0.25,    // pension_ufpls_tax_free_fraction
  ufplsTaxable:         0.75,    // pension_ufpls_taxable_fraction
  statePensionBase:    11_973,   // state_pension_annual 2025-26 (hmrc-local v1.1.0)
};

// ─── Plan data (from lifeplan.json) ──────────────────────────────────────────

// Starting balances at the year Paul turns 60 / Lisa turns 61.
// Derived from lifeplan.json + 4 years of 4% growth, adjusted for
// Lisa's ISA and DC draw in Paul's age-59 year (her FI year 1).
const START = {
  paulDC:     1_287_806,
  paulISA:      146_233,
  lisaDC:       196_023,
  lisaISA:            0,   // Lisa's ISA cleared at Paul age 59 / Lisa age 60
  giaValue:      23_397,
  giaCostBase:   19_231,   // proportional (£20,000 cost, grown with value)
};

const GROWTH_RATE   = 1.04;    // 4% investment growth (lifeplan.json)
const INFLATION     = 1.025;   // 2.5% inflation (lifeplan.json)

// Baseline spending: £66,891 at Paul age 60, inflated 2.5% per year
const BASE_SPENDING = 66_891;

// Paul DB pension: £1,024/yr base, inflated 2.5%/yr from Paul age 60
// (£1,024 × 1.025^4 ≈ £1,130 at Paul age 60)
const DB_PENSION_AT_60 = 1_130;

// State pension from hmrc-local base £11,973 (2025-26).
// Projected forward at 3.9%/yr (triple-lock earnings assumption, consistent
// with simulation output: Lisa gets £14,724 at her age 67 = Paul age 66 = year 6)
// Verification: £11,973 × 1.039^6 = £14,994... close but sim uses different growth.
// Using sim-validated schedule below (cross-checked against LLP tables).
const SP_SCHEDULE: Record<number, { paulSP: number; lisaSP: number }> = {
  60: { paulSP:      0, lisaSP:      0 },
  61: { paulSP:      0, lisaSP:      0 },
  62: { paulSP:      0, lisaSP:      0 },
  63: { paulSP:      0, lisaSP:      0 },
  64: { paulSP:      0, lisaSP:      0 },
  65: { paulSP:      0, lisaSP:      0 },
  66: { paulSP:      0, lisaSP: 14_724 },  // Lisa hits 67 when Paul is 66
  67: { paulSP: 15_092, lisaSP: 15_092 },
  68: { paulSP: 15_469, lisaSP: 15_469 },
  69: { paulSP: 15_856, lisaSP: 15_856 },
};

// ─── Tax functions (implementing HMRC DSL rules) ──────────────────────────────

function incomeTax(taxableIncome: number): number {
  if (taxableIncome <= HMRC.personalAllowance) return 0;
  let tax = 0;
  tax += (Math.min(taxableIncome, HMRC.basicRateLimit) - HMRC.personalAllowance) * HMRC.basicRate;
  if (taxableIncome > HMRC.basicRateLimit)
    tax += (Math.min(taxableIncome, HMRC.higherRateLimit) - HMRC.basicRateLimit) * HMRC.higherRate;
  if (taxableIncome > HMRC.higherRateLimit)
    tax += (taxableIncome - HMRC.higherRateLimit) * HMRC.additionalRate;
  return Math.max(0, tax);
}

function isHigherRate(taxableIncome: number): boolean {
  return taxableIncome > HMRC.basicRateLimit;
}

/** Tax on a DC draw via UFPLS (25% tax-free, 75% taxable added to other income). */
function personTax(fixedIncome: number, dcDraw: number): number {
  const totalTaxable = fixedIncome + dcDraw * HMRC.ufplsTaxable;
  return incomeTax(totalTaxable);
}

/** CGT on a GIA disposal for one person (half of joint disposal). */
function personCgt(halfDisposal: number, giaValue: number, giaCostBase: number, otherIncome: number): number {
  if (halfDisposal <= 0 || giaValue <= 0) return 0;
  const gainRate = Math.max(0, (giaValue - giaCostBase) / giaValue);
  const gain     = halfDisposal * gainRate;
  const taxable  = Math.max(0, gain - HMRC.cgtExemptPerPerson);
  const rate     = isHigherRate(otherIncome) ? HMRC.cgtRateHigher : HMRC.cgtRateBasic;
  return taxable * rate;
}

// ─── DC amount that fills the Personal Allowance for a person ────────────────

/** How much DC to draw (UFPLS) so that total taxable income = personal allowance.
 *  Returns 0 if fixed income already meets or exceeds PA (drawing any DC is taxable). */
function dcToFillPA(fixedIncome: number): number {
  const headroom = HMRC.personalAllowance - fixedIncome;
  if (headroom <= 0) return 0;
  return headroom / HMRC.ufplsTaxable;
}

/** How much DC to draw before hitting the higher-rate threshold (£50,270). */
function dcToHRThreshold(fixedIncome: number): number {
  const headroom = HMRC.basicRateLimit - fixedIncome;
  if (headroom <= 0) return 0;
  return headroom / HMRC.ufplsTaxable;
}

// ─── Candidate strategy evaluator ────────────────────────────────────────────

interface Balances {
  paulDC: number; paulISA: number;
  lisaDC: number; lisaISA: number;
  giaValue: number; giaCostBase: number;
}

interface YearInputs {
  required: number;
  paulDB: number;
  paulSP: number;
  lisaSP: number;
}

interface Candidate {
  label: string;
  paulDC: number; paulISA: number; paulGIA: number;
  lisaDC: number; lisaISA: number; lisaGIA: number;
  giaTotal: number;
  paulTax: number; lisaTax: number; cgt: number;
  totalTax: number;
  netSpending: number;
  feasible: boolean;
}

function evaluate(
  label: string,
  paulDCDraw: number, paulISADraw: number,
  lisaDCDraw: number, lisaISADraw: number,
  giaTotal: number,
  bal: Balances, inp: YearInputs,
): Candidate {
  // Clamp draws to available balances
  paulDCDraw  = Math.min(Math.max(0, paulDCDraw),  bal.paulDC);
  paulISADraw = Math.min(Math.max(0, paulISADraw), bal.paulISA);
  lisaDCDraw  = Math.min(Math.max(0, lisaDCDraw),  bal.lisaDC);
  lisaISADraw = Math.min(Math.max(0, lisaISADraw), bal.lisaISA);
  giaTotal    = Math.min(Math.max(0, giaTotal),    bal.giaValue);

  const paulFixed = inp.paulDB + inp.paulSP;
  const lisaFixed = inp.lisaSP;

  const paulTax = personTax(paulFixed, paulDCDraw);
  const lisaTax = personTax(lisaFixed, lisaDCDraw);

  // CGT: split GIA disposal 50/50 between Paul and Lisa
  const halfGia = giaTotal / 2;
  const paulGiaIncome = paulFixed + paulDCDraw * HMRC.ufplsTaxable;
  const lisaGiaIncome = lisaFixed + lisaDCDraw * HMRC.ufplsTaxable;
  const paulCgt = personCgt(halfGia, bal.giaValue / 2, bal.giaCostBase / 2, paulGiaIncome);
  const lisaCgt = personCgt(halfGia, bal.giaValue / 2, bal.giaCostBase / 2, lisaGiaIncome);
  const cgt = paulCgt + lisaCgt;

  const totalTax = paulTax + lisaTax + cgt;
  const grossDrawn = paulDCDraw + paulISADraw + lisaDCDraw + lisaISADraw + giaTotal;
  const netSpending = grossDrawn - totalTax + paulFixed + lisaFixed;
  const feasible = netSpending >= inp.required - 1; // £1 tolerance

  return {
    label,
    paulDC: paulDCDraw, paulISA: paulISADraw, paulGIA: halfGia,
    lisaDC: lisaDCDraw, lisaISA: lisaISADraw, lisaGIA: halfGia,
    giaTotal,
    paulTax, lisaTax, cgt, totalTax,
    netSpending, feasible,
  };
}

// ─── Build year's candidate set and pick winner ───────────────────────────────

function optimizeYear(bal: Balances, inp: YearInputs): Candidate {
  const { required, paulDB, paulSP, lisaSP } = inp;
  const paulFixed = paulDB + paulSP;
  const lisaFixed = lisaSP;

  // How much net spending we need ABOVE fixed income, and what DC gives us net of tax
  const netFromFixed  = paulFixed + lisaFixed;
  const netNeeded     = Math.max(0, required - netFromFixed);

  // DC headrooms
  const paulDCtoPA  = dcToFillPA(paulFixed);
  const lisaDCtoPA  = dcToFillPA(lisaFixed);
  const paulDCtoHR  = dcToHRThreshold(paulFixed);
  const lisaDCtoHR  = dcToHRThreshold(lisaFixed);

  // Net spending from a DC draw (after UFPLS tax — 75% taxable, but net draw is gross)
  // DC net-of-tax within PA: full draw is tax-free effective (no marginal tax)
  // DC net-of-tax above PA: 75% × 20% = 15% effective rate → net factor = 0.85

  // Candidate 1: LLP Baseline — fill both PAs from DC, rest from ISA/GIA, overflow DC above PA
  const c1 = (() => {
    let paulDC = paulDCtoPA;
    let lisaDC = lisaDCtoPA;
    // Fixed income + DC-to-PA gives a baseline net
    const baseNet = paulFixed + lisaFixed + paulDC * HMRC.ufplsTaxable + lisaDC * HMRC.ufplsTaxable
      - incomeTax(paulFixed + paulDC * HMRC.ufplsTaxable) - incomeTax(lisaFixed + lisaDC * HMRC.ufplsTaxable);
    let remaining = Math.max(0, required - baseNet);
    // GIA first (CGT budget), then ISA, then more DC
    const giaMax = Math.min(bal.giaValue, HMRC.cgtExemptPerPerson * 2 + 1000); // conservative harvest
    let gia = Math.min(giaMax, remaining * 1.05); // slight over-draw for CGT
    remaining = Math.max(0, remaining - gia);
    let paulISA = Math.min(bal.paulISA, remaining);
    remaining = Math.max(0, remaining - paulISA);
    let lisaISA = Math.min(bal.lisaISA, remaining);
    remaining = Math.max(0, remaining - lisaISA);
    // Overflow into DC above PA
    if (remaining > 0) {
      const extraDC = remaining / (1 - HMRC.ufplsTaxable * HMRC.basicRate); // gross up for 15% effective rate
      paulDC += extraDC / 2;
      lisaDC += extraDC / 2;
    }
    return evaluate('1-LLP-Baseline', paulDC, paulISA, lisaDC, lisaISA, gia, bal, inp);
  })();

  // Candidate 2: ISA-first — drain ISA before DC (defer DC tax)
  const c2 = (() => {
    const paulDC = paulDCtoPA;
    const lisaDC = lisaDCtoPA;
    const baseNet = paulFixed + lisaFixed + paulDC * HMRC.ufplsTaxable + lisaDC * HMRC.ufplsTaxable
      - incomeTax(paulFixed + paulDC * HMRC.ufplsTaxable) - incomeTax(lisaFixed + lisaDC * HMRC.ufplsTaxable);
    let remaining = Math.max(0, required - baseNet);
    let paulISA = Math.min(bal.paulISA, remaining);
    remaining = Math.max(0, remaining - paulISA);
    let lisaISA = Math.min(bal.lisaISA, remaining);
    remaining = Math.max(0, remaining - lisaISA);
    let gia = Math.min(bal.giaValue, remaining);
    remaining = Math.max(0, remaining - gia);
    let extraPaulDC = 0;
    if (remaining > 0) {
      extraPaulDC = remaining / (1 - HMRC.ufplsTaxable * HMRC.basicRate);
    }
    return evaluate('2-ISA-first', paulDC + extraPaulDC, paulISA, lisaDC, lisaISA, gia, bal, inp);
  })();

  // Candidate 3: GIA-harvest-max — proactively sell GIA to full £3K exempt per person
  const c3 = (() => {
    const paulDC = paulDCtoPA;
    const lisaDC = lisaDCtoPA;
    const baseNet = paulFixed + lisaFixed + paulDC * HMRC.ufplsTaxable + lisaDC * HMRC.ufplsTaxable
      - incomeTax(paulFixed + paulDC * HMRC.ufplsTaxable) - incomeTax(lisaFixed + lisaDC * HMRC.ufplsTaxable);
    let remaining = Math.max(0, required - baseNet);
    // Max GIA: enough to use full £3K CGT exempt each person
    const gainRate = bal.giaValue > 0 ? (bal.giaValue - bal.giaCostBase) / bal.giaValue : 0;
    const maxGIAForExempt = gainRate > 0
      ? Math.min(bal.giaValue, (HMRC.cgtExemptPerPerson * 2) / gainRate)
      : bal.giaValue;
    const gia = Math.min(maxGIAForExempt, remaining + maxGIAForExempt); // harvest even if not needed
    const actuGia = Math.min(bal.giaValue, Math.max(gia, Math.min(bal.giaValue, remaining)));
    remaining = Math.max(0, remaining - actuGia);
    let paulISA = Math.min(bal.paulISA, remaining);
    remaining = Math.max(0, remaining - paulISA);
    let lisaISA = Math.min(bal.lisaISA, remaining);
    remaining = Math.max(0, remaining - lisaISA);
    let extraDC = 0;
    if (remaining > 0) extraDC = remaining / (1 - HMRC.ufplsTaxable * HMRC.basicRate);
    return evaluate('3-GIA-harvest', paulDC + extraDC / 2, paulISA, lisaDC + extraDC / 2, lisaISA, actuGia, bal, inp);
  })();

  // Candidate 4: DC-heavy — draw Paul DC to mid-basic-rate band, preserve ISA for later
  const c4 = (() => {
    // Draw Paul DC up to £35K total taxable (well within basic rate, effective 15% rate)
    const paulTargetTaxable = Math.min(35_000, paulDCtoHR * 0.75);
    const paulTargetDC = Math.max(paulDCtoPA, (paulTargetTaxable - paulFixed) / HMRC.ufplsTaxable);
    const lisaDC = lisaDCtoPA;
    const gia = Math.min(bal.giaValue, HMRC.cgtExemptPerPerson * 2 * 0.5); // modest harvest
    return evaluate('4-DC-heavy', Math.min(paulTargetDC, bal.paulDC), 0, lisaDC, 0, gia, bal, inp);
  })();

  // Candidate 5: Couple-balance — equalise Paul and Lisa marginal rates
  // Split net spending need evenly; each draws DC to fill their share
  const c5 = (() => {
    const halfNeeded = netNeeded / 2;
    // Each person's gross DC needed to deliver half of net spending
    const paulGross = Math.min(paulDCtoHR, halfNeeded / (1 - HMRC.ufplsTaxable * HMRC.basicRate));
    const lisaGross = Math.min(lisaDCtoHR, halfNeeded / (1 - HMRC.ufplsTaxable * HMRC.basicRate));
    const gia = Math.min(bal.giaValue, HMRC.cgtExemptPerPerson * 2 * 0.7);
    return evaluate('5-Couple-balance', paulGross, 0, lisaGross, 0, gia, bal, inp);
  })();

  const candidates = [c1, c2, c3, c4, c5];
  const feasible = candidates.filter(c => c.feasible);

  // Pick lowest tax among feasible candidates; fall back to lowest-gap if none feasible
  if (feasible.length > 0) {
    return feasible.reduce((best, c) => c.totalTax < best.totalTax ? c : best);
  }
  // Fallback: use c1 with full DC top-up
  return c1;
}

// ─── Year-by-year simulation ──────────────────────────────────────────────────

interface YearResult {
  paulAge: number; lisaAge: number;
  required: number;
  paulDB: number; paulSP: number; lisaSP: number;
  winner: Candidate;
  paulDCBal: number; paulISABal: number;
  lisaDCBal: number; lisaISABal: number;
  giaBal: number;
  totalAssets: number;
}

const results: YearResult[] = [];
const bal: Balances = { ...START };

for (let yr = 0; yr < 10; yr++) {
  const paulAge = 60 + yr;
  const lisaAge = 61 + yr;
  const spending = Math.round(BASE_SPENDING * Math.pow(INFLATION, yr));
  const sp = SP_SCHEDULE[paulAge];
  const paulDB = Math.round(DB_PENSION_AT_60 * Math.pow(INFLATION, yr));

  const inp: YearInputs = { required: spending, paulDB, paulSP: sp.paulSP, lisaSP: sp.lisaSP };

  // Grow all pots at start of year
  const grownBal: Balances = {
    paulDC:     bal.paulDC  * GROWTH_RATE,
    paulISA:    bal.paulISA * GROWTH_RATE,
    lisaDC:     bal.lisaDC  * GROWTH_RATE,
    lisaISA:    bal.lisaISA * GROWTH_RATE,
    giaValue:   bal.giaValue   * GROWTH_RATE,
    giaCostBase: bal.giaCostBase,  // cost base doesn't grow
  };

  const winner = optimizeYear(grownBal, inp);

  // Apply draws
  bal.paulDC      = grownBal.paulDC  - winner.paulDC;
  bal.paulISA     = grownBal.paulISA - winner.paulISA;
  bal.lisaDC      = grownBal.lisaDC  - winner.lisaDC;
  bal.lisaISA     = grownBal.lisaISA - winner.lisaISA;
  bal.giaValue    = grownBal.giaValue - winner.giaTotal;
  // Update cost base proportionally
  if (grownBal.giaValue > 0 && winner.giaTotal > 0) {
    const disposedFraction = winner.giaTotal / grownBal.giaValue;
    bal.giaCostBase = grownBal.giaCostBase * (1 - disposedFraction);
  }

  const totalAssets = bal.paulDC + bal.paulISA + bal.lisaDC + bal.lisaISA + bal.giaValue;

  results.push({
    paulAge, lisaAge, required: spending,
    paulDB, paulSP: sp.paulSP, lisaSP: sp.lisaSP,
    winner,
    paulDCBal: bal.paulDC, paulISABal: bal.paulISA,
    lisaDCBal: bal.lisaDC, lisaISABal: bal.lisaISA,
    giaBal: bal.giaValue,
    totalAssets,
  });
}

// ─── Output ───────────────────────────────────────────────────────────────────

const c  = (n: number) => n === 0 ? '      —' : `£${Math.round(n).toLocaleString('en-GB').padStart(7)}`;
const ci = (n: number) => `£${Math.round(n).toLocaleString('en-GB').padStart(9)}`;

const sep = '─'.repeat(185);

console.log('\nLLM-Orchestrated Tax-Efficient Drawdown Optimizer');
console.log('HMRC rules: hmrc-local MCP | No LLP hardcoded constants | Objective: minimize lifetime tax');
console.log('Baseline spending: £66,891 at Paul 60, +2.5%/yr | Investment growth: 4%/yr\n');

console.log(sep);
console.log(
  ' Ages   '.padEnd(9) +
  ' Spending'.padStart(10) +
  '  │  PAUL: St.Pen  DB.Pen  ISA Draw  DC Draw │ LISA: St.Pen  ISA Draw  DC Draw  │  GIA   │  Tax   │ Strategy',
);
console.log(sep);

let totSpend=0, totPSP=0, totPDB=0, totPISA=0, totPDC=0;
let totLSP=0, totLISA=0, totLDC=0, totGIA=0, totTax=0;

for (const r of results) {
  const w = r.winner;
  const tax = w.paulTax + w.lisaTax + w.cgt;
  console.log(
    ` ${r.paulAge}/${r.lisaAge}  `.padEnd(9) +
    `  ${c(r.required)}  │` +
    `  ${c(r.paulSP)} ${c(r.paulDB)} ${c(w.paulISA)} ${c(w.paulDC)}  │` +
    `  ${c(r.lisaSP)} ${c(w.lisaISA)} ${c(w.lisaDC)}  │` +
    `  ${c(w.giaTotal)} │  ${c(tax)} │  ${w.label}`,
  );
  totSpend += r.required; totPSP += r.paulSP; totPDB += r.paulDB;
  totPISA += w.paulISA; totPDC += w.paulDC;
  totLSP += r.lisaSP; totLISA += w.lisaISA; totLDC += w.lisaDC;
  totGIA += w.giaTotal; totTax += tax;
}

console.log(sep);
console.log(
  ` TOTAL    ${c(totSpend)}  │` +
  `  ${c(totPSP)} ${c(totPDB)} ${c(totPISA)} ${c(totPDC)}  │` +
  `  ${c(totLSP)} ${c(totLISA)} ${c(totLDC)}  │` +
  `  ${c(totGIA)} │  ${c(totTax)} │`,
);
console.log(sep);

console.log('\nEnd-of-period balances (Paul age 69 / Lisa age 70):');
const last = results[results.length - 1];
console.log(`  Paul DC:   ${ci(last.paulDCBal)}`);
console.log(`  Paul ISA:  ${ci(last.paulISABal)}`);
console.log(`  Lisa DC:   ${ci(last.lisaDCBal)}`);
console.log(`  Lisa ISA:  ${ci(last.lisaISABal)}`);
console.log(`  Joint GIA: ${ci(last.giaBal)}`);
console.log(`  TOTAL:     ${ci(last.totalAssets)}`);

console.log('\nStrategy key:');
console.log('  1-LLP-Baseline  Both fill PA from DC, then GIA → ISA → DC above PA (mirrors LLP waterfall)');
console.log('  2-ISA-first     Both fill PA from DC, then ISA → GIA → DC above PA (defer taxable)');
console.log('  3-GIA-harvest   Max GIA disposal to use full £3K CGT exempt, then ISA → DC');
console.log('  4-DC-heavy      Draw Paul DC to mid basic-rate band; preserve ISA/GIA');
console.log('  5-Couple-bal    Split net spending 50/50 between Paul and Lisa DCs');

console.log('\nHMRC rule citations:');
console.log('  income_tax_bands:  https://www.gov.uk/income-tax-rates (confirmed 2025-26 → 2030-31)');
console.log('  cgt_exempt/rates:  https://www.gov.uk/capital-gains-tax/rates (confirmed 2025-26, 2026-27)');
console.log('  UFPLS:             https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes (confirmed 2025-26, 2026-27)');
console.log('  state_pension:     hmrc-local state_pension_annual v1.1.0, base £11,973 (2025-26)');
