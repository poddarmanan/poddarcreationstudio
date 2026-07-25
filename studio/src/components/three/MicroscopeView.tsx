'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ColourLike, FabricLike } from '@/lib/three/fabric-spec';
import { fabricMaterialSpec } from '@/lib/three/fabric-spec';
import { useCapability } from './useCapability';
import { useEffectiveTier } from './quality';
import { Stage } from './Stage';
import { FabricMaterial } from './FabricMaterial';

/**
 * The Digital Microscope (Phase 4 M27).
 *
 * At 500× a buyer is not looking at a fabric any more, they are looking at *yarn*: whether the
 * ply is even, whether the pick is tight, whether a slub is deliberate or a fault. That is a
 * quality-control judgement normally made by holding cloth up to a window, and it is the one
 * thing a flat catalogue photograph can never support because the photograph has a fixed
 * resolution and the weave does not.
 *
 * Generated maps have no such ceiling. Rather than magnifying a bitmap until it turns to
 * porridge, the microscope regenerates the weave at the resolution the magnification needs and
 * shows *fewer* tiles — so 500× really is more detail rather than bigger pixels. That is the
 * whole argument for procedural texture in this application, and this is where it pays.
 *
 * A raking light does the rest: at this distance the relief is the subject, and a light almost
 * parallel to the cloth is how a mill inspector looks at it.
 */

export interface MicroscopeViewProps {
  fabric: FabricLike;
  colour: ColourLike;
  /** The studio's 0-100 scope slider. 100× / 200× / 500× map onto it. */
  power: number;
  fallback: ReactNode;
  label: string;
}

/** Magnification → how many weave tiles fill the frame. Fewer tiles is closer. */
function tilesFor(power: number): number {
  if (power >= 96) return 1.2; // 500×: a couple of yarns across the frame
  if (power >= 48) return 3; // 200×
  return 7; // 100×
}

/** A slow drift, so the specular travels over the yarn rather than sitting still on it. */
function Inspection() {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    const t = state.clock.elapsedTime * 0.35;
    // Almost parallel to the surface: at this magnification the relief is the subject, and a
    // raking light is how a mill inspector reads a weave.
    l.position.set(Math.cos(t) * 1.4, Math.sin(t) * 1.4, 0.42);
  });
  return (
    <>
      <ambientLight intensity={0.42} color="#F4EFE6" />
      <directionalLight ref={light} intensity={2.8} color="#FFFDF6" />
    </>
  );
}

export function MicroscopeView({ fabric, colour, power, fallback, label }: MicroscopeViewProps) {
  const detected = useCapability();
  const tier = useEffectiveTier(detected.tier);
  const spec = useMemo(() => fabricMaterialSpec(fabric, colour), [fabric, colour]);
  const tiles = tilesFor(power);

  // The magnification decides the resolution, not the tier. A tier that would render a whole
  // garment at 256px still needs real detail when the camera is 20mm from the cloth — this is
  // one surface, one material, and the only thing on screen.
  const size = tier === 'low' ? 512 : tier === 'medium' ? 1024 : 2048;

  return (
    <Stage label={label} animate fallback={fallback} style={{ position: 'absolute', inset: 0 }}>
      <Inspection />
      <mesh>
        <planeGeometry args={[2.6, 1.95, 1, 1]} />
        <FabricMaterial spec={spec} tier={tier} repeat={tiles} size={Math.min(size, detected.maxTextureSize || size)} />
      </mesh>
    </Stage>
  );
}
