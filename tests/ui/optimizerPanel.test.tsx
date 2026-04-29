import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimizerPanel from '@/components/OptimizerPanel';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import { formatCurrency } from '@/financialEngine/projectionEngine';
import { dcOnlyState, paulAndLisaState } from '../fixtures/states';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OptimizerPanel', () => {
  test('renders optimizer summary cards and expanded strategy defaults', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.getByText('Tax vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Plan durability vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('End-of-plan assets vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Strategy guide')).toBeInTheDocument();
    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText(/These are the strategy definitions for the best option shown in the comparison table below\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all strategy definitions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▼ Show comparison' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▼ Show breakdown' })).toBeInTheDocument();
    expect(screen.queryByTestId('optimizer-drawdown-breakdown-table')).not.toBeInTheDocument();
  });

  test('renders the year-by-year drawdown breakdown table', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    expect(screen.getByRole('button', { name: '▼ Show breakdown' })).toBeInTheDocument();
    expect(screen.queryByTestId('optimizer-drawdown-breakdown-table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    expect(screen.getByText('Drawdown detail by year')).toBeInTheDocument();
    expect(screen.getByTestId('optimizer-drawdown-breakdown-table')).toBeInTheDocument();
    expect(screen.getAllByText('Paul').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lisa').length).toBeGreaterThan(0);
    expect(screen.getByText('Joint')).toBeInTheDocument();
    expect(screen.getAllByText('Pension').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25% Tax Free').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tax due').length).toBeGreaterThan(0);
  });

  test('uses a shaded sticky age column in the drawdown breakdown table', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    const breakdownTable = screen.getByTestId('optimizer-drawdown-breakdown-table');
    const ageHeader = within(breakdownTable).getByRole('columnheader', { name: 'Age' });
    const firstAgeCell = breakdownTable.querySelector('tbody tr:first-child th:first-child');

    expect(ageHeader).not.toBeNull();
    expect(firstAgeCell).not.toBeNull();

    expect(ageHeader.className).toContain('sticky');
    expect(ageHeader.className).toContain('left-0');
    expect(ageHeader.className).toContain('bg-slate');
    expect(ageHeader.className).toContain('border-r');
    expect(ageHeader.className).not.toContain('top-0');

    expect(firstAgeCell!.className).toContain('sticky');
    expect(firstAgeCell!.className).toContain('left-0');
    expect(firstAgeCell!.className).toContain('bg-slate');
    expect(firstAgeCell!.className).toContain('border-r');
  });

  test('shows the first five comparison years by default', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    // Strategy comparison is collapsed by default — expand it first
    const showBtn = screen.getByRole('button', { name: '▼ Show comparison' });
    expect(showBtn).toBeInTheDocument();
    await userEvent.click(showBtn);

    expect(screen.getByRole('button', { name: '▲ Hide comparison' })).toBeInTheDocument();
    expect(screen.getAllByText('Runner-up').length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText('Required net income').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortfall').length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 5 of \d+ years\./)).toBeInTheDocument();
  });

  test('shows best-option strategy definitions by default and expands to the full list on demand', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    expect(screen.getByText('Strategy guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all strategy definitions' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show all strategy definitions' }));

    expect(screen.getByText(/These are the strategy definitions for the best option shown in the comparison table below\./i)).toBeInTheDocument();
    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Partner 1-first DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Proportional DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Partner 2-first DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('ISA-preserve', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
  });

  test('shows single-person strategy definitions with single-mode labels', async () => {
    const plannerState = dcOnlyState(65, 250_000);
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Show all strategy definitions' }));

    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Even DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Proportional DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Alternative DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('ISA-preserve', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.queryByText('Partner 1-first DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).not.toBeInTheDocument();
    expect(screen.queryByText('Partner 2-first DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).not.toBeInTheDocument();
  });

  test('requires consent before generating an explanation and sends a minimised payload', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const fetchMock = vi.fn().mockResolvedValue(new Response('Explanation text', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Explain this recommendation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate explanation' })).toBeDisabled();

    const consentCheckbox = await screen.findByRole('checkbox');
    await waitFor(() => { expect(consentCheckbox).toBeEnabled(); });
    await userEvent.click(consentCheckbox);
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText('Explanation text')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Generate explanation' })).not.toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/optimizer-explain');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    const serialized = JSON.stringify(body);

    expect(body.planRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(body.subject.householdType).toBe('couple');
    expect(body.optimizationResult.yearRecords).toBeUndefined();
    expect(body.consent.scope).toContain('mcp-citations');
    expect(body.consent.scope).toContain('rag-guidance');
    expect(serialized).not.toContain(plannerState.person1.name);
    expect(serialized).not.toContain(plannerState.person2.name);
  });

  test('reuses a saved explanation for the same unchanged plan', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const fetchMock = vi.fn().mockResolvedValue(new Response('Cached explanation text', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    const consentCheckbox1 = await screen.findByRole('checkbox');
    await waitFor(() => { expect(consentCheckbox1).toBeEnabled(); });
    await userEvent.click(consentCheckbox1);
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Cached explanation text')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));

    await waitFor(() => {
      expect(screen.getByText('Cached explanation text')).toBeInTheDocument();
    });
    expect(screen.getByText('This saved explanation matches your current plan. Change your plan to generate a new one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate explanation' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('shows Generate explanation again after the plan changes', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const fetchMock = vi.fn().mockResolvedValue(new Response('Cached explanation text', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    const consentCheckbox2 = await screen.findByRole('checkbox');
    await waitFor(() => { expect(consentCheckbox2).toBeEnabled(); });
    await userEvent.click(consentCheckbox2);
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Cached explanation text')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const changedPlannerState = {
      ...plannerState,
      person1: {
        ...plannerState.person1,
        currentAge: plannerState.person1.currentAge + 1,
      },
    };
    const changedResult = optimizeWithdrawals(changedPlannerState);

    rerender(<OptimizerPanel plannerState={changedPlannerState} result={changedResult} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));

    expect(await screen.findByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate explanation' })).toBeDisabled();
  });

  test('does not split decimals or abbreviations inside dense explanations', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const denseExplanation = 'Hold £1.5m in ISA. e.g. a SIPP is sheltered. Final sentence explains the outcome.';
    const fetchMock = vi.fn().mockResolvedValue(new Response(denseExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Hold £1.5m in ISA. e.g. a SIPP is sheltered.')).toBeInTheDocument();
    });

    expect(screen.queryByText(/^5m in ISA\./)).not.toBeInTheDocument();
    expect(screen.getByText('Final sentence explains the outcome.')).toBeInTheDocument();
  });

  test('renders bullet-list explanations as a list', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const listExplanation = '* Item one\n* Item two';
    const fetchMock = vi.fn().mockResolvedValue(new Response(listExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByTestId('optimizer-explanation-list')).toBeInTheDocument();
    });

    const explanationList = screen.getByTestId('optimizer-explanation-list');
    expect(explanationList).toBeInTheDocument();
    expect(screen.getByText('Item one')).toBeInTheDocument();
    expect(screen.getByText('Item two')).toBeInTheDocument();
  });

  test('splits a dense explanation into readable paragraphs', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const denseExplanation = [
      'First sentence explains the recommendation.',
      'Second sentence explains the tax outcome.',
      'Third sentence explains the asset impact.',
      'Fourth sentence explains the fallback assumptions.',
    ].join(' ');
    const fetchMock = vi.fn().mockResolvedValue(new Response(denseExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('First sentence explains the recommendation. Second sentence explains the tax outcome.')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('optimizer-explanation-paragraph')).toHaveLength(2);
    expect(screen.getByText('Third sentence explains the asset impact. Fourth sentence explains the fallback assumptions.')).toBeInTheDocument();
  });

  test('does not split on decimal numbers inside a dense explanation', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    // Decimal number (£1.5m) must not be treated as a sentence boundary.
    const denseExplanation = [
      'Hold £1.5m in ISA for tax-free growth.',
      'Draw down £0.8m from DC first.',
      'Residual cash covers short-term needs.',
      'Review annually as rules change.',
    ].join(' ');
    const fetchMock = vi.fn().mockResolvedValue(new Response(denseExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Hold £1.5m in ISA for tax-free growth. Draw down £0.8m from DC first.')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('optimizer-explanation-paragraph')).toHaveLength(2);
    expect(screen.getByText('Residual cash covers short-term needs. Review annually as rules change.')).toBeInTheDocument();
  });

  test('renders bullet-list blocks as a list', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const bulletExplanation = 'Summary sentence.\n\n* Use ISA first for tax-free withdrawals.\n* Draw DC within the personal allowance.\n* Keep cash as a short-term buffer.';
    const fetchMock = vi.fn().mockResolvedValue(new Response(bulletExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByTestId('optimizer-explanation-list')).toBeInTheDocument();
    });

    const explanationList = screen.getByTestId('optimizer-explanation-list');
    const listItems = within(explanationList).getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
    expect(listItems[0]).toHaveTextContent('Use ISA first for tax-free withdrawals.');
    expect(listItems[1]).toHaveTextContent('Draw DC within the personal allowance.');
    expect(listItems[2]).toHaveTextContent('Keep cash as a short-term buffer.');
  });

  test('keeps the dialog scrollable and dismissible when the explanation is long', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const longExplanation = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}: explanation detail.`).join('\n');
    const fetchMock = vi.fn().mockResolvedValue(new Response(longExplanation, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    const consentCheckbox3 = await screen.findByRole('checkbox');
    await waitFor(() => { expect(consentCheckbox3).toBeEnabled(); });
    await userEvent.click(consentCheckbox3);
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    const closeButton = await screen.findByRole('button', { name: 'Close' });

    expect(screen.getByTestId('optimizer-explain-panel')).toHaveClass('max-h-[calc(100vh-2rem)]');
    expect(screen.getByTestId('optimizer-explain-body')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('optimizer-explain-body')).toHaveTextContent('Line 1: explanation detail.');

    expect(closeButton).toBeInTheDocument();

    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('shows an error returned by the explanation route', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    const consentCheckbox4 = await screen.findByRole('checkbox');
    await waitFor(() => { expect(consentCheckbox4).toBeEnabled(); });
    await userEvent.click(consentCheckbox4);
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Authentication required.')).toBeInTheDocument();
    });
  });

  test('treats a whitespace-only streamed response as no explanation', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const fetchMock = vi.fn().mockResolvedValue(new Response('\n  \n', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Whitespace-only response should not show the explanation container or "Close" label
    expect(screen.queryByText('Explanation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // "Generate explanation" should still be available since hasExplanation is false
    expect(screen.getByRole('button', { name: 'Generate explanation' })).toBeInTheDocument();
  });
});

describe('OptimizerPanel — Pro gating (proEnabled=false)', () => {
  test('shows optimized summary cards and baseline first-5-year table without blur', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} />);

    expect(screen.getByText('Tax vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Plan durability vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('End-of-plan assets vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Explain this recommendation')).toBeInTheDocument();
    expect(screen.getByText('Baseline waterfall by year (first 5 years)')).toBeInTheDocument();
    expect(screen.getAllByText('Upgrade to Pro to compare optimised alternatives.')).toHaveLength(5);
    expect(screen.queryByText('Optimised strategy comparison')).not.toBeInTheDocument();
  });

  test('clicking Explain this recommendation in non-Pro mode triggers onProCta only', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const onProCta = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} onProCta={onProCta} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));

    expect(onProCta).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('optimizer-explain-panel')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('does not show drawdown breakdown table in non-Pro mode', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} />);
    expect(screen.queryByTestId('optimizer-drawdown-breakdown-table')).not.toBeInTheDocument();
    expect(screen.queryByText('Drawdown detail by year')).not.toBeInTheDocument();
  });

  test('clicking "Show all optimiser years" in non-Pro mode triggers onProCta and keeps years limited', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const onProCta = vi.fn();

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} onProCta={onProCta} />);

    const showAllBtn = screen.getByRole('button', { name: '▼ Show all optimiser years' });
    expect(showAllBtn).toBeInTheDocument();

    await userEvent.click(showAllBtn);

    expect(onProCta).toHaveBeenCalledTimes(1);

    // Year rows in the baseline table should remain limited (≤ 5) — not expanded
    const baselineSection = screen.getByText('Baseline waterfall by year (first 5 years)').closest('div');
    const table = baselineSection?.querySelector('table');
    expect(table?.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(5);
  });

  test('clicking "Show all optimiser years" in Pro mode expands beyond 5 rows', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));
    const showAllBtn = screen.getByRole('button', { name: '▼ Show all optimiser years' });
    expect(showAllBtn).toBeInTheDocument();

    await userEvent.click(showAllBtn);

    const table = screen.getByTestId('optimizer-drawdown-breakdown-table');
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(5);
  });
});

describe('OptimizerPanel — Bed & ISA action columns', () => {
  test('shows "Annual ISA action" column headers when plan has GIA to shelter', async () => {
    // pcls-bed-isa strategy is required to trigger Bed & ISA transfers
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const hasAnyBedIsa = result.baselineProjections.some(p => p.p1BedIsaTransfer > 0 || p.p2BedIsaTransfer > 0);
    expect(hasAnyBedIsa).toBe(true);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    expect(screen.getByText('Annual ISA action')).toBeInTheDocument();
  });

  test('shows ISA transfer footnote when Bed & ISA columns are present', async () => {
    // pcls-bed-isa strategy is required to trigger Bed & ISA transfers
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const hasAnyBedIsa = result.baselineProjections.some(p => p.p1BedIsaTransfer > 0 || p.p2BedIsaTransfer > 0);
    expect(hasAnyBedIsa).toBe(true);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    expect(screen.getAllByText(/Bed & ISA/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/before 5 April/)).toBeInTheDocument();
  });

  test('does not show "Annual ISA action" column when no GIA exists to shelter', async () => {
    // dcOnlyState has no GIA and uses the default standard-ufpls strategy, so B&I transfers are zero
    const plannerState = dcOnlyState(65, 250_000);
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    const table = screen.getByTestId('optimizer-drawdown-breakdown-table');
    expect(table).toBeInTheDocument();
    expect(screen.queryByText('Annual ISA action')).not.toBeInTheDocument();
  });

  test('BedIsaCell shows split breakdown (Into ISA + Covers ISA spending) when ISA withdrawal partially intercepts the transfer', async () => {
    // Year 1 of pcls-bed-isa has p1Isa < p1Bed, so the table cell enters split mode and shows both sub-rows.
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const record1 = result.yearRecords[1]!;
    const proj1 = result.baselineProjections[record1.yearIndex]!;
    const p1Isa = record1.drawdownBreakdown.person1.isa?.grossAmount ?? 0;
    const p1Bed = proj1.p1BedIsaTransfer;
    // Precondition: ISA withdrawal > 0 but less than the transfer — ensures both split sub-rows render
    expect(p1Isa).toBeGreaterThan(0);
    expect(p1Isa).toBeLessThan(p1Bed);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    // Split label replaces the standard "Move to ISA" header
    expect(screen.getAllByText('GIA sold (Bed & ISA)').length).toBeGreaterThanOrEqual(1);
    // Both destination sub-rows must be present (at least one each across all table cells)
    expect(screen.getAllByText('↳ Into ISA:').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('↳ Covers ISA spending:').length).toBeGreaterThanOrEqual(1);
  });

  test('Bed & ISA cells show dash when no transfer needed that year', async () => {
    // pcls-bed-isa strategy is required to trigger Bed & ISA transfers
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const hasAnyBedIsa = result.baselineProjections.some(p => p.p1BedIsaTransfer > 0 || p.p2BedIsaTransfer > 0);
    expect(hasAnyBedIsa).toBe(true);

    // Find a row within the first 5 displayed rows where p1 transfer is zero
    const displayedProjections = result.baselineProjections.slice(0, 5);
    const zeroRowIndex = displayedProjections.findIndex(p => p.p1BedIsaTransfer === 0);
    expect(zeroRowIndex).toBeGreaterThanOrEqual(0);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    // Locate the target row and assert the Annual ISA action cell shows the dash placeholder
    const table = screen.getByTestId('optimizer-drawdown-breakdown-table');
    const bodyRows = table.querySelectorAll('tbody tr');
    const targetRow = bodyRows[zeroRowIndex];
    const cells = targetRow.querySelectorAll('td');
    // For a couple plan: columns are P1×4 + P2×4 + Joint×1 + BedIsa-P1 + BedIsa-P2
    // BedIsa P1 is the second-to-last td
    const bedIsaP1Cell = cells[cells.length - 2];
    expect(bedIsaP1Cell.textContent).toContain('—');
  });
});

describe('OptimizerPanel — Your action plan (Option B)', () => {
  test('renders the action plan section with the first year showing', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    expect(section).toBeInTheDocument();
    expect(within(section).getByText('Your action plan')).toBeInTheDocument();
    // Year selector shows first year's tax year
    expect(within(section).getByText(result.yearRecords[0]!.taxYear)).toBeInTheDocument();
  });

  test('shows year selector with prev and next navigation', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    expect(within(section).getByRole('button', { name: 'Previous year' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Next year' })).toBeInTheDocument();
  });

  test('advances to the next year when Next is clicked in Pro mode', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    const firstYearLabel = result.yearRecords[0]!.taxYear;
    const secondYearLabel = result.yearRecords[1]!.taxYear;

    expect(within(section).getByText(firstYearLabel)).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));

    expect(within(section).getByText(secondYearLabel)).toBeInTheDocument();
    expect(within(section).queryByText(firstYearLabel)).not.toBeInTheDocument();
  });

  test('shows spending target for the selected year', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    expect(within(section).getByText('Spending this year')).toBeInTheDocument();
    expect(within(section).getByText('target net spending for the year')).toBeInTheDocument();
  });

  test('shows ISA action card when plan has B&I transfers', async () => {
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    // Precondition: at least one year must have a B&I transfer
    const firstBedIsaYear = result.baselineProjections.findIndex(
      p => p.p1BedIsaTransfer > 0 || p.p2BedIsaTransfer > 0,
    );
    expect(firstBedIsaYear).toBeGreaterThanOrEqual(0);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    // Navigate forward to the first year that actually has a B&I transfer
    for (let i = 0; i < firstBedIsaYear; i++) {
      await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    }

    expect(within(section).getByText(/Before 5 April — Move to ISA/i)).toBeInTheDocument();
    expect(within(section).getAllByText(/from.*portfolio/).length).toBeGreaterThan(0);
  });

  test('shows pension withdrawal card when DC draw is non-zero', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    // Precondition: year 0 must have a DC pension draw in the baseline
    const bd = result.yearRecords[0]!.baseline.breakdown;
    expect((bd.person1.pension?.grossAmount ?? 0)).toBeGreaterThan(0);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    expect(within(section).getByText(/Pension withdrawals/i)).toBeInTheDocument();
    expect(within(section).getAllByText(/from your pension/).length).toBeGreaterThan(0);
  });

  test('in non-Pro mode clicking Next year triggers onProCta', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);
    const onProCta = vi.fn();

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} onProCta={onProCta} />);

    const section = screen.getByTestId('action-plan-section');
    await userEvent.click(within(section).getByRole('button', { name: 'Unlock all years with Pro' }));

    expect(onProCta).toHaveBeenCalledTimes(1);
    // Should still show first year (not advanced)
    expect(within(section).getByText(result.yearRecords[0]!.taxYear)).toBeInTheDocument();
  });

  test('in non-Pro mode shows first year free hint', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} />);

    const section = screen.getByTestId('action-plan-section');
    expect(within(section).getByText(/First year shown free/i)).toBeInTheDocument();
  });

  test('shows "Bed & ISA strategy active" banner in action plan when ISA spending partially intercepts the transfer', async () => {
    // Year 1 of pcls-bed-isa: p1Isa=18,351 < p1Bed=23,397 → p1BedIsaToSpend=18,351 > 0 → banner shows
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const record1 = result.yearRecords[1]!;
    const proj1 = result.baselineProjections[record1.yearIndex]!;
    const p1Isa = record1.drawdownBreakdown.person1.isa?.grossAmount ?? 0;
    const p1Bed = proj1.p1BedIsaTransfer;
    // Precondition: both amounts > 0 so p1BedIsaToSpend = min(p1Bed, p1Isa) > 0
    expect(p1Isa).toBeGreaterThan(0);
    expect(p1Bed).toBeGreaterThan(0);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    expect(within(section).getByText(record1.taxYear)).toBeInTheDocument();

    // Banner heading must be visible
    expect(within(section).getByText(/Bed & ISA strategy active/i)).toBeInTheDocument();
    // Partial-redirect variant: some of the transfer still enters the ISA (p1BedIsaNetToIsa > 0)
    expect(within(section).getByText(/Part of the planned GIA-to-ISA transfer/i)).toBeInTheDocument();
  });

  test('resets to year 0 when proEnabled flips from true to false', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    const { rerender } = render(
      <OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />,
    );

    const section = screen.getByTestId('action-plan-section');
    // Advance to year 1 in Pro mode
    await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    expect(within(section).getByText(result.yearRecords[1]!.taxYear)).toBeInTheDocument();

    // Downgrade to non-Pro — should snap back to year 0
    rerender(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={false} />);
    expect(within(section).getByText(result.yearRecords[0]!.taxYear)).toBeInTheDocument();
  });
});

describe('OptimizerPanel — ISA/GIA funding breakdown', () => {
  test('shows ISA-funded spending label and Bed & ISA split when ISA withdrawal covers transfer (person 1)', async () => {
    // With pcls-bed-isa, year 5 has p1ShowBed=false (p1Isa=39,413 >= p1Bed=27,371)
    // so the full breakdown renders inside "ISA withdrawal"
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    // Precondition: year 5 must have p1 ISA withdrawal > p1 Bed transfer
    const record5 = result.yearRecords[5]!;
    const proj5 = result.baselineProjections[record5.yearIndex]!;
    const p1Isa = record5.drawdownBreakdown.person1.isa?.grossAmount ?? 0;
    const p1Bed = proj5.p1BedIsaTransfer;
    expect(p1Isa).toBeGreaterThan(0);
    expect(p1Bed).toBeGreaterThan(0);
    expect(p1Isa).toBeGreaterThanOrEqual(p1Bed); // ensures p1ShowBed=false

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    // Navigate forward to year 5
    for (let i = 0; i < 5; i++) {
      await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    }
    expect(within(section).getByText(record5.taxYear)).toBeInTheDocument();

    // The funding breakdown card should be visible
    expect(within(section).getByText("ISA withdrawal")).toBeInTheDocument();
    // Accurate label for the ISA withdrawal amount
    expect(within(section).getByText('ISA-funded spending:')).toBeInTheDocument();
    // Breakdown lines - should now only show tax-free ISA portion (not "From GIA" anymore)
    expect(within(section).getByText('Tax-free from ISA:')).toBeInTheDocument();
    // GIA breakdown should be in the GIA panel with spending amount
    expect(within(section).getByText('💷 GIA withdrawal')).toBeInTheDocument();
    expect(within(section).getAllByText('To spending:').length).toBeGreaterThanOrEqual(1);

    // Validate computed overlap values for ISA > BED scenario:
    // p1BedIsaToSpend = p1Bed (all BED transfer redirected to spending)
    // p1DirectIsaSpend = p1Isa - p1Bed (only existing ISA used for direct spending)
    // p1GiaToSpending = p1GiaWithdrawal + p1Bed
    const p1GiaWithdrawal5 = record5.drawdownBreakdown.person1.gia?.grossAmount ?? 0;
    const p1DirectIsaSpend5 = p1Isa - p1Bed;
    const p1GiaToSpending5 = p1GiaWithdrawal5 + p1Bed;
    expect(within(section).getAllByText(formatCurrency(p1GiaToSpending5, true)).length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText(formatCurrency(p1DirectIsaSpend5, true)).length).toBeGreaterThanOrEqual(1);
  });

  test('shows CGT line in ISA/GIA breakdown when CGT is due', async () => {
    // Year 5 (pcls-bed-isa) has p1CgtPaid=778 and p1ShowBed=false
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const record5 = result.yearRecords[5]!;
    const proj5 = result.baselineProjections[record5.yearIndex]!;
    expect(proj5.p1CgtPaid).toBeGreaterThan(0);
    const p1Isa = record5.drawdownBreakdown.person1.isa?.grossAmount ?? 0;
    expect(p1Isa).toBeGreaterThanOrEqual(proj5.p1BedIsaTransfer); // ensures p1ShowBed=false

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    for (let i = 0; i < 5; i++) {
      await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    }

    // CGT should be shown in the GIA panel now
    expect(within(section).getAllByText(/Capital gains tax due:/).length).toBeGreaterThanOrEqual(1);
  });

  test('shows ISA/GIA breakdown for person 2 in couple mode', async () => {
    // Year 7 (pcls-bed-isa) has p2ShowBed=false (p2Isa=23,865 >= p2Bed=12,478)
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const record7 = result.yearRecords[7]!;
    const proj7 = result.baselineProjections[record7.yearIndex]!;
    const p2Isa = record7.drawdownBreakdown.person2?.isa?.grossAmount ?? 0;
    const p2Bed = proj7.p2BedIsaTransfer;
    expect(p2Isa).toBeGreaterThan(0);
    expect(p2Bed).toBeGreaterThan(0);
    expect(p2Isa).toBeGreaterThanOrEqual(p2Bed); // ensures p2ShowBed=false

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    for (let i = 0; i < 7; i++) {
      await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    }
    expect(within(section).getByText(record7.taxYear)).toBeInTheDocument();

    // Both persons should have ISA-funded spending labels
    const isaFundedLabels = within(section).getAllByText('ISA-funded spending:');
    expect(isaFundedLabels.length).toBeGreaterThanOrEqual(1);
    // Person 2's breakdown should show GIA panel with the transfer info and spending breakdown
    expect(within(section).getByText('💷 GIA withdrawal')).toBeInTheDocument();
    expect(within(section).getAllByText('To spending:').length).toBeGreaterThanOrEqual(1);
    expect(within(section).getAllByText('Tax-free from ISA:').length).toBeGreaterThanOrEqual(1);
  });

  test('does not show ISA funding section when no ISA withdrawal exists', () => {
    // dcOnlyState has no ISA asset, so no ISA withdrawal
    const plannerState = dcOnlyState(65, 250_000);
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    expect(within(section).queryByText("ISA withdrawal")).not.toBeInTheDocument();
    expect(within(section).queryByText('ISA-funded spending:')).not.toBeInTheDocument();
  });

  test('hides ISA withdrawal card and shows BED explanatory text when ISA withdrawal < BED transfer', async () => {
    // Year 1 (pcls-bed-isa) has p1Isa=18,351 < p1Bed=23,397 and p2Isa=18,351 < p2Bed=23,397
    // so p1ShowBed=true and p2ShowBed=true: BED section shown, ISA withdrawal hidden
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    // Preconditions: year 1 must have both persons' ISA withdrawal < BED transfer
    const record1 = result.yearRecords[1]!;
    const proj1 = result.baselineProjections[record1.yearIndex]!;
    const p1Isa = record1.drawdownBreakdown.person1.isa?.grossAmount ?? 0;
    const p1Bed = proj1.p1BedIsaTransfer;
    const p2Isa = record1.drawdownBreakdown.person2?.isa?.grossAmount ?? 0;
    const p2Bed = proj1.p2BedIsaTransfer;
    expect(p1Isa).toBeGreaterThan(0);
    expect(p1Bed).toBeGreaterThan(0);
    expect(p1Isa).toBeLessThan(p1Bed);
    expect(p2Isa).toBeLessThan(p2Bed);

    render(<OptimizerPanel plannerState={plannerState} result={result} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    expect(within(section).getByText(record1.taxYear)).toBeInTheDocument();

    // BED section IS shown with amount moving to ISA
    expect(within(section).getByText('🗓️ Before 5 April — Move to ISA')).toBeInTheDocument();
    // Should show "Move to ISA:" in the new Bed & ISA panel format, including when an amount is rendered inline
    expect(within(section).getAllByText(/Move to ISA:/).length).toBeGreaterThanOrEqual(1);
    // GIA panel should show the breakdown with spending amount
    expect(within(section).getByText('💷 GIA withdrawal')).toBeInTheDocument();
    expect(within(section).getAllByText('To spending:').length).toBeGreaterThanOrEqual(1);

    // Validate computed overlap values for ISA < BED scenario:
    // p1BedIsaToSpend = p1Isa (ISA withdrawal fully covered by redirected BED transfer)
    // p1BedIsaNetToIsa = p1Bed - p1Isa (net amount that actually enters the ISA)
    // p1GiaToSpending = p1GiaWithdrawal + p1Isa
    const p1GiaWithdrawal1 = record1.drawdownBreakdown.person1.gia?.grossAmount ?? 0;
    const p1BedIsaNetToIsa1 = p1Bed - p1Isa;
    const p1GiaToSpending1 = p1GiaWithdrawal1 + p1Isa;
    expect(within(section).getAllByText(formatCurrency(p1GiaToSpending1, true)).length).toBeGreaterThanOrEqual(1);
    // BED panel "Move to ISA:" shows net amount
    const bedPanels = within(section).getAllByText(/Move to ISA:/);
    expect(bedPanels.some(el => el.textContent?.includes(formatCurrency(p1BedIsaNetToIsa1, true)))).toBe(true);

    // ISA withdrawal card is NOT shown
    expect(within(section).queryByText('ISA withdrawal')).not.toBeInTheDocument();
    expect(within(section).queryByText('ISA-funded spending:')).not.toBeInTheDocument();
  });

  test('hides ISA withdrawal card and shows BED explanatory text when ISA withdrawal equals BED transfer', async () => {
    // Patch year 1 so that person 1's ISA withdrawal exactly equals the BED transfer amount
    // (the equality case must also suppress the ISA withdrawal card)
    const plannerState = { ...paulAndLisaState(), drawdownStrategy: 'pcls-bed-isa' as const };
    const result = optimizeWithdrawals(plannerState);

    const record1 = result.yearRecords[1]!;
    const proj1 = result.baselineProjections[record1.yearIndex]!;
    const p1Bed = proj1.p1BedIsaTransfer;
    expect(p1Bed).toBeGreaterThan(0);

    // Clone the result with person 1's ISA withdrawal set exactly equal to their BED transfer
    const patchedRecord1: typeof record1 = {
      ...record1,
      drawdownBreakdown: {
        ...record1.drawdownBreakdown,
        person1: {
          ...record1.drawdownBreakdown.person1,
          isa: { grossAmount: p1Bed },
        },
      },
    };
    const patchedResult = {
      ...result,
      yearRecords: result.yearRecords.map((r, i) => (i === 1 ? patchedRecord1 : r)),
    };

    render(<OptimizerPanel plannerState={plannerState} result={patchedResult} proEnabled={true} />);

    const section = screen.getByTestId('action-plan-section');
    await userEvent.click(within(section).getByRole('button', { name: 'Next year' }));
    expect(within(section).getByText(record1.taxYear)).toBeInTheDocument();

    // BED section IS shown with amount moving to ISA (equality case: only person 2 shows, residual person 1 = £0)
    expect(within(section).getByText('🗓️ Before 5 April — Move to ISA')).toBeInTheDocument();
    // Should show "Move to ISA:" in the new Bed & ISA panel format
    expect(within(section).getAllByText(/Move to ISA:/).length).toBeGreaterThanOrEqual(1);
    // GIA panel should show the breakdown with spending amount
    expect(within(section).getByText('💷 GIA withdrawal')).toBeInTheDocument();
    expect(within(section).getAllByText('To spending:').length).toBeGreaterThanOrEqual(1);

    // Validate computed overlap values for ISA == BED scenario (person 1):
    // p1BedIsaToSpend = p1Bed (= p1Isa, full transfer redirected to spending)
    // p1BedIsaNetToIsa = 0 (nothing net into ISA for person 1)
    // p1GiaToSpending = p1GiaWithdrawal + p1Bed
    const p1GiaWithdrawalEq = patchedRecord1.drawdownBreakdown.person1.gia?.grossAmount ?? 0;
    const p1GiaToSpendingEq = p1GiaWithdrawalEq + p1Bed;
    expect(within(section).getAllByText(formatCurrency(p1GiaToSpendingEq, true)).length).toBeGreaterThanOrEqual(1);

    // ISA withdrawal card is NOT shown
    expect(within(section).queryByText('ISA withdrawal')).not.toBeInTheDocument();
    expect(within(section).queryByText('ISA-funded spending:')).not.toBeInTheDocument();
  });
});
