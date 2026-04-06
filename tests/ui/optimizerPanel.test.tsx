import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import OptimizerPanel from '@/components/OptimizerPanel';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import { paulAndLisaState } from '../fixtures/states';

describe('OptimizerPanel', () => {
  test('renders optimizer summary cards and table', () => {
    const result = optimizeWithdrawals(paulAndLisaState());

    render(<OptimizerPanel result={result} />);

    expect(screen.getByText('AI optimizer preview')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Lifetime tax saving')).toBeInTheDocument();
    expect(screen.getByText('Asset depletion age')).toBeInTheDocument();
    expect(screen.getAllByText('LLP baseline waterfall').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Runner-up').length).toBeGreaterThan(0);
  });
});
