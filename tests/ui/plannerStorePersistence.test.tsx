import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { LEGACY_PLANNER_STORAGE_KEY } from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';

// ─── BUG-001: DOB setter falls back to previous valid DOB on invalid input ────

describe('plannerStore — setP1Dob / setP2Dob invalid DOB fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('setP1Dob with an invalid-format string retains the previous valid DOB', () => {
    usePlannerStore.getState().setP1Dob('1965-06-15');
    usePlannerStore.getState().setP1Dob('not-a-date');
    expect(usePlannerStore.getState().person1.dateOfBirth).toBe('1965-06-15');
  });

  test('setP1Dob with a valid date updates the DOB', () => {
    usePlannerStore.getState().setP1Dob('1965-06-15');
    expect(usePlannerStore.getState().person1.dateOfBirth).toBe('1965-06-15');
  });

  test('setP2Dob with an invalid-format string retains the previous valid DOB', () => {
    usePlannerStore.setState({ mode: 'couple' });
    usePlannerStore.getState().setP2Dob('1968-03-20');
    usePlannerStore.getState().setP2Dob('not-a-date');
    expect(usePlannerStore.getState().person2.dateOfBirth).toBe('1968-03-20');
  });

  test('setP2Dob with a valid date updates the DOB', () => {
    usePlannerStore.setState({ mode: 'couple' });
    usePlannerStore.getState().setP2Dob('1968-03-20');
    expect(usePlannerStore.getState().person2.dateOfBirth).toBe('1968-03-20');
  });
});

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
