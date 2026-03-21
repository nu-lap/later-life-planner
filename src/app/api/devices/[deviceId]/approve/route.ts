import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  PersistenceConfigError,
  approveDeviceWrappedDek,
  type WrappedDekPackage,
} from '@/lib/cosmos';
import { isValidBase64 } from '@/lib/crypto';
import { rateLimit } from '@/lib/rateLimit';

const WrappedDekPackageSchema = z.object({
  v: z.literal(1),
  suite: z.object({
    kem: z.string().min(1).max(64),
    kdf: z.string().min(1).max(64),
    aead: z.string().min(1).max(64),
  }),
  deviceId: z.string().min(8).max(128),
  requestId: z.string().min(8).max(128),
  enc: z.string().min(1).max(512),
  ciphertext: z.string().min(1).max(2048),
  aad: z.string().min(1).max(1024),
  createdAt: z.string().min(10).max(64),
}).superRefine((value, ctx) => {
  for (const field of ['enc', 'ciphertext', 'aad'] as const) {
    if (!isValidBase64(value[field])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Invalid ${field} payload.`,
      });
    }
  }
});

const PostPayloadSchema = z.object({
  requestId: z.string().min(8).max(128),
  wrappedKeyPackage: WrappedDekPackageSchema,
  expiresAt: z.string().min(10).max(64),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function responseForKnownError(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return jsonError('Authentication required.', 401);
  }
  if (error instanceof PersistenceConfigError) {
    return jsonError('Persistence is not configured.', 503);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) return jsonError('Device not found.', 404);
    if (message.includes('expired')) return jsonError('Approval request expired.', 400);
    if (message.includes('mismatch')) return jsonError('Approval request mismatch.', 400);
    if (message.includes('revoked')) return jsonError('Device is revoked.', 400);
  }
  return jsonError('Unexpected persistence error.', 500);
}

export async function POST(
  request: Request,
  context: { params: { deviceId: string } },
) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`devices:approve:${userId}`, { windowMs: 30_000, max: 20 });
    if (!limit.ok) return jsonError('Rate limit exceeded.', 429);
    const body = await request.json().catch(() => null);
    const parsed = PostPayloadSchema.safeParse(body);
    if (!parsed.success) return jsonError('Invalid request payload.', 400);

    const deviceId = context.params.deviceId;
    if (parsed.data.wrappedKeyPackage.deviceId !== deviceId) {
      return jsonError('Invalid request payload.', 400);
    }
    if (parsed.data.wrappedKeyPackage.requestId !== parsed.data.requestId) {
      return jsonError('Invalid request payload.', 400);
    }

    const expiresAt = new Date(parsed.data.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) return jsonError('Invalid request payload.', 400);

    await approveDeviceWrappedDek({
      userId,
      deviceId,
      requestId: parsed.data.requestId,
      wrappedKeyPackage: parsed.data.wrappedKeyPackage as WrappedDekPackage,
      expiresAt: expiresAt.toISOString(),
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';
