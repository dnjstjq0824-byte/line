// E5: IndexedDB KeyValue for the web E2EE store. Origin-private;
// wiped on logout (E9). No dependencies.
import type { KeyValue } from './store.js';

const DB_NAME = 'luno-e2ee';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export class IndexedDbKV implements KeyValue {
  async get(k: string): Promise<string | null> {
    const v = await withStore<string | undefined>('readonly', (s) => s.get(k));
    return v ?? null;
  }
  async set(k: string, v: string): Promise<void> {
    await withStore('readwrite', (s) => s.put(v, k));
  }
  async del(k: string): Promise<void> {
    await withStore('readwrite', (s) => s.delete(k));
  }
  async clearUser(userId: string, deviceId: string): Promise<void> {
    const prefix = `e2ee:${userId}:${deviceId}:`;
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) {
            resolve();
            return;
          }
          if (typeof c.key === 'string' && c.key.startsWith(prefix)) c.delete();
          c.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
    } finally {
      db.close();
    }
  }
}
