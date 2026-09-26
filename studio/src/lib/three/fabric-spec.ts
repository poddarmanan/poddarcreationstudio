import type { FabricFamily } from '@/lib/fabric-generator';
import { oklchToHex } from './colour';
import { weaveKindForFamily, type WeaveKind, type WeaveSpec } from './weave';

/**
 * The fabric material framework (Phase 4 M22).
 *
 * Two layers, and the split is the point:
 *
 *   1. **A preset per fabric family** — the qualitative character of a cloth. Satin floats and
 *      stretches a highlight along the warp; a crinkle finish has deep relief; filament silk
 *      takes a tight, near-white sheen where cotton takes a broad, warm one. These are
 *      properties of the *kind* of cloth, they are configurable in one place, and a merchant
 *      adding a twelfth quality inherits them for free.
 *
 *   2. **The merchant's own spec sheet** — weight, sheen, thread grading, seed — which
 *      modulates the preset. This is why a 8.8kg PC/PC and a 20kg gajji silk differ on screen:
 *      because they differ on the row, not because someone tuned them by eye.
 *
 * The result is one `FabricMaterialSpec`, and **every rendering component in the app consumes
 * it through `<FabricMaterial>`**. No component sets a shader parameter of its own — the
 * viewer, the lab, the garment, the comparison and the microscope all describe *what* cloth
 * they are showing and never *how* to shade it. `scripts/check-material-abstraction.mjs`
 * enforces that mechanically, because the rule is only worth anything if it cannot drift.
 */

/** What a family of cloth is like, independent of any particular quality in it. */
export interface FabricPreset {
  weave: WeaveKind;
  /** Base roughness before the row's sheen modulates it. Cloth never goes truly smooth. */
  roughness: number;
  /** Strength of the soft fibre-end rim light. Matte naturals have the most. */
  sheen: number;
  /** Tight on filament, broad on staple. This is what separates silk from cotton at a glance. */
  sheenRoughness: number;
  sheenColor: string;
  /** Directional highlight along the float direction; a plain weave has nowhere to stretch. */
  anisotropy: number;
  anisotropyRotation: number;
  /** Relief depth multiplier for the normal map. */
  normalScale: number;
  /** How irregular the yarn is allowed to be, 0-1. */
  irregularity: number;
  /** Below this weight the cloth begins to transmit light; above it, nothing passes. */
  transmitsBelowKg: number;
}

/**
 * The registry. This is the file to edit when a merchant says "gajji should read wetter" —
 * one entry, every surface in the app, no per-component shader tweaking.
 */
export const FABRIC_PRESETS: Record<FabricFamily, FabricPreset> = {
  cotton: {
    weave: 'plain',
    roughness: 0.92,
    sheen: 0.8,
    sheenRoughness: 0.62,
    sheenColor: '#FFF3E2',
    anisotropy: 0.06,
    anisotropyRotation: 0,
    normalScale: 1.1,
    irregularity: 0.24,
    transmitsBelowKg: 10,
  },
  rayon: {
    weave: 'plain',
    roughness: 0.78,
    sheen: 0.72,
    sheenRoughness: 0.45,
    sheenColor: '#FFF6EC',
    anisotropy: 0.14,
    anisotropyRotation: 0,
    normalScale: 0.95,
    irregularity: 0.3,
    transmitsBelowKg: 9,
  },
  slub: {
    // Slub yarn is deliberately uneven — thick and thin along its length — and that
    // irregularity *is* the product. Understate it and the fabric stops being recognisable.
    weave: 'plain',
    roughness: 0.85,
    sheen: 0.75,
    sheenRoughness: 0.55,
    sheenColor: '#FFF4E6',
    anisotropy: 0.1,
    anisotropyRotation: 0,
    normalScale: 1.5,
    irregularity: 0.85,
    transmitsBelowKg: 9,
  },
  wrinkle: {
    weave: 'plain',
    roughness: 0.88,
    sheen: 0.78,
    sheenRoughness: 0.6,
    sheenColor: '#FFF4E8',
    anisotropy: 0.08,
    anisotropyRotation: 0,
    normalScale: 1.9,
    irregularity: 0.7,
    transmitsBelowKg: 9,
  },
  silk: {
    // Filament, not staple: long unbroken fibres lying parallel, which is why the highlight is
    // tight, travels along the warp floats, and is nearly white rather than warm.
    weave: 'satin',
    roughness: 0.52,
    sheen: 0.55,
    sheenRoughness: 0.22,
    sheenColor: '#FFFDF7',
    anisotropy: 0.55,
    anisotropyRotation: 0,
    normalScale: 0.7,
    irregularity: 0.12,
    transmitsBelowKg: 10,
  },
  lycra: {
    weave: 'knit',
    roughness: 0.9,
    sheen: 0.82,
    sheenRoughness: 0.65,
    sheenColor: '#FFF2E0',
    anisotropy: 0.05,
    anisotropyRotation: 0,
    normalScale: 1.25,
    irregularity: 0.35,
    transmitsBelowKg: 8,
  },
};

