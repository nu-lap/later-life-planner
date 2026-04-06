import type { OptimizationResult } from '@/financialEngine/types';
import type { OptimizerExplainRequest } from '@/lib/optimizerExplain';
import { buildOptimizerExplainRequest, REQUIRED_EXPLAIN_CONSENT_SCOPES } from '@/lib/optimizerExplain';
import type { PlannerState } from '@/models/types';

export class OptimizerExplainClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimizerExplainClientError';
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function derivePlanRevision(
  stablePayload: Pick<OptimizerExplainRequest, 'schemaVersion' | 'subject' | 'financialSummary' | 'optimizationResult'>,
): Promise<string> {
  const canonical = JSON.stringify(stablePayload);
  return `sha256:${await sha256Hex(canonical)}`;
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

export interface ExplainOptimizerResultArgs {
  plannerState: PlannerState;
  optimizationResult: OptimizationResult;
}

export async function explainOptimizerResult(
  args: ExplainOptimizerResultArgs,
): Promise<string> {
  const requestId = crypto.randomUUID();
  const grantedAt = new Date().toISOString();

  // Build a temporary request with a placeholder revision to extract stable, non-PII fields.
  const tempRequest = buildOptimizerExplainRequest({
    plannerState: args.plannerState,
    optimizationResult: args.optimizationResult,
    planRevision: `sha256:${'0'.repeat(64)}`,
    consentScope: [...REQUIRED_EXPLAIN_CONSENT_SCOPES, 'mcp-citations'],
    requestId,
    grantedAt,
  });

  // Derive the revision by hashing only the minimised, non-PII stable fields.
  const { schemaVersion, subject, financialSummary, optimizationResult } = tempRequest;
  const planRevision = await derivePlanRevision({ schemaVersion, subject, financialSummary, optimizationResult });

  const request: OptimizerExplainRequest = { ...tempRequest, planRevision };

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

  return readExplainResponse(response);
}
