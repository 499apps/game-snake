/**
 * localStorage wrapper. Every key is prefixed with "g499:" so "clear my data" can wipe
 * everything we ever stored without touching anything else on the origin.
 */

export const STORAGE_PREFIX = 'g499:';
/** Cache names with this prefix hold user data (none today) and are deleted by clearAllUserData. */
export const USER_CACHE_PREFIX = 'g499-user-';

export interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

export interface KitStorage {
  /** Read a JSON value; returns fallback when missing or unreadable. */
  get<T>(key: string, fallback: T): T;
  /** Write a JSON value. Returns false when the backend refused (quota, private mode). */
  set<T>(key: string, value: T): boolean;
  remove(key: string): void;
  /** All full keys (with prefix) that belong to us. */
  keys(): string[];
  /** Remove every prefixed key. Returns how many were removed. */
  clearAll(): number;
  /** The raw backend in use. */
  readonly backend: StorageLike;
  /** True when a real localStorage is in use (false means in-memory fallback). */
  readonly persistent: boolean;
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
}

export function fullKey(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : STORAGE_PREFIX + key;
}

function detectLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = `${STORAGE_PREFIX}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function createStorage(backend?: StorageLike): KitStorage {
  const real = backend ?? detectLocalStorage();
  const store: StorageLike = real ?? createMemoryStorage();
  const persistent = real !== null && real !== undefined;

  const keys = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) out.push(k);
    }
    return out.sort();
  };

  return {
    backend: store,
    persistent,
    get(key, fallback) {
      try {
        const raw = store.getItem(fullKey(key));
        if (raw === null) return fallback;
        return JSON.parse(raw) as typeof fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        store.setItem(fullKey(key), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        store.removeItem(fullKey(key));
      } catch {
        /* ignore */
      }
    },
    keys,
    clearAll() {
      const list = keys();
      for (const k of list) {
        try {
          store.removeItem(k);
        } catch {
          /* ignore */
        }
      }
      return list.length;
    },
  };
}

/** The default storage (localStorage when available, memory otherwise). */
export const storage: KitStorage = createStorage();

export interface ClearResult {
  keysRemoved: number;
  cachesRemoved: number;
}

/**
 * Wipe every "g499:" key and any user-data caches. The precache (the files of the site itself)
 * is kept so the site still works offline afterwards.
 */
export async function clearAllUserData(store: KitStorage = storage): Promise<ClearResult> {
  const keysRemoved = store.clearAll();
  let cachesRemoved = 0;
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      for (const name of names) {
        if (name.startsWith(USER_CACHE_PREFIX)) {
          if (await caches.delete(name)) cachesRemoved++;
        }
      }
    }
  } catch {
    /* caches unavailable: nothing to clear */
  }
  return { keysRemoved, cachesRemoved };
}
