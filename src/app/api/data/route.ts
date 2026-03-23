import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  PersistenceConfigError,
  RevisionConflictError,
  getPlannerPersistenceDocument,
  savePlannerPersistenceDocument,
} from '@/lib/cosmos';
import { rateLimit } from '@/lib/rateLimit';
import {
  AES_GCM_IV_BYTE_LENGTH,
  MAX_CIPHERTEXT_BYTES,
  MAX_WRAPPED_KEY_BYTES,
  PLANNER_SCHEMA_VERSION,
  getBase64ByteLength,
  isCiphertextWithinSizeLimit,
  isExpectedBase64ByteLength,
  isValidBase64,
} from '@/lib/crypto';

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

function jsonError(message: string, status: number, extras?: Record<string, number>) {
  return Response.json(
    { error: message, ...(extras ?? {}) },
    { status },
  );
}

function rateLimitExceeded(resetInMs: number): Response {
  return Response.json(
    { error: 'Rate limit exceeded.' },
    {
      status: 429,
      headers: { 'Retry-After': Math.ceil(resetInMs / 1000).toString() },
    },
  );
}

function responseForKnownError(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return jsonError('Authentication required.', 401);
  }

  if (error instanceof PersistenceConfigError) {
    return jsonError('Persistence is not configured.', 503);
  }

  if (error instanceof RevisionConflictError) {
    return jsonError('Revision conflict.', 409, { currentRevision: error.currentRevision });
  }

  return jsonError('Unexpected persistence error.', 500);
}

export async function GET() {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`data:get:${userId}`, DATA_GET_RATE_LIMIT);
    if (!limit.ok) return rateLimitExceeded(limit.resetInMs);
    const persisted = await getPlannerPersistenceDocument(userId);

    if (!persisted) {
      return new Response('Not found.', { status: 404 });
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
    });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`data:put:${userId}`, DATA_PUT_RATE_LIMIT);
    if (!limit.ok) return rateLimitExceeded(limit.resetInMs);
    const body = await request.json().catch(() => null);
    const parsed = PutPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('Invalid request payload.', 400);
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

    return Response.json({
      schemaVersion: persisted.schemaVersion,
      revision: persisted.revision,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';
