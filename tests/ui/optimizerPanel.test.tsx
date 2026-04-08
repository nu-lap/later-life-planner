import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimizerPanel from '@/components/OptimizerPanel';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    expect(screen.getByText('Withdrawal plan optimisation')).toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.getByText('Tax impact vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Plan durability vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('End-of-plan assets vs standard approach')).toBeInTheDocument();
    expect(screen.getByText('Strategy guide')).toBeInTheDocument();
    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText(/These are the strategy definitions for the best option shown in the comparison table below\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all strategy definitions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▲ Hide comparison' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▼ Show breakdown' })).toBeInTheDocument();
    expect(screen.queryByTestId('optimizer-drawdown-breakdown-table')).not.toBeInTheDocument();
  });

  test('renders the year-by-year drawdown breakdown table', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    expect(screen.getByRole('button', { name: '▼ Show breakdown' })).toBeInTheDocument();
    expect(screen.queryByTestId('optimizer-drawdown-breakdown-table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '▼ Show breakdown' }));

    expect(screen.getByText('Drawdown breakdown by year')).toBeInTheDocument();
    expect(screen.getByTestId('optimizer-drawdown-breakdown-table')).toBeInTheDocument();
    expect(screen.getByText('Paul')).toBeInTheDocument();
    expect(screen.getByText('Lisa')).toBeInTheDocument();
    expect(screen.getByText('Joint')).toBeInTheDocument();
    expect(screen.getAllByText('Pension').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25% Tax Free').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tax due').length).toBeGreaterThan(0);
  });

  test('shows the first five comparison years by default', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    expect(screen.getByRole('button', { name: '▲ Hide comparison' })).toBeInTheDocument();
    expect(screen.getAllByText('Runner-up').length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText('Required net income').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shortfall').length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing 5 of \d+ years\./)).toBeInTheDocument();
  });

  test('shows best-option strategy definitions by default and expands to the full list on demand', async () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    expect(screen.getByText('Strategy guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all strategy definitions' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show all strategy definitions' }));

    expect(screen.getByText(/These are the strategy definitions for the best option shown in the comparison table below\./i)).toBeInTheDocument();
    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Couple-equal DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Proportional DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Partner 2-first DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('ISA-preserve', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
  });

  test('shows single-person strategy definitions with single-mode labels', async () => {
    const plannerState = dcOnlyState(65, 250_000);
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    await userEvent.click(screen.getByRole('button', { name: 'Show all strategy definitions' }));

    expect(screen.getByText('LLP baseline waterfall', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Even DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Proportional DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('Alternative DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.getByText('ISA-preserve', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).toBeInTheDocument();
    expect(screen.queryByText('Couple-equal DC drawdown', { selector: '#strategy-guide-panel p.text-sm.font-semibold.text-slate-900' })).not.toBeInTheDocument();
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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    const { rerender } = render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    rerender(<OptimizerPanel plannerState={changedPlannerState} result={changedResult} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByTestId('optimizer-explanation-list')).toBeInTheDocument();
    });

    expect(screen.getByRole('list')).toBeInTheDocument();
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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    await userEvent.click(screen.getByRole('button', { name: 'Explain this recommendation' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByTestId('optimizer-explanation-list')).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole('listitem');
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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

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