/** The single description every rendering component in the app is given. */
export interface FabricMaterialSpec {
  weave: WeaveSpec;
  roughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  anisotropy: number;
  anisotropyRotation: number;
  /** How much light passes through. Only genuinely light cloth gets any. */
  transmission: number;
  normalScale: number;
  /** Fraction of a metre one weave tile covers, so thread scale is physically honest. */
  tileMetres: number;
}

/** Only the spec-sheet fields the renderer needs — so `FabricDef` and `FabricRow` both fit. */
export interface FabricLike {
  family: FabricFamily;
  weight: string;
  nc: number;
  sheen: number;
  seed: number;
}

export interface ColourLike {
  l: number;
  c: number;
  h: number;
  order: number;
}

/** Grams per running unit, parsed out of the merchant's "14 kg" / "8.800 kg" notation. */
function weightKg(weight: string): number {
  const n = parseFloat(String(weight).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 12;
}

/**
 * Preset + spec sheet → the material description.
 *
 * Note what does *not* happen here: nothing is clamped to look good, and there is no per-fabric
 * override table. The moment one exists, adding a quality means an artist has to tune it before
 * it can be sold, and the render stops being a picture of the catalogue.
 */
export function fabricMaterialSpec(fabric: FabricLike, colour: ColourLike): FabricMaterialSpec {
  const preset = FABRIC_PRESETS[fabric.family] ?? FABRIC_PRESETS.cotton;
  const kg = weightKg(fabric.weight);

  // Denser cloth of the same family has more threads to the inch; the merchant's shade count
  // tracks how finely the quality is graded, which correlates with how fine the yarn is.
  const threadCount = Math.round(32 + kg * 2.6 + (fabric.nc / 96) * 18);

  const weave: WeaveSpec = {
    kind: preset.weave === 'plain' ? weaveKindForFamily(fabric.family) : preset.weave,
    threadCount,
    sheen: fabric.sheen,
    irregularity: preset.irregularity,
    // The catalogue speaks OKLCH; a texture is sRGB bytes. Converting here rather than
    // stringifying CSS is what stops all 824 shades rendering as one fallback colour.
    hex: oklchToHex(colour.l, colour.c, colour.h),
    seed: fabric.seed * 977 + colour.order,
  };

  // The row's own sheen figure pulls the preset's roughness down and its lustre up, within the
  // family's character rather than across it: a shinier cotton is still cotton.
  const lustre = Math.min(1, Math.max(0, fabric.sheen / 0.5));

  // The sheen is the shade's own colour lifted towards the preset's, not a white veil laid
  // over it. A near-white sheen at full strength desaturated every dye — a sky blue rendered
  // as milk — and is why the cloth on the stage did not match the swatch beside it.
  const sheenColor = mixHex(weave.hex, preset.sheenColor, 0.3);

  return {
    weave,
    roughness: Math.max(0.45, preset.roughness - lustre * 0.22),
    sheen: preset.sheen * 0.15,
    sheenRoughness: preset.sheenRoughness,
    sheenColor,
    anisotropy: preset.anisotropy * (0.6 + lustre * 0.6),
    anisotropyRotation: preset.anisotropyRotation,
    transmission: kg < preset.transmitsBelowKg ? Math.min(0.25, (preset.transmitsBelowKg - kg) / 40) : 0,
    normalScale: preset.normalScale,
    // A tile is roughly 25mm of real cloth, tightened for finer counts so thread scale stays
    // believable when the camera comes close in the microscope (M27).
    tileMetres: 0.05 * (60 / Math.max(24, threadCount)),
  };
}

/** Linear blend of two #rrggbb colours, `t` towards the second. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** How many times the weave tiles across a surface of a given size, in metres. */
export function tileRepeat(spec: FabricMaterialSpec, metres: number): number {
  return Math.max(1, Math.round(metres / spec.tileMetres));
}
