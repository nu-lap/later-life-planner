import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { createDefaultState } from '@/lib/mockData';
import { extractPersistedPlannerState } from '@/lib/persistedPlan';
import { STATE_PENSION } from '@/config/financialConstants';
import {
  bytesToBase64,
  PLANNER_SCHEMA_VERSION,
} from '@/lib/crypto';
import { plannerDekWrapAad } from '@/lib/deviceCrypto';
import { idbDel, idbSet } from '@/lib/indexedDbKv';

const mockUseAuth = vi.fn();
let mockDecryptedPlan: unknown = null;

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto')>();
  return {
    ...actual,
    importDataEncryptionKeyFromBase64: async () => ({} as CryptoKey),
    decryptPlannerState: async () => {
      if (!mockDecryptedPlan) throw new Error('Missing mocked decrypted plan.');
      return mockDecryptedPlan;
    },
  };
});

vi.mock('@/lib/deviceCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceCrypto')>();
  return {
    ...actual,
    // UI tests here focus on the approval state machine rather than HPKE/WebCrypto compatibility in jsdom.
    // The HPKE implementation is covered by node-environment unit tests.
    unwrapDekToBase64: async (input: { ciphertextB64: string }) => input.ciphertextB64,
  };
});

function plannerAad(userId: string): Record<string, string | number> {
  return { scope: 'planner', schemaVersion: PLANNER_SCHEMA_VERSION, userId };
}

const VALID_IV = bytesToBase64(new Uint8Array(12).fill(1));
const VALID_CIPHERTEXT = bytesToBase64(new Uint8Array(32).fill(2));

function Harness() {
  const sync = usePlanSync();
  return (
    <div>
      <div data-testid="approval-open">{sync.deviceApprovalPrompt.isOpen ? 'yes' : 'no'}</div>
      <div data-testid="approval-error">{sync.deviceApprovalPrompt.error ?? ''}</div>
      <div data-testid="status">{sync.saveStatus}</div>
      <div data-testid="error">{sync.syncError ?? ''}</div>
    </div>
  );
}

