/** Minimal subset of the Web Storage API so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const createMemoryStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

const defaultStorage = (): StorageLike => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('__probe__');
      return localStorage;
    }
  } catch {
    // private mode / blocked storage
  }
  return createMemoryStorage();
};

export interface SaveStore<T extends object> {
  get(): T;
  set(patch: Partial<T>): T;
  reset(): T;
}

/**
 * Typed, versioned save slot. Missing or corrupt data falls back to defaults,
 * and unknown keys are dropped so schema changes never crash a game.
 */
export const createSaveStore = <T extends object>(
  key: string,
  defaults: T,
  storage: StorageLike = defaultStorage(),
): SaveStore<T> => {
  const read = (): T => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
      for (const k of Object.keys(defaults)) {
        if (k in parsed) out[k] = parsed[k];
      }
      return out as T;
    } catch {
      return { ...defaults };
    }
  };

  const write = (value: T): T => {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: keep running with in-memory value
    }
    return value;
  };

  return {
    get: read,
    set: (patch) => write({ ...read(), ...patch }),
    reset: () => {
      storage.removeItem(key);
      return { ...defaults };
    },
  };
};
