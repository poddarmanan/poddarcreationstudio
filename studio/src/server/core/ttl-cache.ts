/**
 * In-process TTL cache (Priority 12). Serves hot, rarely-changing reads (the catalogue)
 * without a DB round-trip, with explicit invalidation on writes. Per-process by design —
 * the honest single-instance equivalent of an edge/Redis cache, and the seam one would
 * swap for a distributed cache when scaling horizontally.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

export const CACHE_KEYS = {
  catalogue: 'catalogue:fabrics-with-colours',
} as const;

export class TtlCache {
  private store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Read-through helper: compute + cache on miss. */
  async getOrSet<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
