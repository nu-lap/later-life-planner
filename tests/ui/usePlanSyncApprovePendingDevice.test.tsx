import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { bytesToBase64 } from '@/lib/crypto';
import type { DeviceRegistrationDocument } from '@/lib/cosmos';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    importDataEncryptionKeyFromBase64: async () => ({} as CryptoKey),
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    getUserDekB64: async () => bytesToBase64(new Uint8Array(32).fill(7)),
    setUserDekB64: async () => {},
    publicKeyFingerprintB64: async () => 'AAAAAAAAAAAAAAAAAAAAAA==',
    hpkeSealForRecipient: async () => ({ encB64: 'enc', ciphertextB64: 'ciphertext' }),
  };
});

let latestSync: ReturnType<typeof usePlanSync> | null = null;

function Harness() {
  const sync = usePlanSync();
  latestSync = sync;
  return (
    <div>
      <div data-testid="ready">{sync.isSyncReady ? 'yes' : 'no'}</div>
    </div>
  );
}

describe('usePlanSync approvePendingDevice', () => {
  beforeEach(async () => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
  });

  test('re-fetches devices directory before approving', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const device: DeviceRegistrationDocument = {
      id: 'user_123:device:dev',
      type: 'device',
      userId: 'user_123',
      deviceId: 'device-abc',
      publicKey: 'pub',
      status: 'pending',
      requestId: 'req-uuid-1234',
      requestExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) {
        return new Response('Not found.', { status: 404 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [device] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/approve') && init?.method === 'POST') {
        return new Response(null, { status: 204 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);

    await waitFor(() => {
      expect(latestSync?.isSyncReady).toBe(true);
    });

    const approvalCode = JSON.stringify({
      v: 1,
      deviceId: 'device-abc',
      requestId: 'req-uuid-1234',
      expiresAt: device.requestExpiresAt,
      publicKeyFingerprint: 'AAAAAAAAAAAAAAAAAAAAAA==',
    });

    await act(async () => {
      await latestSync!.approvePendingDevice(approvalCode);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/devices', { cache: 'no-store' });
  });
});
