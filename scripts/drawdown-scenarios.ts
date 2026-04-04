/**
 * Drawdown scenario analysis for Paul & Lisa's life plan.
 *
 * Runs 5 alternative drawdown strategies through the LLP projection engine
 * and prints a side-by-side comparison of key outcomes.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/drawdown-scenarios.ts
 */

import { readFileSync } from 'fs';
import { runSimulation } from '../src/financialEngine/projectionEngine';
import type { PlannerState, SpendingCategory } from '../src/models/types';

// ─── Load base plan ───────────────────────────────────────────────────────────

const basePlan = JSON.parse(
  readFileSync('/Users/pauldurbin/Downloads/lifeplan.json', 'utf-8'),
) as PlannerState;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scaleSpending(
  categories: SpendingCategory[],
  factors: { 'go-go': number; 'slo-go': number; 'no-go': number },
): SpendingCategory[] {
  return categories.map(c => ({
    ...c,
    amounts: {
      'go-go':  Math.round(c.amounts['go-go']  * factors['go-go']),
      'slo-go': Math.round(c.amounts['slo-go'] * factors['slo-go']),
      'no-go':  Math.round(c.amounts['no-go']  * factors['no-go']),
    },
  }));
}

function stageTotal(categories: SpendingCategory[], stage: string): number {
  return categories.reduce((s, c) => s + (c.amounts[stage] ?? 0), 0);
}

function fmt(n: number): string {
  return n < 0
    ? `-£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`
    : `£${Math.round(n).toLocaleString('en-GB')}`;
}

