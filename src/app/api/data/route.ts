import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  PersistenceConfigError,
  RevisionConflictError,
  deletePlannerPersistenceDocument,
  getPlannerPersistenceDocument,
  savePlannerPersistenceDocument,
} from '@/lib/cosmos';
import { rateLimit } from '@/lib/rateLimit';
import { auditLog, sha256Base64FingerprintFromBase64Payload } from '@/lib/auditLog';
import {
  AES_GCM_IV_BYTE_LENGTH,
  MAX_CIPHERTEXT_BYTES,
  MAX_WRAPPED_KEY_BYTES,
  PLANNER_SCHEMA_VERSION,
  getBase64ByteLength,
  isCiphertextWithinSizeLimit,
  isExpectedBase64ByteLength,
  isValidBase64,
  validateCipherPayload,
} from '@/lib/crypto';
import {
  buildPlanSyncResponseHeaders,
  readPlanSyncRequestDebugMetadata,
} from '@/lib/planSyncDebug';

const MAX_CIPHERTEXT_BASE64_LENGTH = Math.ceil((MAX_CIPHERTEXT_BYTES * 4) / 3) + 8;
const MAX_WRAPPED_KEY_BASE64_LENGTH = Math.ceil((MAX_WRAPPED_KEY_BYTES * 4) / 3) + 8;

const DATA_GET_RATE_LIMIT = { windowMs: 60_000, max: 120 };
const DATA_PUT_RATE_LIMIT = { windowMs: 60_000, max: 80 };

const PutPayloadSchema = z.object({
  schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
  baseRevision: z.number().int().nonnegative().optional(),
  iv: z.string().min(1).max(128),
  ciphertext: z.string().min(1).max(MAX_CIPHERTEXT_BASE64_LENGTH),
  keyVersion: z.number().int().positive().optional(),
  wrappedKey: z.string().min(1).max(MAX_WRAPPED_KEY_BASE64_LENGTH).optional(),
}).superRefine((value, ctx) => {
  if (!isValidBase64(value.iv) || !isExpectedBase64ByteLength(value.iv, AES_GCM_IV_BYTE_LENGTH)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['iv'],
      message: 'Invalid iv payload.',
    });
  }

  if (!isValidBase64(value.ciphertext) || !isCiphertextWithinSizeLimit(value.ciphertext)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ciphertext'],
      message: 'Invalid ciphertext payload.',
    });
  }

  if (value.wrappedKey !== undefined) {
    const wrappedKeySize = getBase64ByteLength(value.wrappedKey);
    if (wrappedKeySize === null || wrappedKeySize <= 0 || wrappedKeySize > MAX_WRAPPED_KEY_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['wrappedKey'],
        message: 'Invalid wrappedKey payload.',
      });
    }
  }

  const hasWrappedKey = value.wrappedKey !== undefined;
  const hasKeyVersion = value.keyVersion !== undefined;
  if (hasWrappedKey !== hasKeyVersion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasWrappedKey ? ['keyVersion'] : ['wrappedKey'],
      message: 'keyVersion and wrappedKey must be provided together.',
    });
  }
});

function jsonError(
  message: string,
  status: number,
  extras?: Record<string, number>,
  traceId?: string | null,
) {
  return Response.json(
    { error: message, ...(extras ?? {}) },
    { status, headers: buildPlanSyncResponseHeaders(traceId) },
  );
}

function rateLimitExceeded(resetInMs: number, traceId?: string | null): Response {
  return Response.json(
    { error: 'Rate limit exceeded.' },
    {
      status: 429,
      headers: {
        ...(buildPlanSyncResponseHeaders(traceId) ?? {}),
        'Retry-After': Math.ceil(resetInMs / 1000).toString(),
      },
    },
  );
}

function responseForKnownError(error: unknown, traceId?: string | null): Response {
  if (error instanceof UnauthorizedError) {
    return jsonError('Authentication required.', 401, undefined, traceId);
  }

  if (error instanceof PersistenceConfigError) {
    return jsonError('Persistence is not configured.', 503, undefined, traceId);
  }

  if (error instanceof RevisionConflictError) {
    return jsonError('Revision conflict.', 409, { currentRevision: error.currentRevision }, traceId);
  }

  return jsonError('Unexpected persistence error.', 500, undefined, traceId);
}

