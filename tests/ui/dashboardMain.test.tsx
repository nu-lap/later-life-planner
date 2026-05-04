/**
 * Tests for DashboardMain tax panel branches (Pro and non-Pro).
 * Verifies correct content is rendered for each entitlement level.
 */

import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardMain from '@/components/DashboardMain';
import { bareState } from '../fixtures/states';
import { formatCurrency } from '@/lib/calculations';
import type { YearlyProjection } from '@/models/types';
import { PENSION_RULES, INCOME_TAX, CGT } from '@/config/financialConstants';

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicComponent() {
    return <div data-testid="mock-chart" />;
  },
}));

vi.mock('@/financialEngine/projectionEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/financialEngine/projectionEngine')>();
  return {
    ...actual,
    getStageTotalSpending: () => 30_000,
  };
});

/** Minimal projection row sufficient for the component to render without errors. */
function makeProjection(overrides: Partial<YearlyProjection> = {}): YearlyProjection {
  return {
    yearIndex: 0,
    p1Age: 65,
    p2Age: null,
    lifeStage: 'Go-Go',
    spending: 30_000,
    p1StatePension: 0, p1DbPension: 0, p1PartTimeWork: 0, p1OtherIncome: 0, p1PropertyRent: 0,
    p2StatePension: 0, p2DbPension: 0, p2PartTimeWork: 0, p2OtherIncome: 0, p2PropertyRent: 0,
    p2GapSalary: 0,
    p1IsaDrawdown: 0, p1GiaDrawdown: 0, p1CashDrawdown: 0, p1DcDrawdown: 0,
    p2IsaDrawdown: 0, p2GiaDrawdown: 0, p2CashDrawdown: 0, p2DcDrawdown: 0,
    isaDrawdown: 0, giaDrawdown: 0, cashDrawdown: 0, dcDrawdown: 0, dcTaxFreeDrawdown: 0,
    propertyRent: 0,
    p1CapitalGain: 0, p2CapitalGain: 0, p1CgtPaid: 0, p2CgtPaid: 0, totalCgtPaid: 0,
    p1IncomeTax: 0, p2IncomeTax: 0, incomeTaxPaid: 0,
    totalIncome: 30_000, totalTaxPaid: 0, netIncome: 30_000, gap: 0,
    careReserveBalance: 0,
    p1IsaBalance: 0, p1GiaValue: 0, p1GiaBaseCost: 0, p1CashBalance: 0, p1DcBalance: 0,
    p2IsaBalance: 0, p2GiaValue: 0, p2GiaBaseCost: 0, p2CashBalance: 0, p2DcBalance: 0,
    jointGiaValue: 0, jointGiaBaseCost: 0, totalAssets: 200_000,
    p1PclsEvent: 0, p1BedIsaTransfer: 0, p1IndivBedIsaTransfer: 0, p1JointBedIsaTransfer: 0,
    p2BedIsaTransfer: 0, p2IndivBedIsaTransfer: 0, p2JointBedIsaTransfer: 0,
    plannedEventSpend: 0,
    ...overrides,
  };
}

const defaultState = bareState(65);
const defaultLifeStages = [{ id: 'active', label: 'Go-Go', color: '#f97316' }];
const projections = [makeProjection()];

function renderDashboardMain(
  overrides: {
    proEnabled?: boolean;
    optimizerEnabled?: boolean;
  } = {},
) {
  return render(
    <DashboardMain
      state={defaultState}
      projections={projections}
      displayProjections={projections}
      surplus
      depletionAge="Never"
      lifeStages={defaultLifeStages}
      mode="single"
      p1Name="You"
      p2Name="Partner 2"
      optimizerEnabled={overrides.optimizerEnabled ?? false}
      proEnabled={overrides.proEnabled ?? false}
    />,
  );
}

