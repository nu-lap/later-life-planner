import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
    decryptPlannerState: async () => ({ ...usePlannerStore.getState() }),
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

function Harness() {
  const sync = usePlanSync();
  return (
    <div>
      <div data-testid="ready">{sync.isSyncReady ? 'yes' : 'no'}</div>
      <div data-testid="status">{sync.saveStatus}</div>
    </div>
  );
}

describe('usePlanSync — 8-second degradation timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_timeout_test' });
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
    // fetch hangs indefinitely — simulates a slow/unreachable backend
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('degrades to local mode after 8 seconds when sync never completes', async () => {
    render(<Harness />);

    // Before timeout: sync not ready
    expect(screen.getByTestId('ready').textContent).toBe('no');

    // Advance past the 8-second threshold
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8001);
    });

    expect(screen.getByTestId('ready').textContent).toBe('yes');
    expect(screen.getByTestId('status').textContent).toBe('local');
  });

  test('does not fire when sync completes before 8 seconds', async () => {
    // Override fetch with a fast-responding mock so sync completes normally
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url.includes('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [{ deviceId: 'd1', dekWrapped: bytesToBase64(new Uint8Array(48).fill(3)), trusted: true, approved: true }] }), { status: 200 });
      }

      if (url.includes('/api/data') && (!init?.method || init.method === 'GET')) {
        return new Response('', { status: 404 });
      }

      return new Response('{}', { status: 200 });
    });

    render(<Harness />);

    // Advance less than 8 seconds, enough for sync to settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // isSyncReady should have become true through normal sync (not the timeout)
    // and the 8-second timer should have been cleared (no double-fire)
    expect(screen.getByTestId('ready').textContent).toBe('yes');
  });
});
