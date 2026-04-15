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

// ─── Post-freeze escalation parameters ────────────────────────────────────────
// These values are mirrored into the generated file and drive the post-freeze
// escalation logic in getSnapshotForYear. When updating, also re-run
// `npm run gen:tax-snapshot` and commit the refreshed snapshot.
const TAX_BAND_FREEZE_END_YEAR  = 2030;  // last calendar year bands remain frozen (tax year 2030-31)
const TAX_BAND_ESCALATION_RATE  = 0.04;  // 4%/yr post-freeze (matches Voyant default)
const LATEST_CGT_CALENDAR_YEAR  = 2026;  // calendar year matching LATEST_CGT_YEAR ('2026-27')
const LATEST_ISA_CALENDAR_YEAR  = 2026;  // calendar year matching last confirmed ISA allowance
// Derived tax-year string for the last confirmed ISA data (e.g. '2026-27')
const LATEST_ISA_TAX_YEAR = `${LATEST_ISA_CALENDAR_YEAR}-${String(LATEST_ISA_CALENDAR_YEAR + 1).slice(-2)}`;
const ISA_ANNUAL_ALLOWANCE_BASE = 20_000; // confirmed ISA allowance (£) through LATEST_ISA_CALENDAR_YEAR

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
//   income_tax_bands  → confirmed 2025-26 through ${LATEST_INCOME_TAX_YEAR} (frozen at 2025/26 values
//                        per Autumn Budget 2025; escalated at ${TAX_BAND_ESCALATION_RATE * 100}%/yr beyond ${LATEST_INCOME_TAX_YEAR})
//   cgt_due           → confirmed 2025-26 and ${LATEST_CGT_YEAR} only
//                        (exemptAmount escalated ${TAX_BAND_ESCALATION_RATE * 100}%/yr beyond ${LATEST_CGT_YEAR}; rates unchanged)
//   isa_allowance     → confirmed through ${LATEST_ISA_TAX_YEAR} (£20,000 since 2017); escalated ${TAX_BAND_ESCALATION_RATE * 100}%/yr
//   pension_lsa / UFPLS → confirmed 2025-26 and ${LATEST_PENSION_YEAR} only
//   state_pension_annual → confirmed 2025-26 and ${LATEST_STATE_PENSION_YEAR} only
//
// For simulation years beyond the confirmed range, getSnapshotForYear falls
// back to the latest available entry. Income-tax thresholds, CGT exempt amount,
// and ISA allowance (not rates) are escalated beyond their known values at
// TAX_BAND_ESCALATION_RATE (${TAX_BAND_ESCALATION_RATE * 100}%/yr), matching the Voyant Default Tax Table
// Assumption. To avoid console noise during long projections, a console.warn
// is emitted at most once per rule group per process (suppressed in test
// environments).
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

// ─── Post-freeze band escalation ─────────────────────────────────────────────
// UK income-tax thresholds (PA, basic-rate limit, additional-rate threshold,
// PA-taper threshold) are legislatively frozen until 5 April 2031.
// Source: Autumn Budget 2025 — HM Treasury, October 2025.
//
// For simulation years beyond the freeze, the software escalates these
// thresholds at TAX_BAND_ESCALATION_RATE per year, matching the approach used
// by Voyant (Default Tax Table Assumption = ${TAX_BAND_ESCALATION_RATE * 100}%).
//
// TAX_BAND_FREEZE_END_YEAR is the last calendar year in which bands remain
// frozen (i.e. tax year 2030-31). Escalation begins from calendar year 2031
// (tax year 2031-32) onward.
//
// To change the escalation rate, update TAX_BAND_ESCALATION_RATE here.
// Note: tax *rates* (20%, 40%, 45%) are never escalated — only the thresholds.
export const TAX_BAND_FREEZE_END_YEAR   = ${TAX_BAND_FREEZE_END_YEAR}; // last frozen calendar year (tax year 2030-31)
export const TAX_BAND_ESCALATION_RATE   = ${TAX_BAND_ESCALATION_RATE}; // ${TAX_BAND_ESCALATION_RATE * 100}%/yr post-freeze (matches Voyant default)

// The calendar year corresponding to the last confirmed CGT and ISA data.
// Escalation for those allowances begins from calendarYear > this value.
export const LATEST_CGT_CALENDAR_YEAR  = ${LATEST_CGT_CALENDAR_YEAR}; // last confirmed: ${LATEST_CGT_YEAR}
export const LATEST_ISA_CALENDAR_YEAR  = ${LATEST_ISA_CALENDAR_YEAR}; // last confirmed: ${LATEST_ISA_TAX_YEAR}

