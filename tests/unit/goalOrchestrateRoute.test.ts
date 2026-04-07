import { beforeEach, describe, expect, test, vi } from 'vitest';
import { paulAndLisaState } from '../fixtures/states';
import { buildGoalPlanSummary, buildDefaultGoalRegistry } from '@/lib/goalOrchestration';

const {
  requireUserMock,
  rateLimitMock,
  auditLogMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  rateLimitMock: vi.fn(() => ({ ok: true, remaining: 1, resetInMs: 0 })),
  auditLogMock: vi.fn(),
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

vi.mock('@/lib/auditLog', () => ({
  auditLog: auditLogMock,
}));

import { POST } from '@/app/api/goal-orchestrate/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';

function makePayload() {
  const plannerState = paulAndLisaState();
  const goalRegistry = buildDefaultGoalRegistry().map((goal) => {
    if (goal.id === 'bequest') {
      return {
        ...goal,
        priority: 1,
        targetValue: 250_000,
      };
    }

    return {
      ...goal,
      priority: goal.priority + 1,
    };
  });

  return {
    requestId: 'goal_orchestrate_req_1',
    schemaVersion: '1',
    planSummary: buildGoalPlanSummary(plannerState),
    goalRegistry,
    naturalLanguageInput: 'Protect a clear bequest target before extra discretionary spending.',
  };
}

describe('/api/goal-orchestrate route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    rateLimitMock.mockReset();
    rateLimitMock.mockReturnValue({ ok: true, remaining: 1, resetInMs: 60_000 });
    auditLogMock.mockReset();
  });

  test('returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await POST(new Request('http://localhost/api/goal-orchestrate', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  test('returns 429 when rate limited', async () => {
    rateLimitMock.mockReturnValue({ ok: false, remaining: 0, resetInMs: 5_500 });

    const response = await POST(new Request('http://localhost/api/goal-orchestrate', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('6');
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limit exceeded.',
      retryAfterSeconds: 6,
    });
  });

  test('returns 400 for invalid payloads', async () => {
    const payload = makePayload();
    payload.goalRegistry = [];

    const response = await POST(new Request('http://localhost/api/goal-orchestrate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request payload.');
  });

  test('maps a bequest goal to a structured policy override', async () => {
    const response = await POST(new Request('http://localhost/api/goal-orchestrate', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      policyOverride: expect.objectContaining({
        bequestTarget: 250_000,
        isaMode: 'defer',
        rationale: expect.stringContaining('Protect at least'),
      }),
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      'goal.orchestrate.request',
      expect.objectContaining({
        enabledGoalCount: expect.any(Number),
      }),
    );
  });
});
