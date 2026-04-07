import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { paulAndLisaState } from '../fixtures/states';

const plannerState = paulAndLisaState();

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('uses the optimizer panel as the canonical withdrawal guidance section when enabled', () => {
    render(<Step4Dashboard onBack={vi.fn()} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Simplified tax-efficient withdrawal strategy')).not.toBeInTheDocument();
  });
});
