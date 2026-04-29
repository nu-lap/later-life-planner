import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';
import { CARE_RESERVE } from '@/config/financialConstants';

const setCareReserveMock = vi.fn();
const setGoalRegistryMock = vi.fn();
const setGapSpendingMock = vi.fn((v: number | undefined) => { plannerState.gapSpending = v; });

const plannerState: any = {
  ...createDefaultState(57),
  mode: 'couple',
  gapSpending: 1000,
  careReserve: { enabled: true, amount: 0 },
  setCareReserve: setCareReserveMock,
  setGoalRegistry: setGoalRegistryMock,
  updateSpendingAmount: vi.fn(),
  applyRlssTemplate: vi.fn(),
  setGapSpending: setGapSpendingMock,
};

// make person2 salary large so smart default rounds to 0
plannerState.person2.incomeSources.dcPension.workplaceSalary = 1_000_000;
// ensure p2FiAge is after fiAge so gap panel appears
plannerState.p2FiAge = plannerState.fiAge + 2;

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step2SpendingGoals from '@/components/steps/Step2SpendingGoals';

describe('Step2SpendingGoals', () => {
  beforeEach(() => {
    setCareReserveMock.mockReset();
    setGoalRegistryMock.mockReset();
    setGapSpendingMock.mockReset();
    // reset gapSpending value to initial known state
    plannerState.gapSpending = 1000;
  });

  test('syncs the care reserve goal when the reserve amount is updated', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /advanced planning/i }));
    fireEvent.change(screen.getByLabelText('Care reserve target'), { target: { value: '75000' } });

    expect(setCareReserveMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(setGoalRegistryMock).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: 'care_reserve',
        enabled: true,
        targetValue: 75_000,
      }),
    ]));
  });

  test('clamps the care reserve amount to the supported maximum', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /advanced planning/i }));
    fireEvent.change(screen.getByLabelText('Care reserve target'), { target: { value: String(CARE_RESERVE.MAX_AMOUNT + 50_000) } });

    expect(setCareReserveMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      amount: CARE_RESERVE.MAX_AMOUNT,
    }));
    expect(setGoalRegistryMock).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: 'care_reserve',
        enabled: true,
        targetValue: CARE_RESERVE.MAX_AMOUNT,
      }),
    ]));
  });

  test('hides Reset link when user moves slider to smart default', async () => {
    const { rerender } = render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);

    // Ensure the 'Gap period spending' panel is visible
    expect(screen.getByText(/Gap period spending/i)).toBeDefined();

    // Initially gapSpending is 1000 and smart default should be 0 (because person2 salary is large)
    expect(screen.getByRole('button', { name: /Reset to smart default/i })).toBeDefined();

    // Simulate moving the slider to 0 (smart default) — query by accessible name for robustness
    const slider = screen.getByRole('slider', { name: /target spending during gap/i });
    fireEvent.change(slider, { target: { value: '0' } });

    // Simulate the store update that would occur when the slider is moved to the default
    plannerState.gapSpending = 0;
    rerender(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);

    // Now Reset link should be absent because gapSpending equals smart default
    expect(screen.queryByRole('button', { name: /Reset to smart default/i })).toBeNull();
  });
});
