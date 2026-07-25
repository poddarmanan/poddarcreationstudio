'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { FabricMaterial } from './FabricMaterial';

/**
 * A lit panel of generated cloth (Phase 4 M21).
 *
 * The smallest complete path through the foundation — spec sheet to texture to material to a
 * lit, shaded surface. It exists so the pipeline can be *proved* rather than asserted, and the
 * diagnostics panel renders it.
 */

export interface WeaveSurfaceProps {
  spec: FabricMaterialSpec;
  tier: QualityTier;
  repeat?: number;
  /** Slow rotation, so the specular travels across the weave the way it does on a bolt. */
  spin?: boolean;
}

export function WeaveSurface({ spec, tier, repeat = 1, spin = false }: WeaveSurfaceProps) {
  const mesh = useRef<THREE.Mesh>(null);

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
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
    </>
  );
}
