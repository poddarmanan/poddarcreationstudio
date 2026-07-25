import { RIG_LIGHT, type RigLight } from './rig-light';
import { hexToOklab, shadeDistance } from './colour';

/**
 * Metamerism (Phase 4 M26).
 *
 * Two dye lots can match perfectly under a shop's tubes and be visibly different in daylight.
 * For a wholesale dyed-fabric business that is not a curiosity — it is the most common and most
 * expensive complaint there is, because the buyer approved the shade in one light and the
 * garment is worn in another.
 *
 * The studio already lets a buyer put cloth under five lighting conditions. This computes what
 * each one actually does to a shade and how far apart the results are, so the answer is a
 * number rather than an impression.
 *
 * The model is deliberately the same one the renderer uses — albedo multiplied by the rig's
 * summed illumination, then exposed — so the figure agrees with what the buyer is looking at.
 * It is not a spectral simulation: real metamerism needs spectral reflectance for the dye and
 * spectral power for the lamp, and this catalogue records neither. What it does capture is the
 * chromatic adaptation part, which is the part the customer sees.
 */

export interface ShadeUnderLight {
  light: string;
  hex: string;
  /** How far this rendering sits from the shade under a neutral white cyc. */
  shiftFromNeutral: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const enc = (v: number) => Math.round(clamp01(v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055) * 255);
const dec = (b: number) => {
  const v = b / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [dec((v >> 16) & 255), dec((v >> 8) & 255), dec(v & 255)];
}

/** What a shade looks like under one rig — the renderer's own arithmetic, on the CPU. */
export function shadeUnderLight(albedoHex: string, rig: RigLight): string {
  const [ar, ag, ab] = rgb(albedoHex);
  const [kr, kg, kb] = rgb(rig.key.colour);
  const [fr, fg, fb] = rgb(rig.fill.colour);
  const [mr, mg, mb] = rgb(rig.ambient.colour);

  // A surface facing the key takes most of it, some of the fill, and all of the ambient. The
  // 0.42 is the Lambert term for cloth at the angle the viewer presents it, not a fudge.
  const light = (k: number, f: number, m: number) =>
    k * rig.key.intensity * 0.42 + f * rig.fill.intensity * 0.3 + m * rig.ambient.intensity;

  // ACES-ish shoulder, matching the renderer's tone mapping closely enough that the swatch and
  // the canvas agree.
  const tone = (v: number) => {
    const x = v * rig.exposure;
    return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  };

  return `#${[tone(ar * light(kr, fr, mr)), tone(ag * light(kg, fg, mg)), tone(ab * light(kb, fb, mb))]
    .map((v) => enc(v).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Every lighting condition the studio offers, and how far each pushes the shade. */
export function metamerism(albedoHex: string): { readings: ShadeUnderLight[]; worst: number } {
  const neutral = shadeUnderLight(albedoHex, RIG_LIGHT.white);
  const readings = (Object.keys(RIG_LIGHT) as (keyof typeof RIG_LIGHT)[]).map((light) => {
    const hex = shadeUnderLight(albedoHex, RIG_LIGHT[light]);
    return { light, hex, shiftFromNeutral: shadeDistance(hex, neutral) };
  });
  return { readings, worst: Math.max(...readings.map((r) => r.shiftFromNeutral)) };
}

/** So a caller can describe the number without inventing its own thresholds. */
export function shiftVerdict(shift: number): 'steady' | 'noticeable' | 'strong' {
  if (shift < 2) return 'steady';
  if (shift < 5) return 'noticeable';
  return 'strong';
}

export { hexToOklab };
