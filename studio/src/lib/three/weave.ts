/**
 * Procedural weave maps (Phase 4 M21; extended to full PBR in M22).
 *
 * **Why generated rather than downloaded.** A stock fabric texture is a photograph of *some*
 * cloth. This catalogue has nine qualities with real specifications already in the codebase —
 * weight, composition, thread count, hand, sheen, flow, stretch — and a customer is deciding
 * whether to order *this* one. Deriving the weave from those numbers means the render is a
 * picture of the actual product: a 40s cambric and a 20kg gajji silk differ on screen because
 * they differ on the spec sheet, not because someone picked different JPEGs.
 *
 * It is also deterministic (same fabric → same bytes), license-free, resolution-independent,
 * and adds nothing to the bundle.
 *
 * Everything here is pure and canvas-based, so it runs in a worker, in the main thread, or in a
 * headless browser during tests.
 */

export type WeaveKind = 'plain' | 'twill' | 'satin' | 'rib' | 'knit';

export interface WeaveSpec {
  /** Interlacing pattern — the single biggest visual difference between qualities. */
  kind: WeaveKind;
  /** Threads per unit across the tile. Higher = finer, denser cloth. */
  threadCount: number;
  /** 0-1. Specular sharpness; silk is high, cambric is low. */
  sheen: number;
  /** 0-1. How much the yarn is allowed to wander — cheap yarn is irregular. */
  irregularity: number;
  /** Base colour as #rrggbb. */
  hex: string;
  /** Deterministic seed so a fabric always renders identically. */
  seed: number;
}

/** Maps a fabric family from the catalogue onto its interlacing. */
export function weaveKindForFamily(family: string): WeaveKind {
  const f = family.toLowerCase();
  if (f.includes('silk')) return 'satin';
  if (f.includes('lycra') || f.includes('knit') || f.includes('jersey')) return 'knit';
  if (f.includes('twill') || f.includes('denim')) return 'twill';
  if (f.includes('rib') || f.includes('cord')) return 'rib';
  return 'plain';
}

/** Small, fast, seedable PRNG — deterministic across runs and platforms. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [200, 190, 175];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Is this cell a warp float (thread over) or weft (thread under)?
 * This one function is what makes a satin read as satin and a twill as twill.
 */
function isWarpOver(kind: WeaveKind, x: number, y: number): boolean {
  switch (kind) {
    case 'twill':
      // Diagonal wale: the float steps one column per row.
      return (x + y) % 4 < 2;
    case 'satin':
      // Long floats, scattered so the eye reads a continuous sheen rather than a grid.
      return (x + y * 3) % 5 !== 0;
    case 'rib':
      // Paired columns — a raised cord.
      return Math.floor(x / 2) % 2 === 0;
    case 'knit':
      // Interlocking loops: a staggered brick, offset every other row.
      return (x + (Math.floor(y / 2) % 2)) % 2 === 0;
    case 'plain':
    default:
      return (x + y) % 2 === 0;
  }
}

export interface GeneratedMaps {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  /** Red = ambient occlusion, green = roughness, blue = unused. One texture, two channels. */
  ormap: HTMLCanvasElement;
  size: number;
}

/**
 * Renders the albedo (base colour) and normal (surface relief) maps for a weave.
 *
 * The normal map is derived from the same height field that shades the albedo, so the lighting
 * and the colour agree — a thread that looks raised *is* raised as far as the shader is
 * concerned. Both tile seamlessly: the pattern functions are periodic and the sampling wraps.
 */
