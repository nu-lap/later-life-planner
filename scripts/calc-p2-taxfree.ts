import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runSimulation } from '../src/financialEngine/projectionEngine';
import { getSnapshotForYear } from '../src/config/taxRuleSnapshot';

const planPath = process.argv[2];
if (!planPath) {
  console.error('Usage: ts-node scripts/calc-p2-taxfree.ts <plan.json>');
  process.exit(2);
}

const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'));
const sim = runSimulation(plan as any);

let p2Accum = 0;
let p1Accum = 0;

for (const y of sim.projections) {
  const calendarYear = (new Date().getFullYear()) + (y.yearIndex || 0); // fallback
  // attempt to get the snapshot for the correct calendar year used by the engine
  const snapshot = getSnapshotForYear((new Date().getFullYear()) + (y.yearIndex || 0));
  const yearLsa = snapshot.pension.lsa;
  const ufplsFrac = snapshot.pension.ufplsTaxFreeFraction ?? 0.25;

  // p2 dc draw
  const p2Dc = y.p2DcDrawdown || 0;
  const potentialP2TaxFree = p2Dc * ufplsFrac;
  const p2RemainingLsa = Math.max(0, yearLsa - p2Accum);
  const p2TaxFree = Math.min(potentialP2TaxFree, p2RemainingLsa);
  p2Accum += p2TaxFree;

  const p1Dc = y.p1DcDrawdown || 0;
  const potentialP1TaxFree = p1Dc * ufplsFrac;
  const p1RemainingLsa = Math.max(0, yearLsa - p1Accum);
  const p1TaxFree = Math.min(potentialP1TaxFree, p1RemainingLsa);
  p1Accum += p1TaxFree;
}

console.log('Person2 total tax-free UFPLS taken:', Math.round(p2Accum * 100) / 100);
console.log('Person1 total tax-free UFPLS taken:', Math.round(p1Accum * 100) / 100);

// Report remaining LSA per person using the last year snapshot pension.lsa
const lastYear = sim.projections[sim.projections.length - 1];
const lastSnapshot = getSnapshotForYear((new Date().getFullYear()) + (lastYear.yearIndex || 0));
const lastLsa = lastSnapshot.pension.lsa;
console.log('LSA reference used in final year:', lastLsa);
console.log('Person2 remaining LSA (approx):', Math.round(Math.max(0, lastLsa - p2Accum) * 100) / 100);
console.log('Person1 remaining LSA (approx):', Math.round(Math.max(0, lastLsa - p1Accum) * 100) / 100);

// Heuristic: is person2 LSA fully used?
console.log('Person2 LSA fully used?', p2Accum + 1e-6 >= lastLsa ? 'YES' : 'NO');
