'use client';

import * as THREE from 'three';
import type { LightKey } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';

/**
 * The showroom's lighting (Phase 4 M23, extended by M26).
 *
 * The studio already lets a buyer put cloth under daylight, golden hour, a studio box, boutique
 * spots or a white cyc — because the first question a wholesale buyer asks about a dyed fabric
 * is "what does it do under my shop's lights". Those choices were CSS filters; here they are
 * actual lights, which is the only way the answer can be truthful: a warm key genuinely shifts
 * a shade, and a broad soft fill genuinely flattens a weave's relief.
 *
 * Every rig is one key, one fill and an ambient term. That is a deliberate ceiling — each light
 * with a shadow map is a full extra render pass, and three well-placed lights read better than
 * six badly placed ones.
 */

export interface Rig {
  key: { colour: string; intensity: number; position: [number, number, number] };
  fill: { colour: string; intensity: number; position: [number, number, number] };
  ambient: { colour: string; intensity: number };
  /** Renderer exposure. Golden hour is genuinely dimmer than a studio box. */
  exposure: number;
}

/**
 * Keyed to the same `LightKey` the CSS surfaces use, so the 3D view and the flat view are
 * always describing the same lighting rather than drifting apart.
 */
export const RIGS: Record<LightKey, Rig> = {
  daylight: {
    key: { colour: '#FFF8EC', intensity: 2.4, position: [2.6, 3.4, 2.2] },
    fill: { colour: '#C8D8F0', intensity: 0.55, position: [-2.4, 0.4, 1.4] },
    ambient: { colour: '#E8EEF8', intensity: 0.5 },
    exposure: 1.05,
  },
  golden: {
    // Low, warm and raking — which is exactly why golden hour flatters cloth: a grazing key
    // throws the weave's relief into relief.
    key: { colour: '#FFC98A', intensity: 2.6, position: [3.2, 1.1, 1.8] },
    fill: { colour: '#9FB4D8', intensity: 0.32, position: [-2.2, 0.6, 1.2] },
    ambient: { colour: '#E4CBA8', intensity: 0.38 },
    exposure: 0.95,
  },
  studio: {
    key: { colour: '#FFFFFF', intensity: 2.2, position: [1.8, 2.6, 2.8] },
    fill: { colour: '#FFFFFF', intensity: 0.85, position: [-2.2, 1.2, 2.2] },
    ambient: { colour: '#FFFFFF', intensity: 0.6 },
    exposure: 1.1,
  },
  boutique: {
    // Tight, high spots and a dark surround — a shop trying to make everything look expensive.
    key: { colour: '#FFE9C6', intensity: 3.1, position: [1.2, 3.6, 1.4] },
    fill: { colour: '#6E7A96', intensity: 0.22, position: [-1.8, -0.4, 1.6] },
    ambient: { colour: '#2A2622', intensity: 0.22 },
    exposure: 0.9,
  },
  white: {
    // A cyc wall: as close to no lighting opinion as a scene can get, so a buyer can judge the
    // dye rather than the room.
    key: { colour: '#FFFFFF', intensity: 1.7, position: [0.8, 2.2, 3.2] },
    fill: { colour: '#FFFFFF', intensity: 1.2, position: [-1.6, 1.0, 2.6] },
    ambient: { colour: '#FFFFFF', intensity: 0.95 },
    exposure: 1.15,
  },
};

export function LightingRig({ light, tier }: { light: LightKey; tier: QualityTier }) {
  const rig = RIGS[light] ?? RIGS.studio;
  const shadows = shadowsAllowed(tier);

  return (
    <>
      <ambientLight color={new THREE.Color(rig.ambient.colour)} intensity={rig.ambient.intensity} />
      <directionalLight
        color={new THREE.Color(rig.key.colour)}
        intensity={rig.key.intensity}
        position={rig.key.position}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
      />
      <directionalLight color={new THREE.Color(rig.fill.colour)} intensity={rig.fill.intensity} position={rig.fill.position} />
    </>
  );
}