describe('DashboardMain tax panel', () => {
  describe('non-Pro branch', () => {
    test('shows the simplified withdrawal strategy heading', () => {
      renderDashboardMain({ proEnabled: false });
      expect(screen.getByText('Simplified tax-efficient withdrawal strategy')).toBeInTheDocument();
    });

    test('shows all five withdrawal steps matching the drawdown waterfall', () => {
      renderDashboardMain({ proEnabled: false });

      // Steps 1 and 5 both say "DC pension" — two instances are expected
      expect(screen.getAllByText('DC pension')).toHaveLength(2);

      // Each step's distinct suffix/label is present exactly once
      expect(screen.getByText('— within personal allowance')).toBeInTheDocument();
      expect(screen.getAllByText('GIA').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('— within CGT exempt amount')).toBeInTheDocument();
      expect(screen.getByText('Remaining GIA & cash')).toBeInTheDocument();
      expect(screen.getByText('— above personal allowance')).toBeInTheDocument();
    });

    test('derives UFPLS percentages from PENSION_RULES constants, not hardcoded strings', () => {
      renderDashboardMain({ proEnabled: false });

      const ufplsTaxFree = `${Math.round(PENSION_RULES.UFPLS_TAX_FREE_FRACTION * 100)}%`;
      const ufplsTaxable = `${Math.round((1 - PENSION_RULES.UFPLS_TAX_FREE_FRACTION) * 100)}%`;

      // The description for step 1 should contain both percentages from constants
      const step1Text = screen.getByText(new RegExp(`${ufplsTaxFree} tax-free`));
      expect(step1Text).toBeInTheDocument();
      expect(step1Text.textContent).toContain(ufplsTaxable);
    });

    test('derives CGT exemption amount from CGT constants in the GIA step description', () => {
      renderDashboardMain({ proEnabled: false });

      // The GIA step description uses formatCurrency(CGT.ANNUAL_EXEMPT, true) — verify the formatted value is present
      const annualExempt = formatCurrency(CGT.ANNUAL_EXEMPT, true);
      expect(screen.getByText(new RegExp(annualExempt.replace(/[£.]/g, (c) => `\\${c}`)))).toBeInTheDocument();
    });

    test('derives personal allowance from INCOME_TAX constants in the DC pension step description', () => {
      renderDashboardMain({ proEnabled: false });

      // Step 1 uses formatCurrency(INCOME_TAX.PERSONAL_ALLOWANCE, true) — verify formatted value is present
      const personalAllowance = formatCurrency(INCOME_TAX.PERSONAL_ALLOWANCE, true);
      expect(screen.getByText(new RegExp(personalAllowance.replace(/[£.]/g, (c) => `\\${c}`)))).toBeInTheDocument();
    });

    test('shows all four tax summary stat cards', () => {
      renderDashboardMain({ proEnabled: false });

      expect(screen.getByText('Lifetime income tax')).toBeInTheDocument();
      expect(screen.getByText('Lifetime CGT')).toBeInTheDocument();
      expect(screen.getByText('Tax-free years')).toBeInTheDocument();
      expect(screen.getByText('Effective rate')).toBeInTheDocument();
    });

    test('does not show the Pro Tax Summary heading', () => {
      renderDashboardMain({ proEnabled: false });
      expect(screen.queryByText('Tax Summary')).not.toBeInTheDocument();
    });
  });

  describe('Pro branch', () => {
    test('shows the compact Tax Summary heading', () => {
      renderDashboardMain({ proEnabled: true });
      expect(screen.getByText('Tax Summary')).toBeInTheDocument();
    });

    test('shows all four Pro tax stat cards', () => {
      renderDashboardMain({ proEnabled: true });

      expect(screen.getByText('Income Tax')).toBeInTheDocument();
      expect(screen.getByText('CGT')).toBeInTheDocument();
      expect(screen.getByText('Effective Rate')).toBeInTheDocument();
      expect(screen.getByText('Tax-free Years')).toBeInTheDocument();
    });

    test('does not show the simplified withdrawal guide steps', () => {
      renderDashboardMain({ proEnabled: true });
      expect(screen.queryByText('Simplified tax-efficient withdrawal strategy')).not.toBeInTheDocument();
    });

    test('does not show the baseline disclaimer when optimizer is disabled', () => {
      renderDashboardMain({ proEnabled: true, optimizerEnabled: false });
      expect(
        screen.queryByText(/pre-optimiser baseline/i),
      ).not.toBeInTheDocument();
    });

    test('shows a baseline disclaimer note when optimizer is enabled', () => {
      renderDashboardMain({ proEnabled: true, optimizerEnabled: true });
      expect(
        screen.getByText(/pre-optimiser baseline/i),
      ).toBeInTheDocument();
    });
  });
});
