import { auditLog } from '@/lib/auditLog';
import { requireUser, UnauthorizedError } from '@/lib/auth/requireUser';
import { collectHmrcRuleCitations } from '@/lib/hmrcMcp';
import {
  getConfiguredLlmProvider,
  type PlanSummary,
  type LlmProvider,
  LlmConfigError,
  streamExplanation,
} from '@/lib/llm';
import {
  type ConsentScope,
  type RuleCitation,
  OptimizerExplainRequestSchema,
} from '@/lib/optimizerExplain';
import { rateLimit } from '@/lib/rateLimit';

const EXPLAIN_RATE_LIMIT = { windowMs: 60_000, max: 20 };
const MCP_CITATIONS_SCOPE: ConsentScope = 'mcp-citations';

function jsonError(error: string, status: number, details?: Record<string, unknown>): Response {
  return Response.json({ error, ...(details ?? {}) }, { status });
}

function rateLimitExceeded(resetInMs: number): Response {
  return jsonError('Rate limit exceeded.', 429, {
    retryAfterSeconds: Math.ceil(resetInMs / 1000),
  });
}

function iteratorToReadableStream(iterator: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      if (typeof iterator.return === 'function') {
        await iterator.return(undefined);
      }
    },
  });
}

function buildPlanSummary(request: ReturnType<typeof OptimizerExplainRequestSchema.parse>): PlanSummary {
  return {
    householdType: request.subject.householdType,
    ages: request.subject.ages,
    jurisdiction: request.subject.jurisdiction,
    guaranteedIncomeAnnual: request.financialSummary.guaranteedIncomeAnnual,
    dcTotal: request.financialSummary.dcTotal,
    isaTotal: request.financialSummary.isaTotal,
    giaTotal: request.financialSummary.giaTotal,
    targetSpendingAnnual: request.financialSummary.targetSpendingAnnual,
    planRevision: request.planRevision,
  };
}

async function loadHmrcCitations(
  request: ReturnType<typeof OptimizerExplainRequestSchema.parse>,
): Promise<RuleCitation[]> {
  if (!request.consent.scope.includes(MCP_CITATIONS_SCOPE)) {
    return [];
  }

  try {
    return await collectHmrcRuleCitations(request.optimizationResult.ruleProvenance);
  } catch (error) {
    auditLog('optimizer.explain.citationsUnavailable', {
      requestId: request.requestId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

function logExplainRequest(
  userId: string,
  request: ReturnType<typeof OptimizerExplainRequestSchema.parse>,
  provider: LlmProvider,
  citationCount: number,
): void {
  auditLog('optimizer.explain.request', {
    userId,
    requestId: request.requestId,
    planRevision: request.planRevision,
    schemaVersion: request.schemaVersion,
    consentScope: request.consent.scope,
    provider,
    citationCount,
    ruleCount: request.optimizationResult.ruleProvenance.length,
  });
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const limit = rateLimit(`optimizer:explain:${userId}`, EXPLAIN_RATE_LIMIT);
    if (!limit.ok) {
      return rateLimitExceeded(limit.resetInMs);
    }

    const body = await req.json().catch(() => null);
    const parsed = OptimizerExplainRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid request payload.', 400, {
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const request = parsed.data;
    const provider = getConfiguredLlmProvider();
    const mcpCitations = await loadHmrcCitations(request);

    logExplainRequest(userId, request, provider, mcpCitations.length);

    const stream = iteratorToReadableStream(streamExplanation({
      optimizationResult: request.optimizationResult,
      planSummary: buildPlanSummary(request),
      mcpCitations,
      ragChunks: [],
    }));

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(error.message, 401);
    }

    if (error instanceof LlmConfigError) {
      return jsonError('AI features are not configured.', 503);
    }

    auditLog('optimizer.explain.error', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return jsonError('Unexpected explanation error.', 500);
  }
}
