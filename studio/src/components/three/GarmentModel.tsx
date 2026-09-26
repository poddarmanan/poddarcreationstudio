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
import { Mannequin } from './Mannequin';
import { FORM_SEX } from './GarmentMesh';
import { fitForm } from '@/lib/three/mannequin';

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
  garment: GarmentKey;
  /** World y of the floor the form's pole stands on. Omit for no mannequin. */
  floor?: number;
  spec: FabricMaterialSpec;
  tier: QualityTier;
  wind?: number;
  /** Height the model is scaled to, metres. */
  metres?: number;
}

/** A supplied model, re-dressed in the studio's cloth. Suspends while loading; throws on failure. */
export function GarmentModel({ url, garment, spec, tier, wind = 0, metres = 1.15, floor }: GarmentModelProps) {
  const gltf = useGLTF(url, `${BASE}/draco/`);
  const group = useRef<THREE.Group>(null);

  const built = useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const raw = box.getSize(new THREE.Vector3());
    const rawCentre = box.getCenter(new THREE.Vector3());
    // Modellers do not agree on which way is forward. A garment is wider than it is deep, so
    // if the model's x extent is the smaller of the two it is standing side-on to the camera
    // and is turned a quarter to face it. The scene itself is left untouched (it is cached and
    // shared); the turn is applied by a group, and the box is turned with it: a quarter turn
    // about y maps (x, z) to (z, -x).
    const turn = raw.x < raw.z ? Math.PI / 2 : 0;
    const size = turn ? new THREE.Vector3(raw.z, raw.y, raw.x) : raw;
    const centre = turn ? new THREE.Vector3(rawCentre.z, rawCentre.y, -rawCentre.x) : rawCentre;
    const scale = size.y > 0 ? metres / size.y : 1;
    const parts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry;
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      parts.push({ geometry, matrix: mesh.matrixWorld.clone() });
    });
    // A sample of the garment's vertices in stage space, for fitting the form inside it.
    const sample: number[] = [];
    const v = new THREE.Vector3();
    for (const part of parts) {
      const pos = part.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
        if (turn) v.set(v.z, v.y, -v.x);
        v.sub(centre).multiplyScalar(scale);
        sample.push(v.x, v.y, v.z);
      }
    }
    return { parts, scale, centre, turn, fit: fitForm(sample, FORM_SEX[garment]) };
  }, [gltf, metres, garment]);

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
      {built.fit && floor !== undefined && <Mannequin fit={built.fit} floor={floor} />}
      <group scale={built.scale} position={[-built.centre.x * built.scale, -built.centre.y * built.scale, -built.centre.z * built.scale]}>
        <group rotation-y={built.turn}>
          {built.parts.map((part, i) => (
            <mesh key={i} geometry={part.geometry} matrix={part.matrix} matrixAutoUpdate={false} castShadow={shadows} receiveShadow={shadows}>
              <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
            </mesh>
          ))}
        </group>
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
