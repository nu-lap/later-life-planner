import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  requireUserMock,
  fetchApprovedWrappedDekMock,
  consumeApprovedWrappedDekMock,
  rateLimitMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  fetchApprovedWrappedDekMock: vi.fn(),
  consumeApprovedWrappedDekMock: vi.fn(),
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
    fetchApprovedWrappedDek: fetchApprovedWrappedDekMock,
    consumeApprovedWrappedDek: consumeApprovedWrappedDekMock,
  };
});

import { GET, POST } from '@/app/api/devices/[deviceId]/wrapped-dek/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';

describe('/api/devices/:deviceId/wrapped-dek route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    fetchApprovedWrappedDekMock.mockReset();
    consumeApprovedWrappedDekMock.mockReset();
    rateLimitMock.mockClear();
  });

  test('GET returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await GET(
      new Request('http://localhost/api/devices/device-1/wrapped-dek?requestId=req-uuid-1234'),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(401);
  });

  test('GET rejects missing requestId', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });

    const response = await GET(
      new Request('http://localhost/api/devices/device-1/wrapped-dek'),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(400);
    expect(fetchApprovedWrappedDekMock).not.toHaveBeenCalled();
  });

  test('GET rejects unbounded/invalid ids', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    const long = 'x'.repeat(500);

    const response = await GET(
      new Request(`http://localhost/api/devices/${long}/wrapped-dek?requestId=${long}`),
      { params: { deviceId: long } },
    );

    expect(response.status).toBe(400);
    expect(fetchApprovedWrappedDekMock).not.toHaveBeenCalled();
  });

  test('GET returns 404 when no wrapped package exists', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    fetchApprovedWrappedDekMock.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/devices/device-1/wrapped-dek?requestId=req-uuid-1234'),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(404);
  });

  test('GET returns wrapped key package without consuming it', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    fetchApprovedWrappedDekMock.mockResolvedValue({
      v: 1,
      suite: { kem: 'DHKEM(P-256,HKDF-SHA256)', kdf: 'HKDF-SHA256', aead: 'AES-256-GCM' },
      deviceId: 'device-1',
      requestId: 'req-uuid-1234',
      enc: Buffer.alloc(32, 1).toString('base64'),
      ciphertext: Buffer.alloc(64, 2).toString('base64'),
      aad: Buffer.alloc(32, 3).toString('base64'),
      createdAt: new Date().toISOString(),
    });

    const response = await GET(
      new Request('http://localhost/api/devices/device-1/wrapped-dek?requestId=req-uuid-1234'),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(200);
    expect(consumeApprovedWrappedDekMock).not.toHaveBeenCalled();
    expect(fetchApprovedWrappedDekMock).toHaveBeenCalledWith({
      userId: 'user_123',
      deviceId: 'device-1',
      requestId: 'req-uuid-1234',
    });
  });

  test('POST consumes after client confirms decrypt/persist', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    consumeApprovedWrappedDekMock.mockResolvedValue(true);

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/wrapped-dek', {
        method: 'POST',
        body: JSON.stringify({ requestId: 'req-uuid-1234' }),
      }),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(204);
    expect(consumeApprovedWrappedDekMock).toHaveBeenCalledWith({
      userId: 'user_123',
      deviceId: 'device-1',
      requestId: 'req-uuid-1234',
    });
  });

  test('POST returns 404 when no consumable package exists', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    consumeApprovedWrappedDekMock.mockResolvedValue(false);

    const response = await POST(
      new Request('http://localhost/api/devices/device-1/wrapped-dek', {
        method: 'POST',
        body: JSON.stringify({ requestId: 'req-uuid-1234' }),
      }),
      { params: { deviceId: 'device-1' } },
    );

    expect(response.status).toBe(404);
  });
});
