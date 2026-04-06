import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimizerPanel from '@/components/OptimizerPanel';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import { paulAndLisaState } from '../fixtures/states';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OptimizerPanel', () => {
  test('renders optimizer summary cards and table', () => {
    const plannerState = paulAndLisaState();
    const result = optimizeWithdrawals(plannerState);

    render(<OptimizerPanel plannerState={plannerState} result={result} />);

    expect(screen.getByText('AI optimizer preview')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Lifetime tax saving')).toBeInTheDocument();
    expect(screen.getByText('Asset depletion age')).toBeInTheDocument();
    expect(screen.getAllByText('LLP baseline waterfall').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Runner-up').length).toBeGreaterThan(0);
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
    expect(screen.getByRole('button', { name: 'Generate explanation' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText('Explanation text')).toBeInTheDocument();
    });

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
    await userEvent.click(screen.getByRole('checkbox'));
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
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate explanation' }));

    await waitFor(() => {
      expect(screen.getByText('Authentication required.')).toBeInTheDocument();
    });
  });
});
