/**
 * Dress forms (the mannequins), as data.
 *
 * A black tailor's form, not a figure: torso from neck to hip on a pole. That is what a garment
 * is shown on in a showroom, and it has the advantage that it needs no arms or legs that would
 * have to be threaded through sleeves. `fitForm` reads a garment's shoulder line and chest;
 * `bodyFromGarment`, further down, reads the whole body out of the garment, and is what the
 * form is built from.
 */

export type FormSex = 'male' | 'female';

export interface FormFit {
  /** World y of the shoulder line the form reaches up to. */
  shoulderY: number;
  /** World y of the hip, where the form ends and the pole begins. */
  hipY: number;
  /** Half-width of the form at the chest, metres. */
  chest: number;
  /** Half-depth of the form at the chest, metres. */
  depth: number;
  sex: FormSex;
}

/**
 * Measures a garment and returns the form that fits inside it.
 *
 * Width is the garment's *narrowest* band between the underarm and the waist — the one band a
 * sleeve cannot widen — read at a percentile rather than the maximum so an arm hanging at the
 * side does not count as torso. Depth is read the same way, and capped by `maxDepth` where the
 * caller knows how deep the cloth actually is (the procedural cuts do). `positions` are xyz
 * triples of the garment's vertices in stage space.
 */
export interface FitOptions {
  /** Ceiling on the form's half-depth, metres, where the caller knows how deep the cloth is. */
  maxDepth?: number;
  /** Which percentile of a band's |x| and |z| to read as the torso. Lower excludes sleeves. */
  percentile?: number;
  /** Fraction of the measured torso the form fills. */
  ease?: number;
  /** How far below the garment's top the form's shoulder line sits, as a fraction of height. */
  shoulderDrop?: number;
}

export function fitForm(positions: ArrayLike<number>, sex: FormSex, options: FitOptions = {}): FormFit | null {
  const { maxDepth = Infinity, percentile = 0.6, ease = 0.84, shoulderDrop = 0.07 } = options;
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    const y = positions[i];
    if (y > top) top = y;
    if (y < bottom) bottom = y;
  }
  const height = top - bottom;
  if (!(height > 0)) return null;

  const band = (yc: number, pick: (v: number, i: number) => number) => {
    const values: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1] - yc) < height * 0.025) values.push(Math.abs(pick(positions[i], i)));
    }
    if (values.length < 8) return null;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * percentile)];
  };

  let width = Infinity;
  let depth = Infinity;
  for (let f = 0.22; f <= 0.5; f += 0.02) {
    const yc = top - height * f;
    const w = band(yc, (v) => v);
    const d = band(yc, (_, i) => positions[i + 2]);
    if (w !== null && w < width) width = w;
    if (d !== null && d < depth) depth = d;
  }
  if (!Number.isFinite(width)) return null;
  if (!Number.isFinite(depth)) depth = width * 0.6;

  const chest = width * ease;
  return {
    shoulderY: top - height * shoulderDrop,
    hipY: Math.max(bottom + 0.02, top - Math.min(height * 0.6, 0.62)),
    chest,
    depth: Math.min(depth * 0.8, maxDepth, chest * 0.72),
    sex,
  };
}

// ---------------------------------------------------------------------------------------------
// A body measured from the garment, ring by ring and sector by sector.
//
// The profile above fits a form *inside* a garment with room to spare, and from most angles that
// reads as a garment hanging on a stand. Turn it, look down a neckline or through an armhole,
// and the gap shows: the cloth is a shell with nothing in it. A dress form in a showroom fills
// the garment — the cloth lies on it. So the body is now read from the garment itself: at every
// two centimetres of height, in each of 32 directions around the axis, how far out the cloth is
// (sleeves left out), less a clearance, is a point on the body. The garment's collar becomes
// the neck, its shoulders the shoulders, its waist the waist, whatever the cut, and a cross-
// section that is not an ellipse — a shirt is flatter across the chest than an ellipse through
// its extremes — is followed rather than overshot. Below the hip, the pole.
// ---------------------------------------------------------------------------------------------

export const BODY_SECTORS = 32;

export interface FormRing {
  y: number;
  /** Centre of the ring front-to-back — a garment is not always modelled about its own axis. */
  cz: number;
  /** Radius in each of BODY_SECTORS directions, sector k at angle k·2π/SECTORS from +x towards +z. */
  radii: Float32Array;
}

export interface FormBody {
  /** Top ring first (the neck opening), hip last. */
  rings: FormRing[];
  /** Radius of the neck stump that rises out of the top ring. */
  neckR: number;
  sex: FormSex;
}

export interface BodyOptions {
  /** How far inside the cloth the body sits, metres. */
  clearance?: number;
  /** Ring spacing, metres. */
  step?: number;
  /** How far below the garment's top the body may reach before the pole takes over, metres. */
  reach?: number;
}

/** Mean radius of a ring. */
export function ringMean(ring: FormRing): number {
  let sum = 0;
  for (let k = 0; k < ring.radii.length; k++) sum += ring.radii[k];
  return sum / ring.radii.length;
}

