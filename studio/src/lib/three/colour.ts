/**
 * OKLCH → sRGB (Phase 4 M22).
 *
 * The catalogue stores every shade as OKLCH — lightness, chroma, hue — because that is the
 * space in which a merchant's "same colour, one step deeper" actually behaves like one step,
 * and the CSS surfaces render it natively. A GPU texture, on the other hand, is bytes, and the
 * weave generator writes sRGB.
 *
 * Without this conversion the generator's hex parser rejects `oklch(63.5% 0.05 320)` and falls
 * back to its default beige — which means all 824 shades render as the *same colour* and the
 * failure looks like a lighting problem rather than a parsing one. The M22 smoke asserts the
 * output is a hex triplet for exactly that reason.
 *
 * Coefficients are the standard OKLab matrices (Björn Ottosson). Out-of-gamut colours are
 * clipped per channel, which is the right behaviour here: the catalogue's chroma is well
 * inside sRGB, so clipping only ever guards against a bad row.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Linear-light → sRGB, including the piecewise transfer function people usually skip. */
function encode(v: number): number {
  const c = clamp01(v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);
  return Math.round(c * 255);
}

/**
 * @param lightness Lightness **0-1**, as the catalogue stores it — the CSS helper is what
 *                  multiplies by 100 for `oklch()`, not the data. Passing a percentage here
 *                  sends every shade to near-black, which is a very quiet way to lose 824
 *                  colours, so the M22 smoke checks a fabric's shades stay distinct.
 * @param chroma    0 to about 0.37 in sRGB.
 * @param hueDeg    Degrees.
 */
export function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
  const L = clamp01(lightness);
  const h = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  // OKLab → LMS' → LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(encode(r))}${hex(encode(g))}${hex(encode(bl))}`;
}
