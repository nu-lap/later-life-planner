#!/usr/bin/env tsx
/**
 * scripts/gen-tax-snapshot.ts
 *
 * Snapshot generator for HMRC tax rule values.
 *
 * This script writes src/config/taxRuleSnapshot.ts with the known output values
 * from the hmrc-tax-mcp rule set. It acts as a typed constant emitter — the
 * authoritative source-of-truth file that a developer regenerates by running:
 *
 *   npm run gen:tax-snapshot
 *
 * inside the Copilot CLI environment (where the hmrc-local MCP tools are available).
 *
 * Since MCP tools are not available as a Node module at runtime, rule output values
 * are hard-coded here from analysis against the hmrc-local rule engine. When new
 * HMRC rates are published, update the VALUES below and re-run the script.
 *
 * Rule values confirmed via hmrc-local-execute_rule as at 2026-04-03.
 *
 * ┌─────────────────────┬──────────────────────┬──────────────────────┐
 * │ Rule group          │ Confirmed through     │ Rule ID(s)           │
 * ├─────────────────────┼──────────────────────┼──────────────────────┤
 * │ Income tax bands    │ 2030-31              │ income_tax_bands     │
 * │ CGT                 │ 2026-27              │ cgt_due, cgt_rates   │
 * │ Pension / UFPLS     │ 2026-27              │ pension_lsa, UFPLS   │
 * │ State pension       │ 2026-27              │ state_pension_annual │
 * └─────────────────────┴──────────────────────┴──────────────────────┘
 *
 * To add a new tax year when HMRC publishes rates:
 *   1. Add entries to the relevant *_DATA constants below.
 *   2. Update LATEST_* constants if the rule coverage extends.
 *   3. Run `npm run gen:tax-snapshot` to regenerate the snapshot file.
 *   4. Run `npx vitest run tests/unit/taxCalculations.test.ts` to confirm tests pass.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const OUT_FILE = resolve(__dirname, '../src/config/taxRuleSnapshot.ts');

// ─── Known rule output values ─────────────────────────────────────────────────
// These values were gathered by executing hmrc-local rules inside the Copilot
// CLI environment. Each value includes the rule ID and version for auditability.

// rule_id: income_tax_bands — confirmed 2025-26 through 2030-31
// ruleVersion: "1.0.1" for 2025-26, "1.0.0" for all other confirmed years
const INCOME_TAX_YEARS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
const INCOME_TAX_BANDS_CONSTANT_VALUES = {
  personalAllowance: 12_570,
  basicRateLimit: 50_270,
  additionalRateThreshold: 125_140,
  paTaperThreshold: 100_000,
  basicRate: 0.20,
  higherRate: 0.40,
  additionalRate: 0.45,
};
const LATEST_INCOME_TAX_YEAR = '2030-31';

// rule_id: cgt_due, cgt_rates, cgt_exempt — confirmed 2025-26 and 2026-27 only
// Rates reflect Autumn Budget October 2024 changes for non-property assets.
const CGT_YEARS = ['2025-26', '2026-27'];
const CGT_CONSTANT_VALUES = {
  exemptAmount: 3_000,
  basicRate: 0.18,
  higherRate: 0.24,
};
const LATEST_CGT_YEAR = '2026-27';

// rule_id: pension_lsa, pension_ufpls_tax_free_fraction, pension_ufpls_taxable_fraction
// Confirmed 2025-26 and 2026-27 only.
// LSA = 25% of former Lifetime Allowance (£1,073,100) per Finance Act 2024.
const PENSION_YEARS = ['2025-26', '2026-27'];
const PENSION_CONSTANT_VALUES = {
  lsa: 268_275,
  ufplsTaxFreeFraction: 0.25,
  ufplsTaxableFraction: 0.75,
};
const LATEST_PENSION_YEAR = '2026-27';

// rule_id: state_pension_annual — confirmed 2025-26 and 2026-27
// 2026-27 is a triple-lock estimate; update to confirmed DWP figure when published.
const STATE_PENSION_DATA: Record<string, { ruleVersion: string; annualAmount: number }> = {
  '2025-26': { ruleVersion: '1.1.0', annualAmount: 11_502.40 },
  '2026-27': { ruleVersion: '1.0.0', annualAmount: 11_973.00 }, // estimated; update when DWP confirms
};
const LATEST_STATE_PENSION_YEAR = '2026-27';

// ─── Generate file content ────────────────────────────────────────────────────

function r(value: number): string {
  // Format a number as a TypeScript literal (underscore separators for thousands)
  if (Number.isInteger(value) && Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US').replace(/,/g, '_');
  }
  return String(value);
}

const incomeTaxEntries = INCOME_TAX_YEARS.map((yr) => {
  const version = yr === '2025-26' ? '1.0.1' : '1.0.0';
  return `  '${yr}': {
    taxYear: '${yr}', jurisdiction: 'rUK' as const, ruleId: 'income_tax_bands' as const,
    ruleVersion: '${version}',
    personalAllowance: ${r(INCOME_TAX_BANDS_CONSTANT_VALUES.personalAllowance)},
    basicRateLimit: ${r(INCOME_TAX_BANDS_CONSTANT_VALUES.basicRateLimit)},
    additionalRateThreshold: ${r(INCOME_TAX_BANDS_CONSTANT_VALUES.additionalRateThreshold)},
    paTaperThreshold: ${r(INCOME_TAX_BANDS_CONSTANT_VALUES.paTaperThreshold)},
    basicRate: ${INCOME_TAX_BANDS_CONSTANT_VALUES.basicRate},
    higherRate: ${INCOME_TAX_BANDS_CONSTANT_VALUES.higherRate},
    additionalRate: ${INCOME_TAX_BANDS_CONSTANT_VALUES.additionalRate},
  },`;
}).join('\n');

const cgtEntries = CGT_YEARS.map((yr) => `  '${yr}': {
    taxYear: '${yr}', jurisdiction: 'rUK' as const, ruleId: 'cgt_due' as const, ruleVersion: '1.0.0',
    exemptAmount: ${r(CGT_CONSTANT_VALUES.exemptAmount)},
    basicRate: ${CGT_CONSTANT_VALUES.basicRate},
    higherRate: ${CGT_CONSTANT_VALUES.higherRate},
  },`).join('\n');

const pensionEntries = PENSION_YEARS.map((yr) => `  '${yr}': {
    taxYear: '${yr}', jurisdiction: 'rUK' as const,
    lsa: ${r(PENSION_CONSTANT_VALUES.lsa)},
    ufplsTaxFreeFraction: ${PENSION_CONSTANT_VALUES.ufplsTaxFreeFraction},
    ufplsTaxableFraction: ${PENSION_CONSTANT_VALUES.ufplsTaxableFraction},
  },`).join('\n');

const spEntries = Object.entries(STATE_PENSION_DATA).map(([yr, v]) => {
  const note = yr === '2026-27' ? ' // estimated; update to confirmed DWP figure when published' : '';
  return `  '${yr}': { taxYear: '${yr}', jurisdiction: 'rUK' as const, ruleVersion: '${v.ruleVersion}', annualAmount: ${v.annualAmount} },${note}`;
}).join('\n');

const content = `// @generated — DO NOT EDIT BY HAND.
// Generated by scripts/gen-tax-snapshot.ts using the hmrc-tax-mcp rule set.
// Run \`npm run gen:tax-snapshot\` inside the Copilot CLI environment to refresh.
//
// Rule coverage is intentionally uneven:
//   income_tax_bands  → confirmed 2025-26 through 2030-31
//   cgt_due           → confirmed 2025-26 and 2026-27 only
//   pension_lsa / UFPLS → confirmed 2025-26 and 2026-27 only
//   state_pension_annual → confirmed 2025-26 and 2026-27 only
//
// For simulation years beyond the confirmed range, getSnapshotForYear falls
// back to the latest available entry and emits a console.warn (suppressed
// in test environments).
//
// HMRC citations:
//   income_tax_bands: https://www.gov.uk/income-tax-rates ; ITA 2007 s.35
//   cgt_due:          https://www.gov.uk/capital-gains-tax/allowances ; Autumn Budget 2024
//   pension_lsa:      https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes ; Finance Act 2024 s.18
//   state_pension:    https://www.gov.uk/new-state-pension

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface IncomeTaxBands {
  taxYear: string;
  jurisdiction: 'rUK';
  ruleId: 'income_tax_bands';
  ruleVersion: string;
  personalAllowance: number;
  basicRateLimit: number;         // top of basic-rate band (e.g. £50,270)
  additionalRateThreshold: number; // above this rate is 45% (£125,140)
  paTaperThreshold: number;       // PA taper starts at £100,000
  basicRate: number;              // 0.20
  higherRate: number;             // 0.40
  additionalRate: number;         // 0.45
}

export interface CgtSnapshot {
  taxYear: string;
  jurisdiction: 'rUK';
  ruleId: 'cgt_due';
  ruleVersion: string;
  exemptAmount: number;           // £3,000
  basicRate: number;              // 0.18 (non-property assets, post Autumn Budget 2024)
  higherRate: number;             // 0.24 (non-property assets, post Autumn Budget 2024)
}

export interface PensionSnapshot {
  taxYear: string;
  jurisdiction: 'rUK';
  lsa: number;                    // Lifetime Lump Sum Allowance (£268,275)
  ufplsTaxFreeFraction: number;   // 0.25 — tax-free portion of each UFPLS withdrawal
  ufplsTaxableFraction: number;   // 0.75 — taxable portion of each UFPLS withdrawal
}

export interface StatePensionSnapshot {
  taxYear: string;
  jurisdiction: 'rUK';
  ruleVersion: string;
  annualAmount: number;           // Full new State Pension annual amount (£)
}

// ─── Sentinel constants ───────────────────────────────────────────────────────
// The latest confirmed tax year for each rule group. Snapshot entries exist up
// to and including these years. The generator must be re-run when HMRC publishes
// new rates beyond these years.

export const LATEST_INCOME_TAX_YEAR = '${LATEST_INCOME_TAX_YEAR}';
export const LATEST_CGT_YEAR        = '${LATEST_CGT_YEAR}';
export const LATEST_PENSION_YEAR    = '${LATEST_PENSION_YEAR}';
export const LATEST_STATE_PENSION_YEAR = '${LATEST_STATE_PENSION_YEAR}';

// ─── Snapshot data ────────────────────────────────────────────────────────────
// Stored per rule group, each keyed by UK tax year (e.g. '2025-26').

const incomeTaxBandsData: Record<string, IncomeTaxBands> = {
${incomeTaxEntries}
};

// CGT: only confirmed for 2025-26 and 2026-27.
// HMRC has not published CGT rates beyond 2026-27.
const cgtData: Record<string, CgtSnapshot> = {
${cgtEntries}
};

// Pension: only confirmed for 2025-26 and 2026-27.
const pensionData: Record<string, PensionSnapshot> = {
${pensionEntries}
};

// State pension annual amounts.
const statePensionData: Record<string, StatePensionSnapshot> = {
${spEntries}
};

export const TAX_RULE_SNAPSHOT = {
  incomeTaxBands: incomeTaxBandsData,
  cgt: cgtData,
  pension: pensionData,
  statePension: statePensionData,
};

// ─── Resolved snapshot returned by getSnapshotForYear ────────────────────────

export interface ResolvedSnapshot {
  taxYear: string;
  incomeTaxBands: IncomeTaxBands;
  cgt: CgtSnapshot;
  pension: PensionSnapshot;
  statePensionAnnual: number;
  /** true if cgt entry for the requested year was absent; ${LATEST_CGT_YEAR} rates used instead. */
  cgtFallback: boolean;
  /** true if pension entry for the requested year was absent; ${LATEST_PENSION_YEAR} rates used instead. */
  pensionFallback: boolean;
}

