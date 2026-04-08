import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { paulAndLisaState } from '../fixtures/states';

const setGoalRegistryMock = vi.fn();
const fetchMock = vi.fn();
let plannerState = {
  ...paulAndLisaState(),
  setGoalRegistry: setGoalRegistryMock,
};

vi.mock('@/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

vi.mock('next/dynamic', () => ({
  default: () => function MockDynamicComponent() {
    return <div data-testid="mock-chart" />;
  },
}));

import Step4Dashboard from '@/components/steps/Step4Dashboard';

describe('Step4Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_OPTIMIZER_ENABLED', 'true');
    plannerState = {
      ...paulAndLisaState(),
      setGoalRegistry: setGoalRegistryMock,
    };
    setGoalRegistryMock.mockReset();
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
    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Simplified tax-efficient withdrawal strategy')).not.toBeInTheDocument();
    expect(screen.getByText('Required net spending')).toBeInTheDocument();
    expect(screen.getByText(/Gross income at/)).toBeInTheDocument();
    expect(screen.getByText('Gross income vs required spending — optimiser view')).toBeInTheDocument();
    expect(screen.getByText('Goal priorities')).toBeInTheDocument();
    expect(screen.queryByText('Optimiser is using these priorities')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Longevity protection amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Longevity protection slider')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('reorders goal priorities through the dashboard goal panel', async () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Longevity protection down' }));

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const updatedRegistry = setGoalRegistryMock.mock.calls[0][0];
    expect(updatedRegistry[0].id).toBe('spending_floor');
    expect(updatedRegistry[1].id).toBe('longevity_protection');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  test('clamps goal target controls to the configured maximum', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    const amountInput = screen.getByLabelText('Longevity protection amount') as HTMLInputElement;
    const maxValue = Number(amountInput.max);

    fireEvent.change(amountInput, { target: { value: '9999999', valueAsNumber: 9_999_999 } });

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const updatedRegistry = setGoalRegistryMock.mock.calls[0][0];
    const longevityGoal = updatedRegistry.find((entry: { id: string }) => entry.id === 'longevity_protection');
    expect(longevityGoal.targetValue).toBe(maxValue);
  });

  test('shows Unset label when goal target value is not set', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

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
});
