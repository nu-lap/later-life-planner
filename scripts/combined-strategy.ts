/**
 * Combined Waterfall + Optimizer Drawdown Strategy
 *
 * Implements the LLP drawdown waterfall mechanics parametrically.
 * Per year, evaluates 5 candidates that vary DC ordering and ISA timing,
 * picks the lowest-tax feasible combination, and runs a full 35-year
 * simulation (Paul 60 → 95).
 *
 * Waterfall order (same as LLP — never changed):
 *   1. Fixed income (DB, State Pension)
 *   2. DC within Personal Allowance — UFPLS (25% tax-free / 75% taxable)
 *   3. GIA within per-person CGT exempt (£3,000 each = £6,000 couple)
 *   4. ISA (tax-free) — or deferred for ISA-preserve candidate
 *   5. Remaining GIA (capital gains now taxable)
 *   6. DC above Personal Allowance (taxable at marginal rate)
 *   7. ISA as last resort if deferred in step 4
 *
 * Candidates evaluated per year:
 *   1. LLP-Baseline    Paul fills PA from DC first, then Lisa
 *   2. Couple-equal    Both draw equal gross DC within their PA
 *   3. Proportional    DC draw split proportional to respective pot sizes
 *   4. Lisa-first      Lisa fills PA from DC first, then Paul
 *   5. ISA-preserve    Equal DC, but defer ISA → use DC above PA instead
 *
 * HMRC values in this proof-of-concept script were previously verified against
 * hmrc-local MCP and should be kept aligned with LLP snapshot values:
 *   income_tax_bands:    confirmed 2025-26 → 2030-31 (all identical)
 *   cgt_exempt/rates:    confirmed 2025-26, 2026-27; used for all years
 *   pension_ufpls_*:     confirmed 2025-26, 2026-27; used for all years
 *   state_pension_annual: base £11,502.40 (2025-26 LLP snapshot)
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/combined-strategy.ts <path-to-lifeplan.json>
 *      or: PLAN_PATH=<path-to-lifeplan.json> npx tsx --tsconfig tsconfig.json scripts/combined-strategy.ts
 */

import { existsSync, readFileSync } from 'fs';

// ─── HMRC constants (from hmrc-local MCP) ────────────────────────────────────
const PA           = 12_570;   // income_tax_bands.personal_allowance
const BASIC_LIMIT  = 50_270;   // income_tax_bands.basic_rate_limit
const HIGHER_LIMIT = 125_140;  // income_tax_bands.higher_rate_limit
const BASIC_RATE   = 0.20;
const HIGHER_RATE  = 0.40;
const ADDL_RATE    = 0.45;
const CGT_EXEMPT   = 3_000;    // cgt_exempt per person
const CGT_BASIC    = 0.18;     // cgt_rates.basic
const CGT_HIGHER   = 0.24;     // cgt_rates.higher
const UFPLS_TF     = 0.25;     // pension_ufpls_tax_free_fraction
const UFPLS_TX     = 0.75;     // pension_ufpls_taxable_fraction
const LSA          = 268_275;  // Lump Sum Allowance (pension lifetime tax-free limit)

// ─── Load plan data ───────────────────────────────────────────────────────────
const planPath = process.argv[2] ?? process.env.PLAN_PATH;

if (!planPath) {
  throw new Error('Missing plan path. Pass it as the first CLI argument or set PLAN_PATH.');
}

