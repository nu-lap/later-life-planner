import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { runSimulation } from '../src/financialEngine/projectionEngine';
import type { PlannerState, SpendingCategory } from '../src/models/types';

const planFileArg = process.argv[2] ?? process.env.LIFEPLAN_FILE;

if (!planFileArg) {
  throw new Error('Missing plan file path. Provide it as the first CLI argument or set LIFEPLAN_FILE.');
}

const planFilePath = resolve(planFileArg);

if (!existsSync(planFilePath)) {
  throw new Error(`Plan file not found: ${planFilePath}. Provide a valid path as the first CLI argument or set LIFEPLAN_FILE.`);
}

const base = JSON.parse(readFileSync(planFilePath, 'utf-8')) as PlannerState;
function scaleSpending(cats: SpendingCategory[], factors: Record<string,number>) {
  return cats.map(c => ({
    ...c,
    amounts: {
      'go-go':  Math.round(c.amounts['go-go']  * factors['go-go']),
      'slo-go': Math.round(c.amounts['slo-go'] * factors['slo-go']),
      'no-go':  Math.round(c.amounts['no-go']  * factors['no-go']),
    },
  }));
}

const plan: PlannerState = {
  ...base,
  spendingCategories: scaleSpending(base.spendingCategories, {'go-go':1.25,'slo-go':0.90,'no-go':0.95}),
};

const sim = runSimulation(plan);

const fmt = (n: number) => n === 0 ? '         —' : `£${Math.round(n).toLocaleString('en-GB').padStart(9)}`;
const fmtI = (n: number) => `£${Math.round(n).toLocaleString('en-GB').padStart(9)}`;

console.log('\nFrontloaded Go-Go — First 10 Years Withdrawal Breakdown');
console.log('Paul (b.Sep-1969) · Lisa (b.Jan-1969) · FI age 60 · Go-Go +25% = £75,750/yr base\n');

// Paul
console.log('── PAUL ──────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log(' P.Age  Stage        DC Drawdown  ISA Drawdown  GIA Drawdown Cash Drawdown  Income Tax  │ DC Balance  ISA Balance');
console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
const first10 = sim.projections.filter(y => y.p1Age >= 60).slice(0, 10);
for (const y of first10) {
  const stage = y.lifeStage.replace(' Years','').padEnd(10);
  console.log(
    `    ${String(y.p1Age).padStart(2)}  ${stage}` +
    `  ${fmt(y.p1DcDrawdown)} ${fmt(y.p1IsaDrawdown)} ${fmt(y.p1GiaDrawdown)} ${fmt(y.p1CashDrawdown)} ${fmt(y.p1IncomeTax)}` +
    `  │ ${fmtI(y.p1DcBalance)} ${fmtI(y.p1IsaBalance)}`
  );
}
const pDC  = first10.reduce((s,y) => s+y.p1DcDrawdown,  0);
const pISA = first10.reduce((s,y) => s+y.p1IsaDrawdown, 0);
const pGIA = first10.reduce((s,y) => s+y.p1GiaDrawdown, 0);
const pCash= first10.reduce((s,y) => s+y.p1CashDrawdown,0);
const pTax = first10.reduce((s,y) => s+y.p1IncomeTax,   0);
console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log(`  10yr TOTAL             ${fmt(pDC)} ${fmt(pISA)} ${fmt(pGIA)} ${fmt(pCash)} ${fmt(pTax)}`);

// Lisa
console.log('\n── LISA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log(' L.Age  Stage        DC Drawdown  ISA Drawdown  GIA Drawdown Cash Drawdown  Income Tax  │ DC Balance  ISA Balance');
console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
for (const y of first10) {
  const stage = y.lifeStage.replace(' Years','').padEnd(10);
  console.log(
    `    ${String(y.p2Age ?? '?').padStart(2)}  ${stage}` +
    `  ${fmt(y.p2DcDrawdown)} ${fmt(y.p2IsaDrawdown)} ${fmt(y.p2GiaDrawdown)} ${fmt(y.p2CashDrawdown)} ${fmt(y.p2IncomeTax)}` +
    `  │ ${fmtI(y.p2DcBalance)} ${fmtI(y.p2IsaBalance)}`
  );
}
const lDC  = first10.reduce((s,y) => s+y.p2DcDrawdown,  0);
const lISA = first10.reduce((s,y) => s+y.p2IsaDrawdown, 0);
const lGIA = first10.reduce((s,y) => s+y.p2GiaDrawdown, 0);
const lCash= first10.reduce((s,y) => s+y.p2CashDrawdown,0);
const lTax = first10.reduce((s,y) => s+y.p2IncomeTax,   0);
console.log('──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log(`  10yr TOTAL             ${fmt(lDC)} ${fmt(lISA)} ${fmt(lGIA)} ${fmt(lCash)} ${fmt(lTax)}`);

// Joint GIA
console.log('\n── JOINT GIA ──────────────────────────────────────────────────────────────────────────');
console.log(' P.Age  Stage        GIA Drawn   P1 CGT    P2 CGT  │ Joint GIA Balance');
console.log('───────────────────────────────────────────────────────────────────────────────────────');
for (const y of first10) {
  const stage = y.lifeStage.replace(' Years','').padEnd(10);
  const giabal = Math.round(y.p1GiaValue + y.p2GiaValue + ((y as any).jointGiaValue ?? 0));
  console.log(
    `    ${String(y.p1Age).padStart(2)}  ${stage}` +
    `  ${fmt(y.giaDrawdown)} ${fmt(y.p1CgtPaid)} ${fmt(y.p2CgtPaid)}  │ ${fmtI(giabal)}`
  );
}

// Year-by-year cashflow
console.log('\n── ANNUAL CASHFLOW ─────────────────────────────────────────────────────────────────────────');
console.log(' P.Age  Stage         Spending  Total Income       Gap  Total Assets');
console.log('────────────────────────────────────────────────────────────────────────────────────────────');
for (const y of first10) {
  const stage = y.lifeStage.replace(' Years','').padEnd(10);
  console.log(
    `    ${String(y.p1Age).padStart(2)}  ${stage}` +
    `  ${fmt(y.spending)} ${fmt(y.netIncome)} ${fmt(y.gap)}` +
    `  ${fmtI(y.totalAssets)}`
  );
}

// Grand totals
console.log('\n── COMBINED 10-YEAR TOTALS ────────────────────────────────────');
const total = (k: string) => first10.reduce((s:number,y:any) => s + (y[k] as number), 0);
console.log(`  Paul:  DC £${Math.round(pDC).toLocaleString('en-GB')} drawn  │  ISA £${Math.round(pISA).toLocaleString('en-GB')} drawn  │  Tax £${Math.round(pTax).toLocaleString('en-GB')}`);
console.log(`  Lisa:  DC £${Math.round(lDC).toLocaleString('en-GB')} drawn  │  ISA £${Math.round(lISA).toLocaleString('en-GB')} drawn  │  Tax £${Math.round(lTax).toLocaleString('en-GB')}`);
console.log(`  GIA (combined):  £${Math.round(total('giaDrawdown')).toLocaleString('en-GB')} drawn`);
console.log(`  Total spending:  £${Math.round(total('spending')).toLocaleString('en-GB')}`);
console.log(`  Total tax paid:  £${Math.round(pTax + lTax).toLocaleString('en-GB')}`);