/** Memoized resolved snapshots keyed by calendarYear to avoid repeated lookups and log spam. */
const _resolvedCache = new Map<number, ResolvedSnapshot>();
/** Tracks which (group, taxYear) warning messages have already been emitted this process. */
const _warnedKeys = new Set<string>();

/**
 * Look up the tax rule snapshot for a given calendar year.
 *
 * Maps calendarYear to a UK tax year: \`\${calendarYear}-\${(calendarYear+1) % 100}\`.
 *
 * Rule coverage is not uniform:
 *  - Income tax bands: confirmed through ${LATEST_INCOME_TAX_YEAR} (falls back to ${LATEST_INCOME_TAX_YEAR} entry if beyond).
 *  - CGT / pension: confirmed through ${LATEST_CGT_YEAR} only. Falls back and sets cgtFallback /
 *    pensionFallback flags. A console.warn is emitted at most once per (group, taxYear)
 *    per process (suppressed entirely in NODE_ENV=test).
 *
 * @param calendarYear - e.g. 2025 maps to tax year "2025-26"
 */
export function getSnapshotForYear(calendarYear: number): ResolvedSnapshot {
  const cached = _resolvedCache.get(calendarYear);
  if (cached) return cached;

  const taxYear = \`\${calendarYear}-\${String(calendarYear + 1).slice(-2)}\`;

  // Income tax: full coverage through ${LATEST_INCOME_TAX_YEAR}.
  const incomeTaxBands =
    TAX_RULE_SNAPSHOT.incomeTaxBands[taxYear] ??
    TAX_RULE_SNAPSHOT.incomeTaxBands[LATEST_INCOME_TAX_YEAR];

  // CGT: only confirmed to ${LATEST_CGT_YEAR}. Fall back gracefully.
  const cgtEntry = TAX_RULE_SNAPSHOT.cgt[taxYear];
  const cgtFallback = !cgtEntry;
  const cgt = cgtEntry ?? TAX_RULE_SNAPSHOT.cgt[LATEST_CGT_YEAR];

  // Pension: only confirmed to ${LATEST_PENSION_YEAR}. Fall back gracefully.
  const pensionEntry = TAX_RULE_SNAPSHOT.pension[taxYear];
  const pensionFallback = !pensionEntry;
  const pension = pensionEntry ?? TAX_RULE_SNAPSHOT.pension[LATEST_PENSION_YEAR];

  // State pension: only confirmed to ${LATEST_STATE_PENSION_YEAR}. Fall back gracefully.
  const spEntry = TAX_RULE_SNAPSHOT.statePension[taxYear];
  const statePensionAnnual = spEntry
    ? spEntry.annualAmount
    : TAX_RULE_SNAPSHOT.statePension[LATEST_STATE_PENSION_YEAR].annualAmount;

  if (process.env.NODE_ENV !== 'test') {
    const warn = (key: string, message: string) => {
      if (!_warnedKeys.has(key)) {
        _warnedKeys.add(key);
        console.warn(message);
      }
    };
    if (cgtFallback) {
      warn(
        \`cgt:\${taxYear}\`,
        \`[hmrc-tax-mcp] CGT rules not confirmed for \${taxYear}. \` +
        \`Using latest available entry (${LATEST_CGT_YEAR}). \` +
        \`Update snapshot when HMRC publishes new CGT rates.\`,
      );
    }
    if (pensionFallback) {
      warn(
        \`pension:\${taxYear}\`,
        \`[hmrc-tax-mcp] Pension rules not confirmed for \${taxYear}. \` +
        \`Using latest available entry (${LATEST_PENSION_YEAR}). \` +
        \`Update snapshot when HMRC publishes new pension allowances.\`,
      );
    }
    if (!spEntry) {
      warn(
        \`sp:\${taxYear}\`,
        \`[hmrc-tax-mcp] State pension annual amount not confirmed for \${taxYear}. \` +
        \`Using latest available entry (${LATEST_STATE_PENSION_YEAR}).\`,
      );
    }
  }

  const resolved: ResolvedSnapshot = {
    taxYear, incomeTaxBands, cgt, pension, statePensionAnnual, cgtFallback, pensionFallback,
  };
  _resolvedCache.set(calendarYear, resolved);
  return resolved;
}
`;

writeFileSync(OUT_FILE, content, 'utf-8');
console.log(`✓ Written: ${OUT_FILE}`);