if (!existsSync(planPath)) {
  throw new Error(`Plan file not found: ${planPath}`);
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'));

const p1 = plan.person1;
const p2 = plan.person2;
const GROWTH    = 1 + plan.assumptions.investmentGrowth / 100;  // 1.04
const INFLATION = 1 + plan.assumptions.inflation / 100;         // 1.025
const FI_AGE    = plan.fiAge;                                   // 60
const LIFE_EXP  = plan.assumptions.lifeExpectancy;              // 95

// Years from plan creation to FI age
const P1_CURRENT_AGE = p1.currentAge;  // 56
const P2_CURRENT_AGE = p2.currentAge;  // 57
const YEARS_TO_FI    = FI_AGE - P1_CURRENT_AGE;  // 4

// ─── Project balances from plan creation to FI age ───────────────────────────
// Both people are treated as starting drawdown at Paul's FI age (60).
// Lisa is 8 months older, but LLP uses Paul's FI age as the common start.

const JOINT_GIA_COST_BASE = plan.jointGia.baseCost;  // £0 (all gain)

interface Balances {
  paulDC:      number;
  paulISA:     number;
  lisaDC:      number;
  lisaISA:     number;
  giaValue:    number;
  giaCostBase: number;
  paulLSA:     number;  // accumulated against £268,275 Lump Sum Allowance
  lisaLSA:     number;
}

const START: Balances = {
  paulDC:      p1.incomeSources.dcPension.totalValue   * Math.pow(GROWTH, YEARS_TO_FI),
  paulISA:     p1.assets.isaInvestments.totalValue     * Math.pow(GROWTH, YEARS_TO_FI),
  lisaDC:      p2.incomeSources.dcPension.totalValue   * Math.pow(GROWTH, YEARS_TO_FI),
  lisaISA:     p2.assets.isaInvestments.totalValue     * Math.pow(GROWTH, YEARS_TO_FI),
  giaValue:    plan.jointGia.totalValue                * Math.pow(GROWTH, YEARS_TO_FI),
  giaCostBase: JOINT_GIA_COST_BASE,  // stays £0 — cost base doesn't grow
  paulLSA:     0,
  lisaLSA:     0,
};

// ─── Income projection helpers ────────────────────────────────────────────────

/** DB pension: plan stores nominal (plan-creation) value; inflate from creation to each age. */
function dbAtAge(paulAge: number): number {
  if (!p1.incomeSources.dbPension.enabled) return 0;
  const yearsFromCreation = paulAge - P1_CURRENT_AGE;
  return p1.incomeSources.dbPension.annualIncome * Math.pow(INFLATION, yearsFromCreation);
}

/** State pension: weekly amount × 52, inflated from creation year to start age, then growing. */
function spForPerson(
  personCurrentAge: number,
  spStartAge: number,
  currentSimAge: number,  // age in current simulation year
): number {
  if (currentSimAge < spStartAge) return 0;
  const yearsFromCreationToStart = spStartAge - personCurrentAge;
  const baseAtStart = (221.2 * 52) * Math.pow(INFLATION, yearsFromCreationToStart);
  const yearsAfterStart = currentSimAge - spStartAge;
  return baseAtStart * Math.pow(INFLATION, yearsAfterStart);
}

/** Spending: plan stores nominal values; inflate from creation year to each simulation year. */
function spending(paulAge: number): number {
  const cats = plan.spendingCategories as Array<{amounts: Record<string,number>}>;
  const lifeStages = plan.lifeStages as Array<{id:string; startAge:number; endAge:number}>;
  const goGo  = lifeStages.find(s => s.id === 'go-go')!;
  const sloGo = lifeStages.find(s => s.id === 'slo-go')!;

  let stage: string;
  if (paulAge <= goGo.endAge)         stage = 'go-go';
  else if (paulAge <= sloGo.endAge)   stage = 'slo-go';
  else                                 stage = 'no-go';

  const nominal = cats.reduce((s, c) => s + (c.amounts[stage] ?? 0), 0);
  const yearsFromCreation = paulAge - P1_CURRENT_AGE;
  return nominal * Math.pow(INFLATION, yearsFromCreation);
}

// ─── Tax functions ────────────────────────────────────────────────────────────

function effectivePA(totalIncome: number): number {
  if (totalIncome <= 100_000) return PA;
  return Math.max(0, PA - (totalIncome - 100_000) / 2);
}

function incomeTax(taxable: number): number {
  const pa = effectivePA(taxable);
  if (taxable <= pa) return 0;
  let tax = (Math.min(taxable, BASIC_LIMIT) - pa) * BASIC_RATE;
  if (taxable > BASIC_LIMIT)  tax += (Math.min(taxable, HIGHER_LIMIT) - BASIC_LIMIT) * HIGHER_RATE;
  if (taxable > HIGHER_LIMIT) tax += (taxable - HIGHER_LIMIT) * ADDL_RATE;
  return tax;
}

function isHigherRateTaxpayer(taxable: number): boolean {
  return taxable > BASIC_LIMIT;
}

function cgt(gain: number, higherRate: boolean): number {
  const taxable = Math.max(0, gain - CGT_EXEMPT);
  return taxable * (higherRate ? CGT_HIGHER : CGT_BASIC);
}

/** UFPLS: gross DC draw that uses up exactly the PA headroom for a person.
 *  Returns 0 if fixed income already at or above PA. */
function dcToFillPA(fixedIncome: number): number {
  const headroom = PA - fixedIncome;
  if (headroom <= 0) return 0;
  return headroom / UFPLS_TX;
}

// ─── Waterfall function ───────────────────────────────────────────────────────

type DCOrder  = 'paul-first' | 'equal' | 'proportional' | 'lisa-first';
type ISAMode  = 'now' | 'defer';

interface WaterfallConfig {
  label:    string;
  dcOrder:  DCOrder;
  isaMode:  ISAMode;
}

interface WaterfallResult {
  label:      string;
  paulDC:     number;
  paulISA:    number;
  lisaDC:     number;
  lisaISA:    number;
  giaTotal:   number;
  giaCGExempt: number;  // portion of GIA gain within CGT exempt
  paulTax:    number;
  lisaTax:    number;
  cgtPaid:    number;
  totalTax:   number;
  feasible:   boolean;
  gap:        number;   // unmet spending (0 if feasible)
}

function runWaterfall(
  cfg:  WaterfallConfig,
  paulAge:    number,
  lisaAge:    number,
  paulDB:     number,
  paulSP:     number,
  lisaSP:     number,
  required:   number,
  bal:        Balances,
): WaterfallResult {

  // Fixed income
  const paulFixed = paulDB + paulSP;
  const lisaFixed = lisaSP;

  // PA headroom and max DC-within-PA for each person
  const paulPADC = dcToFillPA(paulFixed);
  const lisaPADC = dcToFillPA(lisaFixed);

  let remaining = required - paulFixed - lisaFixed;
  let paulDC = 0, lisaDC = 0;

  // ── Step 1: DC within Personal Allowance ──────────────────────────────────
  if (remaining > 0 && (bal.paulDC > 0 || bal.lisaDC > 0)) {
    switch (cfg.dcOrder) {
      case 'paul-first': {
        paulDC = Math.min(paulPADC, bal.paulDC, remaining);
        remaining -= paulDC;
        lisaDC = Math.min(lisaPADC, bal.lisaDC, remaining);
        remaining -= lisaDC;
        break;
      }
      case 'lisa-first': {
        lisaDC = Math.min(lisaPADC, bal.lisaDC, remaining);
        remaining -= lisaDC;
        paulDC = Math.min(paulPADC, bal.paulDC, remaining);
        remaining -= paulDC;
        break;
      }
      case 'equal': {
        // Each person provides half the net needed, capped at their PA headroom
        const halfNeeded = remaining / 2;
        paulDC = Math.min(paulPADC, bal.paulDC, halfNeeded);
        lisaDC = Math.min(lisaPADC, bal.lisaDC, halfNeeded);
        // If one person falls short, the other compensates (up to their PA cap)
        const shortfall = remaining - paulDC - lisaDC;
        if (shortfall > 0) {
          const paulExtra = Math.min(paulPADC - paulDC, bal.paulDC - paulDC, shortfall);
          paulDC += paulExtra;
          const lisaExtra = Math.min(lisaPADC - lisaDC, bal.lisaDC - lisaDC, shortfall - paulExtra);
          lisaDC += lisaExtra;
        }
        remaining -= paulDC + lisaDC;
        break;
      }
      case 'proportional': {
        const totalDC = bal.paulDC + bal.lisaDC;
        if (totalDC > 0) {
          const paulShare = bal.paulDC / totalDC;
          paulDC = Math.min(paulPADC, bal.paulDC, remaining * paulShare);
          lisaDC = Math.min(lisaPADC, bal.lisaDC, remaining * (1 - paulShare));
          // Remaining after proportional split (one side may be capped)
          const afterProp = remaining - paulDC - lisaDC;
          if (afterProp > 0) {
            const paulExtra = Math.min(paulPADC - paulDC, bal.paulDC - paulDC, afterProp);
            paulDC += paulExtra;
            const lisaExtra = Math.min(lisaPADC - lisaDC, bal.lisaDC - lisaDC, afterProp - paulExtra);
            lisaDC += lisaExtra;
          }
        }
        remaining -= paulDC + lisaDC;
        break;
      }
    }
  }

  // ── Step 2: GIA within CGT exempt ────────────────────────────────────────
  // Always draw before ISA (use-it-or-lose-it allowance). Joint GIA, gains
  // split 50/50 between Paul and Lisa, capped so neither exceeds £3,000 gain.
  let giaExempt = 0, giaAbove = 0;
  if (remaining > 0 && bal.giaValue > 0) {
    const gainFrac   = bal.giaValue > 0 ? Math.max(0, (bal.giaValue - bal.giaCostBase) / bal.giaValue) : 0;
    const maxExempt  = gainFrac > 0 ? (CGT_EXEMPT * 2) / gainFrac : bal.giaValue;
    giaExempt = Math.min(maxExempt, bal.giaValue, remaining);
    remaining -= giaExempt;
  }

  // ── Step 3: ISA (now) ─────────────────────────────────────────────────────
  let paulISA = 0, lisaISA = 0;
  if (cfg.isaMode === 'now' && remaining > 0) {
    paulISA = Math.min(bal.paulISA, remaining);  remaining -= paulISA;
    lisaISA = Math.min(bal.lisaISA, remaining);  remaining -= lisaISA;
  }

  // ── Step 4: Remaining GIA (taxable above CGT exempt) ─────────────────────
  if (remaining > 0 && bal.giaValue - giaExempt > 0) {
    giaAbove = Math.min(bal.giaValue - giaExempt, remaining);
    remaining -= giaAbove;
  }
  const giaTotal = giaExempt + giaAbove;

  // ── Step 5: DC above Personal Allowance (taxable at marginal rate) ────────
  // For ISA-preserve: this draws heavily before touching ISA.
  // The dcOrder applies here too — equal/proportional splits prevent one person
  // crossing into the higher-rate band while the other has unused basic-rate headroom.
  let paulDCAbove = 0, lisaDCAbove = 0;
  if (remaining > 0) {
    const paulDCAvail = Math.max(0, bal.paulDC - paulDC);
    const lisaDCAvail = Math.max(0, bal.lisaDC - lisaDC);
    switch (cfg.dcOrder) {
      case 'paul-first': {
        paulDCAbove = Math.min(paulDCAvail, remaining);  remaining -= paulDCAbove;
        lisaDCAbove = Math.min(lisaDCAvail, remaining);  remaining -= lisaDCAbove;
        break;
      }
      case 'lisa-first': {
        lisaDCAbove = Math.min(lisaDCAvail, remaining);  remaining -= lisaDCAbove;
        paulDCAbove = Math.min(paulDCAvail, remaining);  remaining -= paulDCAbove;
        break;
      }
      case 'equal': {
        const halfA = remaining / 2;
        paulDCAbove = Math.min(paulDCAvail, halfA);
        lisaDCAbove = Math.min(lisaDCAvail, halfA);
        const shortA = remaining - paulDCAbove - lisaDCAbove;
        if (shortA > 0) {
          const pe = Math.min(paulDCAvail - paulDCAbove, shortA);  paulDCAbove += pe;
          const le = Math.min(lisaDCAvail - lisaDCAbove, shortA - pe); lisaDCAbove += le;
        }
        remaining -= paulDCAbove + lisaDCAbove;
        break;
      }
      case 'proportional': {
        const totAvail = paulDCAvail + lisaDCAvail;
        if (totAvail > 0) {
          const pShare = paulDCAvail / totAvail;
          paulDCAbove = Math.min(paulDCAvail, remaining * pShare);
          lisaDCAbove = Math.min(lisaDCAvail, remaining * (1 - pShare));
          const shortP = remaining - paulDCAbove - lisaDCAbove;
          if (shortP > 0) {
            const pe = Math.min(paulDCAvail - paulDCAbove, shortP);  paulDCAbove += pe;
            const le = Math.min(lisaDCAvail - lisaDCAbove, shortP - pe); lisaDCAbove += le;
          }
        }
        remaining -= paulDCAbove + lisaDCAbove;
        break;
      }
    }
  }

  // ── Step 6: ISA as last resort (if deferred above) ────────────────────────
  if (cfg.isaMode === 'defer' && remaining > 0) {
    paulISA = Math.min(bal.paulISA, remaining);  remaining -= paulISA;
    lisaISA = Math.min(bal.lisaISA, remaining);  remaining -= lisaISA;
  }

  // ── Tax computation ───────────────────────────────────────────────────────
  const paulDCTotal   = paulDC + paulDCAbove;
  const lisaDCTotal   = lisaDC + lisaDCAbove;

  // LSA: cap on 25% tax-free portion (remaining LSA per person)
  const paulLSALeft = Math.max(0, LSA - bal.paulLSA);
  const lisaLSALeft = Math.max(0, LSA - bal.lisaLSA);
  const paulTF      = Math.min(paulDCTotal * UFPLS_TF, paulLSALeft);
  const lisaTF      = Math.min(lisaDCTotal * UFPLS_TF, lisaLSALeft);

  const paulTaxable  = paulFixed + (paulDCTotal - paulTF);
  const lisaTaxable  = lisaFixed + (lisaDCTotal - lisaTF);

  const paulTax  = incomeTax(paulTaxable);
  const lisaTax  = incomeTax(lisaTaxable);

  // CGT: joint GIA gains split 50/50
  const gainFrac     = bal.giaValue > 0 ? Math.max(0, (bal.giaValue - bal.giaCostBase) / bal.giaValue) : 0;
  const totalGain    = giaTotal * gainFrac;
  const gainEach     = totalGain / 2;
  const paulCGT      = cgt(gainEach, isHigherRateTaxpayer(paulTaxable));
  const lisaCGT      = cgt(gainEach, isHigherRateTaxpayer(lisaTaxable));
  const cgtPaid      = paulCGT + lisaCGT;

  const totalTax     = paulTax + lisaTax + cgtPaid;
  const feasible     = remaining <= 1;

  return {
    label: cfg.label,
    paulDC: paulDCTotal, paulISA,
    lisaDC: lisaDCTotal, lisaISA,
    giaTotal, giaCGExempt: giaExempt * gainFrac,
    paulTax, lisaTax, cgtPaid, totalTax,
    feasible, gap: remaining,
  };
}

// ─── Per-year optimizer ───────────────────────────────────────────────────────

const CANDIDATES: WaterfallConfig[] = [
  { label: '1-LLP-Baseline',  dcOrder: 'equal',         isaMode: 'now'   },
  { label: '2-Paul-first',    dcOrder: 'paul-first',    isaMode: 'now'   },
  { label: '3-Proportional',  dcOrder: 'proportional',  isaMode: 'now'   },
  { label: '4-Lisa-first',    dcOrder: 'lisa-first',    isaMode: 'now'   },
  { label: '5-ISA-preserve',  dcOrder: 'equal',         isaMode: 'defer' },
];

function optimizeYear(
  paulAge: number, lisaAge: number,
  paulDB: number, paulSP: number, lisaSP: number,
  req: number,
  bal: Balances,
): WaterfallResult {
  const results  = CANDIDATES.map(c => runWaterfall(c, paulAge, lisaAge, paulDB, paulSP, lisaSP, req, bal));
  const feasible = results.filter(r => r.feasible);
  if (feasible.length > 0) return feasible.reduce((best, r) => r.totalTax < best.totalTax ? r : best);
  // Fallback: least unmet spending
  return results.reduce((best, r) => r.gap < best.gap ? r : best);
}

// ─── Simulation loop ──────────────────────────────────────────────────────────

interface YearRecord {
  paulAge:    number;
  lisaAge:    number;
  req:        number;
  paulDB:     number;
  paulSP:     number;
  lisaSP:     number;
  winner:     WaterfallResult;
  endBal:     Balances;
  totalAssets: number;
}

function simulate(useLLPBaseline: boolean): YearRecord[] {
  const records: YearRecord[] = [];
  const bal = JSON.parse(JSON.stringify(START)) as Balances;
  const years = LIFE_EXP - FI_AGE;

  for (let yr = 0; yr < years; yr++) {
    const paulAge = FI_AGE + yr;
    const lisaAge = paulAge + 1;  // Lisa is ~8 months older → rounds to +1 year

    // Grow all pots at start of year
    bal.paulDC   *= GROWTH;
    bal.paulISA  *= GROWTH;
    bal.lisaDC   *= GROWTH;
    bal.lisaISA  *= GROWTH;
    bal.giaValue *= GROWTH;
    // giaCostBase stays fixed (cost basis doesn't grow)

    const paulDB = dbAtAge(paulAge);
    const paulSP = spForPerson(P1_CURRENT_AGE, p1.incomeSources.statePension.startAge, paulAge);
    const lisaSP = spForPerson(P2_CURRENT_AGE, p2.incomeSources.statePension.startAge, lisaAge);
    const req    = spending(paulAge);

    const winner = useLLPBaseline
      ? runWaterfall(CANDIDATES[0], paulAge, lisaAge, paulDB, paulSP, lisaSP, req, bal)
      : optimizeYear(paulAge, lisaAge, paulDB, paulSP, lisaSP, req, bal);

    // Apply draws
    const disposedFrac = bal.giaValue > 0 ? winner.giaTotal / bal.giaValue : 0;
    bal.paulDC      -= winner.paulDC;
    bal.paulISA     -= winner.paulISA;
    bal.lisaDC      -= winner.lisaDC;
    bal.lisaISA     -= winner.lisaISA;
    bal.giaValue    -= winner.giaTotal;
    bal.giaCostBase *= (1 - disposedFrac);  // stays £0 when cost base is £0
    // Track LSA usage (25% tax-free portion of DC draws)
    const paulLSALeft = Math.max(0, LSA - bal.paulLSA);
    const lisaLSALeft = Math.max(0, LSA - bal.lisaLSA);
    bal.paulLSA += Math.min(winner.paulDC * UFPLS_TF, paulLSALeft);
    bal.lisaLSA += Math.min(winner.lisaDC * UFPLS_TF, lisaLSALeft);

    // Floor at zero
    bal.paulDC   = Math.max(0, bal.paulDC);
    bal.paulISA  = Math.max(0, bal.paulISA);
    bal.lisaDC   = Math.max(0, bal.lisaDC);
    bal.lisaISA  = Math.max(0, bal.lisaISA);
    bal.giaValue = Math.max(0, bal.giaValue);

    const totalAssets = bal.paulDC + bal.paulISA + bal.lisaDC + bal.lisaISA + bal.giaValue;
    records.push({ paulAge, lisaAge, req, paulDB, paulSP, lisaSP, winner, endBal: { ...bal }, totalAssets });
  }
  return records;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

const c  = (n: number) => n < 1 ? '       —' : `£${Math.round(n).toLocaleString('en-GB').padStart(7)}`;
const ci = (n: number) => `£${Math.round(n).toLocaleString('en-GB').padStart(10)}`;

function printTable(title: string, rows: YearRecord[], limit?: number) {
  const data = limit ? rows.slice(0, limit) : rows;
  const sep = '─'.repeat(193);
  console.log(`\n${title}`);
  console.log(sep);
  console.log(
    ' Paul/Lisa '.padEnd(12) +
    'Spending '.padStart(10) +
    '│  Paul: DB.Pen  St.Pen  ISA  DC  '.padEnd(35) +
    '│  Lisa: St.Pen  ISA  DC  '.padEnd(27) +
    '│  GIA  '.padEnd(10) +
    '│  Tax   │ Strategy',
  );
  console.log(sep);

  let tSpend=0, tPDB=0, tPSP=0, tPISA=0, tPDC=0;
  let tLSP=0, tLISA=0, tLDC=0, tGIA=0, tTax=0;

  for (const r of data) {
    const w = r.winner;
    const tag = r.winner.label;
    console.log(
      ` ${r.paulAge}/${r.lisaAge}`.padEnd(11) +
      `  ${c(r.req)} │` +
      `  ${c(r.paulDB)} ${c(r.paulSP)} ${c(w.paulISA)} ${c(w.paulDC)}  │` +
      `  ${c(r.lisaSP)} ${c(w.lisaISA)} ${c(w.lisaDC)}  │` +
      `  ${c(w.giaTotal)} │` +
      `  ${c(w.totalTax)} │ ${tag}`,
    );
    tSpend += r.req; tPDB += r.paulDB; tPSP += r.paulSP;
    tPISA += w.paulISA; tPDC += w.paulDC;
    tLSP += r.lisaSP; tLISA += w.lisaISA; tLDC += w.lisaDC;
    tGIA += w.giaTotal; tTax += w.totalTax;
  }

  console.log(sep);
  console.log(
    ' TOTAL'.padEnd(11) +
    `  ${c(tSpend)} │` +
    `  ${c(tPDB)} ${c(tPSP)} ${c(tPISA)} ${c(tPDC)}  │` +
    `  ${c(tLSP)} ${c(tLISA)} ${c(tLDC)}  │` +
    `  ${c(tGIA)} │` +
    `  ${c(tTax)} │`,
  );
  console.log(sep);
}

// ─── Run both simulations ─────────────────────────────────────────────────────

const optimized = simulate(false);
const baseline  = simulate(true);

// ─── 10-year detail table ─────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════════');
console.log('  COMBINED WATERFALL + OPTIMIZER — Paul 60 → 69 (10-year detail)');
console.log('  HMRC rules: hmrc-local MCP | Objective: minimise lifetime tax');
console.log('════════════════════════════════════════════════════════════════');

printTable('Optimized strategy (lowest-tax candidate per year)', optimized, 10);

const last10 = optimized[9].endBal;
console.log('\nEnd balances at Paul 69 / Lisa 70:');
console.log(`  Paul DC:   ${ci(last10.paulDC)}`);
console.log(`  Paul ISA:  ${ci(last10.paulISA)}`);
console.log(`  Lisa DC:   ${ci(last10.lisaDC)}`);
console.log(`  Lisa ISA:  ${ci(last10.lisaISA)}`);
console.log(`  Joint GIA: ${ci(last10.giaValue)}`);
console.log(`  TOTAL:     ${ci(optimized[9].totalAssets)}`);

// ─── Lifetime summary ─────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════════');
console.log('  LIFETIME SUMMARY (Paul 60 → 95, 35 years)');
console.log('════════════════════════════════════════════════════════════════');

const optTax  = optimized.reduce((s, r) => s + r.winner.totalTax, 0);
const baseTax = baseline.reduce((s, r) => s + r.winner.totalTax, 0);
const saving  = baseTax - optTax;
const pctSave = (saving / baseTax * 100).toFixed(1);

// Find depletion age for each
const optDeplete  = optimized.find(r => r.totalAssets < 1)?.paulAge ?? 95;
const baseDeplete = baseline.find(r => r.totalAssets < 1)?.paulAge ?? 95;

const optLast  = optimized[optimized.length - 1];
const baseLast = baseline[baseline.length - 1];

console.log(`\n  Metric                       Optimizer    LLP-Baseline    Saving`);
console.log(`  ${'─'.repeat(68)}`);
console.log(`  Lifetime tax paid         ${ci(optTax)}     ${ci(baseTax)}  ${ci(saving)}`);
console.log(`  % reduction                        —              —     ${pctSave.padStart(5)}%`);
console.log(`  Depletion age              ${optDeplete === 95 ? '> 95     ' : `${optDeplete}        `}  ${baseDeplete === 95 ? '>95          ' : `${baseDeplete}          `}       —`);
console.log(`  Final total assets        ${ci(optLast.totalAssets)}     ${ci(baseLast.totalAssets)}          —`);
console.log(`  Paul DC at 95             ${ci(optLast.endBal.paulDC)}     ${ci(baseLast.endBal.paulDC)}          —`);
console.log(`  Paul ISA at 95            ${ci(optLast.endBal.paulISA)}     ${ci(baseLast.endBal.paulISA)}          —`);

// Strategy frequency breakdown
const stratFreq: Record<string, number> = {};
for (const r of optimized) {
  stratFreq[r.winner.label] = (stratFreq[r.winner.label] ?? 0) + 1;
}
console.log('\n  Strategy selected (years out of 35):');
for (const [label, count] of Object.entries(stratFreq).sort((a,b) => b[1]-a[1])) {
  console.log(`    ${label.padEnd(20)} ${count} year(s)`);
}

// Tax by life stage
function taxByStage(rows: YearRecord[]) {
  const goGo  = rows.filter(r => r.paulAge <= 70).reduce((s, r) => s + r.winner.totalTax, 0);
  const sloGo = rows.filter(r => r.paulAge >= 71 && r.paulAge <= 80).reduce((s, r) => s + r.winner.totalTax, 0);
  const noGo  = rows.filter(r => r.paulAge >= 81).reduce((s, r) => s + r.winner.totalTax, 0);
  return { goGo, sloGo, noGo };
}
const optStage  = taxByStage(optimized);
const baseStage = taxByStage(baseline);

console.log('\n  Tax by life stage:');
console.log(`  ${'─'.repeat(68)}`);
console.log(`  Stage           Optimizer     LLP-Baseline       Saving`);
console.log(`  Go-Go (60-70) ${ci(optStage.goGo)}    ${ci(baseStage.goGo)}   ${ci(baseStage.goGo - optStage.goGo)}`);
console.log(`  Slo-Go (71-80) ${ci(optStage.sloGo)}    ${ci(baseStage.sloGo)}   ${ci(baseStage.sloGo - optStage.sloGo)}`);
console.log(`  No-Go (81-95) ${ci(optStage.noGo)}    ${ci(baseStage.noGo)}   ${ci(baseStage.noGo - optStage.noGo)}`);

console.log('\n  Candidate key:');
console.log('  1-LLP-Baseline   Both draw equal gross DC above the personal allowance (LLP waterfall)');
console.log('  2-Paul-first     Paul fills PA from DC first, then Lisa');
console.log('  3-Proportional   DC draw split proportional to respective pot sizes');
console.log('  4-Lisa-first     Lisa fills PA from DC first, then Paul');
console.log('  5-ISA-preserve   Equal DC split; DC above PA instead of ISA (defer ISA wrapper)');

console.log('\n  HMRC citations:');
console.log('  income_tax_bands: https://www.gov.uk/income-tax-rates (confirmed 2025-26 → 2030-31)');
console.log('  cgt_exempt/rates: https://www.gov.uk/capital-gains-tax/rates (confirmed 2025-26, 2026-27)');
console.log('  UFPLS/LSA:        https://www.gov.uk/tax-on-pension (confirmed 2025-26, 2026-27)');
console.log('  state_pension:    LLP snapshot 2025-26 base £11,502.40; 2026-27 snapshot base £11,973 (estimated)');
