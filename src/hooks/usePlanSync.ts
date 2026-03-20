'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATE_PENSION } from '@/config/financialConstants';
import {
  decryptPlannerState,
  encryptPlannerState,
  exportDataEncryptionKeyToBase64,
  generateDataEncryptionKey,
  importDataEncryptionKeyFromBase64,
  PLANNER_SCHEMA_VERSION,
} from '@/lib/crypto';
import {
  LEGACY_PLANNER_STORAGE_KEY,
  getSyncKeyStorageKey,
  getSyncMigrationDecisionStorageKey,
} from '@/lib/browserStorageKeys';
import {
  extractPersistedPlannerState,
  hydratePlannerState,
  parseLegacyPlannerStoragePayload,
} from '@/lib/persistedPlan';
import { createDefaultState } from '@/lib/mockData';
import type { PersistedPlannerState, PlannerSaveStatus, PlannerState } from '@/models/types';
import { usePlannerStore } from '@/store/plannerStore';

const SAVE_DEBOUNCE_MS = 900;

type MigrationDecision = 'imported' | 'start-fresh' | 'keep-remote';

interface RemotePlanPayload {
  schemaVersion: number;
  revision: number;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

interface MigrationPromptState {
  isOpen: boolean;
  hasRemotePlan: boolean;
}

interface UsePlanSyncResult {
  isSyncReady: boolean;
  saveStatus: PlannerSaveStatus;
  syncError: string | null;
  lastSavedAt: string | null;
  revision: number | null;
  migrationPrompt: MigrationPromptState;
  reloadRemotePlan: () => Promise<void>;
  importLegacyPlan: () => Promise<void>;
  startFreshPlan: () => void;
  keepRemotePlan: () => void;
  exportCanonicalPlan: () => void;
}

function plannerAad(userId: string): Record<string, string | number> {
  return {
    scope: 'planner',
    schemaVersion: PLANNER_SCHEMA_VERSION,
    userId,
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'Unexpected sync error.';
}

function selectCanonicalPlannerState(state: PlannerState): PersistedPlannerState {
  return extractPersistedPlannerState(state);
}

function readMigrationDecision(userId: string): MigrationDecision | null {
  const decision = localStorage.getItem(getSyncMigrationDecisionStorageKey(userId));
  if (decision === 'imported' || decision === 'start-fresh' || decision === 'keep-remote') {
    return decision;
  }
  return null;
}

function writeMigrationDecision(userId: string, decision: MigrationDecision): void {
  localStorage.setItem(getSyncMigrationDecisionStorageKey(userId), decision);
}

function clearLegacyLocalPlannerCache(): void {
  localStorage.removeItem(LEGACY_PLANNER_STORAGE_KEY);
}

async function getExistingUserKey(userId: string): Promise<CryptoKey | null> {
  const storedRawKey = localStorage.getItem(getSyncKeyStorageKey(userId));
  if (!storedRawKey) return null;
  return importDataEncryptionKeyFromBase64(storedRawKey);
}

async function getOrCreateUserKey(userId: string): Promise<CryptoKey> {
  const existing = await getExistingUserKey(userId);
  if (existing) return existing;

  const created = await generateDataEncryptionKey();
  const rawKey = await exportDataEncryptionKeyToBase64(created);
  localStorage.setItem(getSyncKeyStorageKey(userId), rawKey);
  return created;
}

export function usePlanSync(): UsePlanSyncResult {
  const { isLoaded, userId } = useAuth();
  const hydrateCanonicalPlan = usePlannerStore((state) => state.hydrateCanonicalPlan);
  const resetPlan = usePlannerStore((state) => state.resetPlan);
  const canonicalPlannerState = usePlannerStore(selectCanonicalPlannerState);

  const serializedPlannerState = useMemo(
    () => JSON.stringify(canonicalPlannerState),
    [canonicalPlannerState],
  );

  const [isSyncReady, setIsSyncReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<PlannerSaveStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [migrationPrompt, setMigrationPrompt] = useState<MigrationPromptState>({
    isOpen: false,
    hasRemotePlan: false,
  });

  const lastSavedSerializedRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<number | null>(null);
  const hasRemotePlanRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const loadSequenceRef = useRef(0);
  const syncEnabledRef = useRef(false);
  const awaitingMigrationChoiceRef = useRef(false);
  const legacyPlanRef = useRef<PersistedPlannerState | null>(null);

  const queueSave = useCallback(
    async (plan: PersistedPlannerState, serialized: string): Promise<boolean> => {
      if (!userId) return false;
      if (!syncEnabledRef.current) return false;

      try {
        const key = await getOrCreateUserKey(userId);
        const encrypted = await encryptPlannerState(plan, key, plannerAad(userId));
        const payload: Record<string, unknown> = {
          schemaVersion: PLANNER_SCHEMA_VERSION,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
        };

        if (hasRemotePlanRef.current && typeof currentRevisionRef.current === 'number') {
          payload.baseRevision = currentRevisionRef.current;
        }

        const response = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.status === 409) {
          const conflictBody = await response.json().catch(() => null) as { currentRevision?: number } | null;
          currentRevisionRef.current = typeof conflictBody?.currentRevision === 'number'
            ? conflictBody.currentRevision
            : currentRevisionRef.current;
          setRevision(currentRevisionRef.current);
          setSaveStatus('conflict');
          setSyncError('This plan was updated elsewhere. Reload the remote version to continue.');
          return false;
        }

        if (!response.ok) {
          throw new Error(`Save request failed (${response.status}).`);
        }

        const saved = await response.json() as { revision: number; updatedAt: string };
        hasRemotePlanRef.current = true;
        currentRevisionRef.current = saved.revision;
        lastSavedSerializedRef.current = serialized;
        setRevision(saved.revision);
        setLastSavedAt(saved.updatedAt);
        setSaveStatus('saved');
        setSyncError(null);
        return true;
      } catch (error) {
        setSaveStatus('error');
        setSyncError(safeErrorMessage(error));
        return false;
      }
    },
    [userId],
  );

  const loadRemotePlan = useCallback(
    async (openMigrationPrompt = true): Promise<void> => {
      if (!userId) {
        setSaveStatus('local');
        setSyncError(null);
        setIsSyncReady(true);
        return;
      }

      const sequenceId = loadSequenceRef.current + 1;
      loadSequenceRef.current = sequenceId;
      setSaveStatus('loading');
      setSyncError(null);
      setIsSyncReady(false);
      syncEnabledRef.current = false;
      awaitingMigrationChoiceRef.current = false;

      const fallbackState = createDefaultState(STATE_PENSION.DEFAULT_AGE);
      legacyPlanRef.current = parseLegacyPlannerStoragePayload(
        localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY),
        fallbackState,
      );

      try {
        const response = await fetch('/api/data', {
          method: 'GET',
          cache: 'no-store',
        });

        if (loadSequenceRef.current !== sequenceId) return;

        if (response.status === 404) {
          hasRemotePlanRef.current = false;
          currentRevisionRef.current = null;
          lastSavedSerializedRef.current = null;
          setRevision(null);
          setLastSavedAt(null);

          const needsMigrationChoice = Boolean(
            openMigrationPrompt &&
            userId &&
            legacyPlanRef.current &&
            !readMigrationDecision(userId),
          );

          awaitingMigrationChoiceRef.current = needsMigrationChoice;
          setMigrationPrompt({
            isOpen: openMigrationPrompt && needsMigrationChoice,
            hasRemotePlan: false,
          });
          setSaveStatus('local');
          setSyncError(null);
          setIsSyncReady(true);
          syncEnabledRef.current = true;
          return;
        }

        if (!response.ok) {
          throw new Error(`Load request failed (${response.status}).`);
        }

        const remotePlan = await response.json() as RemotePlanPayload;
        if (remotePlan.schemaVersion !== PLANNER_SCHEMA_VERSION) {
          throw new Error(`Unsupported planner schema version (${remotePlan.schemaVersion}).`);
        }

        hasRemotePlanRef.current = true;
        currentRevisionRef.current = remotePlan.revision;
        setRevision(remotePlan.revision);
        setLastSavedAt(remotePlan.updatedAt);

        const existingKey = await getExistingUserKey(userId);
        if (!existingKey) {
          throw new Error('Cannot decrypt this plan on this device. Sign in on your original device or contact support.');
        }

        const decrypted = await decryptPlannerState<PersistedPlannerState>(
          {
            iv: remotePlan.iv,
            ciphertext: remotePlan.ciphertext,
          },
          existingKey,
          plannerAad(userId),
        );

        const normalizedRemotePlan = extractPersistedPlannerState(
          hydratePlannerState(
            {
              ...fallbackState,
              currentStep: 0,
              maxVisitedStep: 0,
            },
            decrypted,
          ),
        );

        skipNextSaveRef.current = true;
        hydrateCanonicalPlan(normalizedRemotePlan);
        lastSavedSerializedRef.current = JSON.stringify(normalizedRemotePlan);
        setSaveStatus('saved');
        setSyncError(null);

        const needsMigrationChoice = Boolean(
          openMigrationPrompt &&
          userId &&
          legacyPlanRef.current &&
          !readMigrationDecision(userId),
        );

        awaitingMigrationChoiceRef.current = needsMigrationChoice;
        setMigrationPrompt({
          isOpen: openMigrationPrompt && needsMigrationChoice,
          hasRemotePlan: true,
        });
        syncEnabledRef.current = true;
        setIsSyncReady(true);
      } catch (error) {
        if (loadSequenceRef.current !== sequenceId) return;
        setSaveStatus('error');
        setSyncError(safeErrorMessage(error));
        setIsSyncReady(true);
        syncEnabledRef.current = false;
      }
    },
    [hydrateCanonicalPlan, userId],
  );

  useEffect(() => {
    if (!isLoaded) {
      setSaveStatus('loading');
      setIsSyncReady(false);
      return;
    }

    if (!userId) {
      setSaveStatus('local');
      setSyncError(null);
      setLastSavedAt(null);
      setRevision(null);
      setMigrationPrompt({ isOpen: false, hasRemotePlan: false });
      syncEnabledRef.current = false;
      awaitingMigrationChoiceRef.current = false;
      setIsSyncReady(true);
      return;
    }

    void loadRemotePlan(true);
  }, [isLoaded, userId, loadRemotePlan]);

  useEffect(() => {
    if (!isLoaded || !userId || !isSyncReady) return;
    if (!syncEnabledRef.current) return;
    if (awaitingMigrationChoiceRef.current) return;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (serializedPlannerState === lastSavedSerializedRef.current) return;

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');
    setSyncError(null);

    saveTimeoutRef.current = window.setTimeout(() => {
      void queueSave(canonicalPlannerState, serializedPlannerState);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    canonicalPlannerState,
    isLoaded,
    isSyncReady,
    queueSave,
    serializedPlannerState,
    userId,
  ]);

  useEffect(() => () => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const importLegacyPlan = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const legacyPlan = legacyPlanRef.current;
    if (!legacyPlan) {
      setMigrationPrompt({ isOpen: false, hasRemotePlan: hasRemotePlanRef.current });
      awaitingMigrationChoiceRef.current = false;
      return;
    }

    skipNextSaveRef.current = true;
    hydrateCanonicalPlan(legacyPlan);
    setSaveStatus('saving');
    setSyncError(null);
    const didSave = await queueSave(legacyPlan, JSON.stringify(legacyPlan));

    if (!didSave) {
      awaitingMigrationChoiceRef.current = true;
      setMigrationPrompt({ isOpen: true, hasRemotePlan: hasRemotePlanRef.current });
      return;
    }

    writeMigrationDecision(userId, 'imported');
    clearLegacyLocalPlannerCache();
    legacyPlanRef.current = null;
    setMigrationPrompt({ isOpen: false, hasRemotePlan: hasRemotePlanRef.current });
    awaitingMigrationChoiceRef.current = false;
  }, [hydrateCanonicalPlan, queueSave, userId]);

  const startFreshPlan = useCallback((): void => {
    if (!userId) return;
    writeMigrationDecision(userId, 'start-fresh');
    clearLegacyLocalPlannerCache();
    awaitingMigrationChoiceRef.current = false;
    skipNextSaveRef.current = false;
    setMigrationPrompt({ isOpen: false, hasRemotePlan: hasRemotePlanRef.current });
    lastSavedSerializedRef.current = null;
    resetPlan();
  }, [resetPlan, userId]);

  const keepRemotePlan = useCallback((): void => {
    if (!userId) return;
    writeMigrationDecision(userId, 'keep-remote');
    clearLegacyLocalPlannerCache();
    awaitingMigrationChoiceRef.current = false;
    setMigrationPrompt({ isOpen: false, hasRemotePlan: true });
  }, [userId]);

  const exportCanonicalPlan = useCallback(() => {
    const content = `${JSON.stringify(canonicalPlannerState, null, 2)}\n`;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `later-life-plan-${dateStamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [canonicalPlannerState]);

  return {
    isSyncReady,
    saveStatus,
    syncError,
    lastSavedAt,
    revision,
    migrationPrompt,
    reloadRemotePlan: () => loadRemotePlan(false),
    importLegacyPlan,
    startFreshPlan,
    keepRemotePlan,
    exportCanonicalPlan,
  };
}