/** Radius of a ring at an angle, interpolated between its sectors. */
export function ringRadius(ring: FormRing, angle: number): number {
  const n = ring.radii.length;
  let f = (angle / (Math.PI * 2)) * n;
  f = ((f % n) + n) % n;
  const k = Math.floor(f);
  const t = f - k;
  return ring.radii[k] * (1 - t) + ring.radii[(k + 1) % n] * t;
}

function smoothRing(radii: Float32Array, passes: number): void {
  const n = radii.length;
  for (let pass = 0; pass < passes; pass++) {
    const copy = Float32Array.from(radii);
    for (let k = 0; k < n; k++) radii[k] = (copy[(k + n - 1) % n] + 2 * copy[k] + copy[(k + 1) % n]) / 4;
  }
}

/**
 * Reads the body inside a garment. `positions` are xyz triples in stage space; `membership`,
 * when given, marks sleeve vertices (non-zero), which are not body. Returns null when there is
 * not enough garment to read.
 */
export function bodyFromGarment(positions: ArrayLike<number>, membership: ArrayLike<number> | null, sex: FormSex, options: BodyOptions = {}): FormBody | null {
  const { clearance = 0.012, step = 0.02, reach = 0.66 } = options;
  const n = positions.length / 3;
  const S = BODY_SECTORS;
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < n; i++) {
    if (membership && membership[i]) continue;
    const y = positions[i * 3 + 1];
    if (y > top) top = y;
    if (y < bottom) bottom = y;
  }
  if (!(top - bottom > 0.1)) return null;
  const lowest = Math.max(bottom + 0.03, top - reach);

  // Vertices sorted into height bins once, so each ring is a slice rather than a scan. A dense
  // model is sampled: forty thousand vertices describe a body as well as two hundred thousand,
  // and this runs on the main thread of a phone the moment a model arrives.
  const bins: number[][] = [];
  const binOf = (y: number) => Math.floor((top - y) / step);
  const stride = Math.max(1, Math.floor(n / 40000));
  for (let i = 0; i < n; i += stride) {
    if (membership && membership[i]) continue;
    const b = binOf(positions[i * 3 + 1]);
    (bins[b] ??= []).push(i);
  }

  const percentile = (values: number[], p: number) => {
    values.sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.floor(values.length * p))];
  };
  const raw: (FormRing | null)[] = [];
  for (let y = top - step / 2; y >= lowest; y -= step) {
    const b = binOf(y);
    const members = [...(bins[b - 1] ?? []), ...(bins[b] ?? []), ...(bins[b + 1] ?? [])].filter((i) => Math.abs(positions[i * 3 + 1] - y) < step * 0.75);
    if (members.length < 6) {
      raw.push(null);
      continue;
    }
    // The ring's centre front-to-back is the middle of its z range; sideways it is the axis.
    const zs = members.map((i) => positions[i * 3 + 2]);
    const cz = (percentile(zs.slice(), 0.03) + percentile(zs.slice(), 0.97)) / 2;
    // In each direction the cloth's distance from the centre: a low percentile, so a fold that
    // bulges out does not push the body out with it — the dips are where the body is.
    const sectors: number[][] = Array.from({ length: S }, () => []);
    for (const i of members) {
      const x = positions[i * 3];
      const dz = positions[i * 3 + 2] - cz;
      let angle = Math.atan2(dz, x);
      if (angle < 0) angle += Math.PI * 2;
      sectors[Math.min(S - 1, Math.floor((angle / (Math.PI * 2)) * S))].push(Math.hypot(x, dz));
    }
    const radii = new Float32Array(S).fill(NaN);
    for (let k = 0; k < S; k++) if (sectors[k].length >= 3) radii[k] = percentile(sectors[k], 0.3);
    // Directions with no cloth (an armhole, the gap at a placket) take their neighbours'.
    const known = [...radii].some((r) => !Number.isNaN(r));
    if (!known) {
      raw.push(null);
      continue;
    }
    for (let k = 0; k < S; k++) {
      if (!Number.isNaN(radii[k])) continue;
      let before = k;
      let after = k;
      let d1 = 0;
      let d2 = 0;
      while (Number.isNaN(radii[before])) { before = (before + S - 1) % S; d1++; }
      while (Number.isNaN(radii[after])) { after = (after + 1) % S; d2++; }
      radii[k] = (radii[before] * d2 + radii[after] * d1) / (d1 + d2);
    }
    for (let k = 0; k < S; k++) radii[k] = Math.max(0.015, radii[k] - clearance);
    smoothRing(radii, 2);
    raw.push({ y, cz, radii });
  }
  if (raw.filter(Boolean).length < 4) return null;

  // Rings with too little cloth to read take their neighbours'.
  const rings: FormRing[] = [];
  for (let k = 0; k < raw.length; k++) {
    const y = top - step / 2 - k * step;
    const ring = raw[k];
    if (ring) {
      rings.push(ring);
      continue;
    }
    let above = k - 1;
    while (above >= 0 && !raw[above]) above--;
    let below = k + 1;
    while (below < raw.length && !raw[below]) below++;
    const a = above >= 0 ? raw[above] : null;
    const c = below < raw.length ? raw[below] : null;
    if (a && c) rings.push({ y, cz: (a.cz + c.cz) / 2, radii: a.radii.map((r, i) => (r + c.radii[i]) / 2) });
    else if (a ?? c) rings.push({ y, cz: (a ?? c)!.cz, radii: Float32Array.from((a ?? c)!.radii) });
  }

  // Seams and folds put bumps on the reading from ring to ring; a body has none. Two passes of
  // a 3-tap average down the body, ends held.
  for (let pass = 0; pass < 2; pass++) {
    const copy = rings.map((r) => ({ cz: r.cz, radii: Float32Array.from(r.radii) }));
    for (let k = 1; k < rings.length - 1; k++) {
      rings[k].cz = (copy[k - 1].cz + 2 * copy[k].cz + copy[k + 1].cz) / 4;
      for (let s2 = 0; s2 < S; s2++) rings[k].radii[s2] = (copy[k - 1].radii[s2] + 2 * copy[k].radii[s2] + copy[k + 1].radii[s2]) / 4;
    }
  }

  const neckR = Math.min(0.06, Math.max(0.035, ringMean(rings[0]) * 0.9));
  return { rings, neckR, sex };
}

