import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { usePlannerStore } from '@/store/plannerStore';
import { bytesToBase64, PLANNER_SCHEMA_VERSION } from '@/lib/crypto';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    importDataEncryptionKeyFromBase64: async () => ({} as CryptoKey),
    decryptPlannerState: async () => ({
      ...usePlannerStore.getState(),
      currentStep: 0,
      maxVisitedStep: 0,
    }),
    encryptPlannerState: async () => ({
      iv: bytesToBase64(new Uint8Array(12).fill(1)),
      ciphertext: bytesToBase64(new Uint8Array(32).fill(2)),
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
    </div>
  );
}

describe('usePlanSync optimistic concurrency (revision conflicts)', () => {
  beforeEach(() => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('enters conflict state on 409 and blocks further saves until reload', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    let putCalls = 0;

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
          iv: bytesToBase64(new Uint8Array(12).fill(4)),
          ciphertext: bytesToBase64(new Uint8Array(32).fill(8)),
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/data') && init?.method === 'PUT') {
        putCalls += 1;
        return new Response(JSON.stringify({ error: 'Revision conflict.', currentRevision: 6 }), { status: 409 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));

    await act(async () => {
      usePlannerStore.getState().setLifeVision('local change 1');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    await waitFor(() => {
      expect(latestSync?.saveStatus).toBe('conflict');
    });
    expect(putCalls).toBe(1);

    await act(async () => {
      usePlannerStore.getState().setLifeVision('local change 2');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    expect(putCalls).toBe(1);
  }, 10_000);
});
