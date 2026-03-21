type StoredValue = unknown;

const DB_NAME = 'later-life-planner';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null;
  const value = await withStore<StoredValue | undefined>('readonly', (store) => store.get(key));
  return (value ?? null) as T | null;
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) => store.put(value as StoredValue, key));
}

export async function idbDel(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) => store.delete(key));
}

