/**
 * Rate limiting (Priority 3). Fixed-window counter behind an interface so a distributed
 * store (Redis/Upstash) can replace the in-memory driver for multi-instance deployments
 * without touching call sites. In-memory state is per server process — correct for single
 * instance / dev, and the documented extension point for horizontal scaling.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.maybeSweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt };
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit;
    return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
  }

  /** Evict expired buckets occasionally so the map can't grow unbounded. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.buckets) {
      if (v.resetAt <= now) this.buckets.delete(k);
    }
  }
}

export interface RateLimitPolicy {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Stable name mixed into the bucket key, so different policies don't share counters. */
  name: string;
}

export const RATE_LIMITS = {
  auth: { name: 'auth', limit: 10, windowMs: 60_000 },
  register: { name: 'register', limit: 5, windowMs: 60_000 },
  quote: { name: 'quote', limit: 15, windowMs: 60_000 },
  upload: { name: 'upload', limit: 60, windowMs: 60_000 },
  write: { name: 'write', limit: 40, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;
