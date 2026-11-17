/** Cache TTLs (seção 5.1). */
export const TTL = {
  player: 10 * 60 * 1000,
  champion: 6 * 60 * 60 * 1000,
  ddragon: 24 * 60 * 60 * 1000,
} as const;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with per-key TTL. It lives per server instance,
 * which is enough for the MVP (no database by design).
 */
export class TTLCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private now: () => number = Date.now) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Returns the cached value or loads it. Concurrent calls for the same key
   * share one load. Errors are not cached.
   */
  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = load()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

/** Shared cache for the whole server process. */
export const cache = new TTLCache();
