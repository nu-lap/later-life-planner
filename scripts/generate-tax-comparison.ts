#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import type { PlannerState } from '@/models/types';

function usage() {
  console.error('Usage: tsx scripts/generate-tax-comparison.ts --plan /path/to/plan.json --out /path/to/out.xlsx');
  process.exit(2);
}

const argv = process.argv.slice(2);
let planPath = '';
let outPath = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--plan') planPath = argv[++i];
  if (argv[i] === '--out') outPath = argv[++i];
}
if (!planPath || !outPath) usage();

if (!fs.existsSync(planPath)) {
  console.error('Plan file not found:', planPath);
  process.exit(1);
}

const raw = fs.readFileSync(planPath, 'utf8');
const state = JSON.parse(raw) as PlannerState;

const result = optimizeWithdrawals(state);
const records = result.yearRecords;

function formatCurrency(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const optimizedRows = records.map((r) => ({
  age: `${r.p1Age}${r.p2Age ? '/' + r.p2Age : ''}`,
  taxYear: r.taxYear,
  totalTax: r.winner.totalTax,
  incomeTax: r.winner.incomeTax,
  cgtPaid: r.winner.cgtPaid,
}));

const baselineRows = records.map((r) => ({
  age: `${r.p1Age}${r.p2Age ? '/' + r.p2Age : ''}`,
  taxYear: r.taxYear,
  totalTax: r.baseline.totalTax,
  incomeTax: r.baseline.incomeTax,
  cgtPaid: r.baseline.cgtPaid,
}));

const comparisonRows = records.map((r) => ({
  age: `${r.p1Age}${r.p2Age ? '/' + r.p2Age : ''}`,
  taxYear: r.taxYear,
  optimized_total_tax: r.winner.totalTax,
  baseline_total_tax: r.baseline.totalTax,
  tax_saving: r.baseline.totalTax - r.winner.totalTax,
}));

const wb = XLSX.utils.book_new();
const wsOpt = XLSX.utils.json_to_sheet(optimizedRows);
const wsBase = XLSX.utils.json_to_sheet(baselineRows);
const wsComp = XLSX.utils.json_to_sheet(comparisonRows);

XLSX.utils.book_append_sheet(wb, wsOpt, 'Optimized');
XLSX.utils.book_append_sheet(wb, wsBase, 'Baseline');
XLSX.utils.book_append_sheet(wb, wsComp, 'Comparison');

// Write workbook
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
