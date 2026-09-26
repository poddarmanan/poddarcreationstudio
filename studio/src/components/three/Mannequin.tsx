'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { FORM_PROFILE, type FormFit } from '@/lib/three/mannequin';

/**
 * A black dress form on a pole, built from the profile in `lib/three/mannequin`.
 *
 * Matte black on purpose: it is there to give the cloth a body, and the less it says about
 * itself the more the cloth says. The torso is a lathe of the profile, scaled to the fit's
 * chest and squashed front-to-back; the neck is a short stump with a cap, and the pole runs
 * from the hip to the floor.
 */
export function Mannequin({ fit, floor }: { fit: FormFit; floor: number }) {
  const torso = useMemo(() => {
    const rows = FORM_PROFILE[fit.sex];
    const height = fit.shoulderY - fit.hipY;
    // A unit lathe: radius 1 at the chest. The mesh is scaled to the fit's chest half-width in
    // x and half-depth in z, so the profile's width and depth columns are averaged here — the
    // exact per-row depth is used by the collider, which is what the cloth feels.
    const points = rows.map(([h, w, d]) => new THREE.Vector2(Math.max(0.001, (w + d) / 2), h * height));
    // Round the hip off so the form does not end in a flat disc.
    points.unshift(new THREE.Vector2(rows[0][1] * 0.6, -0.04), new THREE.Vector2(0.001, -0.06));
    const g = new THREE.LatheGeometry(points, 48);
    g.computeVertexNormals();
    return g;
  }, [fit.sex, fit.shoulderY, fit.hipY]);

  const neckR = Math.min(fit.chest, fit.depth) * (fit.sex === 'male' ? 0.5 : 0.46);

  return (
    <group>
      <mesh geometry={torso} position={[0, fit.hipY, 0]} scale={[fit.chest, 1, fit.depth]} castShadow receiveShadow>
        <meshStandardMaterial color="#141311" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, fit.shoulderY + 0.035, 0]} castShadow>
        <cylinderGeometry args={[neckR * 0.9, neckR, 0.09, 32]} />
        <meshStandardMaterial color="#141311" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[0, fit.shoulderY + 0.083, 0]}>
        <cylinderGeometry args={[neckR * 0.9, neckR * 0.9, 0.012, 32]} />
        <meshStandardMaterial color="#B9A88E" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* The pole and base. */}
      <mesh position={[0, (fit.hipY - 0.06 + floor) / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, Math.max(0.05, fit.hipY - 0.06 - floor), 16]} />
        <meshStandardMaterial color="#3A3733" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, floor + 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.012, 48]} />
        <meshStandardMaterial color="#1E1C1A" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}
