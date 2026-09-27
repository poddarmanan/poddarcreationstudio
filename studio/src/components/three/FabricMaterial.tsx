'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
  /**
   * Gentle motion for cloth that is not simulated — a supplied garment model with too many
   * vertices to relax every frame. Ripples along the surface normal, growing from `top` (still)
   * to `hem` (loose), in stage-space y; `amount` is 0–1 and rises with the wind. Done in the
   * vertex shader, so it costs nothing on the CPU whatever the vertex count.
   */
  sway?: { top: number; hem: number; amount: number; wind: number };
  /**
   * A cut-out, for a supplied model that has something in it that is not the garment (a
   * mannequin torso saved into the same mesh, say). Where the model's own colour map is
   * transparent the surface is dropped, so what is left is the garment, dressed in the studio's
   * cloth.
   */
  mask?: THREE.Texture;
}

/** Vertex-shader ripple for rigid cloth. Uniform names are prefixed so nothing in three's own shader can collide. */
const SWAY_UNIFORMS = `
uniform float pcSwayTime;
uniform float pcSwayAmount;
uniform float pcSwayTop;
uniform float pcSwayHem;
uniform float pcSwayWind;
attribute float pcSleeve;
`;
const SWAY_VERTEX = `
#include <begin_vertex>
{
  vec4 pcWorld = modelMatrix * vec4(position, 1.0);
  float pcHang = clamp((pcSwayTop - pcWorld.y) / max(0.001, pcSwayTop - pcSwayHem), 0.0, 1.0);
  // Outward only (each wave lifted above zero): cloth that breathes out from its rest surface
  // never sinks behind the depth its shadow map recorded, so it cannot shadow itself in bands.
  float pcWave = 0.012 * (1.0 + sin(pcWorld.y * 7.0 + pcSwayTime * 1.3 + pcWorld.x * 3.0))
               + 0.008 * (1.0 + sin(pcWorld.x * 11.0 - pcSwayTime * 0.9 + pcWorld.y * 2.0))
               + 0.003 * (1.0 + sin(pcSwayTime * 0.7));
  // Displacement is in metres; the mesh may be modelled in any unit, so divide by its scale.
  float pcScale = max(0.001, length(vec3(modelMatrix[0])));
  transformed += normal * (pcSwayAmount * pcHang * pcHang * pcWave / pcScale);
  // The wind: the loose lower part of the garment is lifted forward and swung sideways, more
  // the further it hangs from the shoulders, and more with the rail — a slow swell with a
  // little turbulence on it. A world-space push, carried into the mesh's own frame (rotation
  // only, so the transpose is the inverse).
  float pcSwell = 0.55 + 0.45 * sin(pcSwayTime * 1.1) + 0.12 * sin(pcSwayTime * 2.7 + 1.0);
  vec3 pcPush = vec3(0.3 * sin(pcSwayTime * 0.8), 0.0, pcSwell) * (pcSwayWind * 0.13 * pcHang * pcHang);
  // A sleeve swings from its shoulder: out from the body and back, and a little fore and aft,
  // the cuff most. pcSleeve is signed by side and grows to 1 at the cuff (0 on the body).
  float pcSide = sign(pcSleeve);
  float pcAlong = abs(pcSleeve);
  float pcSwing = pcSwayWind * 0.14 * pcAlong * pcAlong;
  pcPush += vec3(pcSide * pcSwing * (0.5 + 0.5 * sin(pcSwayTime * 1.15 + pcSide * 0.7)), 0.0, pcSwing * 0.6 * sin(pcSwayTime * 0.85 + 1.3));
  transformed += (transpose(mat3(modelMatrix)) * pcPush) / (pcScale * pcScale);
}
`;

export function FabricMaterial({ spec, tier, repeat = 1, side = THREE.DoubleSide, size: sizeOverride, sway, mask }: FabricMaterialProps) {
  const gl = useThree((s) => s.gl);
  const capabilities = gl.capabilities;
  const swayUniforms = useRef<{ pcSwayTime: { value: number }; pcSwayAmount: { value: number }; pcSwayTop: { value: number }; pcSwayHem: { value: number }; pcSwayWind: { value: number } } | null>(null);
  const swayOn = !!sway;

  // Installs the ripple into whichever material is in use, keeping a handle on its uniforms.
  const onBeforeCompile = useCallback(
    (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string }) => {
      if (!swayOn) return;
      const u = { pcSwayTime: { value: 0 }, pcSwayAmount: { value: 0 }, pcSwayTop: { value: 0 }, pcSwayHem: { value: -1 }, pcSwayWind: { value: 0 } };
      Object.assign(shader.uniforms, u);
      shader.vertexShader = SWAY_UNIFORMS + shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERTEX);
      swayUniforms.current = u;
    },
    [swayOn]
  );
  const cacheKey = useCallback(() => (swayOn ? 'pc-fabric-sway' : 'pc-fabric'), [swayOn]);

  // The shadow map is drawn with a depth material of its own, which knows nothing of the ripple
  // or the wind: a surface the wind has pushed back would then sit behind its own recorded
  // depth and shadow itself, in bands. So a swaying mesh gets a depth material with the same
  // displacement, attached to it as its `customDepthMaterial`, fed the same values each frame.
  const depthMaterial = useMemo(() => {
    if (!swayOn) return null;
    const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    material.onBeforeCompile = (shader) => {
      const u = { pcSwayTime: { value: 0 }, pcSwayAmount: { value: 0 }, pcSwayTop: { value: 0 }, pcSwayHem: { value: -1 }, pcSwayWind: { value: 0 } };
      Object.assign(shader.uniforms, u);
      shader.vertexShader = SWAY_UNIFORMS + shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERTEX);
      // Kept on the material itself, where the frame loop finds them once the program exists.
      material.userData.swayUniforms = u;
    };
    material.customProgramCacheKey = () => 'pc-fabric-sway-depth';
    return material;
  }, [swayOn]);
  useEffect(() => () => depthMaterial?.dispose(), [depthMaterial]);

  useFrame((state) => {
    if (!sway) return;
    for (const u of [swayUniforms.current, depthMaterial?.userData.swayUniforms as typeof swayUniforms.current]) {
      if (!u) continue;
      u.pcSwayTime.value = state.clock.elapsedTime;
      u.pcSwayAmount.value = sway.amount;
      u.pcSwayTop.value = sway.top;
      u.pcSwayHem.value = sway.hem;
      u.pcSwayWind.value = sway.wind;
    }
  });

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
  // The mask travels with it, or a cut-out garment would still cast the shadow of what was cut.
  const depth = depthMaterial ? <primitive object={depthMaterial} attach="customDepthMaterial" alphaMap={mask ?? null} alphaTest={mask ? 0.5 : 0} /> : null;
  if (tier === 'low') {
    return (
      <>
      {depth}
      <meshStandardMaterial
        onBeforeCompile={onBeforeCompile}
        customProgramCacheKey={cacheKey}
        alphaMap={mask ?? null}
        alphaTest={mask ? 0.5 : 0}
        map={tiled.map}
        normalMap={tiled.normalMap}
        normalScale={new THREE.Vector2(spec.normalScale, spec.normalScale)}
        aoMap={tiled.orm}
        roughnessMap={tiled.orm}
        roughness={spec.roughness}
        metalness={0}
        side={side}
      />
      </>
    );
  }

  return (
    <>
    {depth}
    <meshPhysicalMaterial
      onBeforeCompile={onBeforeCompile}
      customProgramCacheKey={cacheKey}
      alphaMap={mask ?? null}
      alphaTest={mask ? 0.5 : 0}
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
    </>
  );
}
