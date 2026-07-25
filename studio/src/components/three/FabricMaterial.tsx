'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier } from '@/lib/three/capability';
import { textureSizeFor } from '@/lib/three/capability';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { releaseWeaveTextures, retainWeaveTextures, weaveTextures } from '@/lib/three/textures';

/**
 * The fabric material (Phase 4 M22).
 *
 * Cloth is the awkward case for a standard physically-based model. A metallic-roughness
 * material can describe a metal, a plastic and a painted wall, and it describes all three of
 * them better than it describes a shirt — because most of what the eye reads as "fabric" is
 * light grazing off fibre *ends* at the silhouette, which that model has no term for.
 *
 * So the lustre here lives in the sheen layer, not in a low roughness. Even gajji silk keeps a
 * rough base and gets its shine from a bright, tight sheen with an anisotropic stretch along
 * the warp floats. Turn the sheen off and every quality in the catalogue reads as painted
 * plastic, which is the tell in most fabric renderings on the web.
 *
 * Every parameter comes from `fabricMaterialSpec`, which reads the merchant's own spec sheet.
 */

export interface FabricMaterialProps {
  spec: FabricMaterialSpec;
  tier: QualityTier;
  /** How many times the weave tiles across the surface. */
  repeat?: number;
  side?: THREE.Side;
  /**
   * Map resolution override, in pixels. The tier normally decides this, but magnification
   * changes the question: the microscope (M27) has one surface filling the frame at 500×, and
   * a 256px map that is right for a whole garment is porridge at 20mm.
   */
  size?: number;
}

export function FabricMaterial({ spec, tier, repeat = 1, side = THREE.DoubleSide, size: sizeOverride }: FabricMaterialProps) {
  const gl = useThree((s) => s.gl);
  const capabilities = gl.capabilities;

  const size = useMemo(
    () => Math.min(sizeOverride ?? textureSizeFor(tier, capabilities.maxTextureSize ?? 2048), capabilities.maxTextureSize ?? 4096),
    [tier, sizeOverride, capabilities.maxTextureSize]
  );
  const anisotropy = useMemo(() => Math.min(8, capabilities.getMaxAnisotropy?.() ?? 1), [capabilities]);

  const maps = useMemo(() => weaveTextures(spec.weave, size, anisotropy), [spec.weave, size, anisotropy]);

  useEffect(() => {
    retainWeaveTextures(spec.weave, size);
    return () => releaseWeaveTextures(spec.weave, size);
  }, [spec.weave, size]);

  // Repeat is per-surface, but the textures are shared. Setting `.repeat` on a shared texture
  // would change it for every other surface using the same cloth, so the offset/repeat live on
  // the material's own copies of the sampler state via clones that share the GPU image.
  const tiled = useMemo(() => {
    const clone = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(repeat, repeat);
      c.needsUpdate = true;
      return c;
    };
    const orm = clone(maps.aoMap);
    // three.js reads `aoMap` from the *second* UV set by default, and none of our geometry has
    // one — so occlusion sampled undefined coordinates and shaded bands of the cloth black.
    // Pointing it at UV0, which is the set the weave is laid out in, is the fix.
    orm.channel = 0;
    return { map: clone(maps.map), normalMap: clone(maps.normalMap), orm };
  }, [maps, repeat]);

  useEffect(
    () => () => {
      // A clone shares the underlying image but owns its own GPU handle; disposing it is
      // required and does not touch the cached original.
      tiled.map.dispose();
      tiled.normalMap.dispose();
      tiled.orm.dispose();
    },
    [tiled]
  );

  // Sheen and anisotropy are physical-material features and cost real fragment work. The low
  // tier gets the standard model instead — still lit, still textured, just without the layer
  // a device that reports software rendering cannot afford.
  if (tier === 'low') {
    return (
      <meshStandardMaterial
        map={tiled.map}
        normalMap={tiled.normalMap}
        normalScale={new THREE.Vector2(spec.normalScale, spec.normalScale)}
        aoMap={tiled.orm}
        roughnessMap={tiled.orm}
        roughness={spec.roughness}
        metalness={0}
        side={side}
      />
    );
  }

  return (
    <meshPhysicalMaterial
      map={tiled.map}
      normalMap={tiled.normalMap}
      normalScale={new THREE.Vector2(spec.normalScale, spec.normalScale)}
      aoMap={tiled.orm}
      aoMapIntensity={0.9}
      roughnessMap={tiled.orm}
      roughness={spec.roughness}
      metalness={0}
      sheen={spec.sheen}
      sheenRoughness={spec.sheenRoughness}
      sheenColor={new THREE.Color(spec.sheenColor)}
      anisotropy={spec.anisotropy}
      anisotropyRotation={spec.anisotropyRotation}
      // Transmission needs the renderer to resolve a background pass, so it is only switched on
      // for cloth light enough to genuinely need it.
      transmission={spec.transmission}
      thickness={spec.transmission > 0 ? 0.4 : 0}
      side={side}
    />
  );
}
