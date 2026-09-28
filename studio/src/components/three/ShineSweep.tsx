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
 * Each pass is a gesture, not a loop: the light fades up from nothing at one edge, glides across
 * on a slight arc (eased at both ends), fades back to nothing at the other, and rests a moment
 * before the next. It used to run a sawtooth at full strength, so it vanished at one edge and
 * reappeared at the other in a single frame.
 */
const PERIOD = 4.2;
/** The share of each period spent travelling; the rest is the pause between passes. */
const TRAVEL = 0.78;

export function ShineSweep({ active, sheen }: { active: boolean; sheen: number }) {
  const light = useRef<THREE.PointLight>(null);
  const level = useRef(0);

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    // Fades in and out rather than snapping, so toggling the test is not a flash.
    level.current += ((active ? 1 : 0) - level.current) * Math.min(1, delta * 5);
    const t = (state.clock.elapsedTime % PERIOD) / PERIOD;
    const u = Math.min(1, t / TRAVEL);
    const eased = u * u * (3 - 2 * u);
    // Zero at both edges and through the pause, full in the middle of the pass.
    const envelope = t < TRAVEL ? Math.pow(Math.sin(Math.PI * u), 1.4) : 0;
    l.position.set(-1.9 + eased * 3.8, 0.28 + Math.sin(Math.PI * u) * 0.16, 1.15);
    // A shinier cloth deserves a brighter raking light: the point of the test is to make the
    // difference between qualities visible, not to light them all identically. A little brighter
    // at its peak than the old constant sweep, since it now spends its edges fading.
    l.intensity = level.current * envelope * (3.4 + sheen * 7.5);
  });

  return <pointLight ref={light} color="#FFFFFF" distance={4} decay={1.6} intensity={0} />;
}
