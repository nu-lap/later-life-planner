import type { OptimizationResult } from '@/financialEngine/types';
import { buildOptimizerExplainRequest, REQUIRED_EXPLAIN_CONSENT_SCOPES } from '@/lib/optimizerExplain';
import { extractPersistedPlannerState } from '@/lib/persistedPlan';
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

async function derivePlanRevision(plannerState: PlannerState): Promise<string> {
  const persistedState = extractPersistedPlannerState(plannerState);
  const canonical = JSON.stringify(persistedState);
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
  const planRevision = await derivePlanRevision(args.plannerState);
  const request = buildOptimizerExplainRequest({
    plannerState: args.plannerState,
    optimizationResult: args.optimizationResult,
    planRevision,
    consentScope: [...REQUIRED_EXPLAIN_CONSENT_SCOPES, 'mcp-citations'],
    requestId: crypto.randomUUID(),
  });

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
