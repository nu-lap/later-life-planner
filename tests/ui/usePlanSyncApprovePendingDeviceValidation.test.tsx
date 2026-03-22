import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import type { DeviceRegistrationDocument } from '@/lib/cosmos';
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
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    getUserDekB64: async () => bytesToBase64(new Uint8Array(32).fill(7)),
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

function makeDevice(overrides: Partial<DeviceRegistrationDocument> = {}): DeviceRegistrationDocument {
  const now = new Date().toISOString();
  return {
    id: 'user_123:device:device-abc',
    type: 'device',
    userId: 'user_123',
    deviceId: 'device-abc',
    publicKey: bytesToBase64(new Uint8Array(65).fill(1)),
    status: 'pending',
    requestId: 'req-uuid-1234',
    requestExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

describe('usePlanSync approvePendingDevice validation', () => {
  beforeEach(() => {
    latestSync = null;
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
  });

  test('rejects when requestId does not match pending device request', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    const device = makeDevice();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) return new Response('Not found.', { status: 404 });
      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [device] }), { status: 200 });
      }
      return new Response('Unexpected', { status: 500 });
    });
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);
    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));

    const approvalCode = JSON.stringify({
      v: 1,
      deviceId: device.deviceId,
      requestId: 'req-wrong-9999',
      expiresAt: device.requestExpiresAt,
      publicKeyFingerprint: 'AAAAAAAAAAAAAAAAAAAAAA==',
    });

    await expect(act(async () => {
      await latestSync!.approvePendingDevice(approvalCode);
    })).rejects.toThrow('Approval code does not match the pending device request.');
  });

  test('rejects when approval request is expired', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    const device = makeDevice({ requestExpiresAt: new Date(Date.now() - 60_000).toISOString() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) return new Response('Not found.', { status: 404 });
      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [device] }), { status: 200 });
      }
      return new Response('Unexpected', { status: 500 });
    });
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);
    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));

    const approvalCode = JSON.stringify({
      v: 1,
      deviceId: device.deviceId,
      requestId: device.requestId,
      expiresAt: device.requestExpiresAt,
      publicKeyFingerprint: 'AAAAAAAAAAAAAAAAAAAAAA==',
    });

    await expect(act(async () => {
      await latestSync!.approvePendingDevice(approvalCode);
    })).rejects.toThrow('Approval request expired.');
  });

  test('rejects when public key fingerprint does not match', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    const device = makeDevice();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) return new Response('Not found.', { status: 404 });
      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [device] }), { status: 200 });
      }
      return new Response('Unexpected', { status: 500 });
    });
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    render(<Harness />);
    await waitFor(() => expect(latestSync?.isSyncReady).toBe(true));

    const approvalCode = JSON.stringify({
      v: 1,
      deviceId: device.deviceId,
      requestId: device.requestId,
      expiresAt: device.requestExpiresAt,
      publicKeyFingerprint: bytesToBase64(new Uint8Array(32).fill(9)),
    });

    await expect(act(async () => {
      await latestSync!.approvePendingDevice(approvalCode);
    })).rejects.toThrow('Approval code does not match the device key fingerprint.');
  });
});

