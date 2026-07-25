'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The shine test (Phase 4 M24).
 *
 * A merchant checking lustre does not stand still — they walk a light across the cloth and
 * watch where the highlight goes. On a matte cambric it barely moves; on a gajji satin it runs
 * along the warp floats like water. That travel is the measurement, and it is exactly what a
 * still image cannot show.
 *
 * The sweep is timed to the same 2.4s period as the studio's existing CSS `shineSweep`
 * animation, so the flat rendering and the 3D one stay in step rather than beating against
 * each other at slightly different rates.
 */
const PERIOD = 2.4;

export function ShineSweep({ active, sheen }: { active: boolean; sheen: number }) {
  const light = useRef<THREE.PointLight>(null);
  const level = useRef(0);

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    // Fades in and out rather than snapping, so toggling the test is not a flash.
    level.current += ((active ? 1 : 0) - level.current) * Math.min(1, delta * 5);
    const phase = ((state.clock.elapsedTime % PERIOD) / PERIOD) * 2 - 1;
    l.position.set(phase * 1.6, 0.35, 1.15);
    // A shinier cloth deserves a brighter raking light: the point of the test is to make the
    // difference between qualities visible, not to light them all identically.
    l.intensity = level.current * (1.2 + sheen * 3.4);
  });

  return <pointLight ref={light} color="#FFFFFF" distance={4} decay={1.6} intensity={0} />;
}
