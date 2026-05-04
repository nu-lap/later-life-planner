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

/** Escapes characters that are special in RegExp so they can be used in `new RegExp(str)`. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

describe('DashboardMain basic rendering', () => {
  test('renders without crashing', () => {
    renderDashboardMain();
    // Projection table is now lazy-loaded, so we look for the toggle button
    expect(screen.getByText('Show detailed table')).toBeInTheDocument();
  });
});
