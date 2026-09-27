'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { tileRepeat } from '@/lib/three/fabric-spec';
import { drape } from '@/lib/three/drape';
import { FabricMaterial } from './FabricMaterial';

/**
 * A hanging length of cloth (Phase 4 M23).
 *
 * The geometry is a plane whose vertices are displaced every frame, which is the honest way to
 * show drape: a fabric's fall is a *behaviour*, not a texture, and the merchant already records
 * the two numbers that govern it — `flow` (how fluid the cloth is) and `stretch`.
 *
 * A 20kg gajji hangs in few deep folds because a heavy, stiff cloth resists bending; a 14kg
 * rayon breaks into many shallow ones because it does not. That difference is the single most
 * useful thing a buyer can see before ordering, and no photograph of a flat swatch shows it.
 *
 * This is not a cloth simulator. A real solver is milliseconds per frame per garment, needs a
 * fixed timestep, and would put a phone on the floor. What this does is drive a sum of standing
 * waves whose wavelength and amplitude come from the fabric's own figures — the look of drape,
 * at the cost of a vertex shader's worth of arithmetic.
 */

export interface FabricPanelProps {
  spec: FabricMaterialSpec;
  tier: QualityTier;
  /** 0-1, the merchant's `flow`: how fluid the cloth is. Drives fold count and depth. */
  flow: number;
  /** 0-1, the merchant's `stretch`. Drives how far the panel elongates under the stretch test. */
  stretch: number;
  /** 0-3 wind strength from the lab's rail. 0 is still air. */
  wind?: number;
  /** The stretch test (M24): pulls the panel taut and thins it. */
  pulled?: boolean;
  /** Metres. The panel is sized in real units so thread scale stays honest. */
  width?: number;
  height?: number;
}

export function FabricPanel({
  spec,
  tier,
  flow,
  stretch,
  wind = 0,
  pulled = false,
  width = 0.9,
  height = 1.35,
}: FabricPanelProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const pull = useRef(0);

  // Enough segments for folds to read, few enough that a phone can displace them every frame.
  const segments = tier === 'high' ? 48 : tier === 'medium' ? 32 : 16;

  // The undeformed vertex positions travel with the geometry rather than in a ref: every
  // frame's displacement is computed from rest, and reading last frame's output instead would
  // compound the folds until the panel tore itself apart.
  const { geometry, rest } = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, segments, segments);
    return { geometry: g, rest: Float32Array.from(g.attributes.position.array) };
  }, [width, height, segments]);

  const repeat = useMemo(() => tileRepeat(spec, Math.max(width, height)), [spec, width, height]);

  useFrame((state, delta) => {
    const m = mesh.current;
    const base = rest;
    if (!m) return;

    const position = m.geometry.attributes.position;
    const t = state.clock.elapsedTime;

    // The stretch test eases rather than snaps — a cloth pulled taut takes a moment, and an
    // instant jump reads as a glitch rather than a demonstration.
    pull.current += ((pulled ? 1 : 0) - pull.current) * Math.min(1, delta * 4);

    for (let i = 0; i < position.count; i++) {
      // The pull acts on the whole panel: the drape function holds the top edge and lengthens
      // downward from it, so the cloth stays on its bolt while both sides draw in.
      const d = drape({
        x: base[i * 3],
        y: base[i * 3 + 1],
        height,
        flow,
        stretch,
        wind,
        pull: pull.current,
        time: t,
      });
      position.setXYZ(i, d.x, d.y, d.z);
    }

    position.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });

  const shadows = shadowsAllowed(tier);

  return (
    <mesh ref={mesh} geometry={geometry} castShadow={shadows} receiveShadow={shadows}>
      {/* Double-sided: a deep fold turned towards the edge of the drag arc shows its own back,
          and a single-sided panel puts a hole there. */}
      <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
    </mesh>
  );
}
