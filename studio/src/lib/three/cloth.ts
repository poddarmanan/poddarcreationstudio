/**
 * A small cloth simulation (Phase 4 M25, extended).
 *
 * Position-based dynamics: Verlet integration, distance constraints solved by relaxation, and a
 * collision callback. It is what runs a garment on the stage — the folds a buyer sees are still
 * the drape function's, laid over the top as detail, but *where the cloth is* comes from here:
 * it hangs from its shoulders under gravity, sits against the form, swings when the turntable
 * is flicked and is pushed about by the wind.
 *
 * Pure and dependency-free so it can be stepped in a test without a renderer, and so the
 * numbers that keep it stable are in one place:
 *
 * - **Substeps and iterations** trade cost for stiffness. Relaxation never reaches the exact
 *   solution, so a cloth always stretches a little under load; more iterations, less stretch.
 * - **Reduced gravity.** Real gravity on an approximate solver reads as a garment slowly
 *   melting off its form. A quarter of it, with the rest lengths taken from the fitted shape,
 *   holds the shape and still lets a hem swing back after a flick.
 * - **Damping** is what stops a flicked garment from swinging for a minute.
 */

export interface ClothForces {
  /** Metres per second squared, downward positive. */
  gravity: number;
  /** Wind push, as acceleration, in the cloth's local frame. */
  wind: [number, number, number];
  /** Angular velocity and acceleration of the turntable about y, radians. */
  spin: { omega: number; alpha: number };
  /** Extra downward acceleration on the lowest part of the cloth — the stretch test's tug. */
  tug: number;
  /** Velocity damping per second; 2.2 if omitted. Higher settles faster and swings less. */
  damping?: number;
}

/** Returns the corrected position if `p` is inside a solid, or null if it is clear. */
export type Collider = (x: number, y: number, z: number, out: Float32Array) => boolean;

export class Cloth {
  readonly count: number;
  readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly rest: Float32Array;
  private readonly pinned: Uint8Array;
  private readonly edges: Uint32Array;
  private readonly lengths: Float32Array;
  private readonly bottom: Float32Array;
  private readonly scratch = new Float32Array(3);

  constructor(rest: Float32Array, edges: Uint32Array, pinned: Uint8Array) {
    this.count = rest.length / 3;
    this.rest = rest;
    this.pos = Float32Array.from(rest);
    this.prev = Float32Array.from(rest);
    this.pinned = pinned;
    this.edges = edges;
    this.lengths = new Float32Array(edges.length / 2);
    for (let e = 0; e < this.lengths.length; e++) {
      const a = edges[e * 2] * 3;
      const b = edges[e * 2 + 1] * 3;
      this.lengths[e] = Math.hypot(rest[b] - rest[a], rest[b + 1] - rest[a + 1], rest[b + 2] - rest[a + 2]);
    }
    // How far down the cloth each vertex is, 0 at the top, 1 at the hem — for the tug.
    let top = -Infinity;
    let low = Infinity;
    for (let i = 1; i < rest.length; i += 3) {
      if (rest[i] > top) top = rest[i];
      if (rest[i] < low) low = rest[i];
    }
    this.bottom = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.bottom[i] = (top - rest[i * 3 + 1]) / (top - low || 1);
  }

  /** True if any vertex has stopped being a number — the one failure a solver cannot recover from on its own. */
  broken(): boolean {
    for (let i = 0; i < this.pos.length; i++) if (!Number.isFinite(this.pos[i])) return true;
    return false;
  }

  /** Puts every vertex back where it started. */
  reset(): void {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
  }

