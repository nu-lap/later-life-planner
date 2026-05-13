import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';
import { buildCategoriesForRlss } from '@/lib/mockData';
import { RLSS } from '@/config/financialConstants';
import { getStageTotalSpending } from '@/financialEngine/projectionEngine';
import { STEP2_IDS } from '@/lib/testIds';

// ─── Mock store ───────────────────────────────────────────────────────────────

let plannerState: any;

function makePlannerState(overrides: Partial<{
  mode: 'single' | 'couple';
  rlssStandard: 'minimum' | 'moderate' | 'comfortable' | null;
  p2FiAgeOffset: number;
}> = {}) {
  const { mode = 'single', rlssStandard = null, p2FiAgeOffset = 0 } = overrides;
  const base = createDefaultState(57);
  const cats = rlssStandard
    ? buildCategoriesForRlss(rlssStandard, mode)
    : base.spendingCategories;

  return {
    ...base,
    mode,
    gapSpending: mode === 'couple' && p2FiAgeOffset > 0 ? 0 : undefined,
    careReserve: { enabled: false, amount: 0 },
    spendingCategories: cats,
    rlssStandard: rlssStandard ?? undefined,
    p2FiAge: mode === 'couple' ? base.fiAge + p2FiAgeOffset : undefined,
    setCareReserve: vi.fn(),
    setGoalRegistry: vi.fn(),
    updateSpendingAmount: vi.fn(),
    applyRlssTemplate: vi.fn(),
    setGapSpending: vi.fn(),
    plannedEvents: [],
    addPlannedEvent: vi.fn(),
    updatePlannedEvent: vi.fn(),
    removePlannedEvent: vi.fn(),
  };
}

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step2SpendingGoals from '@/components/steps/Step2SpendingGoals';

describe('Step2 — RLSS total spend display', () => {
  beforeEach(() => {
    plannerState = makePlannerState({ mode: 'single', rlssStandard: 'moderate' });
  });

  test('moderate single RLSS: Go-Go total displayed matches PLSA target (£31,700)', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    const display = screen.getByTestId(STEP2_IDS.TOTAL_SPEND_DISPLAY);
    // formatCurrency(31700, true) = '£31.7k'
    expect(display).toHaveTextContent('£31.7k');
  });

  test('comfortable single RLSS: Go-Go total displayed matches PLSA target (£43,900)', () => {
    plannerState = makePlannerState({ mode: 'single', rlssStandard: 'comfortable' });
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    const display = screen.getByTestId(STEP2_IDS.TOTAL_SPEND_DISPLAY);
    // formatCurrency(43900, true) = '£43.9k'
    expect(display).toHaveTextContent('£43.9k');
  });

  test('minimum single RLSS: Go-Go total displayed matches PLSA target (£13,400)', () => {
    plannerState = makePlannerState({ mode: 'single', rlssStandard: 'minimum' });
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    const display = screen.getByTestId(STEP2_IDS.TOTAL_SPEND_DISPLAY);
    expect(display).toHaveTextContent('£13.4k');
  });

  test('moderate couple RLSS total (£43,900) differs from moderate single (£31,700)', () => {
    const singleCategories = buildCategoriesForRlss('moderate', 'single');
    const coupleCategories = buildCategoriesForRlss('moderate', 'couple');

    const singleTotal = getStageTotalSpending({ spendingCategories: singleCategories } as any, 'go-go');
    const coupleTotal = getStageTotalSpending({ spendingCategories: coupleCategories } as any, 'go-go');

    expect(coupleTotal).toBe(RLSS.couple.moderate.annual);
    expect(singleTotal).toBe(RLSS.single.moderate.annual);
    expect(coupleTotal).toBeGreaterThan(singleTotal);
  });

  test('buildCategoriesForRlss Go-Go total exactly matches RLSS annual target', () => {
    for (const standard of ['minimum', 'moderate', 'comfortable'] as const) {
      for (const mode of ['single', 'couple'] as const) {
        const categories = buildCategoriesForRlss(standard, mode);
        const total = categories.reduce((s, c) => s + (c.amounts['go-go'] ?? 0), 0);
        expect(total).toBe(RLSS[mode][standard].annual);
      }
    }
  });
});

describe('Step2 — RLSS buttons render and call applyRlssTemplate', () => {
  beforeEach(() => {
    plannerState = makePlannerState({ mode: 'single' });
  });

  test('moderate RLSS button is rendered', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP2_IDS.RLSS_BUTTON('moderate'))).toBeInTheDocument();
  });

  test('clicking moderate RLSS button calls applyRlssTemplate with "moderate"', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    screen.getByTestId(STEP2_IDS.RLSS_BUTTON('moderate')).click();
    expect(plannerState.applyRlssTemplate).toHaveBeenCalledWith('moderate');
  });

  test('all three RLSS standard buttons are rendered', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP2_IDS.RLSS_BUTTON('minimum'))).toBeInTheDocument();
    expect(screen.getByTestId(STEP2_IDS.RLSS_BUTTON('moderate'))).toBeInTheDocument();
    expect(screen.getByTestId(STEP2_IDS.RLSS_BUTTON('comfortable'))).toBeInTheDocument();
  });
});

describe('Step2 — gap spending section visibility', () => {
  test('gap section hidden when p1FiAge equals p2FiAge (couple mode, no gap)', () => {
    plannerState = makePlannerState({ mode: 'couple', p2FiAgeOffset: 0 });
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByTestId(STEP2_IDS.GAP_SPENDING_INPUT)).not.toBeInTheDocument();
  });

  test('gap section hidden in single mode', () => {
    plannerState = makePlannerState({ mode: 'single' });
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByTestId(STEP2_IDS.GAP_SPENDING_INPUT)).not.toBeInTheDocument();
  });

  test('gap section visible when p2FiAge > p1FiAge (couple with gap)', () => {
    plannerState = makePlannerState({ mode: 'couple', p2FiAgeOffset: 3 });
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP2_IDS.GAP_SPENDING_INPUT)).toBeInTheDocument();
  });
});
