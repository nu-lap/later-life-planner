import { readFileSync } from 'fs';
import { runSimulation } from '../src/financialEngine/projectionEngine';
import type { PlannerState, SpendingCategory } from '../src/models/types';

const base = JSON.parse(readFileSync('/Users/pauldurbin/Downloads/lifeplan.json', 'utf-8')) as PlannerState;

const plan: PlannerState = {
  ...base,
  spendingCategories: base.spendingCategories.map((c: SpendingCategory) => ({
    ...c,
    amounts: {
      'go-go':  Math.round(c.amounts['go-go']  * 1.25),
      'slo-go': Math.round(c.amounts['slo-go'] * 0.90),
      'no-go':  Math.round(c.amounts['no-go']  * 0.95),
    },
  })),
};

const sim = runSimulation(plan);
const rows = sim.projections.filter(y => y.p1Age >= 60).slice(0, 10);

const c = (n: number) =>
  n === 0 ? '      —' : `£${Math.round(n).toLocaleString('en-GB').padStart(7)}`;

const sep = '─'.repeat(162);
console.log('\nFrontloaded Go-Go  ·  Ages 60–69  ·  All figures nominal (2.5% inflation on spending)\n');
console.log(sep);
console.log(
  ' Ages   '.padEnd(9) +
  ' Required'.padStart(10) +
  '  │' +
  '  ──── PAUL ────────────────────────────────'.padEnd(46) +
  '│' +
  '  ──── LISA ────────────────────────────'.padEnd(40) +
  '│ Joint  │  Tax   │   Gap'
);
console.log(
  ' P / L  '.padEnd(9) +
  ' Spending'.padStart(10) +
  '  │' +
  '  St.Pen  DB.Pen  ISA Draw  DC Draw '.padEnd(46) +
  '│' +
  '  St.Pen  ISA Draw  DC Draw'.padEnd(40) +
  '│  GIA   │  Total │'
);
console.log(sep);

let totSpend=0, totPSP=0, totPDB=0, totPISA=0, totPDC=0;
let totLSP=0, totLISA=0, totLDC=0, totGIA=0, totTax=0, totGap=0;

for (const y of rows) {
  const ages = `${y.p1Age}/${y.p2Age ?? '?'}`.padEnd(7);
  const tax = y.p1IncomeTax + y.p2IncomeTax;
  console.log(
    ` ${ages}  ${c(y.spending)}  │` +
    `  ${c(y.p1StatePension)} ${c(y.p1DbPension)} ${c(y.p1IsaDrawdown)} ${c(y.p1DcDrawdown)}  │` +
    `  ${c(y.p2StatePension)} ${c(y.p2IsaDrawdown)} ${c(y.p2DcDrawdown)}  │` +
    ` ${c(y.giaDrawdown)} │ ${c(tax)} │ ${c(y.gap)}`
  );
  totSpend += y.spending; totPSP += y.p1StatePension; totPDB += y.p1DbPension;
  totPISA  += y.p1IsaDrawdown; totPDC += y.p1DcDrawdown;
  totLSP += y.p2StatePension; totLISA += y.p2IsaDrawdown; totLDC += y.p2DcDrawdown;
  totGIA += y.giaDrawdown; totTax += tax;
  totGap += y.gap > 0 ? y.gap : 0;
}

console.log(sep);
console.log(
  ` ${'TOTAL'.padEnd(7)}  ${c(totSpend)}  │` +
  `  ${c(totPSP)} ${c(totPDB)} ${c(totPISA)} ${c(totPDC)}  │` +
  `  ${c(totLSP)} ${c(totLISA)} ${c(totLDC)}  │` +
  ` ${c(totGIA)} │ ${c(totTax)} │ ${c(totGap)}`
);
console.log(sep);

console.log('\nNotes:');
console.log('  • State pensions: Paul from 67, Lisa from 67 — £11,502/yr each (£221.20/wk)');
console.log('  • Paul DB pension: £1,024/yr from age 60');
console.log('  • Drawdown waterfall: GIA (CGT budget) → ISA → DC within personal allowance → DC above PA');
console.log('  • Gap = shortfall met from assets beyond normal waterfall (positive = residual draw)');
console.log('  • Tax = income tax on DC withdrawals exceeding personal allowance (£12,570)');
