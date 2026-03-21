import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { usePlanSync } from '@/hooks/usePlanSync';
import { createDefaultState } from '@/lib/mockData';
import { extractPersistedPlannerState } from '@/lib/persistedPlan';
import { STATE_PENSION } from '@/config/financialConstants';
import {
  bytesToBase64,
  encryptPlannerState,
  exportDataEncryptionKeyToBase64,
  generateDataEncryptionKey,
  importDataEncryptionKeyFromBase64,
  PLANNER_SCHEMA_VERSION,
} from '@/lib/crypto';
import { plannerDekWrapAad } from '@/lib/deviceCrypto';
import { idbSet } from '@/lib/indexedDbKv';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

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

function Harness() {
  const sync = usePlanSync();
  return (
    <div>
      <div data-testid="approval-open">{sync.deviceApprovalPrompt.isOpen ? 'yes' : 'no'}</div>
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
    await idbSet('llp.deviceId.user_123', 'device-abc');
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
          iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
          ciphertext: 'AAAAAAAA',
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && init?.method === 'POST') {
        return new Response('{}', { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/wrapped-dek')) {
        return new Response('Not found.', { status: 404 });
      }

      return new Response('Unexpected', { status: 500 });
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const view = render(<Harness />);

    await waitFor(() => {
      expect(view.getByTestId('approval-open').textContent).toBe('yes');
      expect(view.getByTestId('error').textContent).toContain('Device approval required');
    });

    view.unmount();
  });

  test('closes approval prompt after wrapped DEK is fetched and remote plan decrypts', async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });

    const devicePublicKeyB64 = 'AAAA';
    const devicePrivateKeyB64 = 'AAAA';
    await idbSet('llp.deviceKeypair.user_123', { publicKeyB64: devicePublicKeyB64, privateKeyB64: devicePrivateKeyB64 });

    const dekKey = await generateDataEncryptionKey();
    const dekB64 = await exportDataEncryptionKeyToBase64(dekKey);
    const dekCryptoKey = await importDataEncryptionKeyFromBase64(dekB64);

    const plan = extractPersistedPlannerState(createDefaultState(STATE_PENSION.DEFAULT_AGE));
    const encrypted = await encryptPlannerState(plan, dekCryptoKey, plannerAad('user_123'));

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const aadBytes = plannerDekWrapAad({
      userId: 'user_123',
      deviceId: 'device-abc',
      requestId: 'req-uuid',
      schemaVersion: PLANNER_SCHEMA_VERSION,
      expiresAt,
    });

    const sealed = { encB64: 'AAAA', ciphertextB64: dekB64 };

    let wrappedServed = false;
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
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          updatedAt: new Date().toISOString(),
        }), { status: 200 });
      }

      if (url.endsWith('/api/devices') && init?.method === 'POST') {
        return new Response('{}', { status: 200 });
      }

      if (url.endsWith('/api/devices') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ devices: [] }), { status: 200 });
      }

      if (url.includes('/api/devices/') && url.includes('/wrapped-dek')) {
        if (wrappedServed) return new Response('Not found.', { status: 404 });
        wrappedServed = true;
        return new Response(JSON.stringify({
          wrappedKeyPackage: {
            v: 1,
            suite: { kem: 'DHKEM(X25519,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
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
  });
});
