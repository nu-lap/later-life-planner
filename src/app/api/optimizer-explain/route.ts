import { auditLog } from '@/lib/auditLog';
import { requireUser, UnauthorizedError } from '@/lib/auth/requireUser';
import { collectHmrcRuleCitations } from '@/lib/hmrcMcp';
import { retrieveHmrcChunks } from '@/lib/hmrcRag';
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
  type HmrcChunk,
  OptimizerExplainRequestSchema,
} from '@/lib/optimizerExplain';
import { rateLimit } from '@/lib/rateLimit';

const EXPLAIN_RATE_LIMIT = { windowMs: 60_000, max: 20 };
const MCP_CITATIONS_SCOPE: ConsentScope = 'mcp-citations';
const RAG_GUIDANCE_SCOPE: ConsentScope = 'rag-guidance';

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

function getExplainRuleIds(request: ReturnType<typeof OptimizerExplainRequestSchema.parse>): string[] {
  return [...new Set(
    request.optimizationResult.ruleProvenance
      .map((entry) => entry.rule_id.trim())
      .filter((ruleId) => ruleId.length > 0),
  )];
}

function inferExplainTaxYear(request: ReturnType<typeof OptimizerExplainRequestSchema.parse>): string {
  const counts = new Map<string, number>();
  for (const entry of request.optimizationResult.ruleProvenance) {
    counts.set(entry.tax_year_used, (counts.get(entry.tax_year_used) ?? 0) + 1);
  }

  let selectedTaxYear = request.optimizationResult.ruleProvenance[0]?.tax_year_used ?? '2025-26';
  let highestCount = -1;
  for (const [taxYear, count] of counts.entries()) {
    if (count > highestCount) {
      selectedTaxYear = taxYear;
      highestCount = count;
    }
  }

  return selectedTaxYear;
}

function buildRagQueryText(request: ReturnType<typeof OptimizerExplainRequestSchema.parse>): string {
  const { subject, financialSummary, optimizationResult } = request;
  const depletionAge = optimizationResult.assetDepletionAge === null
    ? 'no depletion age triggered in the optimizer horizon'
    : `assets deplete around age ${optimizationResult.assetDepletionAge}`;

  return [
    `Explain why ${optimizationResult.recommendedStrategy.label} is recommended over ${optimizationResult.baselineStrategy.label}.`,
    `Household: ${subject.householdType} in ${subject.jurisdiction}.`,
    `Ages: ${subject.ages.join(', ')}.`,
    `Guaranteed income: ${financialSummary.guaranteedIncomeAnnual}.`,
    `DC total: ${financialSummary.dcTotal}.`,
    `ISA total: ${financialSummary.isaTotal}.`,
    `GIA total: ${financialSummary.giaTotal}.`,
    `Target spending: ${financialSummary.targetSpendingAnnual}.`,
    `Lifetime tax saving: ${optimizationResult.lifetimeTaxSaving}.`,
    depletionAge,
    `Relevant rule ids: ${getExplainRuleIds(request).join(', ')}.`,
  ].join(' ');
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

async function loadHmrcRagChunks(
  request: ReturnType<typeof OptimizerExplainRequestSchema.parse>,
): Promise<HmrcChunk[]> {
  if (!request.consent.scope.includes(RAG_GUIDANCE_SCOPE)) {
    return [];
  }

  try {
    return await retrieveHmrcChunks(
      getExplainRuleIds(request),
      buildRagQueryText(request),
      inferExplainTaxYear(request),
      request.subject.jurisdiction,
    );
  } catch (error) {
    auditLog('optimizer.explain.ragUnavailable', {
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
  ragChunkCount: number,
): void {
  auditLog('optimizer.explain.request', {
    userId,
    requestId: request.requestId,
    planRevision: request.planRevision,
    schemaVersion: request.schemaVersion,
    consentScope: request.consent.scope,
    provider,
    citationCount,
    ragChunkCount,
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
    const ragChunks = await loadHmrcRagChunks(request);

    logExplainRequest(userId, request, provider, mcpCitations.length, ragChunks.length);

    const stream = iteratorToReadableStream(streamExplanation({
      optimizationResult: request.optimizationResult,
      planSummary: buildPlanSummary(request),
      mcpCitations,
      ragChunks,
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
