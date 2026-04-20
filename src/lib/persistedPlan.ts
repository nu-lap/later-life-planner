import { normalizePlannerState } from '@/lib/mockData';
import type { PersistedPlannerState, PlannerState, PlannerUiState } from '@/models/types';

export const PERSISTED_PLANNER_KEYS = [
  'mode',
  'person1',
  'person2',
  'fiAge',
  'lifeVision',
  'aspirations',
  'lifeStages',
  'spendingCategories',
  'assumptions',
  'rlssStandard',
  'goalRegistry',
  'jointGia',
  'careReserve',
  'primaryResidence',
  'drawdownStrategy',
] as const satisfies readonly (keyof PersistedPlannerState)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseLegacyPlannerStoragePayload(
  rawPayload: string | null,
  fallbackState: PlannerState,
): PersistedPlannerState | null {
  if (!rawPayload) return null;

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  const rootPayload = isRecord(parsedPayload)
    ? ('state' in parsedPayload ? parsedPayload.state : parsedPayload)
    : parsedPayload;

  if (!isRecord(rootPayload)) return null;
  const hasCanonicalDomainShape = PERSISTED_PLANNER_KEYS.some((key) => key in rootPayload);
  if (!hasCanonicalDomainShape) return null;

  const hydrated = hydratePlannerState(
    {
      ...fallbackState,
      ...extractPlannerUiState(fallbackState),
    },
    rootPayload as Partial<PersistedPlannerState>,
  );

  return extractPersistedPlannerState(hydrated);
}

export function extractPlannerUiState(state: PlannerState): PlannerUiState {
  return {
    currentStep: state.currentStep,
    maxVisitedStep: state.maxVisitedStep,
  };
}

export function extractPersistedPlannerState(state: PlannerState): PersistedPlannerState {
  const {
    currentStep: _currentStep,
    maxVisitedStep: _maxVisitedStep,
    ...persistedState
  } = state;

  return persistedState;
}

export function hydratePlannerState(
  currentState: PlannerState,
  persistedState: Partial<PersistedPlannerState> | null | undefined,
): PlannerState {
  if (!isRecord(persistedState)) return normalizePlannerState(currentState);

  const nextPersistedState = { ...extractPersistedPlannerState(currentState) };
  const persistedEntries = persistedState as Record<string, unknown>;
  const mutablePersistedState = nextPersistedState as Record<string, unknown>;

  for (const key of PERSISTED_PLANNER_KEYS) {
    if (key in persistedEntries) {
      mutablePersistedState[key] = persistedEntries[key];
    }
  }

  return normalizePlannerState({
    ...currentState,
    ...nextPersistedState,
  });
}
