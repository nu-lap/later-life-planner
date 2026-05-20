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

// ─── BUG-017: GIA base cost callout ──────────────────────────────────────────

describe('Step3IncomeSources — GIA base cost callout (BUG-017)', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('shows base cost warning when GIA has value > 0 and baseCost = 0', async () => {
    usePlannerStore.getState().setP1Asset('generalInvestments', { enabled: true, totalValue: 50000, baseCost: 0 });
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    expect(await screen.findByText(/Enter your original purchase price above/i)).toBeInTheDocument();
  });

  test('hides base cost warning and shows unrealised gain when baseCost > 0', async () => {
    usePlannerStore.getState().setP1Asset('generalInvestments', { enabled: true, totalValue: 50000, baseCost: 20000 });
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    expect(await screen.findByText(/Unrealised gain/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enter your original purchase price above/i)).not.toBeInTheDocument();
  });

  test('no callout when GIA totalValue is 0', async () => {
    usePlannerStore.getState().setP1Asset('generalInvestments', { enabled: true, totalValue: 0, baseCost: 0 });
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    // give the component time to settle
    await screen.findByRole('switch', { name: 'Enable GIA — Individual' });
    expect(screen.queryByText(/Enter your original purchase price above/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unrealised gain/i)).not.toBeInTheDocument();
  });

  test('shows joint GIA base cost warning in couple mode when baseCost = 0 and value > 0', async () => {
    usePlannerStore.setState({ mode: 'couple' });
    usePlannerStore.setState((s) => ({
      jointGia: { ...s.jointGia, enabled: true, totalValue: 200000, baseCost: 0 },
    }));
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByTestId(STEP3_IDS.TAB_ASSETS));
    const warnings = await screen.findAllByText(/Enter your original purchase price above/i);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Step3IncomeSources — guided wizard default behaviour', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('guided wizard is shown by default when the component first renders', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByText(/Skip the wizard and enter manually/i)).toBeInTheDocument();
  });

  test('"Skip the wizard and enter manually" link dismisses the wizard', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByText(/Skip the wizard and enter manually/i));
    expect(screen.queryByText(/Skip the wizard and enter manually/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Re-open guided setup/i)).toBeInTheDocument();
  });

  test('"Re-open guided setup" link shows the wizard again after dismissal', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    fireEvent.click(screen.getByText(/Skip the wizard and enter manually/i));
    fireEvent.click(screen.getByText(/Re-open guided setup/i));
    expect(screen.getByText(/Skip the wizard and enter manually/i)).toBeInTheDocument();
  });
});

describe('Step3IncomeSources — quick entry card', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  function dismissWizard() {
    fireEvent.click(screen.getByText(/Skip the wizard and enter manually/i));
  }

  test('quick entry card is visible after dismissing the wizard', () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    dismissWizard();
    expect(screen.getByText(/Quick entry/i)).toBeInTheDocument();
  });

  test('quick entry expands on toggle and shows pension pot field', async () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    dismissWizard();
    fireEvent.click(screen.getByText(/Quick entry — just the basics/i));
    expect(await screen.findByLabelText('Person 1 pension pot quick entry')).toBeInTheDocument();
  });

  test('"Update plan →" writes pension pot and ISA to store', async () => {
    render(<Step3IncomeSources onBack={vi.fn()} onNext={vi.fn()} />);
    dismissWizard();
    fireEvent.click(screen.getByText(/Quick entry — just the basics/i));

    const pensionInput = await screen.findByLabelText('Person 1 pension pot quick entry');
    fireEvent.focus(pensionInput);
    fireEvent.change(pensionInput, { target: { value: '150000' } });
    fireEvent.blur(pensionInput);

    const isaInput = screen.getByLabelText('Person 1 ISA quick entry');
    fireEvent.focus(isaInput);
    fireEvent.change(isaInput, { target: { value: '50000' } });
    fireEvent.blur(isaInput);

    fireEvent.click(screen.getByText(/Update plan/i));

    const state = usePlannerStore.getState();
    expect(state.person1.incomeSources.dcPension.totalValue).toBe(150_000);
    expect(state.person1.assets.isaInvestments.totalValue).toBe(50_000);
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
