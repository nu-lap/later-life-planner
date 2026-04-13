export const PLAN_SYNC_TRACE_HEADER = 'x-plan-sync-trace-id';
export const PLAN_SYNC_DEBUG_HEADER = 'x-plan-sync-debug';

export function createPlanSyncTraceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `plan-sync-${Date.now().toString(36)}-${randomPart}`;
}

export function readPlanSyncRequestDebugMetadata(headers?: Headers | null): {
  traceId: string | null;
  debugEnabled: boolean;
} {
  if (!headers) {
    return {
      traceId: null,
      debugEnabled: false,
    };
  }

  return {
    traceId: headers.get(PLAN_SYNC_TRACE_HEADER),
    debugEnabled: headers.get(PLAN_SYNC_DEBUG_HEADER) === '1',
  };
}

export function buildPlanSyncResponseHeaders(traceId: string | null | undefined): Record<string, string> | undefined {
  if (!traceId) return undefined;
  return { [PLAN_SYNC_TRACE_HEADER]: traceId };
}
