export const DISCLAIMER_KEY = 'llp-disclaimer-accepted';
export const LEGACY_PLANNER_STORAGE_KEY = 'life-planner-v6';
export const SYNC_KEY_STORAGE_PREFIX = 'llp-sync-key-v1:';
export const SYNC_MIGRATION_DECISION_PREFIX = 'llp-sync-migration-v1:';

export function getSyncKeyStorageKey(userId: string): string {
  return `${SYNC_KEY_STORAGE_PREFIX}${userId}`;
}

export function getSyncMigrationDecisionStorageKey(userId: string): string {
  return `${SYNC_MIGRATION_DECISION_PREFIX}${userId}`;
}
