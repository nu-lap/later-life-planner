import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  requireUserMock,
  activateInitialDeviceRegistrationMock,
  rateLimitMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  activateInitialDeviceRegistrationMock: vi.fn(),
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
    activateInitialDeviceRegistration: activateInitialDeviceRegistrationMock,
  };
});

import { POST } from '@/app/api/devices/activate/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';

function base64OfSize(bytes: number): string {
  return Buffer.alloc(bytes, 9).toString('base64');
}

describe('/api/devices/activate route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    activateInitialDeviceRegistrationMock.mockReset();
    rateLimitMock.mockClear();
  });

  test('returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await POST(
      new Request('http://localhost/api/devices/activate', { method: 'POST', body: '{}' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
    expect(activateInitialDeviceRegistrationMock).not.toHaveBeenCalled();
  });

  test('rejects invalid payloads', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });

    const response = await POST(
      new Request('http://localhost/api/devices/activate', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'short',
          publicKey: 'bad',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(activateInitialDeviceRegistrationMock).not.toHaveBeenCalled();
  });

  test('passes userId from verified auth context', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    activateInitialDeviceRegistrationMock.mockResolvedValue({
      deviceId: 'device-1234',
      status: 'active',
    });

    const response = await POST(
      new Request('http://localhost/api/devices/activate', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: 'device-1234',
          publicKey: base64OfSize(65),
          label: 'Laptop',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(activateInitialDeviceRegistrationMock).toHaveBeenCalledWith({
      userId: 'user_123',
      deviceId: 'device-1234',
      publicKey: base64OfSize(65),
      label: 'Laptop',
    });
  });
});

