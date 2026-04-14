import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LEGACY_PLANNER_STORAGE_KEY } from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';
import Step3IncomeSources from '@/components/steps/Step3IncomeSources';

describe('Step3IncomeSources primary residence card', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('renders the primary residence card and persists updates', async () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);

    const assetsTab = screen.getByText('🏦 Assets').closest('button');
    expect(assetsTab).not.toBeNull();
    fireEvent.click(assetsTab as HTMLButtonElement);

    expect(screen.getByText('Primary Residence')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Primary residence enabled' }));

    expect(await screen.findByLabelText('Primary residence current market value')).toBeInTheDocument();

    const valueInput = screen.getByLabelText('Primary residence current market value');
    fireEvent.focus(valueInput);
    fireEvent.change(valueInput, { target: { value: '550000' } });
    fireEvent.blur(valueInput);

    const mortgageInput = screen.getByLabelText('Primary residence outstanding mortgage');
    fireEvent.focus(mortgageInput);
    fireEvent.change(mortgageInput, { target: { value: '125000' } });
    fireEvent.blur(mortgageInput);

    fireEvent.click(screen.getByLabelText('Passes to direct descendants'));

    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY) ?? '{}') as {
        state?: { primaryResidence?: Record<string, unknown> };
      };

      expect(persisted.state?.primaryResidence).toMatchObject({
        enabled: true,
        currentValue: 550000,
        mortgageOutstanding: 125000,
        leavesToDescendants: true,
      });
    });

    expect(usePlannerStore.getState().primaryResidence).toMatchObject({
      enabled: true,
      currentValue: 550000,
      mortgageOutstanding: 125000,
      leavesToDescendants: true,
    });
  });
});
