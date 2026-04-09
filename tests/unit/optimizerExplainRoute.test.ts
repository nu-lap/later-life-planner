import { beforeEach, describe, expect, test, vi } from 'vitest';
import { paulAndLisaState } from '../fixtures/states';
import { optimizeWithdrawals } from '@/financialEngine/withdrawalOptimizer';
import {
  buildOptimizerExplainRequest,
  REQUIRED_EXPLAIN_CONSENT_SCOPES,
} from '@/lib/optimizerExplain';

const {
  requireUserMock,
  rateLimitMock,
  auditLogMock,
  collectHmrcRuleCitationsMock,
  retrieveHmrcChunksMock,
  getConfiguredLlmProviderMock,
  streamExplanationMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  rateLimitMock: vi.fn(() => ({ ok: true, remaining: 1, resetInMs: 0 })),
  auditLogMock: vi.fn(),
  collectHmrcRuleCitationsMock: vi.fn(),
  retrieveHmrcChunksMock: vi.fn(),
  getConfiguredLlmProviderMock: vi.fn(() => 'azure-openai'),
  streamExplanationMock: vi.fn(),
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

vi.mock('@/lib/hmrcMcp', () => ({
  collectHmrcRuleCitations: collectHmrcRuleCitationsMock,
}));

vi.mock('@/lib/hmrcRag', () => ({
  retrieveHmrcChunks: retrieveHmrcChunksMock,
}));

vi.mock('@/lib/llm', () => {
  class LlmConfigError extends Error {
    constructor(message = 'AI features are not configured.') {
      super(message);
      this.name = 'LlmConfigError';
    }
  }

  return {
    LlmConfigError,
    getConfiguredLlmProvider: getConfiguredLlmProviderMock,
    streamExplanation: streamExplanationMock,
  };
});

import { POST } from '@/app/api/optimizer-explain/route';
import { UnauthorizedError } from '@/lib/auth/requireUser';
import { LlmConfigError } from '@/lib/llm';

function makePayload(extraScopes: Array<'mcp-citations' | 'rag-guidance'> = ['mcp-citations']) {
  const plannerState = paulAndLisaState();
  return buildOptimizerExplainRequest({
    plannerState,
    optimizationResult: optimizeWithdrawals(plannerState),
    planRevision: 'etag:plan-rev-1',
    consentScope: [...REQUIRED_EXPLAIN_CONSENT_SCOPES, ...extraScopes],
    requestId: 'req_optimizer_explain_route',
    grantedAt: '2026-04-06T10:30:00.000Z',
  });
}

function streamChunks(...chunks: string[]) {
  return async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  };
}

