import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createDefaultState } from '@/lib/mockData';
import { CARE_RESERVE } from '@/config/financialConstants';
import { STEP2_IDS } from '@/lib/testIds';

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

  test('RLSS standard buttons are rendered and call applyRlssTemplate', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    const moderate = screen.getByTestId(STEP2_IDS.RLSS_BUTTON('moderate'));
    expect(moderate).toBeInTheDocument();
    fireEvent.click(moderate);
    expect(plannerState.applyRlssTemplate).toHaveBeenCalledWith('moderate');
  });

  test('life stage tabs are rendered for each stage', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    const stages = plannerState.lifeStages as Array<{ id: string }>;
    stages.forEach(stage => {
      expect(screen.getByTestId(STEP2_IDS.STAGE_TAB(stage.id))).toBeInTheDocument();
    });
  });

  test('care reserve toggle calls setCareReserve with toggled enabled state', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced planning/i }));
    const toggle = screen.getByTestId(STEP2_IDS.CARE_RESERVE_TOGGLE);
    fireEvent.click(toggle);
    expect(setCareReserveMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test('care reserve amount input is present when care reserve enabled', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /advanced planning/i }));
    expect(screen.getByTestId(STEP2_IDS.CARE_RESERVE_AMOUNT)).toBeInTheDocument();
  });

  test('add planned event button is rendered', () => {
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP2_IDS.ADD_PLANNED_EVENT)).toBeInTheDocument();
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

// ─── BUG-015: null rlssStandard shows prompt instead of spend total ───────────

describe('Step2SpendingGoals — null rlssStandard prompt (BUG-015)', () => {
  test('shows "Choose a lifestyle" prompt when rlssStandard is null', () => {
    const savedRlss = plannerState.rlssStandard;
    plannerState.rlssStandard = null;
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByText(/Choose a lifestyle above to set your budget/i)).toBeInTheDocument();
    plannerState.rlssStandard = savedRlss;
  });

  test('shows currency spend total when rlssStandard is set', () => {
    plannerState.rlssStandard = 'moderate';
    render(<Step2SpendingGoals onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByText(/Choose a lifestyle above to set your budget/i)).not.toBeInTheDocument();
  });
});
