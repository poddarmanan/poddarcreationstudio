/**
 * Pure, isomorphic colour science (Priority 9). Derives every stored colour metric from a
 * colour's canonical OKLCH values: HEX, RGB, CIELAB, brightness, saturation, temperature,
 * and WCAG contrast against the brand ink/cream. Also ΔE for similarity/relationships.
 * No dependencies — safe in the seed script, the upload pipeline, and the browser.
 */

export const INK = '#1C1917';
export const CREAM = '#FAF8F5';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface ColourMetrics {
  hex: string;
  rgbR: number;
  rgbG: number;
  rgbB: number;
  labL: number;
  labA: number;
  labB: number;
  brightness: number; // WCAG relative luminance, 0..1
  saturation: number; // HSL saturation, 0..1
  temperature: 'warm' | 'cool' | 'neutral';
  contrastInk: number; // WCAG contrast ratio vs brand ink
  contrastCream: number; // WCAG contrast ratio vs brand cream
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** OKLCH (l 0..1, c, h degrees) → linear-light sRGB, then gamut-clamped. */
function oklchToLinearSrgb(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return [
    clamp01(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp01(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp01(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

const linToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const [lr, lg, lb] = oklchToLinearSrgb(l, c, h);
  return {
    r: Math.round(clamp01(linToSrgb(lr)) * 255),
    g: Math.round(clamp01(linToSrgb(lg)) * 255),
    b: Math.round(clamp01(linToSrgb(lb)) * 255),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** linear-sRGB channel from an 8-bit sRGB channel. */
const srgbToLin = (c8: number) => {
  const x = c8 / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance (0..1). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** HSL saturation (0..1). */
export function hslSaturation({ r, g, b }: Rgb): number {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/** sRGB → CIELAB (D65). */
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  // linear sRGB → XYZ (D65)
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** CIE76 ΔE between two CIELAB colours (simple, adequate for nearest-shade ranking). */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Warm/cool/neutral from OKLCH hue + chroma (near-grey → neutral). In OKLCH, warm hues
 * (red→orange→yellow) run ~[0,110], plus pink/magenta ~[340,360); the rest (green→blue→
 * violet) read cool.
 */
export function classifyTemperature(c: number, h: number): 'warm' | 'cool' | 'neutral' {
  if (c < 0.035) return 'neutral';
  return h < 110 || h >= 340 ? 'warm' : 'cool';
}

const INK_RGB = hexToRgb(INK);
const CREAM_RGB = hexToRgb(CREAM);

/** Compute the full metric set for a colour from its OKLCH values. */
export function computeColourMetrics(l: number, c: number, h: number): ColourMetrics {
  const rgb = oklchToRgb(l, c, h);
  const lab = rgbToLab(rgb);
  return {
    hex: rgbToHex(rgb),
    rgbR: rgb.r,
    rgbG: rgb.g,
    rgbB: rgb.b,
    labL: Math.round(lab.L * 100) / 100,
    labA: Math.round(lab.a * 100) / 100,
    labB: Math.round(lab.b * 100) / 100,
    brightness: Math.round(relativeLuminance(rgb) * 1000) / 1000,
    saturation: Math.round(hslSaturation(rgb) * 1000) / 1000,
    temperature: classifyTemperature(c, h),
    contrastInk: contrastRatio(rgb, INK_RGB),
    contrastCream: contrastRatio(rgb, CREAM_RGB),
  };
}
