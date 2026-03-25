import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { LEGACY_PLANNER_STORAGE_KEY, getSyncMigrationDecisionStorageKey } from '@/lib/browserStorageKeys';
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
      iv: bytesToBase64(new Uint8Array(12).fill(2)),
      ciphertext: bytesToBase64(new Uint8Array(64).fill(3)),
    }),
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    getUserDekB64: async () => bytesToBase64(new Uint8Array(32).fill(8)),
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
      <div data-testid="migration-open">{sync.migrationPrompt.isOpen ? 'yes' : 'no'}</div>
      <div data-testid="migration-has-remote">{sync.migrationPrompt.hasRemotePlan ? 'yes' : 'no'}</div>
    </div>
  );
}

describe('usePlanSync migration flow', () => {
  beforeEach(() => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
    localStorage.clear();
  });

  test('opens migration prompt when legacy local plan exists and remote is missing', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    localStorage.setItem(LEGACY_PLANNER_STORAGE_KEY, JSON.stringify({
      state: {
        mode: 'single',
        lifeVision: 'Legacy plan vision',
      },
    }));

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

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));
    expect(latestSync?.migrationPrompt.isOpen).toBe(true);
    expect(latestSync?.migrationPrompt.hasRemotePlan).toBe(false);
  });

  test('importLegacyPlan saves remote data, records decision, and clears legacy cache', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    localStorage.setItem(LEGACY_PLANNER_STORAGE_KEY, JSON.stringify({
      state: {
        mode: 'single',
        lifeVision: 'Legacy import vision',
      },
    }));

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
          revision: 1,
          updatedAt: '2026-03-25T12:00:00.000Z',
        }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));
    expect(latestSync?.migrationPrompt.isOpen).toBe(true);

    await act(async () => {
      await latestSync?.importLegacyPlan();
    });

    await waitFor(() => expect(latestSync?.migrationPrompt.isOpen).toBe(false));
    expect(putCalls).toBe(1);
    expect(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(getSyncMigrationDecisionStorageKey('user_123'))).toBe('imported');
    expect(usePlannerStore.getState().lifeVision).toBe('Legacy import vision');
  });
});

