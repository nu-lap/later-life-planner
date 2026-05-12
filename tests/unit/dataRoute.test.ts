import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  requireUserMock,
  getPlannerPersistenceDocumentMock,
  savePlannerPersistenceDocumentMock,
  deletePlannerPersistenceDocumentMock,
  rateLimitMock,
  auditLogMock,
  fingerprintMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  getPlannerPersistenceDocumentMock: vi.fn(),
  savePlannerPersistenceDocumentMock: vi.fn(),
  deletePlannerPersistenceDocumentMock: vi.fn(),
  rateLimitMock: vi.fn(),
  auditLogMock: vi.fn(),
  fingerprintMock: vi.fn(),
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

vi.mock('@/lib/cosmos', () => {
  class PersistenceConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PersistenceConfigError';
    }
  }

  class RevisionConflictError extends Error {
    currentRevision: number;

    constructor(currentRevision: number) {
      super('Revision conflict.');
      this.name = 'RevisionConflictError';
      this.currentRevision = currentRevision;
    }
  }

  return {
    PersistenceConfigError,
    RevisionConflictError,
    getPlannerPersistenceDocument: getPlannerPersistenceDocumentMock,
    savePlannerPersistenceDocument: savePlannerPersistenceDocumentMock,
    deletePlannerPersistenceDocument: deletePlannerPersistenceDocumentMock,
  };
});

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/auditLog', () => ({
  auditLog: auditLogMock,
  sha256Base64FingerprintFromBase64Payload: fingerprintMock,
}));

import { DELETE, GET, PUT } from '@/app/api/data/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';
import { PersistenceConfigError, RevisionConflictError } from '@/lib/cosmos';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    baseRevision: 0,
    iv: Buffer.alloc(12, 1).toString('base64'),
    ciphertext: Buffer.alloc(32, 2).toString('base64'),
    ...overrides,
  };
}

