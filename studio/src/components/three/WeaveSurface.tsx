'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import type { WeaveSpec } from '@/lib/three/weave';
import { releaseWeaveTextures, retainWeaveTextures, weaveTextures } from '@/lib/three/textures';

/**
 * A lit panel of generated cloth (Phase 4 M21).
 *
 * This is the smallest complete path through the foundation — spec to texture to material to
 * a lit, shaded surface — and it exists so the foundation can be *proved* rather than
 * asserted. M22 replaces the material here with the full PBR treatment (roughness, sheen,
 * anisotropy, transmission); the resource handling and the lighting rig stay.
 */

export interface WeaveSurfaceProps {
  spec: WeaveSpec;
  size: number;
  tier: QualityTier;
  /** Slow rotation, so the specular travels across the weave the way it does on a bolt. */
  spin?: boolean;
}

export function WeaveSurface({ spec, size, tier, spin = false }: WeaveSurfaceProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const gl = useThree((s) => s.gl);

  // Anisotropic filtering is what stops a weave turning to mush at a glancing angle — the
  // exact angle cloth is usually seen at. It is cheap and the GPU tells us its ceiling.
  const anisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1), [gl]);
  const { map, normalMap } = useMemo(() => weaveTextures(spec, size, anisotropy), [spec, size, anisotropy]);

  // Claimed in an effect, never in render: StrictMode renders twice and would leak a claim.
  useEffect(() => {
    retainWeaveTextures(spec, size);
    return () => releaseWeaveTextures(spec, size);
  }, [spec, size]);

  useFrame((state, delta) => {
    if (!spin || !mesh.current) return;
    mesh.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.35;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.27) * 0.12;
    void delta;
  });

  const shadows = shadowsAllowed(tier);

  return (
    <>
      {/* A key light high and to the left, a cool fill opposite, and a dim ambient so the
          weave's shadowed side keeps some colour. This is the showroom's own lighting —
          M26's lighting studio makes it adjustable. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.4, 3, 2]} intensity={1.7} castShadow={shadows} color="#FFF6E6" />
      <directionalLight position={[-2, -1, 1.5]} intensity={0.4} color="#CBD6E6" />

      <mesh ref={mesh} castShadow={shadows} receiveShadow={shadows}>
        {/* Segmented rather than a flat quad: the surface has to be able to deform for the
            drape and wind work later, and a two-triangle plane cannot. */}
        <planeGeometry args={[1.6, 1.6, tier === 'low' ? 8 : 32, tier === 'low' ? 8 : 32]} />
        <meshStandardMaterial
          map={map}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(1, 1)}
          roughness={1 - spec.sheen * 0.55}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}
