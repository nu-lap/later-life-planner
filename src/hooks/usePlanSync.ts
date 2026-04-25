'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { STATE_PENSION } from '@/config/financialConstants';
import {
  base64ToBytes,
  bytesToBase64,
  decryptPlannerState,
  encryptPlannerState,
  importDataEncryptionKeyFromBase64,
  getBase64ByteLength,
  PLANNER_SCHEMA_VERSION,
  validateCipherPayload,
} from '@/lib/crypto';
import {
  PLAN_SYNC_DEBUG_HEADER,
  PLAN_SYNC_TRACE_HEADER,
  createPlanSyncTraceId,
} from '@/lib/planSyncDebug';
import {
  LEGACY_PLANNER_STORAGE_KEY,
  getSyncMigrationDecisionStorageKey,
} from '@/lib/browserStorageKeys';
import {
  approveDevice,
  activateDevice,
  fetchDevices,
  fetchWrappedDek,
  consumeWrappedDek,
  registerDevice,
} from '@/lib/deviceApi';
import {
  createApprovalRequest,
  getOrCreateDeviceId,
  getOrCreateDeviceKeyPair,
  getUserDekB64,
  hpkeSealForRecipient,
  plannerDekWrapAad,
  publicKeyFingerprintB64,
  setUserDekB64,
  unwrapDekToBase64,
} from '@/lib/deviceCrypto';
import {
  extractPersistedPlannerState,
  hydratePlannerState,
  parseLegacyPlannerStoragePayload,
} from '@/lib/persistedPlan';
import { createDefaultState } from '@/lib/mockData';
import type { PersistedPlannerState, PlannerSaveStatus, PlannerState } from '@/models/types';
import { usePlannerStore } from '@/store/plannerStore';
import type { DeviceRegistrationDocument, WrappedDekPackage } from '@/lib/cosmos';
import { probeIndexedDb } from '@/lib/indexedDbKv';

const SAVE_DEBOUNCE_MS = 900;
const DEVICE_APPROVAL_TTL_MS = 10 * 60 * 1000;
const DEVICE_APPROVAL_POLL_MS = 3000;
const CORRUPT_PAYLOAD_MESSAGE = 'Saved plan data is corrupted or unreadable. Your plan has not been changed. Contact support for recovery.';
const PLAN_SYNC_DEBUG_STORAGE_KEY = 'later-life-plan-sync-debug';

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

interface DeviceApprovalPromptState {
  isOpen: boolean;
  deviceId: string;
  requestId: string;
  expiresAt: string;
  publicKeyFingerprint: string;
  error: string | null;
}

interface UsePlanSyncResult {
  isSyncReady: boolean;
  saveStatus: PlannerSaveStatus;
  syncError: string | null;
  lastSavedAt: string | null;
  revision: number | null;
  migrationPrompt: MigrationPromptState;
  deviceApprovalPrompt: DeviceApprovalPromptState;
  devices: DeviceRegistrationDocument[];
  refreshDevices: () => Promise<void>;
  approvePendingDevice: (approvalCode: string) => Promise<void>;
  closeDeviceApprovalPrompt: () => void;
  reloadRemotePlan: () => Promise<void>;
  importLegacyPlan: () => Promise<void>;
  startFreshPlan: () => void;
  keepRemotePlan: () => void;
  exportCanonicalPlan: () => void;
}

const ApprovalCodeSchema = z.object({
  v: z.literal(1),
  deviceId: z.string().min(8).max(128),
  requestId: z.string().min(8).max(128),
  expiresAt: z.string().min(10).max(64),
  publicKeyFingerprint: z.string().min(16).max(128),
});

function plannerAad(userId: string): Record<string, string | number> {
  return {
    scope: 'planner',
    schemaVersion: PLANNER_SCHEMA_VERSION,
    userId,
  };
}

function readLocalStorageItem(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function writeLocalStorageItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.localStorage?.setItem !== 'function') return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore blocked or unavailable localStorage writes.
  }
}

function removeLocalStorageItem(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.localStorage?.removeItem !== 'function') return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore blocked or unavailable localStorage writes.
  }
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'Unexpected sync error.';
}

function isPlanSyncDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URL(window.location.href).searchParams;
    const queryFlag = params.get('planSyncDebug');
    if (queryFlag === '1' || queryFlag === 'true') return true;
    return window.localStorage.getItem(PLAN_SYNC_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function buildPlanSyncHeaders(traceId: string): Record<string, string> | undefined {
  if (!isPlanSyncDebugEnabled()) return undefined;
  return {
    [PLAN_SYNC_TRACE_HEADER]: traceId,
    [PLAN_SYNC_DEBUG_HEADER]: '1',
  };
}

function logPlanSyncDebug(event: string, details: Record<string, unknown>): void {
  if (!isPlanSyncDebugEnabled()) return;
  console.debug('[plan-sync]', { ...details, event });
}

function selectCanonicalPlannerState(state: PlannerState): PersistedPlannerState {
  return extractPersistedPlannerState(state);
}

function readMigrationDecision(userId: string): MigrationDecision | null {
  const decision = readLocalStorageItem(getSyncMigrationDecisionStorageKey(userId));
  if (decision === 'imported' || decision === 'start-fresh' || decision === 'keep-remote') {
    return decision;
  }
  return null;
}

function writeMigrationDecision(userId: string, decision: MigrationDecision): void {
  writeLocalStorageItem(getSyncMigrationDecisionStorageKey(userId), decision);
}

function clearLegacyLocalPlannerCache(): void {
  removeLocalStorageItem(LEGACY_PLANNER_STORAGE_KEY);
}

export function usePlanSync(): UsePlanSyncResult {
  const { isLoaded, userId, getToken } = useAuth();
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
  const [deviceApprovalPrompt, setDeviceApprovalPrompt] = useState<DeviceApprovalPromptState>({
    isOpen: false,
    deviceId: '',
    requestId: '',
    expiresAt: '',
    publicKeyFingerprint: '',
    error: null,
  });
  const [devices, setDevices] = useState<DeviceRegistrationDocument[]>([]);

  const lastSavedSerializedRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<number | null>(null);
  const hasRemotePlanRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const loadSequenceRef = useRef(0);
  const syncEnabledRef = useRef(false);
  const blockedByConflictRef = useRef(false);
  const awaitingMigrationChoiceRef = useRef(false);
  const legacyPlanRef = useRef<PersistedPlannerState | null>(null);
  const deviceApprovalIntervalRef = useRef<number | null>(null);
  const indexedDbAvailableRef = useRef<boolean | null>(null);
  const hasSeenSignedInRef = useRef(false);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  /** Returns Authorization headers with a fresh Clerk Bearer token, or empty object on failure. */
  const buildAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await getTokenRef.current();
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {
      // If getToken fails, fall back to cookie-based auth (best-effort)
    }
    return {};
  }, []);

  const clearSensitiveStateOnSignOut = useCallback(() => {
    lastSavedSerializedRef.current = null;
    currentRevisionRef.current = null;
    hasRemotePlanRef.current = false;
    skipNextSaveRef.current = false;
    legacyPlanRef.current = null;
    loadSequenceRef.current += 1;
    resetPlan();
    usePlannerStore.persist.clearStorage();
  }, [resetPlan]);

  const ensureKeyStorageAvailable = useCallback(async (): Promise<boolean> => {
    if (indexedDbAvailableRef.current === true) return true;
    if (indexedDbAvailableRef.current === false) return false;

    const ok = await probeIndexedDb();
    indexedDbAvailableRef.current = ok;
    if (!ok) {
      syncEnabledRef.current = false;
      setSaveStatus('local');
      setSyncError(
        'Plan sync is unavailable because this browser blocks IndexedDB (site storage). Use a non-private window or allow site storage, then reload.',
      );
      setIsSyncReady(true);
    }
    return ok;
  }, []);

  const queueSave = useCallback(
    async (plan: PersistedPlannerState, serialized: string): Promise<boolean> => {
      if (!userId) return false;
      if (!syncEnabledRef.current) return false;
      if (!(await ensureKeyStorageAvailable())) return false;

      const traceId = createPlanSyncTraceId();
      const debugHeaders = buildPlanSyncHeaders(traceId);

      try {
        let dekB64 = await getUserDekB64(userId);
        const dekSource = dekB64 ? 'cached' : 'generated';
        if (!dekB64) {
          if (!globalThis.crypto?.getRandomValues) {
            throw new Error('Web Crypto API is unavailable in this runtime.');
          }
          const created = globalThis.crypto.getRandomValues(new Uint8Array(32));
          dekB64 = bytesToBase64(created);
          await setUserDekB64(userId, dekB64);
        }

        const key = await importDataEncryptionKeyFromBase64(dekB64);
        const encrypted = await encryptPlannerState(plan, key, plannerAad(userId));

        logPlanSyncDebug('save:start', {
          traceId,
          hasRemotePlan: hasRemotePlanRef.current,
          currentRevision: currentRevisionRef.current,
          baseRevision: hasRemotePlanRef.current && typeof currentRevisionRef.current === 'number'
            ? currentRevisionRef.current
            : null,
          dekSource,
          schemaVersion: PLANNER_SCHEMA_VERSION,
          serializedBytes: serialized.length,
          ivBytes: getBase64ByteLength(encrypted.iv),
          ciphertextBytes: getBase64ByteLength(encrypted.ciphertext),
          hasWrappedKey: false,
          keyVersion: null,
        });

        const payload: Record<string, unknown> = {
          schemaVersion: PLANNER_SCHEMA_VERSION,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
        };

        if (hasRemotePlanRef.current && typeof currentRevisionRef.current === 'number') {
          payload.baseRevision = currentRevisionRef.current;
        }

        const authHeaders = await buildAuthHeaders();
        const response = await fetch('/api/data', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(debugHeaders ?? {}),
          },
          body: JSON.stringify(payload),
        });

        logPlanSyncDebug('save:response', {
          traceId,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          clerkAuthReason: response.headers.get('x-clerk-auth-reason'),
          middlewareRewrite: response.headers.get('x-middleware-rewrite'),
          middlewareNext: response.headers.get('x-middleware-next'),
          responseUrl: response.url,
        });

	        if (response.status === 409) {
	          const conflictBody = await response.json().catch(() => null) as { currentRevision?: number } | null;
	          currentRevisionRef.current = typeof conflictBody?.currentRevision === 'number'
	            ? conflictBody.currentRevision
	            : currentRevisionRef.current;
	          setRevision(currentRevisionRef.current);
	          setSaveStatus('conflict');
	          blockedByConflictRef.current = true;
	          syncEnabledRef.current = false;
          setSyncError('Reload the remote version to continue.');
          return false;
        }

        if (!response.ok) {
          const errorBody = isPlanSyncDebugEnabled() ? await response.text().catch(() => '') : '';
          logPlanSyncDebug('save:error-body', {
            traceId,
            status: response.status,
            bodySnippet: errorBody.slice(0, 400),
          });
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
        blockedByConflictRef.current = false;
        syncEnabledRef.current = true;
        return true;
      } catch (error) {
        logPlanSyncDebug('save:exception', {
          traceId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: safeErrorMessage(error),
        });
        setSaveStatus('error');
        setSyncError(safeErrorMessage(error));
        return false;
      }
    },
    [buildPlanSyncHeaders, ensureKeyStorageAvailable, userId],
  );

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (!userId) {
      setDevices([]);
      return;
    }

    const list = await fetchDevices();
    setDevices(list);
  }, [userId]);

  const approvePendingDevice = useCallback(async (approvalCode: string): Promise<void> => {
    if (!userId) return;
    const dekB64 = await getUserDekB64(userId);
    if (!dekB64) {
      throw new Error('This device cannot approve others until it has access to the saved plan.');
    }

    // Require a server-side notion of an "active approver" to reduce the approval race surface.
    // This is a best-effort bootstrap: it establishes the first active device record for a user.
    const approverDeviceId = await getOrCreateDeviceId(userId);
    const approverKeyPair = await getOrCreateDeviceKeyPair(userId);
    await activateDevice({
      deviceId: approverDeviceId,
      publicKey: approverKeyPair.publicKeyB64,
    });

    const trimmed = approvalCode.trim();
    if (!trimmed) {
      throw new Error('Approval code is required.');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error('Invalid approval code.');
    }

    const parsed = ApprovalCodeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error('Invalid approval code.');
    }

    const code = parsed.data;

    // Do not rely on potentially-stale local state. Always re-fetch the directory before approving.
    const directory = await fetchDevices();
    setDevices(directory);

    const target = directory.find((candidate) => candidate.deviceId === code.deviceId);
    if (!target || !target.requestId || !target.requestExpiresAt) {
      throw new Error('Device approval request not found.');
    }
    if (target.requestId !== code.requestId || target.requestExpiresAt !== code.expiresAt) {
      throw new Error('Approval code does not match the pending device request.');
    }
    if (new Date(target.requestExpiresAt).getTime() <= Date.now()) {
      throw new Error('Approval request expired.');
    }

    const expectedFingerprint = await publicKeyFingerprintB64(target.publicKey);
    if (expectedFingerprint !== code.publicKeyFingerprint) {
      throw new Error('Approval code does not match the device key fingerprint.');
    }

    const aadBytes = plannerDekWrapAad({
      userId,
      deviceId: target.deviceId,
      requestId: target.requestId,
      schemaVersion: PLANNER_SCHEMA_VERSION,
      expiresAt: target.requestExpiresAt,
    });

    const sealed = await hpkeSealForRecipient({
      recipientPublicKeyB64: target.publicKey,
      plaintext: base64ToBytes(dekB64),
      aad: aadBytes,
    });

    const now = new Date().toISOString();
    const wrappedKeyPackage: WrappedDekPackage = {
      v: 1,
      suite: {
        kem: 'DHKEM(P-256,HKDF-SHA256)',
        kdf: 'HKDF-SHA256',
        aead: 'AES-256-GCM',
      },
      deviceId: target.deviceId,
      requestId: target.requestId,
      enc: sealed.encB64,
      ciphertext: sealed.ciphertextB64,
      aad: bytesToBase64(aadBytes),
      createdAt: now,
    };

    await approveDevice({
      deviceId: target.deviceId,
      approverDeviceId,
      requestId: target.requestId,
      wrappedKeyPackage,
    });

    await refreshDevices();
  }, [refreshDevices, userId]);

  const closeDeviceApprovalPrompt = useCallback((): void => {
    setDeviceApprovalPrompt((current) => (
      current.isOpen ? { ...current, isOpen: false } : current
    ));
    if (deviceApprovalIntervalRef.current !== null) {
      window.clearInterval(deviceApprovalIntervalRef.current);
      deviceApprovalIntervalRef.current = null;
    }
  }, []);

  const loadRemotePlan = useCallback(
    async (openMigrationPrompt = true): Promise<void> => {
      if (!userId) {
        setSaveStatus('local');
        setSyncError(null);
        setIsSyncReady(true);
        return;
      }
      if (!(await ensureKeyStorageAvailable())) return;

      const sequenceId = loadSequenceRef.current + 1;
      loadSequenceRef.current = sequenceId;
      setSaveStatus('loading');
      setSyncError(null);
      setIsSyncReady(false);
      syncEnabledRef.current = false;
      blockedByConflictRef.current = false;
      awaitingMigrationChoiceRef.current = false;

      const fallbackState = createDefaultState(STATE_PENSION.DEFAULT_AGE);
      legacyPlanRef.current = parseLegacyPlannerStoragePayload(
        readLocalStorageItem(LEGACY_PLANNER_STORAGE_KEY),
        fallbackState,
      );

      const handleCorruptRemotePayload = () => {
        setSaveStatus('error');
        setSyncError(CORRUPT_PAYLOAD_MESSAGE);
        setMigrationPrompt({ isOpen: false, hasRemotePlan: true });
        awaitingMigrationChoiceRef.current = false;
        setIsSyncReady(true);
        syncEnabledRef.current = false;
        blockedByConflictRef.current = false;
      };

      const traceId = createPlanSyncTraceId();
      const debugHeaders = buildPlanSyncHeaders(traceId);

      try {
        logPlanSyncDebug('load:start', {
          traceId,
          openMigrationPrompt,
          hasLegacyPlan: legacyPlanRef.current !== null,
        });

        const authHeaders = await buildAuthHeaders();
        const response = await fetch('/api/data', {
          method: 'GET',
          cache: 'no-store',
          headers: {
            ...authHeaders,
            ...(debugHeaders ?? {}),
          },
        });

        logPlanSyncDebug('load:response', {
          traceId,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          clerkAuthReason: response.headers.get('x-clerk-auth-reason'),
          middlewareRewrite: response.headers.get('x-middleware-rewrite'),
          middlewareNext: response.headers.get('x-middleware-next'),
          responseUrl: response.url,
        });

        if (loadSequenceRef.current !== sequenceId) return;

        if (response.status === 404) {
          const bodySnippet = isPlanSyncDebugEnabled() ? await response.text().catch(() => '') : '';
          logPlanSyncDebug('load:not-found', {
            traceId,
            bodySnippet: bodySnippet.slice(0, 400),
          });
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
          if (response.status === 500) {
            const errorText = isPlanSyncDebugEnabled() ? await response.text().catch(() => '') : '';
            if (isPlanSyncDebugEnabled()) {
              logPlanSyncDebug('load:error-body', {
                traceId,
                status: response.status,
                bodySnippet: errorText.slice(0, 400),
              });
            }
            const errorPayload = isPlanSyncDebugEnabled()
              ? (() => {
                  try {
                    return JSON.parse(errorText) as { error?: string };
                  } catch {
                    return null;
                  }
                })()
              : await response.json().catch(() => null) as { error?: string } | null;
            if (errorPayload?.error === 'Corrupt planner payload.') {
              handleCorruptRemotePayload();
              return;
            }
          } else if (isPlanSyncDebugEnabled()) {
            const errorBody = await response.text().catch(() => '');
            logPlanSyncDebug('load:error-body', {
              traceId,
              status: response.status,
              bodySnippet: errorBody.slice(0, 400),
            });
          }
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

        const payloadValidation = validateCipherPayload({
          iv: remotePlan.iv,
          ciphertext: remotePlan.ciphertext,
        });
        if (!payloadValidation.ok) {
          handleCorruptRemotePayload();
          return;
        }

        const dekB64 = await getUserDekB64(userId);
        if (!dekB64) {
          const deviceId = await getOrCreateDeviceId(userId);
          const deviceKeyPair = await getOrCreateDeviceKeyPair(userId);
          const approval = createApprovalRequest(DEVICE_APPROVAL_TTL_MS);
          const registration = await registerDevice({
            deviceId,
            publicKey: deviceKeyPair.publicKeyB64,
            requestId: approval.requestId,
            requestExpiresAt: approval.expiresAt,
          });

          const requestExpiresAt = registration.requestExpiresAt ?? approval.expiresAt;

          const fingerprint = await publicKeyFingerprintB64(deviceKeyPair.publicKeyB64);
          setDeviceApprovalPrompt({
            isOpen: true,
            deviceId,
            requestId: approval.requestId,
            expiresAt: requestExpiresAt,
            publicKeyFingerprint: fingerprint,
            error: null,
          });

          if (deviceApprovalIntervalRef.current !== null) {
            window.clearInterval(deviceApprovalIntervalRef.current);
          }

          deviceApprovalIntervalRef.current = window.setInterval(() => {
            void (async () => {
              if (!userId) return;
              if (Date.now() > new Date(requestExpiresAt).getTime()) {
                if (deviceApprovalIntervalRef.current !== null) {
                  window.clearInterval(deviceApprovalIntervalRef.current);
                  deviceApprovalIntervalRef.current = null;
                }
                setDeviceApprovalPrompt((current) => (
                  current.isOpen ? { ...current, error: 'Approval request expired.' } : current
                ));
                return;
              }

              try {
                const pkg = await fetchWrappedDek({ deviceId, requestId: approval.requestId });
                if (!pkg) return;
                if (pkg.v !== 1) {
                  throw new Error('Unsupported wrapped key package version.');
                }
                if (pkg.deviceId !== deviceId || pkg.requestId !== approval.requestId) {
                  throw new Error('Wrapped key package context mismatch.');
                }

                const expectedAadBytes = plannerDekWrapAad({
                  userId,
                  deviceId,
                  requestId: approval.requestId,
                  schemaVersion: PLANNER_SCHEMA_VERSION,
                  expiresAt: requestExpiresAt,
                });
                const expectedAadB64 = bytesToBase64(expectedAadBytes);
                if (pkg.aad !== expectedAadB64) {
                  throw new Error('Wrapped key package AAD mismatch.');
                }

                const openedDekB64 = await unwrapDekToBase64({
                  recipientPrivateKey: deviceKeyPair.privateKey,
                  encB64: pkg.enc,
                  ciphertextB64: pkg.ciphertext,
                  aad: expectedAadBytes,
                });

                await setUserDekB64(userId, openedDekB64);
                await consumeWrappedDek({ deviceId, requestId: approval.requestId });
                setDeviceApprovalPrompt((current) => (
                  current.isOpen ? { ...current, isOpen: false, error: null } : current
                ));

                if (deviceApprovalIntervalRef.current !== null) {
                  window.clearInterval(deviceApprovalIntervalRef.current);
                  deviceApprovalIntervalRef.current = null;
                }

                void loadRemotePlan(false);
              } catch (error) {
                const message = safeErrorMessage(error);
                setDeviceApprovalPrompt((current) => (
                  current.isOpen ? { ...current, error: message } : current
                ));
              }
            })();
          }, DEVICE_APPROVAL_POLL_MS);

          setSaveStatus('approval_required');
          setSyncError('Approve this device from one that already has access to unlock your saved plan.');
          setIsSyncReady(true);
          syncEnabledRef.current = false;
          return;
        }

        const existingKey = await importDataEncryptionKeyFromBase64(dekB64);

        let decrypted: PersistedPlannerState;
        try {
          decrypted = await decryptPlannerState<PersistedPlannerState>(
            {
              iv: remotePlan.iv,
              ciphertext: remotePlan.ciphertext,
            },
            existingKey,
            plannerAad(userId),
          );
        } catch {
          handleCorruptRemotePayload();
          return;
        }

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
        void refreshDevices();
        syncEnabledRef.current = true;
        blockedByConflictRef.current = false;
        setIsSyncReady(true);
      } catch (error) {
        if (loadSequenceRef.current !== sequenceId) return;
        logPlanSyncDebug('load:exception', {
          traceId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: safeErrorMessage(error),
        });
        setSaveStatus('error');
        setSyncError(safeErrorMessage(error));
        setIsSyncReady(true);
        syncEnabledRef.current = false;
        blockedByConflictRef.current = false;
      }
    },
    [buildAuthHeaders, ensureKeyStorageAvailable, hydrateCanonicalPlan, refreshDevices, userId],
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
      setDeviceApprovalPrompt({
        isOpen: false,
        deviceId: '',
        requestId: '',
        expiresAt: '',
        publicKeyFingerprint: '',
        error: null,
      });
      setDevices([]);
      syncEnabledRef.current = false;
      blockedByConflictRef.current = false;
      awaitingMigrationChoiceRef.current = false;
      if (hasSeenSignedInRef.current) {
        clearSensitiveStateOnSignOut();
        hasSeenSignedInRef.current = false;
      }
      if (deviceApprovalIntervalRef.current !== null) {
        window.clearInterval(deviceApprovalIntervalRef.current);
        deviceApprovalIntervalRef.current = null;
      }
      setIsSyncReady(true);
      return;
    }

    hasSeenSignedInRef.current = true;
    void loadRemotePlan(true);
  }, [clearSensitiveStateOnSignOut, isLoaded, loadRemotePlan, userId]);

  useEffect(() => {
    if (!isLoaded || !userId || !isSyncReady) return;
    if (!syncEnabledRef.current) return;
    if (blockedByConflictRef.current) return;
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
    if (deviceApprovalIntervalRef.current !== null) {
      window.clearInterval(deviceApprovalIntervalRef.current);
      deviceApprovalIntervalRef.current = null;
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
    deviceApprovalPrompt,
    devices,
    refreshDevices,
    approvePendingDevice,
    closeDeviceApprovalPrompt,
    reloadRemotePlan: () => loadRemotePlan(false),
    importLegacyPlan,
    startFreshPlan,
    keepRemotePlan,
    exportCanonicalPlan,
  };
}