  /**
   * Advances the cloth by `dt` seconds.
   *
   * @param collide  pushes a vertex out of any solid it has entered.
   * @param substeps two is enough at 60fps; the cost is linear in it.
   * @param iterations relaxation passes per substep; eight keeps stretch under a few percent.
   */
  step(dt: number, forces: ClothForces, collide: Collider | null, substeps = 2, iterations = 8): void {
    const h = Math.min(dt, 1 / 30) / substeps;
    const damping = 1 - Math.min(0.5, (forces.damping ?? 2.2) * h);
    const { pos, prev, pinned, edges, lengths, count, bottom, scratch } = this;
    const [wx, wy, wz] = forces.wind;
    const { omega, alpha } = forces.spin;

    for (let s = 0; s < substeps; s++) {
      // Integrate.
      for (let i = 0; i < count; i++) {
        if (pinned[i]) continue;
        const o = i * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        // The turntable's motion, felt in the cloth's own frame: centrifugal outward, and the
        // tangential kick of a change in speed. This is what makes a hem flare on a flick.
        const ax = wx + omega * omega * x - alpha * -z;
        const ay = wy - forces.gravity - forces.tug * bottom[i] * bottom[i];
        const az = wz + omega * omega * z - alpha * x;
        const nx = x + (x - prev[o]) * damping + ax * h * h;
        const ny = y + (y - prev[o + 1]) * damping + ay * h * h;
        const nz = z + (z - prev[o + 2]) * damping + az * h * h;
        prev[o] = x;
        prev[o + 1] = y;
        prev[o + 2] = z;
        pos[o] = nx;
        pos[o + 1] = ny;
        pos[o + 2] = nz;
      }

      // Relax the distance constraints.
      for (let it = 0; it < iterations; it++) {
        for (let e = 0; e < lengths.length; e++) {
          const a = edges[e * 2];
          const b = edges[e * 2 + 1];
          const pa = pinned[a];
          const pb = pinned[b];
          if (pa && pb) continue;
          const ao = a * 3;
          const bo = b * 3;
          const dx = pos[bo] - pos[ao];
          const dy = pos[bo + 1] - pos[ao + 1];
          const dz = pos[bo + 2] - pos[ao + 2];
          const len = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = (len - lengths[e]) / len;
          const wa = pa ? 0 : pb ? 1 : 0.5;
          const wb = pb ? 0 : pa ? 1 : 0.5;
          pos[ao] += dx * diff * wa;
          pos[ao + 1] += dy * diff * wa;
          pos[ao + 2] += dz * diff * wa;
          pos[bo] -= dx * diff * wb;
          pos[bo + 1] -= dy * diff * wb;
          pos[bo + 2] -= dz * diff * wb;
        }
        if (collide) {
          for (let i = 0; i < count; i++) {
            if (pinned[i]) continue;
            const o = i * 3;
            if (collide(pos[o], pos[o + 1], pos[o + 2], scratch)) {
              pos[o] = scratch[0];
              pos[o + 1] = scratch[1];
              pos[o + 2] = scratch[2];
            }
          }
        }
      }
    }
  }
}

/** Unique undirected edges of an indexed triangle mesh, as a flat pair list. */
export function edgesOf(index: ArrayLike<number>): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * 4294967296 + hi;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(lo, hi);
  };
  for (let i = 0; i < index.length; i += 3) {
    add(index[i], index[i + 1]);
    add(index[i + 1], index[i + 2]);
    add(index[i + 2], index[i]);
  }
  return Uint32Array.from(out);
}

/**
 * Bending springs: for every edge shared by two triangles, the pair of vertices *opposite* that
 * edge. Held at their rest distance, they resist the surface folding across the edge — the
 * cheap, standard stand-in for a bending constraint. Without them a triangle mesh under gravity
 * crumples like paper: edge constraints alone say nothing about the angle between faces.
 */
export function bendEdgesOf(index: ArrayLike<number>): Uint32Array {
  const opposite = new Map<number, number[]>();
  const key = (a: number, b: number) => Math.min(a, b) * 4294967296 + Math.max(a, b);
  for (let i = 0; i < index.length; i += 3) {
    const tri = [index[i], index[i + 1], index[i + 2]];
    for (let e = 0; e < 3; e++) {
      const k = key(tri[e], tri[(e + 1) % 3]);
      const list = opposite.get(k) ?? [];
      list.push(tri[(e + 2) % 3]);
      opposite.set(k, list);
    }
  }
  const out: number[] = [];
  for (const list of opposite.values()) if (list.length === 2 && list[0] !== list[1]) out.push(list[0], list[1]);
  return Uint32Array.from(out);
}
