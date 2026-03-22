import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  DeviceRegistrationConflictError,
  PersistenceConfigError,
  activateInitialDeviceRegistration,
} from '@/lib/cosmos';
import { isExpectedBase64ByteLength, isValidBase64 } from '@/lib/crypto';
import { rateLimit } from '@/lib/rateLimit';

const DeviceIdSchema = z.string().min(8).max(128);

const PostPayloadSchema = z.object({
  deviceId: DeviceIdSchema,
  publicKey: z.string().min(1).max(256),
  label: z.string().min(1).max(64).optional(),
}).superRefine((value, ctx) => {
  if (!isValidBase64(value.publicKey)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['publicKey'],
      message: 'Invalid publicKey payload.',
    });
    return;
  }

  if (!isExpectedBase64ByteLength(value.publicKey, 65)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['publicKey'],
      message: 'Invalid publicKey payload.',
    });
  }
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
  if (error instanceof DeviceRegistrationConflictError) {
    return jsonError(error.message, 409);
  }
  return jsonError('Unexpected persistence error.', 500);
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`devices:activate:${userId}`, { windowMs: 30_000, max: 20 });
    if (!limit.ok) return jsonError('Rate limit exceeded.', 429);
    const body = await request.json().catch(() => null);
    const parsed = PostPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request payload.', 400);
    }

    const activated = await activateInitialDeviceRegistration({
      userId,
      deviceId: parsed.data.deviceId,
      publicKey: parsed.data.publicKey,
      label: parsed.data.label,
    });

    return Response.json({
      deviceId: activated.deviceId,
      status: activated.status,
    });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';

