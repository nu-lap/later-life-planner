import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  requireUserMock,
  approveDeviceWrappedDekMock,
  getDeviceRegistrationMock,
  rateLimitMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  approveDeviceWrappedDekMock: vi.fn(),
  getDeviceRegistrationMock: vi.fn(),
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

  return {
    PersistenceConfigError,
    approveDeviceWrappedDek: approveDeviceWrappedDekMock,
    getDeviceRegistration: getDeviceRegistrationMock,
  };
});

import { POST } from '@/app/api/devices/[deviceId]/approve/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';

function base64OfSize(bytes: number): string {
  return Buffer.alloc(bytes, 8).toString('base64');
}

describe('/api/devices/:deviceId/approve route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    approveDeviceWrappedDekMock.mockReset();
    getDeviceRegistrationMock.mockReset();
    rateLimitMock.mockClear();
  });

  test('returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(401);
  });

  test('rejects invalid payloads', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(400);
    expect(approveDeviceWrappedDekMock).not.toHaveBeenCalled();
  });

  test('rejects when approver device is not active', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getDeviceRegistrationMock.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', {
        method: 'POST',
        body: JSON.stringify({
          approverDeviceId: 'device-approver',
          requestId: 'req-uuid-1234',
          wrappedKeyPackage: {
            v: 1,
            suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
            deviceId: 'device-1',
            requestId: 'req-uuid-1234',
            enc: base64OfSize(32),
            ciphertext: base64OfSize(64),
            aad: base64OfSize(32),
            createdAt: new Date().toISOString(),
          },
        }),
      }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(403);
    expect(approveDeviceWrappedDekMock).not.toHaveBeenCalled();
  });

  test('rejects when path deviceId does not match wrapped package deviceId', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getDeviceRegistrationMock.mockResolvedValue({ status: 'active' });

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', {
        method: 'POST',
        body: JSON.stringify({
          approverDeviceId: 'device-approver',
          requestId: 'req-uuid-1234',
          wrappedKeyPackage: {
            v: 1,
            suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
            deviceId: 'device-2',
            requestId: 'req-uuid-1234',
            enc: base64OfSize(32),
            ciphertext: base64OfSize(64),
            aad: base64OfSize(32),
            createdAt: new Date().toISOString(),
          },
        }),
      }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(400);
    expect(approveDeviceWrappedDekMock).not.toHaveBeenCalled();
  });

  test('passes userId from auth context to persistence layer', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getDeviceRegistrationMock.mockResolvedValue({ status: 'active' });

    const payload = {
      approverDeviceId: 'device-approver',
      requestId: 'req-uuid-1234',
      wrappedKeyPackage: {
        v: 1,
        suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
        deviceId: 'device-1',
        requestId: 'req-uuid-1234',
        enc: base64OfSize(32),
        ciphertext: base64OfSize(64),
        aad: base64OfSize(32),
        createdAt: new Date().toISOString(),
      },
    };

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(204);
    expect(approveDeviceWrappedDekMock).toHaveBeenCalledWith({
      userId: 'user_123',
      deviceId: 'device-1',
      requestId: 'req-uuid-1234',
      wrappedKeyPackage: payload.wrappedKeyPackage,
    });
  });

  test('returns 404 when device approval is attempted by a different user', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_wrong' });
    getDeviceRegistrationMock.mockResolvedValue({ status: 'active' });
    approveDeviceWrappedDekMock.mockImplementation(async (input) => {
      if (input.userId !== 'user_owner') {
        throw new Error('Device registration not found.');
      }
    });

    const payload = {
      approverDeviceId: 'device-approver',
      requestId: 'req-uuid-1234',
      wrappedKeyPackage: {
        v: 1,
        suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
        deviceId: 'device-1',
        requestId: 'req-uuid-1234',
        enc: base64OfSize(32),
        ciphertext: base64OfSize(64),
        aad: base64OfSize(32),
        createdAt: new Date().toISOString(),
      },
    };

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/approve', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ deviceId: 'device-1' }) },
    );

    expect(response.status).toBe(404);
    expect(approveDeviceWrappedDekMock).toHaveBeenCalledWith({
      userId: 'user_wrong',
      deviceId: 'device-1',
      requestId: 'req-uuid-1234',
      wrappedKeyPackage: payload.wrappedKeyPackage,
    });
  });
});
