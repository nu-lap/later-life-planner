#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import type { PlannerState } from '@/models/types';

function usage() {
  console.error('Usage: tsx scripts/update-tax-comparison-from-template.ts --plan /path/to/plan.json --template /path/to/template.xlsx --out /path/to/out.xlsx');
  process.exit(2);
}

const argv = process.argv.slice(2);
let planPath = '';
let templatePath = '';
let outPath = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--plan') planPath = argv[++i];
  if (argv[i] === '--template') templatePath = argv[++i];
  if (argv[i] === '--out') outPath = argv[++i];
}
if (!planPath || !templatePath || !outPath) usage();

if (!fs.existsSync(planPath)) {
  console.error('Plan file not found:', planPath);
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error('Template file not found:', templatePath);
  process.exit(1);
}

const raw = fs.readFileSync(planPath, 'utf8');
const state = JSON.parse(raw) as PlannerState;

const result = optimizeWithdrawals(state);
const records = result.yearRecords;

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

// Read template workbook
const wb = XLSX.readFile(templatePath, { cellDates: true });

// Replace sheets while preserving other workbook parts (charts, styles)
const wsOpt = XLSX.utils.json_to_sheet(optimizedRows);
const wsBase = XLSX.utils.json_to_sheet(baselineRows);
const wsComp = XLSX.utils.json_to_sheet(comparisonRows);

// Assign or create sheets with exact names used in template
wb.Sheets['Optimized'] = wsOpt;
if (!wb.SheetNames.includes('Optimized')) wb.SheetNames.push('Optimized');
wb.Sheets['Baseline'] = wsBase;
if (!wb.SheetNames.includes('Baseline')) wb.SheetNames.push('Baseline');
wb.Sheets['Comparison'] = wsComp;
if (!wb.SheetNames.includes('Comparison')) wb.SheetNames.push('Comparison');

// Write out to target path
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