function fmtAge(n: number | null): string {
  return n === null ? 'Sustains to 95' : `Age ${n}`;
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

const scenarios: Array<{
  name: string;
  description: string;
  plan: PlannerState;
}> = [

  // ── 1. Baseline ──────────────────────────────────────────────────────────
  {
    name: '1. Baseline',
    description: 'Current plan: 4% growth, 2.5% inflation, spending unchanged.',
    plan: basePlan,
  },

  // ── 2. Conservative Markets ──────────────────────────────────────────────
  // Stress-tests lower investment returns (e.g. sustained lower-return decade).
  {
    name: '2. Conservative Markets',
    description: '3% growth (DC, ISA, GIA), 2.5% inflation. Tests resilience to weak markets.',
    plan: {
      ...basePlan,
      assumptions: { ...basePlan.assumptions, investmentGrowth: 3 },
      person1: {
        ...basePlan.person1,
        incomeSources: {
          ...basePlan.person1.incomeSources,
          dcPension: { ...basePlan.person1.incomeSources.dcPension, growthRate: 3 },
        },
        assets: {
          ...basePlan.person1.assets,
          isaInvestments: { ...basePlan.person1.assets.isaInvestments, growthRate: 3 },
        },
      },
      person2: {
        ...basePlan.person2,
        incomeSources: {
          ...basePlan.person2.incomeSources,
          dcPension: { ...basePlan.person2.incomeSources.dcPension, growthRate: 3 },
        },
        assets: {
          ...basePlan.person2.assets,
          isaInvestments: { ...basePlan.person2.assets.isaInvestments, growthRate: 3 },
        },
      },
      jointGia: { ...basePlan.jointGia, growthRate: 3 },
    },
  },

  // ── 3. Inflation Shock ───────────────────────────────────────────────────
  // Models persistent higher inflation (e.g. 3.5% CPI) eroding purchasing power.
  {
    name: '3. Inflation Shock',
    description: '4% growth, 3.5% inflation. Spending erodes real value faster.',
    plan: {
      ...basePlan,
      assumptions: { ...basePlan.assumptions, inflation: 3.5 },
    },
  },

  // ── 4. Frontloaded Go-Go ─────────────────────────────────────────────────
  // Spend more while active (Go-Go +25%), reduce Slo-Go (-10%) and No-Go (-5%).
  // Rationale: maximise experiences while health allows; cut back as needs reduce.
  {
    name: '4. Frontloaded Go-Go',
    description: 'Go-Go +25% (£75,750), Slo-Go −10% (£51,300), No-Go −5% (£45,980). Front-load experiences.',
    plan: {
      ...basePlan,
      spendingCategories: scaleSpending(basePlan.spendingCategories, {
        'go-go':  1.25,
        'slo-go': 0.90,
        'no-go':  0.95,
      }),
    },
  },

  // ── 5. Care-Funded Conservative ──────────────────────────────────────────
  // Enable a £150k care reserve and trim aspirational/variable spend in Go-Go
  // to fund it — protecting against late-life care costs.
  {
    name: '5. Care Reserve',
    description: '£150k care reserve enabled. Aspirational & variable Go-Go spend −20%. Protects against care costs.',
    plan: (() => {
      const careCategories = ['family', 'gifts', 'charity', 'legacy', 'home_impr', 'major_purch', 'buffer'];
      const categories = basePlan.spendingCategories.map(c => ({
        ...c,
        amounts: {
          ...c.amounts,
          'go-go': careCategories.includes(c.id)
            ? Math.round(c.amounts['go-go'] * 0.80)
            : c.amounts['go-go'],
        },
      }));
      return {
        ...basePlan,
        spendingCategories: categories,
        careReserve: { enabled: true, amount: 150_000 },
      };
    })(),
  },
];

// ─── Run scenarios and collect results ───────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  DRAWDOWN SCENARIO ANALYSIS — Paul & Lisa');
console.log('  FI age: 60 | Life expectancy: 95 | Mode: Couple');
console.log('══════════════════════════════════════════════════════════════════════\n');

type ScenarioResult = {
  name: string;
  description: string;
  goGoSpend: number;
  sloGoSpend: number;
  noGoSpend: number;
  depletionAge: number | null;
  lifetimeTax: number;
  lifetimeCGT: number;
  finalAssets: number;
  minAnnualGap: number;
  worstGapAge: number;
  rlss: string | null;
};

const results: ScenarioResult[] = [];

for (const s of scenarios) {
  const sim = runSimulation(s.plan);

  const worstYear = sim.projections.reduce(
    (worst, y) => (y.gap < worst.gap ? y : worst),
    sim.projections[0],
  );

  const lastYear = sim.projections[sim.projections.length - 1];

  results.push({
    name: s.name,
    description: s.description,
    goGoSpend:   stageTotal(s.plan.spendingCategories, 'go-go'),
    sloGoSpend:  stageTotal(s.plan.spendingCategories, 'slo-go'),
    noGoSpend:   stageTotal(s.plan.spendingCategories, 'no-go'),
    depletionAge:   sim.depletionAge,
    lifetimeTax:    sim.lifetimeTaxPaid,
    lifetimeCGT:    sim.lifetimeCGT,
    finalAssets:    lastYear?.totalAssets ?? 0,
    minAnnualGap:   worstYear?.gap ?? 0,
    worstGapAge:    worstYear?.p1Age ?? 0,
    rlss:           sim.sustainableRlssLevel,
  });
}

// ─── Output table ─────────────────────────────────────────────────────────────

const col = 26;
const pad = (s: string) => s.padEnd(col);
const num = (s: string) => s.padStart(col);

// Header
const header = ['Metric', ...results.map(r => r.name)];
const divider = header.map(() => '─'.repeat(col)).join('┼');

console.log(header.map(pad).join('│'));
console.log(divider);

function row(label: string, values: string[]) {
  console.log([pad(label), ...values.map(num)].join('│'));
}

row('Go-Go annual spend',    results.map(r => fmt(r.goGoSpend)));
row('Slo-Go annual spend',   results.map(r => fmt(r.sloGoSpend)));
row('No-Go annual spend',    results.map(r => fmt(r.noGoSpend)));
console.log(divider);
row('Asset depletion',       results.map(r => fmtAge(r.depletionAge)));
row('Final assets (age 95)', results.map(r => fmt(r.finalAssets)));
row('Sustainable RLSS',      results.map(r => r.rlss ?? 'n/a'));
console.log(divider);
row('Lifetime income tax',   results.map(r => fmt(r.lifetimeTax)));
row('Lifetime CGT',          results.map(r => fmt(r.lifetimeCGT)));
row('Total lifetime tax',    results.map(r => fmt(r.lifetimeTax + r.lifetimeCGT)));
console.log(divider);
row('Worst annual gap',      results.map(r => fmt(r.minAnnualGap)));
row('Worst gap at age',      results.map(r => `${r.worstGapAge}`));
console.log('');

// ─── Per-scenario narrative ───────────────────────────────────────────────────

for (const r of results) {
  console.log(`▶ ${r.name}`);
  console.log(`  ${r.description}`);

  const goGoTotal  = r.goGoSpend  * 10; // 10-year stage (60–70)
  const sloGoTotal = r.sloGoSpend * 10; // 10-year stage (71–80)
  const noGoTotal  = r.noGoSpend  * 14; // 14-year stage (81–95... approx)

  console.log(`  Stage totals (nominal): Go-Go ${fmt(goGoTotal)} | Slo-Go ${fmt(sloGoTotal)} | No-Go ${fmt(noGoTotal)}`);

  if (r.depletionAge !== null) {
    console.log(`  ⚠  Assets depleted at age ${r.depletionAge} — shortfall in later years.`);
  } else {
    console.log(`  ✓  Assets sustain through age 95 with ${fmt(r.finalAssets)} remaining.`);
  }
  console.log('');
}

// ─── Year-by-year cashflow for each scenario ─────────────────────────────────

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  YEAR-BY-YEAR SUMMARY (Paul\'s age | Stage | Net income | Gap | Assets)');
console.log('══════════════════════════════════════════════════════════════════════\n');

for (const s of scenarios) {
  const sim = runSimulation(s.plan);
  console.log(`── ${s.name} ──`);
  console.log(
    'Age'.padStart(4),
    'Stage  '.padEnd(10),
    'Spending'.padStart(12),
    'Net Inc'.padStart(12),
    'Gap'.padStart(10),
    'DC Draw'.padStart(12),
    'Total Assets'.padStart(14),
  );
  for (const y of sim.projections) {
    const stage = y.lifeStage.padEnd(10);
    console.log(
      String(y.p1Age).padStart(4),
      stage,
      fmt(y.spending).padStart(12),
      fmt(y.netIncome).padStart(12),
      fmt(y.gap).padStart(10),
      fmt(y.dcDrawdown).padStart(12),
      fmt(y.totalAssets).padStart(14),
    );
  }
  console.log('');
}