describe('usePlanSync device approval', () => {
  beforeEach(async () => {
    mockUseAuth.mockReset();
    vi.restoreAllMocks();
    // Ensure deterministic IDs in tests.
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('req-uuid');
    await idbDel('llp.userDek.user_123');
    await idbDel('llp.deviceKeypair.p256.user_123');
    await idbSet('llp.deviceId.p256.user_123', 'device-abc');
  });

  afterEach(() => {
    mockUseAuth.mockReset();
  });

  test('opens device approval prompt when remote plan exists but DEK is missing', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) {
        return new Response(JSON.stringify({
          schemaVersion: PLANNER_SCHEMA_VERSION,
          revision: 1,
          iv: VALID_IV,
          ciphertext: VALID_CIPHERTEXT,
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && init?.method === 'POST') {
        const parsed = init.body ? JSON.parse(init.body.toString()) as { deviceId: string; requestId: string; requestExpiresAt: string } : null;
        return new Response(JSON.stringify({
          deviceId: parsed?.deviceId ?? 'device-abc',
          status: 'pending',
          requestId: parsed?.requestId ?? 'req-uuid',
          requestExpiresAt: parsed?.requestExpiresAt ?? new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/wrapped-dek')) {
        return new Response(null, { status: 204 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const view = render(<Harness />);

    await waitFor(() => {
      expect(view.getByTestId('approval-open').textContent).toBe('yes');
      expect(view.getByTestId('status').textContent).toBe('approval_required');
      expect(view.getByTestId('error').textContent).toContain('Approve this device');
    });

    view.unmount();
  });

  test('closes approval prompt after wrapped DEK is fetched and remote plan decrypts', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    const devicePublicKeyB64 = 'AAAA';
    const devicePrivateKeyB64 = 'AAAA';
    await idbSet('llp.deviceKeypair.p256.user_123', { publicKeyB64: devicePublicKeyB64, privateKeyB64: devicePrivateKeyB64 });

    const dekB64 = bytesToBase64(new Uint8Array(32).fill(7));
    const plan = extractPersistedPlannerState(createDefaultState(STATE_PENSION.DEFAULT_AGE));
    mockDecryptedPlan = plan;

    const expiresAt = new Date(nowMs + 10 * 60_000).toISOString();
    const aadBytes = plannerDekWrapAad({
      userId: 'user_123',
      deviceId: 'device-abc',
      requestId: 'req-uuid',
      schemaVersion: PLANNER_SCHEMA_VERSION,
      expiresAt,
    });

    const sealed = { encB64: 'AAAA', ciphertextB64: dekB64 };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) {
        return new Response(JSON.stringify({
          schemaVersion: PLANNER_SCHEMA_VERSION,
          revision: 1,
          iv: VALID_IV,
          ciphertext: VALID_CIPHERTEXT,
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && init?.method === 'POST') {
        const parsed = init.body ? JSON.parse(init.body.toString()) as { deviceId: string; requestId: string; requestExpiresAt: string } : null;
        return new Response(JSON.stringify({
          deviceId: parsed?.deviceId ?? 'device-abc',
          status: 'pending',
          requestId: parsed?.requestId ?? 'req-uuid',
          requestExpiresAt: parsed?.requestExpiresAt ?? new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/wrapped-dek')) {
        if (init?.method === 'POST') {
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify({
          wrappedKeyPackage: {
            v: 1,
            suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
            deviceId: 'device-abc',
            requestId: 'req-uuid',
            enc: sealed.encB64,
            ciphertext: sealed.ciphertextB64,
            aad: bytesToBase64(aadBytes),
            createdAt: new Date().toISOString(),
          },
        }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const view = render(<Harness />);

    await waitFor(() => {
      expect(view.getByTestId('approval-open').textContent).toBe('no');
      expect(view.getByTestId('status').textContent).toBe('saved');
    }, { timeout: 8000 });

    view.unmount();
  }, 10_000);

  test('falls back to local mode with a clear error when IndexedDB is unavailable', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const originalIndexedDb = (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });

    const fetchMock = vi.fn(async () => new Response('Unexpected', { status: 500 }));
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    try {
      const view = render(<Harness />);

      await waitFor(() => {
        expect(view.getByTestId('status').textContent).toBe('local');
        expect(view.getByTestId('approval-open').textContent).toBe('no');
        expect(view.getByTestId('error').textContent).toContain('IndexedDB');
      });

      expect(fetchMock).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: originalIndexedDb, configurable: true });
    }
  });

  test('surfaces an error when the wrapped key package AAD is mismatched', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    const devicePublicKeyB64 = 'AAAA';
    const devicePrivateKeyB64 = 'AAAA';
    await idbSet('llp.deviceKeypair.p256.user_123', { publicKeyB64: devicePublicKeyB64, privateKeyB64: devicePrivateKeyB64 });

    const expiresAt = new Date(nowMs + 10 * 60_000).toISOString();
    const expectedAad = plannerDekWrapAad({
      userId: 'user_123',
      deviceId: 'device-abc',
      requestId: 'req-uuid',
      schemaVersion: PLANNER_SCHEMA_VERSION,
      expiresAt,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith('/api/data')) {
        return new Response(JSON.stringify({
          schemaVersion: PLANNER_SCHEMA_VERSION,
          revision: 1,
          iv: VALID_IV,
          ciphertext: VALID_CIPHERTEXT,
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && init?.method === 'POST') {
        const parsed = init.body ? JSON.parse(init.body.toString()) as { deviceId: string; requestId: string; requestExpiresAt: string } : null;
        return new Response(JSON.stringify({
          deviceId: parsed?.deviceId ?? 'device-abc',
          status: 'pending',
          requestId: parsed?.requestId ?? 'req-uuid',
          requestExpiresAt: parsed?.requestExpiresAt ?? new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/wrapped-dek')) {
        return new Response(JSON.stringify({
          wrappedKeyPackage: {
            v: 1,
            suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
            deviceId: 'device-abc',
            requestId: 'req-uuid',
            enc: 'AAAA',
            ciphertext: 'AAAA',
            // Force mismatch: flip 1 byte by replacing expected AAD with a different base64.
            aad: bytesToBase64(new Uint8Array(expectedAad.length).fill(1)),
            createdAt: new Date().toISOString(),
          },
        }), { status: 200 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const view = render(<Harness />);

    await waitFor(() => {
      expect(view.getByTestId('approval-open').textContent).toBe('yes');
    });

    await waitFor(() => {
      expect(view.getByTestId('approval-error').textContent).toContain('AAD mismatch');
    }, { timeout: 8000 });

    view.unmount();
  });
});
