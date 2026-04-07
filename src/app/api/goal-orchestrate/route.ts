import { auditLog } from '@/lib/auditLog';
import { requireUser, UnauthorizedError } from '@/lib/auth/requireUser';
import { GoalOrchestrateRequestSchema } from '@/lib/goalOrchestration';
import { generateGoalPolicyOverride } from '@/lib/llm';
import { rateLimit } from '@/lib/rateLimit';

const GOAL_ORCHESTRATE_RATE_LIMIT = { windowMs: 60_000, max: 20 };

function jsonError(error: string, status: number, details?: Record<string, unknown>): Response {
  return Response.json({ error, ...(details ?? {}) }, { status });
}

function rateLimitExceeded(resetInMs: number): Response {
  const retryAfterSeconds = Math.ceil(resetInMs / 1000);

  return Response.json(
    {
      error: 'Rate limit exceeded.',
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`goal-orchestrate:${userId}`, GOAL_ORCHESTRATE_RATE_LIMIT);
    if (!limit.ok) {
      return rateLimitExceeded(limit.resetInMs);
    }

    const body = await req.json().catch(() => null);
    const parsed = GoalOrchestrateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request payload.', 400, {
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const request = parsed.data;
    const policyOverride = await generateGoalPolicyOverride({
      planSummary: request.planSummary,
      goalRegistry: request.goalRegistry,
      naturalLanguageInput: request.naturalLanguageInput,
    });

    auditLog('goal.orchestrate.request', {
      userId,
      requestId: request.requestId,
      schemaVersion: request.schemaVersion,
      enabledGoalCount: request.goalRegistry.filter((goal) => goal.enabled).length,
      hasNaturalLanguageInput: Boolean(request.naturalLanguageInput?.trim()),
      // Log only structured numeric targets and mode selections; omit free-text
      // rationale which may embed user-provided naturalLanguageInput.
      policyOverrideTargets: {
        minAnnualIncome: policyOverride.minAnnualIncome,
        bequestTarget: policyOverride.bequestTarget,
        careReserveTarget: policyOverride.careReserveTarget,
        dcOrder: policyOverride.dcOrder,
        isaMode: policyOverride.isaMode,
        inflationAdjustSpending: policyOverride.inflationAdjustSpending,
      },
    });

    return Response.json({ policyOverride }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(error.message, 401);
    }

    auditLog('goal.orchestrate.error', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return jsonError('Unexpected goal orchestration error.', 500);
  }
}