export async function GET(request: Request) {
  const { traceId, debugEnabled } = readPlanSyncRequestDebugMetadata(request?.headers);
  try {
    const { userId } = await requireUser();
    if (debugEnabled) {
      auditLog('planner.data.get.request', {
        traceId,
        method: 'GET',
        hasUser: true,
      });
    }

    const limit = rateLimit(`data:get:${userId}`, DATA_GET_RATE_LIMIT);
    if (!limit.ok) return rateLimitExceeded(limit.resetInMs, traceId);
    const persisted = await getPlannerPersistenceDocument(userId);

    if (!persisted) {
      if (debugEnabled) {
        auditLog('planner.data.get.notFound', {
          traceId,
          method: 'GET',
        });
      }
      return new Response('Not found.', {
        status: 404,
        headers: buildPlanSyncResponseHeaders(traceId),
      });
    }

    const validation = validateCipherPayload({
      iv: persisted.iv,
      ciphertext: persisted.ciphertext,
    });

    if (!validation.ok) {
      auditLog('planner.payloadCorrupt', {
        userId,
        reason: validation.reason,
        ivBytes: getBase64ByteLength(persisted.iv),
        ciphertextBytes: getBase64ByteLength(persisted.ciphertext),
        ciphertextFingerprint: sha256Base64FingerprintFromBase64Payload(persisted.ciphertext),
      });
      return jsonError('Corrupt planner payload.', 500, undefined, traceId);
    }

    if (debugEnabled) {
      auditLog('planner.data.get.success', {
        traceId,
        method: 'GET',
        schemaVersion: persisted.schemaVersion,
        revision: persisted.revision,
        hasWrappedKey: persisted.wrappedKey !== undefined,
        hasKeyVersion: persisted.keyVersion !== undefined,
      });
    }

    return Response.json({
      schemaVersion: persisted.schemaVersion,
      revision: persisted.revision,
      iv: persisted.iv,
      ciphertext: persisted.ciphertext,
      keyVersion: persisted.keyVersion,
      wrappedKey: persisted.wrappedKey,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    }, {
      headers: buildPlanSyncResponseHeaders(traceId),
    });
  } catch (error) {
    return responseForKnownError(error, traceId);
  }
}

export async function PUT(request: Request) {
  const { traceId, debugEnabled } = readPlanSyncRequestDebugMetadata(request.headers);
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`data:put:${userId}`, DATA_PUT_RATE_LIMIT);
    if (!limit.ok) return rateLimitExceeded(limit.resetInMs, traceId);
    const body = await request.json().catch(() => null);
    const parsed = PutPayloadSchema.safeParse(body);

    if (!parsed.success) {
      if (debugEnabled) {
        auditLog('planner.data.put.invalid', {
          traceId,
          method: 'PUT',
        });
      }
      return jsonError('Invalid request payload.', 400, undefined, traceId);
    }

    if (debugEnabled) {
      auditLog('planner.data.put.request', {
        traceId,
        method: 'PUT',
        schemaVersion: parsed.data.schemaVersion,
        hasBaseRevision: typeof parsed.data.baseRevision === 'number',
        ivBytes: getBase64ByteLength(parsed.data.iv),
        ciphertextBytes: getBase64ByteLength(parsed.data.ciphertext),
        hasWrappedKey: parsed.data.wrappedKey !== undefined,
        keyVersion: parsed.data.keyVersion ?? null,
      });
    }

    const persisted = await savePlannerPersistenceDocument({
      userId,
      schemaVersion: parsed.data.schemaVersion,
      baseRevision: parsed.data.baseRevision,
      iv: parsed.data.iv,
      ciphertext: parsed.data.ciphertext,
      keyVersion: parsed.data.keyVersion,
      wrappedKey: parsed.data.wrappedKey,
    });

    if (debugEnabled) {
      auditLog('planner.data.put.success', {
        traceId,
        method: 'PUT',
        schemaVersion: persisted.schemaVersion,
        revision: persisted.revision,
        hasWrappedKey: persisted.wrappedKey !== undefined,
        keyVersion: persisted.keyVersion ?? null,
      });
    }

    return Response.json({
      schemaVersion: persisted.schemaVersion,
      revision: persisted.revision,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    }, {
      headers: buildPlanSyncResponseHeaders(traceId),
    });
  } catch (error) {
    if (debugEnabled) {
      auditLog('planner.data.put.error', {
        traceId,
        method: 'PUT',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    return responseForKnownError(error, traceId);
  }
}

// Only available when using Clerk test keys — prevents accidental use in production.
export async function DELETE() {
  if (!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }
  try {
    const { userId } = await requireUser();
    await deletePlannerPersistenceDocument(userId);
    return Response.json({ deleted: true });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';
