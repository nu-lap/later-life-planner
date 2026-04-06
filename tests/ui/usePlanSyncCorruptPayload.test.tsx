import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { bytesToBase64, PLANNER_SCHEMA_VERSION } from '@/lib/crypto';
import { usePlannerStore } from '@/store/plannerStore';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    importDataEncryptionKeyFromBase64: async () => ({} as CryptoKey),
    decryptPlannerState: vi.fn(async () => {
      throw new Error('Decrypt should not run for malformed payloads.');
    }),
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    getUserDekB64: async () => bytesToBase64(new Uint8Array(32).fill(7)),
    setUserDekB64: async () => {},
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
      <div data-testid="error">{sync.syncError ?? ''}</div>
    </div>
  );
}

describe('usePlanSync corrupted payload handling', () => {
  beforeEach(() => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('enters error state when the remote payload is malformed', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          schemaVersion: PLANNER_SCHEMA_VERSION,
          revision: 5,
          iv: 'bad',
          ciphertext: bytesToBase64(new Uint8Array(32).fill(8)),
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));
    expect(latestSync?.saveStatus).toBe('error');
    expect(latestSync?.syncError).toBe(
      'Saved plan data is corrupted or unreadable. Your plan has not been changed. Contact support for recovery.',
    );
  });

  test('treats server 500 corrupt payload response as a recoverable error', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ error: 'Corrupt planner payload.' }), { status: 500 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));
    expect(latestSync?.saveStatus).toBe('error');
    expect(latestSync?.syncError).toBe(
      'Saved plan data is corrupted or unreadable. Your plan has not been changed. Contact support for recovery.',
    );
  });
});
