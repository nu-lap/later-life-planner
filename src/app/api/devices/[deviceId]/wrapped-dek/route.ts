import { z } from 'zod';
import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  PersistenceConfigError,
  fetchApprovedWrappedDek,
  consumeApprovedWrappedDek,
} from '@/lib/cosmos';
import { rateLimit } from '@/lib/rateLimit';
import { auditLog } from '@/lib/auditLog';

const DeviceIdSchema = z.string().min(8).max(128);
const RequestIdSchema = z.string().min(8).max(128);

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
  return jsonError('Unexpected persistence error.', 500);
}

export async function GET(
  request: Request,
  context: { params: { deviceId: string } },
) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`devices:poll:${userId}`, { windowMs: 30_000, max: 120 });
    if (!limit.ok) return jsonError('Rate limit exceeded.', 429);
    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId');
    if (!requestId) {
      return jsonError('Invalid request payload.', 400);
    }
    const deviceIdParsed = DeviceIdSchema.safeParse(context.params.deviceId);
    const requestIdParsed = RequestIdSchema.safeParse(requestId);
    if (!deviceIdParsed.success || !requestIdParsed.success) {
      return jsonError('Invalid request payload.', 400);
    }

    const wrapped = await fetchApprovedWrappedDek({
      userId,
      deviceId: deviceIdParsed.data,
      requestId: requestIdParsed.data,
    });

    if (!wrapped) {
      return new Response(null, { status: 204 });
    }

    return Response.json({ wrappedKeyPackage: wrapped });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: { deviceId: string } },
) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`devices:consume:${userId}`, { windowMs: 30_000, max: 60 });
    if (!limit.ok) return jsonError('Rate limit exceeded.', 429);
    const body = await request.json().catch(() => null) as unknown;
    const parsed = z.object({ requestId: RequestIdSchema }).safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request payload.', 400);
    }

    const deviceIdParsed = DeviceIdSchema.safeParse(context.params.deviceId);
    if (!deviceIdParsed.success) {
      return jsonError('Invalid request payload.', 400);
    }

    const consumed = await consumeApprovedWrappedDek({
      userId,
      deviceId: deviceIdParsed.data,
      requestId: parsed.data.requestId,
    });

    if (!consumed) {
      return new Response('Not found.', { status: 404 });
    }

    auditLog('device.consumedWrappedDek', {
      userId,
      deviceId: deviceIdParsed.data,
      requestId: parsed.data.requestId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';
