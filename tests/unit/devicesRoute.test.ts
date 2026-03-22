import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  requireUserMock,
  listDeviceRegistrationsMock,
  upsertDeviceRegistrationMock,
  rateLimitMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  listDeviceRegistrationsMock: vi.fn(),
  upsertDeviceRegistrationMock: vi.fn(),
  rateLimitMock: vi.fn(() => ({ ok: true, remaining: 1, resetInMs: 0 })),
}));

vi.mock('@/lib/auth/requireUser', () => {
  class UnauthorizedError extends Error {
    constructor(message = 'Authentication required.') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  }

  return {
    UnauthorizedError,
    requireUser: requireUserMock,
  };
});

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/cosmos', () => {
  class PersistenceConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PersistenceConfigError';
    }
  }

  class DeviceRegistrationConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DeviceRegistrationConflictError';
    }
  }

  return {
    PersistenceConfigError,
    DeviceRegistrationConflictError,
    listDeviceRegistrations: listDeviceRegistrationsMock,
    upsertDeviceRegistration: upsertDeviceRegistrationMock,
  };
});

import { GET, POST } from '@/app/api/devices/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';
import { DeviceRegistrationConflictError } from '@/lib/cosmos';

function base64OfSize(bytes: number): string {
  return Buffer.alloc(bytes, 7).toString('base64');
}

describe('/api/devices route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    listDeviceRegistrationsMock.mockReset();
    upsertDeviceRegistrationMock.mockReset();
    rateLimitMock.mockClear();
  });

  test('GET returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  test('GET returns device list for authenticated requests', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    listDeviceRegistrationsMock.mockResolvedValue([
      {
        id: 'user_123:device:device-1234',
        type: 'device',
        userId: 'user_123',
        deviceId: 'device-1234',
        publicKey: base64OfSize(65),
        status: 'pending',
        requestId: 'req-uuid-1234',
        requestExpiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      devices: expect.any(Array),
    });
    expect(listDeviceRegistrationsMock).toHaveBeenCalledWith('user_123');
  });

  test('POST enforces server TTL regardless of requestExpiresAt input', async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    upsertDeviceRegistrationMock.mockImplementation(async (input: { requestExpiresAt: string }) => ({
      id: `user_123:device:${'device-1234'}`,
      type: 'device',
      userId: 'user_123',
      deviceId: 'device-1234',
      publicKey: base64OfSize(65),
      status: 'pending',
      requestId: 'req-uuid-1234',
      requestExpiresAt: input.requestExpiresAt,
      createdAt: new Date(nowMs).toISOString(),
      lastSeenAt: new Date(nowMs).toISOString(),
    }));

    const response = await POST(
      new Request('http://localhost/api/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'device-1234',
          publicKey: base64OfSize(65),
          requestId: 'req-uuid-1234',
          // Attempt to set a long expiry; server should ignore.
          requestExpiresAt: new Date(nowMs + 365 * 24 * 60 * 60_000).toISOString(),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertDeviceRegistrationMock).toHaveBeenCalledWith({
      userId: 'user_123',
      deviceId: 'device-1234',
      publicKey: base64OfSize(65),
      requestId: 'req-uuid-1234',
      requestExpiresAt: new Date(nowMs + 10 * 60_000).toISOString(),
      label: undefined,
    });
  });

  test('POST rejects invalid public key length', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });

    const response = await POST(
      new Request('http://localhost/api/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'device-1234',
          // X25519-length key (32 bytes) should now fail (P-256 expects 65 bytes).
          publicKey: base64OfSize(32),
          requestId: 'req-uuid-1234',
          requestExpiresAt: new Date().toISOString(),
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(upsertDeviceRegistrationMock).not.toHaveBeenCalled();
  });

  test('POST returns 409 for device registration conflicts', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    upsertDeviceRegistrationMock.mockRejectedValue(
      new DeviceRegistrationConflictError('DeviceId is already registered with a different public key.'),
    );

    const response = await POST(
      new Request('http://localhost/api/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'device-1234',
          publicKey: base64OfSize(65),
          requestId: 'req-uuid-1234',
          requestExpiresAt: new Date().toISOString(),
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'DeviceId is already registered with a different public key.',
    });
  });
});
