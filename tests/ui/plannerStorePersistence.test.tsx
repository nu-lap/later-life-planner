import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { LEGACY_PLANNER_STORAGE_KEY } from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';

describe('planner store local persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  afterEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('persists canonical planner data when Clerk is not configured', async () => {
    usePlannerStore.getState().setLifeVision('Spend more time near the coast');
    usePlannerStore.getState().setCurrentStep(2);

    await waitFor(() => {
      expect(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)).not.toBeNull();
    });

    const raw = localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(parsed.state.lifeVision).toBe('Spend more time near the coast');
    expect(parsed.state.person1).toBeTruthy();
    expect(parsed.state.currentStep).toBe(2);
  });
});