// ISA annual contribution allowance: £20,000 since tax year 2017-18, confirmed
// through ${LATEST_ISA_TAX_YEAR}. Source: HMRC — https://www.gov.uk/individual-savings-accounts
export const ISA_ANNUAL_ALLOWANCE_BASE  = ${r(ISA_ANNUAL_ALLOWANCE_BASE)};

// ─── Snapshot data ────────────────────────────────────────────────────────────
// Stored per rule group, each keyed by UK tax year (e.g. '2025-26').

const incomeTaxBandsData: Record<string, IncomeTaxBands> = {
${incomeTaxEntries}
};

// CGT: only confirmed for 2025-26 and ${LATEST_CGT_YEAR}.
// HMRC has not published CGT rates beyond ${LATEST_CGT_YEAR}.
const cgtData: Record<string, CgtSnapshot> = {
${cgtEntries}
};

// Pension: only confirmed for 2025-26 and ${LATEST_PENSION_YEAR}.
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
  /** ISA annual contribution allowance (£). Confirmed through ${LATEST_ISA_TAX_YEAR}; escalated at ${TAX_BAND_ESCALATION_RATE * 100}%/yr thereafter. */
  isaAnnualAllowance: number;
  /** true if cgt entry for the requested year was absent; escalated from ${LATEST_CGT_YEAR} baseline instead. */
  cgtFallback: boolean;
  /** true if pension entry for the requested year was absent; ${LATEST_PENSION_YEAR} rates used instead. */
  pensionFallback: boolean;
}

/** Memoized resolved snapshots keyed by calendarYear to avoid repeated lookups and log spam. */
const _resolvedCache = new Map<number, ResolvedSnapshot>();
/** Tracks which rule-group fallback warnings have already been emitted this process. */
const _warnedKeys = new Set<string>();

/**
 * Look up the tax rule snapshot for a given calendar year.
 *
 * Maps calendarYear to a UK tax year: \`\${calendarYear}-\${(calendarYear+1) % 100}\`.
 *
 * Rule coverage is not uniform:
 *  - Income tax bands: confirmed through ${LATEST_INCOME_TAX_YEAR} (frozen at 2025/26 values per Finance Act).
 *    For years beyond ${TAX_BAND_FREEZE_END_YEAR}, thresholds are escalated at TAX_BAND_ESCALATION_RATE (${TAX_BAND_ESCALATION_RATE * 100}%/yr)
 *    from the ${LATEST_INCOME_TAX_YEAR} frozen baseline — matching Voyant's Default Tax Table Assumption.
 *    Tax *rates* (20%, 40%, 45%) are never escalated, only the monetary thresholds.
 *  - CGT exempt amount: confirmed through ${LATEST_CGT_YEAR}. For later years, escalated at
 *    TAX_BAND_ESCALATION_RATE (${TAX_BAND_ESCALATION_RATE * 100}%/yr) from the ${LATEST_CGT_YEAR} baseline.
 *    CGT rates (18%/24%) are never escalated.
 *  - ISA annual allowance: confirmed through ${LATEST_ISA_TAX_YEAR} (£20,000). For later years, escalated
 *    at TAX_BAND_ESCALATION_RATE (${TAX_BAND_ESCALATION_RATE * 100}%/yr) from the ${LATEST_ISA_TAX_YEAR} baseline.
 *  - Pension / state pension: confirmed only through their latest published years.
 *
 * @param calendarYear - e.g. 2025 maps to tax year "2025-26"
 */
