import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { paulAndLisaState } from '../fixtures/states';

const setGoalRegistryMock = vi.fn();
const plannerState = {
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
    vi.stubEnv('NEXT_PUBLIC_OPTIMIZER_ENABLED', 'true');
    setGoalRegistryMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('uses the optimizer panel as the canonical withdrawal guidance section when enabled', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Simplified tax-efficient withdrawal strategy')).not.toBeInTheDocument();
    expect(screen.getByText('Required net spending')).toBeInTheDocument();
    expect(screen.getByText(/Gross income at/)).toBeInTheDocument();
    expect(screen.getByText('Gross income vs required spending — optimiser view')).toBeInTheDocument();
    expect(screen.getByText('Goal priorities')).toBeInTheDocument();
  });

  test('reorders goal priorities through the dashboard goal panel', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Longevity protection down' }));

    expect(setGoalRegistryMock).toHaveBeenCalledTimes(1);
    const updatedRegistry = setGoalRegistryMock.mock.calls[0][0];
    expect(updatedRegistry[0].id).toBe('spending_floor');
    expect(updatedRegistry[1].id).toBe('longevity_protection');
  });
});
