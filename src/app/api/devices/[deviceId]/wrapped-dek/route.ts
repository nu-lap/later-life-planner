import { UnauthorizedError, requireUser } from '@/lib/auth/requireUser';
import {
  PersistenceConfigError,
  consumeApprovedWrappedDek,
} from '@/lib/cosmos';
import { rateLimit } from '@/lib/rateLimit';

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

    const wrapped = await consumeApprovedWrappedDek({
      userId,
      deviceId: context.params.deviceId,
      requestId,
    });

    if (!wrapped) {
      return new Response('Not found.', { status: 404 });
    }

    return Response.json({ wrappedKeyPackage: wrapped });
  } catch (error) {
    return responseForKnownError(error);
  }
}

export const runtime = 'nodejs';