export function getSnapshotForYear(calendarYear: number): ResolvedSnapshot {
  const cached = _resolvedCache.get(calendarYear);
  if (cached) return cached;

  const taxYear = \`\${calendarYear}-\${String(calendarYear + 1).slice(-2)}\`;

  // Income tax: confirmed through ${LATEST_INCOME_TAX_YEAR} (all frozen at 2025/26 values).
  // Beyond the freeze, escalate monetary thresholds at TAX_BAND_ESCALATION_RATE per year.
  // Tax rates (basicRate, higherRate, additionalRate) are never escalated.
  let incomeTaxBands =
    TAX_RULE_SNAPSHOT.incomeTaxBands[taxYear] ??
    TAX_RULE_SNAPSHOT.incomeTaxBands[LATEST_INCOME_TAX_YEAR];

  if (calendarYear > TAX_BAND_FREEZE_END_YEAR) {
    const yearsPostFreeze = calendarYear - TAX_BAND_FREEZE_END_YEAR;
    const factor = Math.pow(1 + TAX_BAND_ESCALATION_RATE, yearsPostFreeze);
    const frozen = TAX_RULE_SNAPSHOT.incomeTaxBands[LATEST_INCOME_TAX_YEAR];
    incomeTaxBands = {
      ...frozen,
      taxYear,
      personalAllowance:        Math.round(frozen.personalAllowance        * factor),
      basicRateLimit:           Math.round(frozen.basicRateLimit           * factor),
      additionalRateThreshold:  Math.round(frozen.additionalRateThreshold  * factor),
      paTaperThreshold:         Math.round(frozen.paTaperThreshold         * factor),
      // basicRate / higherRate / additionalRate intentionally not escalated
    };
  }

  // CGT: confirmed only through ${LATEST_CGT_YEAR}.
  // Beyond the last confirmed year, escalate exemptAmount at TAX_BAND_ESCALATION_RATE
  // (${TAX_BAND_ESCALATION_RATE * 100}%/yr) from the ${LATEST_CGT_YEAR} baseline — matching Voyant's Default Tax Table Assumption.
  // CGT rates (18%/24%) are never escalated — only the exempt amount.
  const cgtEntry = TAX_RULE_SNAPSHOT.cgt[taxYear];
  const cgtFallback = !cgtEntry;
  const _cgtBase = cgtEntry ?? TAX_RULE_SNAPSHOT.cgt[LATEST_CGT_YEAR];
  let cgt = _cgtBase;
  if (cgtFallback && calendarYear > LATEST_CGT_CALENDAR_YEAR) {
    const yearsPostConfirmed = calendarYear - LATEST_CGT_CALENDAR_YEAR;
    const factor = Math.pow(1 + TAX_BAND_ESCALATION_RATE, yearsPostConfirmed);
    const frozen = TAX_RULE_SNAPSHOT.cgt[LATEST_CGT_YEAR];
    cgt = {
      ...frozen,
      taxYear,
      exemptAmount: Math.round(frozen.exemptAmount * factor),
      // basicRate / higherRate intentionally not escalated
    };
  }

  // ISA annual allowance: confirmed through ${LATEST_ISA_TAX_YEAR} (£20,000).
  // Beyond the last confirmed year, escalate at TAX_BAND_ESCALATION_RATE (${TAX_BAND_ESCALATION_RATE * 100}%/yr).
  const isaAnnualAllowance = calendarYear > LATEST_ISA_CALENDAR_YEAR
    ? Math.round(ISA_ANNUAL_ALLOWANCE_BASE * Math.pow(1 + TAX_BAND_ESCALATION_RATE, calendarYear - LATEST_ISA_CALENDAR_YEAR))
    : ISA_ANNUAL_ALLOWANCE_BASE;

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
        'cgt',
        \`[hmrc-tax-mcp] CGT rules not confirmed for \${taxYear}. \` +
        \`Escalating exemptAmount at \${TAX_BAND_ESCALATION_RATE * 100}%/yr from ${LATEST_CGT_YEAR} baseline. \` +
        \`CGT rates (18%/24%) unchanged. Update snapshot when HMRC publishes new CGT rates.\`,
      );
    }
    if (pensionFallback) {
      warn(
        'pension',
        \`[hmrc-tax-mcp] Pension rules not confirmed for \${taxYear}. \` +
        \`Using latest available entry (${LATEST_PENSION_YEAR}). \` +
        \`Update snapshot when HMRC publishes new pension allowances.\`,
      );
    }
    if (!spEntry) {
      warn(
        'state-pension',
        \`[hmrc-tax-mcp] State pension annual amount not confirmed for \${taxYear}. \` +
        \`Using latest available entry (${LATEST_STATE_PENSION_YEAR}).\`,
      );
    }
  }

  const resolved: ResolvedSnapshot = {
    taxYear, incomeTaxBands, cgt, pension, statePensionAnnual, isaAnnualAllowance, cgtFallback, pensionFallback,
  };
  _resolvedCache.set(calendarYear, resolved);
  return resolved;
}
`;

writeFileSync(OUT_FILE, content, 'utf-8');
console.log(`✓ Written: ${OUT_FILE}`);
