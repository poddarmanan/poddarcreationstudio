/**
 * Dress forms (the mannequins), as data.
 *
 * A black tailor's form, not a figure: torso from neck to hip on a pole. That is what a garment
 * is shown on in a showroom, and it has the advantage that it needs no arms or legs that would
 * have to be threaded through sleeves. Two profiles — a man's and a woman's — each a list of
 * (height, half-width, half-depth) rows from the hip up to the shoulder, relative to the chest
 * (which is 1 × 1), so one profile fits any garment once the chest has been measured.
 */

export type FormSex = 'male' | 'female';

/** [height fraction hip→shoulder, half-width ÷ chest half-width, half-depth ÷ chest half-depth] */
export const FORM_PROFILE: Record<FormSex, [number, number, number][]> = {
  male: [
    [0.0, 0.86, 0.88],
    [0.15, 0.88, 0.9],
    [0.35, 0.9, 0.9],
    [0.55, 0.96, 0.96],
    [0.72, 1.0, 1.0],
    [0.86, 1.0, 0.94],
    [0.96, 0.92, 0.76],
    [1.0, 0.7, 0.64],
  ],
  female: [
    [0.0, 0.98, 0.94],
    [0.14, 0.94, 0.88],
    [0.32, 0.76, 0.72],
    [0.5, 0.86, 0.86],
    [0.64, 1.0, 1.0],
    [0.78, 0.96, 0.86],
    [0.92, 0.84, 0.66],
    [1.0, 0.62, 0.54],
  ],
};

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

/** Half-radii of the form at a height, for the cloth to collide against. */
export function formRadii(fit: FormFit, y: number): { rx: number; rz: number } | null {
  if (y < fit.hipY - 0.06 || y > fit.shoulderY + 0.02) return null;
  const t = Math.max(0, Math.min(1, (y - fit.hipY) / (fit.shoulderY - fit.hipY)));
  const rows = FORM_PROFILE[fit.sex];
  let a = rows[0];
  let b = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (t >= rows[i][0] && t <= rows[i + 1][0]) {
      a = rows[i];
      b = rows[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const k = (t - a[0]) / span;
  // Below the hip the form rounds off to nothing over 6cm.
  const round = y < fit.hipY ? Math.sqrt(Math.max(0, 1 - ((fit.hipY - y) / 0.06) ** 2)) : 1;
  return { rx: fit.chest * (a[1] + (b[1] - a[1]) * k) * round, rz: fit.depth * (a[2] + (b[2] - a[2]) * k) * round };
}
