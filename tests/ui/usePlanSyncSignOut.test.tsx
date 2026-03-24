import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { usePlannerStore } from '@/store/plannerStore';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

function Harness() {
  usePlanSync();
  return <div />;
}

describe('usePlanSync sign-out handling', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('clears decrypted planner state after sign-out', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data') && (!init?.method || init.method === 'GET')) {
        return new Response('Not found.', { status: 404 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const view = render(<Harness />);

    await waitFor(() => {
      expect(usePlannerStore.getState().lifeVision).toBe('');
    });

    await act(async () => {
      usePlannerStore.getState().setLifeVision('Sensitive plan details');
    });
    expect(usePlannerStore.getState().lifeVision).toBe('Sensitive plan details');

    await act(async () => {
      mockUseAuth.mockReturnValue({ isLoaded: true, userId: null });
      view.rerender(<Harness />);
    });

    await waitFor(() => {
      expect(usePlannerStore.getState().lifeVision).toBe('');
    });

    view.unmount();
  });
});
