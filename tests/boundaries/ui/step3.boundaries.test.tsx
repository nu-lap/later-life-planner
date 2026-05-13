import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { usePlannerStore } from '@/store/plannerStore';
import { STEP3_IDS } from '@/lib/testIds';
import Step3IncomeSources from '@/components/steps/Step3IncomeSources';

// Step3 uses the REAL store (same pattern as tests/ui/step3IncomeSources.test.tsx).
// Boundary tests target cross-field constraints: startAge → stopAge auto-advance,
// tab switching, and state pension start age gating.

beforeEach(() => {
  localStorage.clear();
  usePlannerStore.getState().resetPlan();
  usePlannerStore.persist.clearStorage();
});

describe('Step3 — income/assets tab switching', () => {
  test('income and assets tab buttons are rendered', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP3_IDS.TAB_INCOME)).toBeInTheDocument();
    expect(screen.getByTestId(STEP3_IDS.TAB_ASSETS)).toBeInTheDocument();
  });

  test('clicking assets tab shows ISA; income section is hidden', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    expect(screen.getByText('ISA')).toBeInTheDocument();
    // DC pension label should not be visible on assets tab
    expect(screen.queryByText('DC / Personal Pension')).not.toBeInTheDocument();
  });

  test('switching back to income tab shows DC pension; assets section is hidden', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_INCOME));
    expect(screen.getByText('DC / Personal Pension')).toBeInTheDocument();
    expect(screen.queryByText('ISA')).not.toBeInTheDocument();
  });
});

describe('Step3 — otherIncome stopAge auto-advance', () => {
  test('increasing startAge past stopAge pushes stopAge forward by one', async () => {
    // Set up: otherIncome enabled with startAge = 68, stopAge = 70.
    // The store default age after resetPlan() is STATE_PENSION.DEFAULT_AGE = 67.
    usePlannerStore.getState().setP1Income('otherIncome', {
      enabled: true,
      annualAmount: 1_000,
      description: 'Test income',
      startAge: 68,
      stopAge: 70,
    });

    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);

    // Step: click + to advance startAge from 68 → 69
    fireEvent.click(screen.getByRole('button', { name: 'Increase age (current: 68)' }));

    await waitFor(() => {
      const state = usePlannerStore.getState();
      expect(state.person1.incomeSources.otherIncome.startAge).toBe(69);
      // stopAge (70) > new startAge (69) — no auto-advance yet
      expect(state.person1.incomeSources.otherIncome.stopAge).toBe(70);
    });

    // Step: click + again: startAge 69 → 70, which equals stopAge (70) → auto-advance
    fireEvent.click(screen.getByRole('button', { name: 'Increase age (current: 69)' }));

    await waitFor(() => {
      const state = usePlannerStore.getState();
      expect(state.person1.incomeSources.otherIncome.startAge).toBe(70);
      // stopAge auto-advanced from 70 to 71 (= newStart + 1)
      expect(state.person1.incomeSources.otherIncome.stopAge).toBe(71);
    });
  });
});

describe('Step3 — state pension age gating', () => {
  test('state pension row is visible on income tab', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    // The state pension section label should be present
    expect(screen.getByText('State Pension')).toBeInTheDocument();
  });
});
