import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';

const setCareReserveMock = vi.fn();
const setGoalRegistryMock = vi.fn();

const plannerState = {
  ...createDefaultState(57),
  careReserve: { enabled: true, amount: 0 },
  setCareReserve: setCareReserveMock,
  setGoalRegistry: setGoalRegistryMock,
  updateSpendingAmount: vi.fn(),
  applyRlssTemplate: vi.fn(),
};

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

import Step2SpendingGoals from '@/components/steps/Step2SpendingGoals';

describe('Step2SpendingGoals', () => {
  beforeEach(() => {
    setCareReserveMock.mockReset();
    setGoalRegistryMock.mockReset();
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
});
