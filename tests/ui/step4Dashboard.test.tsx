import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { paulAndLisaState } from '../fixtures/states';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';

const setGoalRegistryMock = vi.fn();
const setCareReserveMock = vi.fn();
const fetchMock = vi.fn();
let plannerState = {
  ...paulAndLisaState(),
  setGoalRegistry: setGoalRegistryMock,
  setCareReserve: setCareReserveMock,
};

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicComponent() {
    return <div data-testid="mock-chart" />;
  },
}));

import Step4Dashboard, { buildOptimizerViewProjections } from '@/components/steps/Step4Dashboard';

describe('Step4Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_OPTIMIZER_ENABLED', 'true');
    plannerState = {
      ...paulAndLisaState(),
      setGoalRegistry: setGoalRegistryMock,
      setCareReserve: setCareReserveMock,
    };
    setGoalRegistryMock.mockReset();
    setCareReserveMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        policyOverride: {
          minAnnualIncome: 60_600,
          rationale: 'Keep annual spending support above the requested floor.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('uses the optimizer panel as the canonical withdrawal guidance section when enabled', async () => {
    plannerState = {
      ...plannerState,
      careReserve: { enabled: true, amount: 75_000 },
    };

    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Simplified tax-efficient withdrawal strategy')).not.toBeInTheDocument();
    expect(screen.getByText('Required net spending')).toBeInTheDocument();
    expect(screen.getByText(/Gross income at/)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Care Reserve at 60'))).toBeInTheDocument();
    expect(screen.getByText(/Protected capital set aside for later-life care/)).toBeInTheDocument();
    expect(screen.getByText('Gross income vs required spending — optimiser view')).toBeInTheDocument();
    expect(screen.getByText('Goal priorities')).toBeInTheDocument();
    expect(screen.queryByText('Current optimiser focus')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all goals' })).toBeInTheDocument();
    expect(screen.getByTestId('goal-card-tax_efficiency')).toBeInTheDocument();
    expect(screen.queryByTestId('goal-card-longevity_protection')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Longevity protection amount')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('reorders goal priorities through the dashboard goal panel', async () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    setGoalRegistryMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Longevity protection down' }));

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const updatedRegistry = setGoalRegistryMock.mock.calls[0][0];
    expect(updatedRegistry[0].id).toBe('tax_efficiency');
    expect(updatedRegistry[1].id).toBe('spending_floor');
    expect(updatedRegistry[2].id).toBe('longevity_protection');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  test('clamps goal target controls to the configured maximum', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    setGoalRegistryMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));
    const amountInput = screen.getByLabelText('Longevity protection amount') as HTMLInputElement;
    const maxValue = Number(amountInput.max);

    fireEvent.change(amountInput, { target: { value: '9999999', valueAsNumber: 9_999_999 } });

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const updatedRegistry = setGoalRegistryMock.mock.calls[0][0];
    const longevityGoal = updatedRegistry.find((entry: { id: string }) => entry.id === 'longevity_protection');
    expect(longevityGoal.targetValue).toBe(maxValue);
  });

  test('links the care reserve goal controls to the canonical care reserve state', () => {
    plannerState = {
      ...plannerState,
      careReserve: { enabled: true, amount: 125_000 },
    };

    render(<Step4Dashboard onBack={vi.fn()} />);
    setCareReserveMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));

    const amountInput = screen.getByLabelText('Care reserve amount') as HTMLInputElement;
    expect(amountInput.value).toBe('125000');

    fireEvent.change(amountInput, { target: { value: '240000', valueAsNumber: 240_000 } });

    expect(setCareReserveMock).toHaveBeenCalledWith({
      enabled: true,
      amount: 240_000,
    });
  });

  test('disabling care reserve in the goal panel updates the canonical care reserve state', () => {
    plannerState = {
      ...plannerState,
      careReserve: { enabled: true, amount: 125_000 },
    };

    render(<Step4Dashboard onBack={vi.fn()} />);
    setCareReserveMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));
    fireEvent.click(within(screen.getByTestId('goal-card-care_reserve')).getByRole('checkbox', { name: 'Enabled' }));

    expect(setCareReserveMock).toHaveBeenCalledWith({
      enabled: false,
      amount: 125_000,
    });
  });

  test('shows only enabled goals in the collapsed view by default', () => {
    plannerState = {
      ...plannerState,
      careReserve: { enabled: true, amount: 115_000 },
    };

    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(screen.getByTestId('goal-card-tax_efficiency')).toBeInTheDocument();
    expect(screen.getByTestId('goal-card-care_reserve')).toBeInTheDocument();
    expect(screen.queryByTestId('goal-card-longevity_protection')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-card-bequest')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Care reserve amount')).not.toBeInTheDocument();
    expect(screen.getByText('Protected capital')).toBeInTheDocument();
    expect(screen.getByText('£115.0k')).toBeInTheDocument();
  });

  test('shows Unset label when goal target value is not set', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));

    expect(screen.getAllByText('Unset').length).toBeGreaterThan(0);
  });

  test('normalizes out-of-range goal target values when rendered with an over-limit stored value', () => {
    const goalRegistryWithOverLimit = plannerState.goalRegistry.map((goal: { id: string }) =>
      goal.id === 'longevity_protection' ? { ...goal, targetValue: 9_999_999 } : goal
    );
    plannerState = {
      ...plannerState,
      goalRegistry: goalRegistryWithOverLimit,
    };

    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const normalizedRegistry = setGoalRegistryMock.mock.calls[0][0];
    const longevityGoal = normalizedRegistry.find((entry: { id: string }) => entry.id === 'longevity_protection');
    fireEvent.click(screen.getByRole('button', { name: 'Show all goals' }));
    const amountInput = screen.getByLabelText('Longevity protection amount') as HTMLInputElement;
    expect(longevityGoal.targetValue).toBe(Number(amountInput.max));
  });

  test('does not crash when goal orchestration request construction fails', async () => {
    plannerState = {
      ...plannerState,
      person1: {
        ...plannerState.person1,
        currentAge: 16,
      },
    };

    render(<Step4Dashboard onBack={vi.fn()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Goal priorities')).toBeInTheDocument();
  });

  test('maps optimiser ending balances into chart projections', () => {
    const state = paulAndLisaState();
    const optimizerResult = optimizeWithdrawals(state);

    const chartRows = buildOptimizerViewProjections(optimizerResult.baselineProjections, optimizerResult);
    const firstOptimizedRow = optimizerResult.yearRecords[0];
    const firstChartRow = chartRows.find((row) => row.yearIndex === firstOptimizedRow.yearIndex);

    expect(firstChartRow).toBeDefined();
    expect(firstChartRow?.p1DcBalance).toBe(firstOptimizedRow.winner.endingBalances.p1DcBalance);
    expect(firstChartRow?.p2DcBalance).toBe(firstOptimizedRow.winner.endingBalances.p2DcBalance);
    expect(firstChartRow?.p1IsaBalance).toBe(firstOptimizedRow.winner.endingBalances.p1IsaBalance);
    expect(firstChartRow?.p2IsaBalance).toBe(firstOptimizedRow.winner.endingBalances.p2IsaBalance);
    expect(firstChartRow?.jointGiaValue).toBe(firstOptimizedRow.winner.endingBalances.jointGiaValue);
  });
});
