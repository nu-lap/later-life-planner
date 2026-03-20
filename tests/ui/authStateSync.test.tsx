import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AuthStateSync from '@/components/AuthStateSync';
import {
  DISCLAIMER_KEY,
  LEGACY_PLANNER_STORAGE_KEY,
  getSyncKeyStorageKey,
  getSyncMigrationDecisionStorageKey,
} from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';

const mockUseAuth = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AuthStateSync', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
    mockUseAuth.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetPlan();
    usePlannerStore.persist.clearStorage();
  });

  test('preserves disclaimer acceptance when a signed-in user signs out', async () => {
    const userId = 'user_123';
    localStorage.setItem(DISCLAIMER_KEY, '1');
    localStorage.setItem(getSyncKeyStorageKey(userId), 'raw-key');
    localStorage.setItem(getSyncMigrationDecisionStorageKey(userId), 'imported');
    mockUseAuth.mockReturnValue({ isLoaded: true, userId });

    const { rerender } = render(<AuthStateSync />);

    usePlannerStore.getState().setCurrentStep(3);

    await waitFor(() => {
      expect(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)).not.toBeNull();
    });

    mockUseAuth.mockReturnValue({ isLoaded: true, userId: null });
    rerender(<AuthStateSync />);

    await waitFor(() => {
      expect(usePlannerStore.getState().currentStep).toBe(0);
      expect(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(DISCLAIMER_KEY)).toBe('1');
      expect(localStorage.getItem(getSyncKeyStorageKey(userId))).toBeNull();
      expect(localStorage.getItem(getSyncMigrationDecisionStorageKey(userId))).toBeNull();
    });
  });
});
