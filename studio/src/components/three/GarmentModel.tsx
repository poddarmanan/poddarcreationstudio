'use client';

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { GarmentKey } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { tileRepeat } from '@/lib/three/fabric-spec';
import { FabricMaterial } from './FabricMaterial';

/**
 * Modelled garments (Phase 4 M25, extended).
 *
 * The procedural silhouettes in `GarmentMesh` need no assets and always work. A real garment
 * model — a kurti with a placket, a shirt with a collar and cuffs — is what a buyer recognises,
 * and the owner supplies those as glTF files, one per cut, in `public/models/`:
 *
 *   kurti.glb · shirt.glb · dress.glb · top.glb · tshirt.glb
 *
 * Drop a file in and that cut uses it; take it out and the cut falls back. Nothing else to
 * configure. The model's own materials are discarded: every surface is re-dressed in the same
 * `FabricMaterial` the rest of the studio uses, so a modelled kurti in Peacock rayon and a
 * hanging panel of Peacock rayon are the same cloth under the same light. The geometry is
 * scaled to a real garment height and centred, whatever units the modeller worked in.
 *
 * Presence is checked once per file with a HEAD request rather than by attempting the load, so
 * a cut with no model does not spend a failed download and a console error on every visit.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const GARMENT_MODEL_FILES: Partial<Record<GarmentKey, string>> = {
  kurti: `${BASE}/models/kurti.glb`,
  shirt: `${BASE}/models/shirt.glb`,
  dress: `${BASE}/models/dress.glb`,
  top: `${BASE}/models/top.glb`,
  tshirt: `${BASE}/models/tshirt.glb`,
};

const availability = new Map<string, Promise<boolean>>();

function isAvailable(url: string): Promise<boolean> {
  let pending = availability.get(url);
  if (!pending) {
    pending = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && !/text\/html/i.test(r.headers.get('content-type') ?? ''))
      .catch(() => false);
    availability.set(url, pending);
  }
  return pending;
}

/** The model URL for a cut, once it is known to exist; null while unknown or absent. */
export function useGarmentModel(garment: GarmentKey | undefined): string | null {
  const url = garment ? GARMENT_MODEL_FILES[garment] : undefined;
  // Keyed by URL so a stale answer for the previous cut is never read as this one's.
  const [known, setKnown] = useState<{ url: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    isAvailable(url).then((ok) => {
      if (live) setKnown({ url, ok });
    });
    return () => {
      live = false;
    };
  }, [url]);
  return url && known?.url === url && known.ok ? url : null;
}

export interface GarmentModelProps {
  url: string;
  spec: FabricMaterialSpec;
  tier: QualityTier;
  wind?: number;
  /** Height the model is scaled to, metres. */
  metres?: number;
}

/** A supplied model, re-dressed in the studio's cloth. Suspends while loading; throws on failure. */
export function GarmentModel({ url, spec, tier, wind = 0, metres = 1.15 }: GarmentModelProps) {
  const gltf = useGLTF(url, `${BASE}/draco/`);
  const group = useRef<THREE.Group>(null);

  const built = useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? metres / size.y : 1;
    const parts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry;
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      parts.push({ geometry, matrix: mesh.matrixWorld.clone() });
    });
    return { parts, scale, centre };
  }, [gltf, metres]);

  const repeat = useMemo(() => tileRepeat(spec, metres), [spec, metres]);
  const shadows = shadowsAllowed(tier);

  // A rigid model does not drape, but it can still answer the wind rail: a gentle lean that
  // grows with the wind, so the garment is not the one thing on the stage standing perfectly
  // still in a gale.
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 1.3) * 0.012 * wind;
  });

  return (
    <group ref={group}>
      <group scale={built.scale} position={[-built.centre.x * built.scale, -built.centre.y * built.scale, -built.centre.z * built.scale]}>
        {built.parts.map((part, i) => (
          <mesh key={i} geometry={part.geometry} matrix={part.matrix} matrixAutoUpdate={false} castShadow={shadows} receiveShadow={shadows}>
            <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * A model that fails to load — a bad file, a lost connection — must never take the stage down
 * with it. The boundary hands the cut back to the procedural silhouette and stays there for the
 * life of the view.
 */
export class GarmentModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Loading shows the procedural cut, so the stage is never empty while a model arrives. */
export function ModelledGarment({ url, fallback, ...props }: GarmentModelProps & { fallback: ReactNode }) {
  return (
    <GarmentModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GarmentModel url={url} {...props} />
      </Suspense>
    </GarmentModelBoundary>
  );
}
