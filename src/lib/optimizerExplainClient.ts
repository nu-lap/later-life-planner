import type { OptimizationResult } from '@/financialEngine/types';
import type { OptimizerExplainRequest } from '@/lib/optimizerExplain';
import { buildOptimizerExplainRequest, REQUIRED_EXPLAIN_CONSENT_SCOPES } from '@/lib/optimizerExplain';
import type { PlannerState } from '@/models/types';

const EXPLANATION_CACHE_PREFIX = 'llp.optimizer-explanation:';
const EXPLANATION_CACHE_VERSION = '2';

export class OptimizerExplainClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimizerExplainClientError';
  }
}

export interface ExplainOptimizerResultArgs {
  plannerState: PlannerState;
  optimizationResult: OptimizationResult;
}

export interface CachedOptimizerExplanation {
  planRevision: string;
  explanation: string | null;
}

export interface GeneratedOptimizerExplanation {
  planRevision: string;
  text: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getExplanationStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getExplanationCacheKey(planRevision: string): string {
  return `${EXPLANATION_CACHE_PREFIX}v${EXPLANATION_CACHE_VERSION}:${planRevision}`;
}

function loadCachedExplanation(planRevision: string): string | null {
  const storage = getExplanationStorage();
  if (!storage) return null;

  try {
    const cached = storage.getItem(getExplanationCacheKey(planRevision));
    return cached && cached.trim().length > 0 ? cached : null;
  } catch {
    return null;
  }
}

function persistExplanation(planRevision: string, text: string): void {
  const storage = getExplanationStorage();
  if (!storage) return;

  try {
    storage.setItem(getExplanationCacheKey(planRevision), text);
  } catch {
    // Best-effort cache write: explanation generation should not fail if storage is unavailable.
  }
}

async function derivePlanRevision(
  stablePayload: Pick<OptimizerExplainRequest, 'schemaVersion' | 'subject' | 'financialSummary' | 'optimizationResult' | 'timelineFacts'>,
): Promise<string> {
  const canonical = JSON.stringify(stablePayload);
  return `sha256:${await sha256Hex(canonical)}`;
}

async function buildRequestWithDerivedRevision(
  args: ExplainOptimizerResultArgs,
): Promise<OptimizerExplainRequest> {
  const requestId = crypto.randomUUID();
  const grantedAt = new Date().toISOString();

  const tempRequest = buildOptimizerExplainRequest({
    plannerState: args.plannerState,
    optimizationResult: args.optimizationResult,
    planRevision: `sha256:${'0'.repeat(64)}`,
    consentScope: [...REQUIRED_EXPLAIN_CONSENT_SCOPES, 'mcp-citations', 'rag-guidance'],
    requestId,
    grantedAt,
  });

  const { schemaVersion, subject, financialSummary, optimizationResult, timelineFacts } = tempRequest;
  const planRevision = await derivePlanRevision({ schemaVersion, subject, financialSummary, optimizationResult, timelineFacts });

  return { ...tempRequest, planRevision };
}

async function readExplainResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

export async function getCachedOptimizerExplanation(
  args: ExplainOptimizerResultArgs,
): Promise<CachedOptimizerExplanation> {
  const request = await buildRequestWithDerivedRevision(args);
  return {
    planRevision: request.planRevision,
    explanation: loadCachedExplanation(request.planRevision),
  };
}

export async function explainOptimizerResult(
  args: ExplainOptimizerResultArgs,
): Promise<GeneratedOptimizerExplanation> {
  const request = await buildRequestWithDerivedRevision(args);

  const response = await fetch('/api/optimizer-explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorMessage = 'Unable to generate optimizer explanation.';
    const contentType = response.headers.get('Content-Type') ?? '';

    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (body?.error) {
        errorMessage = body.error;
      }
    } else {
      const body = await response.text().catch(() => '');
      if (body.trim()) {
        errorMessage = body.trim();
      }
    }

    throw new OptimizerExplainClientError(errorMessage);
  }

  const text = await readExplainResponse(response);
  persistExplanation(request.planRevision, text);
  return { planRevision: request.planRevision, text };
}
