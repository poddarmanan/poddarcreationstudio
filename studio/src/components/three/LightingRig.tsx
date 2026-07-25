'use client';

import * as THREE from 'three';
import type { LightKey } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import { RIG_LIGHT } from '@/lib/three/rig-light';

/**
 * The showroom's lighting (Phase 4 M23, extended by M26).
 *
 * The studio already lets a buyer put cloth under daylight, golden hour, a studio box, boutique
 * spots or a white cyc — because the first question a wholesale buyer asks about a dyed fabric
 * is "what does it do under my shop's lights". Those choices were CSS filters; here they are
 * actual lights, which is the only way the answer can be truthful.
 *
 * Every rig is one key, one fill and an ambient term. That is a deliberate ceiling — each light
 * with a shadow map is a full extra render pass, and three well-placed lights read better than
 * six badly placed ones. The numbers live in `@/lib/three/rig-light` so the metamerism readout
 * (M26) can use exactly the same ones.
 */

export { RIG_LIGHT as RIGS };

export function LightingRig({ light, tier }: { light: LightKey; tier: QualityTier }) {
  const rig = RIG_LIGHT[light] ?? RIG_LIGHT.studio;
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
