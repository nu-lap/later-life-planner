'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';
import {
  getSyncKeyStorageKey,
  getSyncMigrationDecisionStorageKey,
} from '@/lib/browserStorageKeys';
import { usePlannerStore } from '@/store/plannerStore';

export default function AuthStateSync() {
  const { isLoaded, userId } = useAuth();
  const resetPlan = usePlannerStore((state) => state.resetPlan);
  const hasSeenSignedInState = useRef(false);
  const lastSignedInUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (userId) {
      hasSeenSignedInState.current = true;
      lastSignedInUserId.current = userId;
      return;
    }

    if (!hasSeenSignedInState.current) return;

    const previousUserId = lastSignedInUserId.current;
    if (previousUserId) {
      localStorage.removeItem(getSyncKeyStorageKey(previousUserId));
      localStorage.removeItem(getSyncMigrationDecisionStorageKey(previousUserId));
    }

    resetPlan();
    usePlannerStore.persist.clearStorage();
    hasSeenSignedInState.current = false;
    lastSignedInUserId.current = null;
  }, [isLoaded, userId, resetPlan]);

  return null;
}
