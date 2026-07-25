import type * as THREE from 'three';

/**
 * GPU texture cache (Phase 4 M21).
 *
 * Textures are the expensive thing in this app: a 1024² PBR set is four maps, and a customer
 * flicking between shades would otherwise rebuild them on every click. This cache keys on the
 * *parameters* a map was generated from, so the same weave at the same size is generated once.
 *
 * The important part is the eviction: a `THREE.Texture` holds GPU memory that JavaScript's
 * garbage collector knows nothing about. Dropping the reference is not enough — it must be
 * `dispose()`d, or the browser leaks VRAM until the context is lost. So this is an LRU with an
 * explicit disposal step, not a `Map`.
 */

export interface CacheStats {
  /** Entries a live surface is currently drawing with. */
  retained: number;
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  bytesApprox: number;
}

interface Entry {
  texture: THREE.Texture;
  bytes: number;
  usedAt: number;
  /** How many live surfaces are drawing with this texture right now. */
  refs: number;
}

export class TextureCache {
  private entries = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    /** Max entries. Deliberately small — a fabric needs 4-6 maps and we hold a few fabrics. */
    private readonly maxEntries = 48,
    /** Soft VRAM ceiling in bytes; eviction runs until we are under it. */
    private readonly maxBytes = 192 * 1024 * 1024
  ) {}

  /** Returns the cached texture, or builds it with `factory` and caches the result. */
  get(key: string, factory: () => THREE.Texture, bytes = 0): THREE.Texture {
    const hit = this.entries.get(key);
    if (hit) {
      this.hits += 1;
      hit.usedAt = performance.now();
      return hit.texture;
    }

    this.misses += 1;
    const texture = factory();
    this.entries.set(key, { texture, bytes, usedAt: performance.now(), refs: 0 });
    this.evictIfNeeded();
    return texture;
  }

  /**
   * Claims a texture against eviction. Retain/release exist separately from `get` because
   * `get` is called during render — and under StrictMode a render happens twice — while
   * effects are guaranteed to be paired. Claiming in `get` would leak a reference every
   * time a component re-rendered.
   */
  retain(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refs += 1;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Drops the least-recently-used *unclaimed* entries until both ceilings are satisfied.
   *
   * An entry a surface is still drawing with is never evicted, however old it is — freeing a
   * texture out from under a live material gives you an untextured white plane, not a
   * smaller memory footprint. If everything is claimed we go over budget and stop; that is
   * the honest outcome, and M29's adaptive quality is what lowers the demand.
   */
  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [key, entry] of this.entries) {
        if (entry.refs === 0 && entry.usedAt < oldestAt) {
          oldestAt = entry.usedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) return; // everything is in use
      this.evict(oldestKey);
      this.evictions += 1;
    }
  }

  private get bytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    return total;
  }

  /**
   * Gives up one claim. The texture stays cached — that is the entire point of a cache — and
   * simply becomes evictable again once nobody holds it.
   */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refs = Math.max(0, entry.refs - 1);
  }

  /** Disposes one entry's GPU memory and forgets it, claimed or not. */
  evict(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.texture.dispose();
    this.entries.delete(key);
  }

  /** Disposes everything — call on unmount, or the canvas leaks its whole working set. */
  clear(): void {
    for (const entry of this.entries.values()) entry.texture.dispose();
    this.entries.clear();
  }

  get stats(): CacheStats {
    let retained = 0;
    for (const entry of this.entries.values()) if (entry.refs > 0) retained += 1;
    return { size: this.entries.size, retained, hits: this.hits, misses: this.misses, evictions: this.evictions, bytesApprox: this.bytes };
  }
}

/**
 * One cache per browser tab. Textures are keyed by content, so sharing across every viewer is
 * exactly what we want — opening the comparison studio (M28) with four fabrics that the lab
 * already rendered costs nothing.
 */
const globalForCache = globalThis as unknown as { __pcTextureCache?: TextureCache };

export function getTextureCache(): TextureCache {
  if (!globalForCache.__pcTextureCache) globalForCache.__pcTextureCache = new TextureCache();
  return globalForCache.__pcTextureCache;
}

/** Approximate VRAM for an RGBA texture including its mip chain (~1.33×). */
export function approxTextureBytes(size: number, channels = 4, mipmapped = true): number {
  return Math.round(size * size * channels * (mipmapped ? 1.334 : 1));
}
