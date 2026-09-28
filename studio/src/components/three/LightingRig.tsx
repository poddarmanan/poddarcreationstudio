'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import type { LightKey } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import { RIG_LIGHT } from '@/lib/three/rig-light';

/**
 * drei's Environment renders the room into a cube render target and disposes it when the stage
 * unmounts — but React Three Fiber has already disposed the renderer by then, and three's dispose
 * handler reads the target's framebuffers from the renderer's cleared records and throws. It
 * happened on every exit from the lab (to the Swatch Book, say). The target's GPU memory went
 * with the renderer's context anyway, so the late dispose is swallowed rather than allowed to
 * surface as an uncaught error. Patched once, for cube targets only.
 */
const cubeProto = THREE.WebGLCubeRenderTarget.prototype as THREE.WebGLCubeRenderTarget & { __pcGuarded?: boolean };
if (!cubeProto.__pcGuarded) {
  const dispose = cubeProto.dispose;
  cubeProto.dispose = function guardedDispose(this: THREE.WebGLCubeRenderTarget) {
    try {
      dispose.call(this);
    } catch {
      // The renderer is already gone; there is nothing left to free.
    }
  };
  cubeProto.__pcGuarded = true;
}

/**
 * The showroom's lighting (Phase 4 M23, extended by M26; rebuilt for image-based light).
 *
 * The studio already lets a buyer put cloth under daylight, golden hour, a studio box, boutique
 * spots or a white cyc — because the first question a wholesale buyer asks about a dyed fabric
 * is "what does it do under my shop's lights". Those choices were CSS filters; here they are
 * actual lights, which is the only way the answer can be truthful.
 *
 * Three layers, and the first is the one that was missing:
 *
 * **An environment.** Physically based cloth is lit by everything around it, not by two lamps
 * in a void. Sheen — the whole reason a rayon reads as rayon — is a grazing-angle reflection
 * of the *room*, and with no room to reflect it is dead. The room here is built from light
 * panels the way a product photographer builds one: a large soft source above, two softboxes
 * either side, a dim floor. It is rendered once to a cube map and costs nothing per frame.
 *
 * **A key and a fill**, from the same numbers the metamerism readout (M26) uses, so the swatch
 * a buyer reads and the cloth they are looking at can never disagree. The key casts the shadow.
 *
 * **A contact shadow** on the floor. A garment with no shadow under it is floating; one with a
 * soft pool beneath its hem is standing on something.
 */

export { RIG_LIGHT as RIGS };

/**
 * How bright and how tinted the room is, per rig. The environment contributes the ambient and
 * reflected light, so the flat `ambientLight` each rig used to carry is folded into it — the
 * rig's ambient colour tints the panels and its ambient intensity scales them.
 */
const ROOM: Record<LightKey, { intensity: number; top: string; side: string; floor: string }> = {
  daylight: { intensity: 1.0, top: '#EAF2FF', side: '#FFF6E6', floor: '#C9C2B6' },
  golden: { intensity: 1.1, top: '#FFD9A6', side: '#FFB877', floor: '#8C6E52' },
  studio: { intensity: 1.1, top: '#FFFFFF', side: '#F4F4F4', floor: '#B9B4AC' },
  boutique: { intensity: 0.5, top: '#FFE7C2', side: '#3A342E', floor: '#1E1B18' },
  white: { intensity: 1.35, top: '#FFFFFF', side: '#FFFFFF', floor: '#E6E6E6' },
};

export function LightingRig({ light, tier, floor = -0.7 }: { light: LightKey; tier: QualityTier; floor?: number }) {
  const rig = RIG_LIGHT[light] ?? RIG_LIGHT.studio;
  const room = ROOM[light] ?? ROOM.studio;
  const shadows = shadowsAllowed(tier);
  const keyColour = useMemo(() => new THREE.Color(rig.key.colour), [rig.key.colour]);
  const fillColour = useMemo(() => new THREE.Color(rig.fill.colour), [rig.fill.colour]);

  return (
    <>
      {/* The room. `frames={1}` renders it once per rig change; the panels do not move. */}
      <Environment frames={1} resolution={tier === 'high' ? 256 : 128} environmentIntensity={room.intensity}>
        {/* The main softbox: in front and above, the way a product photographer lights cloth,
            so the face of the garment — the side the buyer is looking at — is what the room
            lights most. Every panel is aimed at the cloth. */}
        <Lightformer form="rect" intensity={3.2} color={room.top} scale={[5, 3.5]} position={[0.8, 3, 3.2]} target={[0, 0, 0]} />
        {/* A second, dimmer panel straight ahead at cloth height, for the folds' faces. */}
        <Lightformer form="rect" intensity={1.4} color={room.side} scale={[4, 2.5]} position={[0, 0.3, 4.5]} target={[0, 0, 0]} />
        {/* Softboxes left and right, the right one brighter to keep a single dominant side. */}
        <Lightformer form="rect" intensity={2.2} color={room.side} scale={[3, 4]} position={[4, 1.2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color={room.side} scale={[3, 4]} position={[-4, 1.2, 1]} target={[0, 0, 0]} />
        {/* A rim from behind and above, so the shoulders separate from the backdrop. */}
        <Lightformer form="rect" intensity={1.6} color={room.top} scale={[4, 2]} position={[-1, 3, -3.5]} target={[0, 0, 0]} />
        {/* The floor: dark, so the underside of folds and the hem fall off rather than glow. */}
        <Lightformer form="rect" intensity={0.5} color={room.floor} scale={[8, 8]} position={[0, -3, 0]} rotation-x={Math.PI / 2} />
      </Environment>

      {/* A little ambient remains for the shadowed side of a fold; the room does the rest. */}
      <ambientLight color={new THREE.Color(rig.ambient.colour)} intensity={rig.ambient.intensity * 0.15} />
      <directionalLight
        color={keyColour}
        intensity={rig.key.intensity}
        position={rig.key.position}
        castShadow={shadows}
        shadow-mapSize-width={tier === 'high' ? 2048 : 1024}
        shadow-mapSize-height={tier === 'high' ? 2048 : 1024}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={1.5}
        shadow-camera-bottom={-1.5}
      />
      <directionalLight color={fillColour} intensity={rig.fill.intensity} position={rig.fill.position} />

      {shadows && (
        <ContactShadows
          position={[0, floor, 0]}
          opacity={light === 'boutique' ? 0.55 : 0.38}
          scale={2.4}
          blur={2.4}
          far={1.4}
          resolution={tier === 'high' ? 512 : 256}
          color="#1C1917"
        />
      )}
    </>
  );
}
