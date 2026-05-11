import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LEGACY_PLANNER_STORAGE_KEY } from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';
import { STEP3_IDS } from '@/lib/testIds';
import Step3IncomeSources from '@/components/steps/Step3IncomeSources';

describe('Step3IncomeSources — income/assets tab switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('income and assets tab buttons are rendered', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId(STEP3_IDS.TAB_INCOME)).toBeInTheDocument();
    expect(screen.getByTestId(STEP3_IDS.TAB_ASSETS)).toBeInTheDocument();
  });

  test('clicking assets tab reveals the ISA card', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    expect(screen.getByText('ISA')).toBeInTheDocument();
  });

  test('clicking income tab after assets tab returns to income section', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_INCOME));
    expect(screen.getByText('DC / Personal Pension')).toBeInTheDocument();
  });
});

describe('Step3IncomeSources — ISA and GIA annual contributions', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('ISA yearly contribution input is accessible and accepts a value', async () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));

    fireEvent.click(screen.getByRole('switch', { name: 'Enable ISA' }));
    const input = await screen.findByLabelText('ISA yearly contribution');
    expect(input).toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const state = usePlannerStore.getState();
      expect(state.person1.assets.isaInvestments.annualContribution).toBe(10_000);
    });
  });

  test('GIA individual yearly contribution input is accessible and accepts a value', async () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));

    fireEvent.click(screen.getByRole('switch', { name: 'Enable GIA — Individual' }));
    const input = await screen.findByLabelText('GIA yearly contribution');
    expect(input).toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const state = usePlannerStore.getState();
      expect(state.person1.assets.generalInvestments.annualContribution).toBe(5_000);
    });
  });
});

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