describe('/api/data route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    getPlannerPersistenceDocumentMock.mockReset();
    savePlannerPersistenceDocumentMock.mockReset();
    deletePlannerPersistenceDocumentMock.mockReset();
    rateLimitMock.mockReset();
    rateLimitMock.mockReturnValue({ ok: true, remaining: 1, resetInMs: 60_000 });
    auditLogMock.mockReset();
    fingerprintMock.mockReset();
    fingerprintMock.mockReturnValue('fingerprint');
    delete process.env.CLERK_SECRET_KEY;
  });

  test('GET returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request('http://localhost/api/data'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  test('GET returns 404 when no planner document exists yet', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getPlannerPersistenceDocumentMock.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/data'));

    expect(response.status).toBe(404);
  });

  test('GET returns encrypted planner document metadata', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getPlannerPersistenceDocumentMock.mockResolvedValue({
      id: 'user_123',
      schemaVersion: 1,
      revision: 5,
      iv: Buffer.alloc(12, 4).toString('base64'),
      ciphertext: Buffer.alloc(64, 8).toString('base64'),
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T11:00:00.000Z',
    });

    const response = await GET(new Request('http://localhost/api/data'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      revision: 5,
      iv: Buffer.alloc(12, 4).toString('base64'),
      ciphertext: Buffer.alloc(64, 8).toString('base64'),
      keyVersion: undefined,
      wrappedKey: undefined,
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T11:00:00.000Z',
    });
  });

  test('GET returns 500 when persisted payload is malformed', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    getPlannerPersistenceDocumentMock.mockResolvedValue({
      id: 'user_123',
      schemaVersion: 1,
      revision: 2,
      iv: 'bad',
      ciphertext: 'bad',
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T10:00:00.000Z',
    });

    const response = await GET(new Request('http://localhost/api/data'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Corrupt planner payload.' });
    expect(auditLogMock).toHaveBeenCalledWith('planner.payloadCorrupt', expect.objectContaining({
      userId: 'user_123',
      reason: expect.any(String),
      ciphertextFingerprint: 'fingerprint',
    }));
  });

  test('GET returns 429 when rate limited', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    rateLimitMock.mockReturnValue({ ok: false, remaining: 0, resetInMs: 12_000 });

    const response = await GET(new Request('http://localhost/api/data'));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    await expect(response.json()).resolves.toEqual({ error: 'Rate limit exceeded.' });
  });

  test('PUT rejects malformed payloads', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });

    const response = await PUT(
      new Request('http://localhost/api/data', {
        method: 'PUT',
        body: JSON.stringify({
          schemaVersion: 1,
          iv: 'not-base64',
          ciphertext: 'bad',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(savePlannerPersistenceDocumentMock).not.toHaveBeenCalled();
  });

  test('PUT returns 429 when rate limited', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    rateLimitMock.mockReturnValue({ ok: false, remaining: 0, resetInMs: 2000 });

    const response = await PUT(
      new Request('http://localhost/api/data', {
        method: 'PUT',
        body: JSON.stringify(createPayload()),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('2');
    await expect(response.json()).resolves.toEqual({ error: 'Rate limit exceeded.' });
    expect(savePlannerPersistenceDocumentMock).not.toHaveBeenCalled();
  });

  test('PUT saves encrypted payload and returns revision metadata', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    savePlannerPersistenceDocumentMock.mockResolvedValue({
      id: 'user_123',
      schemaVersion: 1,
      revision: 2,
      iv: Buffer.alloc(12, 1).toString('base64'),
      ciphertext: Buffer.alloc(32, 2).toString('base64'),
      createdAt: '2026-03-20T12:00:00.000Z',
      updatedAt: '2026-03-20T12:05:00.000Z',
    });

    const response = await PUT(
      new Request('http://localhost/api/data', {
        method: 'PUT',
        body: JSON.stringify(createPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(savePlannerPersistenceDocumentMock).toHaveBeenCalledWith({
      userId: 'user_123',
      schemaVersion: 1,
      baseRevision: 0,
      iv: Buffer.alloc(12, 1).toString('base64'),
      ciphertext: Buffer.alloc(32, 2).toString('base64'),
      keyVersion: undefined,
      wrappedKey: undefined,
    });
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      revision: 2,
      createdAt: '2026-03-20T12:00:00.000Z',
      updatedAt: '2026-03-20T12:05:00.000Z',
    });
  });

  test('PUT returns 409 on revision conflicts', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    savePlannerPersistenceDocumentMock.mockRejectedValue(new RevisionConflictError(7));

    const response = await PUT(
      new Request('http://localhost/api/data', {
        method: 'PUT',
        body: JSON.stringify(createPayload()),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Revision conflict.',
      currentRevision: 7,
    });
  });

  test('PUT returns 503 when persistence is not configured', async () => {
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    savePlannerPersistenceDocumentMock.mockRejectedValue(
      new PersistenceConfigError('missing env'),
    );

    const response = await PUT(
      new Request('http://localhost/api/data', {
        method: 'PUT',
        body: JSON.stringify(createPayload()),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Persistence is not configured.',
    });
  });

  test('DELETE returns 404 when CLERK_SECRET_KEY is not a test key', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_live_TESTKEYFORTESTING';

    const response = await DELETE();

    expect(response.status).toBe(404);
    expect(deletePlannerPersistenceDocumentMock).not.toHaveBeenCalled();
  });

  test('DELETE returns 404 when CLERK_SECRET_KEY is absent', async () => {
    const response = await DELETE();

    expect(response.status).toBe(404);
    expect(deletePlannerPersistenceDocumentMock).not.toHaveBeenCalled();
  });

  test('DELETE returns 401 for unauthenticated requests with test key', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_TESTKEYFORTESTING';
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(deletePlannerPersistenceDocumentMock).not.toHaveBeenCalled();
  });

  test('DELETE deletes plan and returns 200 with test key', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_TESTKEYFORTESTING';
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    deletePlannerPersistenceDocumentMock.mockResolvedValue(undefined);

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(deletePlannerPersistenceDocumentMock).toHaveBeenCalledWith('user_123');
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });

  test('DELETE returns 503 when persistence is not configured', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_TESTKEYFORTESTING';
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    deletePlannerPersistenceDocumentMock.mockRejectedValue(
      new PersistenceConfigError('missing env'),
    );

    const response = await DELETE();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Persistence is not configured.',
    });
  });
});
