import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { usePlannerStore } from '@/store/plannerStore';
import { bytesToBase64 } from '@/lib/crypto';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    importDataEncryptionKeyFromBase64: async () => ({} as CryptoKey),
    encryptPlannerState: async () => ({
      iv: bytesToBase64(new Uint8Array(12).fill(3)),
      ciphertext: bytesToBase64(new Uint8Array(64).fill(4)),
    }),
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    getUserDekB64: async () => bytesToBase64(new Uint8Array(32).fill(6)),
  };
});

let latestSync: ReturnType<typeof usePlanSync> | null = null;

function Harness() {
  const sync = usePlanSync();
  latestSync = sync;
  return (
    <div>
      <div data-testid="ready">{sync.isSyncReady ? 'yes' : 'no'}</div>
      <div data-testid="status">{sync.saveStatus}</div>
      <div data-testid="savedAt">{sync.lastSavedAt ?? ''}</div>
    </div>
  );
}

describe('usePlanSync save-state transitions', () => {
  beforeEach(() => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
    localStorage.clear();
  });

  test('transitions to saving then saved after a canonical edit', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    let putCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data') && (!init?.method || init.method === 'GET')) {
        return new Response('Not found.', { status: 404 });
      }

      if (url.endsWith('/api/data') && init?.method === 'PUT') {
        putCalls += 1;
        return new Response(JSON.stringify({
          revision: putCalls,
          updatedAt: '2026-03-25T12:00:00.000Z',
        }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));
    await waitFor(() => expect(latestSync?.saveStatus).toBe('saved'));
    const initialPutCalls = putCalls;

    await act(async () => {
      usePlannerStore.getState().setLifeVision('Save-state transition test');
    });

    await waitFor(() => expect(latestSync?.saveStatus).toBe('saving'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    await waitFor(() => expect(latestSync?.saveStatus).toBe('saved'));
    expect(latestSync?.lastSavedAt).toBe('2026-03-25T12:00:00.000Z');
    expect(putCalls).toBeGreaterThan(initialPutCalls);
    expect(fetchMock).toHaveBeenCalled();
  }, 10_000);
});