export function generateWeaveMaps(spec: WeaveSpec, size: number): GeneratedMaps {
  const [r, g, b] = hexToRgb(spec.hex);
  const rand = mulberry32(spec.seed);

  // Threads across the tile. Clamped so a 40s cambric stays legible at 256px and a coarse
  // weave does not turn into mush at 1024.
  const threads = Math.max(8, Math.min(Math.round(spec.threadCount), Math.floor(size / 3)));
  const cell = size / threads;

  // Per-thread jitter, computed once: real yarn is not perfectly regular, and the irregularity
  // is what stops a render looking like graph paper.
  const jitterX = Array.from({ length: threads }, () => (rand() - 0.5) * spec.irregularity);
  const jitterY = Array.from({ length: threads }, () => (rand() - 0.5) * spec.irregularity);
  const shadeX = Array.from({ length: threads }, () => 1 + (rand() - 0.5) * spec.irregularity * 0.5);

  const height = new Float32Array(size * size);
  const albedo = createCanvas(size);
  const albedoCtx = albedo.getContext('2d')!;
  const albedoData = albedoCtx.createImageData(size, size);

  // Occlusion and roughness travel together in one texture (M22). They are both single-channel
  // and both derived from the same relief, so packing them halves the uploads and the samples:
  // red is how much ambient light the gap between threads loses, green is how rough the fibre
  // is at that point. Blue is spare.
  const ormap = createCanvas(size);
  const ormCtx = ormap.getContext('2d')!;
  const ormData = ormCtx.createImageData(size, size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const tx = Math.floor(px / cell);
      const ty = Math.floor(py / cell);
      const warpOver = isWarpOver(spec.kind, tx, ty);

      // Position within the thread, 0..1, nudged by that thread's jitter.
      const u = ((px % cell) / cell + jitterX[tx % threads] * 0.15 + 1) % 1;
      const v = ((py % cell) / cell + jitterY[ty % threads] * 0.15 + 1) % 1;

      // A thread is a cylinder: brightest along its crown, falling off to the gap either side.
      const across = warpOver ? u : v;
      const crown = Math.sin(across * Math.PI); // 0 at the edges, 1 at the centre
      const h = warpOver ? 0.55 + crown * 0.45 : 0.2 + crown * 0.35;

      const i = py * size + px;
      height[i] = h;

      // Shade the colour by the same relief, tinted slightly warm in the crowns where more
      // light returns, and modulated per-thread so no two picks are identical.
      const lift = (h - 0.5) * (0.35 + spec.sheen * 0.4);
      const tone = shadeX[(warpOver ? tx : ty) % threads];
      const o = i * 4;
      albedoData.data[o] = clamp255(r * tone * (1 + lift * 1.05));
      albedoData.data[o + 1] = clamp255(g * tone * (1 + lift));
      albedoData.data[o + 2] = clamp255(b * tone * (1 + lift * 0.95));
      albedoData.data[o + 3] = 255;

      // Ambient occlusion: the valleys between threads see less of the sky. This is what stops
      // a weave reading as a printed pattern on a flat card.
      const ao = 0.55 + h * 0.45;
      // Roughness: a thread's crown is where the fibres lie parallel and catch a highlight;
      // the gaps are broken fibre ends and scatter. Sheen decides how far apart those two get,
      // which is the whole difference between gajji silk and cambric.
      const rough = 1 - spec.sheen * (0.25 + crown * 0.6);
      ormData.data[o] = clamp255(ao * 255);
      ormData.data[o + 1] = clamp255(rough * 255);
      ormData.data[o + 2] = 0;
      ormData.data[o + 3] = 255;
    }
  }
  albedoCtx.putImageData(albedoData, 0, 0);
  ormCtx.putImageData(ormData, 0, 0);

  return { albedo, normal: heightToNormal(height, size, 1.4 + spec.sheen), ormap, size };
}

/**
 * Converts a height field to a tangent-space normal map by central differences.
 * Sampling wraps, so the result tiles as seamlessly as its input.
 */
export function heightToNormal(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1) into the 0..255 encoding shaders expect.
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      image.data[o] = clamp255(((-dx / len) * 0.5 + 0.5) * 255);
      image.data[o + 1] = clamp255(((-dy / len) * 0.5 + 0.5) * 255);
      image.data[o + 2] = clamp255((1 / len) * 0.5 * 255 + 127.5);
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** OffscreenCanvas where available (workers, no DOM cost), a real canvas otherwise. */
function createCanvas(size: number): HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') {
    return new OffscreenCanvas(size, size) as unknown as HTMLCanvasElement;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

/** Stable cache key: same inputs → same key → generated once per tab. */
export function weaveCacheKey(spec: WeaveSpec, size: number, map: string): string {
  return `${map}:${spec.kind}:${spec.threadCount}:${spec.hex}:${spec.seed}:${spec.sheen.toFixed(2)}:${spec.irregularity.toFixed(2)}:${size}`;
}