/**
 * A standard dress form, for a garment that hugs the body only in places: a saree is a fitted
 * blouse over yards of loose drape, with a pallu over one shoulder, and a body read out of that
 * comes out lopsided wherever the cloth stands off it. The form is a size-M tailor's form, as
 * half-width and half-depth by drop below the shoulder line, metres; `size` scales it, and its
 * shoulder line sits at `shoulderY`.
 */
const STANDARD_FORM: Record<FormSex, [number, number, number][]> = {
  female: [
    [0.0, 0.15, 0.075], [0.04, 0.172, 0.09], [0.1, 0.165, 0.104], [0.18, 0.158, 0.118], [0.26, 0.14, 0.104],
    [0.34, 0.122, 0.09], [0.42, 0.138, 0.098], [0.52, 0.162, 0.108], [0.58, 0.165, 0.108],
  ],
  male: [
    [0.0, 0.17, 0.085], [0.04, 0.2, 0.1], [0.12, 0.19, 0.115], [0.22, 0.175, 0.112], [0.34, 0.155, 0.1],
    [0.46, 0.158, 0.1], [0.56, 0.165, 0.105],
  ],
};

export function standardBody(sex: FormSex, shoulderY: number, size = 1): FormBody {
  const table = STANDARD_FORM[sex];
  const step = 0.02;
  const end = table[table.length - 1][0];
  const rings: FormRing[] = [];
  for (let drop = 0; drop <= end + 1e-6; drop += step) {
    let k = 0;
    while (k < table.length - 2 && table[k + 1][0] < drop) k++;
    const [d0, w0, z0] = table[k];
    const [d1, w1, z1] = table[k + 1];
    const t = Math.max(0, Math.min(1, (drop - d0) / (d1 - d0)));
    const e = t * t * (3 - 2 * t);
    const a = (w0 + (w1 - w0) * e) * size;
    const b = (z0 + (z1 - z0) * e) * size;
    const radii = new Float32Array(BODY_SECTORS);
    for (let s2 = 0; s2 < BODY_SECTORS; s2++) {
      const ang = (s2 / BODY_SECTORS) * Math.PI * 2;
      radii[s2] = 1 / Math.sqrt((Math.cos(ang) / a) ** 2 + (Math.sin(ang) / b) ** 2);
    }
    rings.push({ y: shoulderY - drop * size, cz: 0, radii });
  }
  return { rings, neckR: 0.05 * size, sex };
}

/** The body's ring at a height, interpolated; null above the neck or well below the hip. */
export function bodyRing(body: FormBody, y: number): FormRing | null {
  const { rings } = body;
  const top = rings[0].y;
  const bottom = rings[rings.length - 1].y;
  if (y > top + 0.02 || y < bottom - 0.06) return null;
  if (y >= top) return rings[0];
  if (y <= bottom) {
    // Below the hip the body rounds off to nothing over 6cm.
    const round = Math.sqrt(Math.max(0, 1 - ((bottom - y) / 0.06) ** 2));
    const last = rings[rings.length - 1];
    return { y, cz: last.cz, radii: last.radii.map((r) => r * round) };
  }
  const stepY = rings.length > 1 ? rings[0].y - rings[1].y : 1;
  const k = Math.min(rings.length - 2, Math.max(0, Math.floor((top - y) / stepY)));
  const a = rings[k];
  const b = rings[k + 1];
  const t = Math.max(0, Math.min(1, (a.y - y) / (a.y - b.y || 1)));
  return { y, cz: a.cz + (b.cz - a.cz) * t, radii: a.radii.map((r, i) => r + (b.radii[i] - r) * t) };
}