describe('/api/optimizer-explain route', () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    requireUserMock.mockResolvedValue({ userId: 'user_123' });
    rateLimitMock.mockReset();
    rateLimitMock.mockReturnValue({ ok: true, remaining: 1, resetInMs: 60_000 });
    auditLogMock.mockReset();
    collectHmrcRuleCitationsMock.mockReset();
    collectHmrcRuleCitationsMock.mockResolvedValue([]);
    retrieveHmrcChunksMock.mockReset();
    retrieveHmrcChunksMock.mockResolvedValue([]);
    getConfiguredLlmProviderMock.mockReset();
    getConfiguredLlmProviderMock.mockReturnValue('azure-openai');
    streamExplanationMock.mockReset();
    streamExplanationMock.mockImplementation(streamChunks('Optimizer explanation.'));
  });

  test('returns 401 for unauthenticated requests', async () => {
    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
  });

  test('returns 429 when rate limited', async () => {
    rateLimitMock.mockReturnValue({ ok: false, remaining: 0, resetInMs: 5_500 });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('6');
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limit exceeded.',
      retryAfterSeconds: 6,
    });
    expect(streamExplanationMock).not.toHaveBeenCalled();
  });

  test('returns 400 for invalid payloads', async () => {
    const payload = makePayload();
    payload.consent.scope = ['optimization-result'];

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request payload.');
    expect(body.issues).toContain('Missing required consent scope: household-demographics');
  });

  test('streams an explanation and includes MCP citations when consented', async () => {
    const payload = makePayload();
    collectHmrcRuleCitationsMock.mockResolvedValue([
      {
        ruleId: 'income_tax_bands',
        version: '2025-26.1',
        taxYear: '2025-26',
        jurisdiction: 'rUK',
        title: 'Income Tax rates and allowances',
        url: 'https://www.gov.uk/income-tax-rates',
        summary: 'Personal Allowance applies before basic rate income tax.',
      },
    ]);
    streamExplanationMock.mockImplementation(async function* (context) {
      expect(context.mcpCitations).toHaveLength(1);
      expect(context.ragChunks).toEqual([]);
      expect(context.planSummary.planRevision).toBe(payload.planRevision);
      expect(context.planSummary.timelineFacts.planStartAges).toEqual(payload.timelineFacts.planStartAges);
      yield 'Tax saving ';
      yield 'comes from using pension withdrawals before ISA drawdown.';
    });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(
      'Tax saving comes from using pension withdrawals before ISA drawdown.',
    );
    expect(collectHmrcRuleCitationsMock).toHaveBeenCalledWith(payload.optimizationResult.ruleProvenance);
    expect(auditLogMock).toHaveBeenCalledWith(
      'optimizer.explain.request',
      expect.objectContaining({ citationCount: 1, provider: 'azure-openai', ragChunkCount: 0 }),
    );
  });

  test('retrieves RAG guidance when consented and passes chunks to the LLM context', async () => {
    const payload = makePayload(['mcp-citations', 'rag-guidance']);
    retrieveHmrcChunksMock.mockResolvedValue([
      {
        id: 'ptm-1',
        manual_ref: 'PTM063010',
        section_title: 'Lump sum allowance',
        text: 'The lump sum allowance places a cap on tax-free lump sums.',
        rule_ids: ['pension_lsa_cap'],
        source_url: 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm063010',
        applicable_tax_year: '2025-26',
        jurisdiction: 'rUK',
      },
    ]);
    streamExplanationMock.mockImplementation(async function* (context) {
      expect(context.ragChunks).toHaveLength(1);
      expect(context.ragChunks?.[0]?.source_url).toContain('ptm063010');
      yield 'Explanation with HMRC RAG guidance.';
    });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('Explanation with HMRC RAG guidance.');
    const [ruleIds, queryText, taxYear, jurisdiction] = retrieveHmrcChunksMock.mock.calls[0] ?? [];
    const taxYearCounts = payload.optimizationResult.ruleProvenance.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.tax_year_used] = (counts[entry.tax_year_used] ?? 0) + 1;
      return counts;
    }, {});
    const expectedTaxYear = Object.entries(taxYearCounts)
      .sort((left, right) => right[1] - left[1])[0]?.[0];

    expect(ruleIds).toEqual(expect.arrayContaining(['income_tax_bands', 'cgt_due', 'pension_lsa']));
    expect(queryText).toContain(payload.optimizationResult.recommendedStrategy.label);
    expect(taxYear).toBe(expectedTaxYear);
    expect(jurisdiction).toBe('rUK');
    expect(auditLogMock).toHaveBeenCalledWith(
      'optimizer.explain.request',
      expect.objectContaining({ ragChunkCount: 1 }),
    );
  });

  test('falls back to explanation without citations when HMRC MCP is unavailable', async () => {
    const payload = makePayload();
    collectHmrcRuleCitationsMock.mockRejectedValue(new Error('HMRC MCP unavailable'));
    streamExplanationMock.mockImplementation(async function* (context) {
      expect(context.mcpCitations).toEqual([]);
      yield 'Explanation without citations.';
    });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('Explanation without citations.');
    expect(auditLogMock).toHaveBeenCalledWith(
      'optimizer.explain.citationsUnavailable',
      expect.objectContaining({ requestId: payload.requestId }),
    );
  });

  test('falls back to explanation without RAG chunks when retrieval is unavailable', async () => {
    const payload = makePayload(['rag-guidance']);
    retrieveHmrcChunksMock.mockRejectedValue(new Error('Cosmos unavailable'));
    streamExplanationMock.mockImplementation(async function* (context) {
      expect(context.ragChunks).toEqual([]);
      yield 'Explanation without RAG guidance.';
    });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('Explanation without RAG guidance.');
    expect(auditLogMock).toHaveBeenCalledWith(
      'optimizer.explain.ragUnavailable',
      expect.objectContaining({ requestId: payload.requestId }),
    );
  });

  test('returns 503 when the LLM provider is not configured', async () => {
    getConfiguredLlmProviderMock.mockImplementation(() => {
      throw new LlmConfigError('AI features are not configured.');
    });

    const response = await POST(new Request('http://localhost/api/optimizer-explain', {
      method: 'POST',
      body: JSON.stringify(makePayload()),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'AI features are not configured.' });
  });
});
