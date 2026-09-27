'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BODY_SECTORS, ringMean, type FormBody } from '@/lib/three/mannequin';

/**
 * A black dress form on a pole, built from the body read out of the garment
 * (`bodyFromGarment` in `lib/three/mannequin`).
 *
 * Matte black on purpose: it is there to give the cloth a body, and the less it says about
 * itself the more the cloth says. The torso is a tube through the body's rings — one ellipse
 * per two centimetres of height, so it fills the garment the way a form fills a garment — with
 * a neck stump and cap rising out of the top ring, a rounded-off hip, and the pole from the
 * hip to the floor.
 */
const SEGMENTS = BODY_SECTORS;

function torsoGeometry(body: FormBody): THREE.BufferGeometry {
  const rings = body.rings;
  const top = rings[0];
  const hip = rings[rings.length - 1];
  const neck = body.neckR;
  const scaled = (ring: { cz: number; radii: Float32Array }, y: number, factor: number, floorR: number, czFactor = 1) => ({
    y,
    cz: ring.cz * czFactor,
    radii: ring.radii.map((r) => Math.max(floorR, r * factor)),
  });
  const topMean = ringMean(top);
  // Extra rings: the shoulder rounds up into the neck over 4.5cm; the hip rounds off over 6.5cm.
  const profile: { y: number; cz: number; radii: Float32Array }[] = [
    { y: top.y + 0.045, cz: top.cz * 0.5, radii: new Float32Array(SEGMENTS).fill(neck) },
    scaled(top, top.y + 0.03, Math.min(1, (neck * 1.25) / topMean), neck, 0.6),
    scaled(top, top.y + 0.015, 0.8, neck, 0.8),
    ...rings,
    scaled(hip, hip.y - 0.03, 0.85, 0.002),
    scaled(hip, hip.y - 0.055, 0.45, 0.002),
    scaled(hip, hip.y - 0.065, 0, 0.002),
  ];
  const positions: number[] = [];
  const index: number[] = [];
  for (const ring of profile) {
    for (let s = 0; s <= SEGMENTS; s++) {
      const k = s % SEGMENTS;
      const a = (k / SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(a) * ring.radii[k], ring.y, ring.cz + Math.sin(a) * ring.radii[k]);
    }
  }
  for (let r = 0; r < profile.length - 1; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = r * (SEGMENTS + 1) + s;
      const b = a + SEGMENTS + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // The neck's flat top.
  const centre = positions.length / 3;
  positions.push(0, profile[0].y, profile[0].cz);
  for (let s = 0; s < SEGMENTS; s++) index.push(centre, s + 1, s);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function Mannequin({ body, floor }: { body: FormBody; floor: number }) {
  const torso = useMemo(() => torsoGeometry(body), [body]);
  useEffect(() => () => torso.dispose(), [torso]);
  const top = body.rings[0];
  const hip = body.rings[body.rings.length - 1];
  const poleTop = hip.y - 0.06;

  return (
    <group>
      <mesh geometry={torso} castShadow receiveShadow>
        <meshStandardMaterial color="#141311" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, top.y + 0.051, top.cz * 0.5]}>
        <cylinderGeometry args={[body.neckR * 0.92, body.neckR * 0.92, 0.012, 32]} />
        <meshStandardMaterial color="#B9A88E" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* The pole and base. */}
      <mesh position={[0, (poleTop + floor) / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, Math.max(0.05, poleTop - floor), 16]} />
        <meshStandardMaterial color="#3A3733" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, floor + 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.012, 48]} />
        <meshStandardMaterial color="#1E1C1A" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}
