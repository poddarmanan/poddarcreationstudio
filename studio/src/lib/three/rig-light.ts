import type { LightKey } from '@/lib/fabric-generator';

/**
 * The showroom's five lighting conditions, as data (Phase 4 M26).
 *
 * Kept out of the React component on purpose. Two things need these numbers: the renderer,
 * which turns them into lights, and the metamerism model, which computes what they do to a
 * shade without a GPU. One definition means the swatch a buyer reads and the cloth they are
 * looking at can never disagree.
 */

export interface RigLight {
  key: { colour: string; intensity: number; position: [number, number, number] };
  fill: { colour: string; intensity: number; position: [number, number, number] };
  ambient: { colour: string; intensity: number };
  /**
   * Renderer exposure. Golden hour is genuinely dimmer than a studio box. Calibrated so that
   * under the white cyc a dyed cloth's mid-tones land on the swatch's own sRGB values, measured
   * rather than eyeballed (scripts: the colour check in the lab review).
   */
  exposure: number;
}

/**
 * Keyed to the same `LightKey` the CSS surfaces use, so the 3D view and the flat view are
 * always describing the same lighting rather than drifting apart.
 */
export const RIG_LIGHT: Record<LightKey, RigLight> = {
  daylight: {
    key: { colour: '#FFF8EC', intensity: 2.4, position: [2.6, 3.4, 2.2] },
    fill: { colour: '#C8D8F0', intensity: 0.55, position: [-2.4, 0.4, 1.4] },
    ambient: { colour: '#E8EEF8', intensity: 0.5 },
    exposure: 0.63,
  },
  golden: {
    // Low, warm and raking — which is exactly why golden hour flatters cloth: a grazing key
    // throws the weave's relief into relief.
    key: { colour: '#FFC98A', intensity: 2.6, position: [3.2, 1.1, 1.8] },
    fill: { colour: '#9FB4D8', intensity: 0.32, position: [-2.2, 0.6, 1.2] },
    ambient: { colour: '#E4CBA8', intensity: 0.38 },
    exposure: 0.6,
  },
  studio: {
    key: { colour: '#FFFFFF', intensity: 2.2, position: [1.8, 2.6, 2.8] },
    fill: { colour: '#FFFFFF', intensity: 0.85, position: [-2.2, 1.2, 2.2] },
    ambient: { colour: '#FFFFFF', intensity: 0.6 },
    exposure: 0.63,
  },
  boutique: {
    // Tight, high spots and a dark surround — a shop trying to make everything look expensive.
    key: { colour: '#FFE9C6', intensity: 3.1, position: [1.2, 3.6, 1.4] },
    fill: { colour: '#6E7A96', intensity: 0.22, position: [-1.8, -0.4, 1.6] },
    ambient: { colour: '#2A2622', intensity: 0.22 },
    exposure: 0.51,
  },
  white: {
    // A cyc wall: as close to no lighting opinion as a scene can get, so a buyer can judge the
    // dye rather than the room.
    key: { colour: '#FFFFFF', intensity: 1.7, position: [0.8, 2.2, 3.2] },
    fill: { colour: '#FFFFFF', intensity: 1.2, position: [-1.6, 1.0, 2.6] },
    ambient: { colour: '#FFFFFF', intensity: 0.95 },
    exposure: 0.66,
  },
};

