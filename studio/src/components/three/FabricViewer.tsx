'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GarmentKey, LightKey } from '@/lib/fabric-generator';
import type { ColourLike, FabricLike } from '@/lib/three/fabric-spec';
import { fabricMaterialSpec } from '@/lib/three/fabric-spec';
import { useCapability } from './useCapability';
import { useEffectiveTier } from './quality';
import { Stage, type StageStats } from './Stage';
import { FabricPanel } from './FabricPanel';
import { LightingRig, RIGS } from './LightingRig';
import { ShineSweep } from './ShineSweep';
import { GarmentMesh } from './GarmentMesh';
import { ModelledGarment, useGarmentModel } from './GarmentModel';

/**
 * Fabric Viewer 2.0 (Phase 4 M23).
 *
 * Replaces the flat swatch in the Fabric Lab's stage with the real cloth: lit, draping, and
 * turnable. The chrome around it — the lighting rail, the wind rail, the test pills, the
 * specification — is untouched; only what stands on the stage has changed.
 *
 * Turnable matters more than it sounds. Cloth is judged at an angle: a buyer tilts a swatch
 * under the shop light to see whether the shade shifts and whether the weave catches. A flat
 * image cannot answer that, and the answer is often the reason an order is placed or isn't.
 */

export interface FabricViewerProps {
  fabric: FabricLike & { flow: number; stretch: number };
  colour: ColourLike;
  light: LightKey;
  wind?: number;
  /** The stretch test from the lab's rail (M24). */
  pulled?: boolean;
  /** The shine test (M24): a light walked across the cloth to show where the highlight goes. */
  shine?: boolean;
  /** "Watch in 3D" (M24): lets the cloth turn all the way round, on a stand. */
  free?: boolean;
  /** Shown whenever 3D is unavailable — the studio's existing flat rendering. */
  fallback: ReactNode;
  label: string;
  onStats?: (stats: StageStats) => void;
  /** Roll rather than hanging panel: the showroom's bolt-on-the-shelf presentation. */
  rolled?: boolean;
  /** Cut the cloth into a garment silhouette (M25). `roll` keeps the hanging panel. */
  garment?: GarmentKey;
  /** Name this viewer so its frame can be exported (M30). */
  captureId?: string;
}

/** Real garment heights, metres — a kurti is not a t-shirt. */
const GARMENT_METRES: Record<string, number> = { kurti: 1.15, dress: 1.3, shirt: 0.8, tshirt: 0.74, top: 0.62 };
/** Where the shoulder line sits on the stage, whatever the cut, so the form's neck stays put. */
const SHOULDER_Y = 0.6;
/** The floor every pole stands on. */
const FLOOR_Y = -0.74;

/**
 * The stand the cloth hangs from once "Watch in 3D" is on. A length of fabric floating in
 * space has no scale; a stand of a known height gives the eye something to measure against,
 * which is the same reason a showroom drapes cloth over a rail rather than holding it up.
 */
function Stand({ hem }: { hem: number }) {
  // Placed under the hem of whatever is on the turntable rather than at a fixed height: a
  // stand that floats a hand's breadth below a kurti, or pokes up through a long panel, is
  // worse than no stand at all.
  return (
    <group position={[0, hem - 0.125, 0]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
        <meshBasicMaterial color="#B9A88E" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.012, 24]} />
        <meshBasicMaterial color="#8F8069" />
      </mesh>
    </group>
  );
}

/** Shortest signed distance from `a` round to `b`, so a return trip never goes the long way. */
function shortestTurn(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * The turntable: hold and spin.
 *
 * The drag lives on the canvas element rather than on the mesh, so it works wherever a thumb
 * lands on the stage — a buyer does not aim for the cloth — and it captures the pointer, so a
 * fast flick that leaves the stage still finishes. Release carries momentum that decays over a
 * second or so, which is what makes a spin feel like a spin rather than a slider.
 *
 * Left alone for a few seconds it eases back into its own motion: a gentle rock in the ordinary
 * view (a merchant rocks a bolt under the light; nobody turns it through 360°, and doing so
 * shows the back of a surface that has no back), or a slow full turn when "Watch in 3D" is on.
 * Any touch takes over instantly and completely; the automatic motion only ever resumes, never
 * competes.
 */
function Turntable({ children, idle, free = false }: { children: ReactNode; idle: boolean; free?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const angle = useRef({ x: 0, y: 0 });
  const drag = useRef({ active: false, id: -1, lastX: 0, lastY: 0, lastT: 0, vx: 0 });
  const velocity = useRef(0);
  const idleFor = useRef(3);
  const rock = useRef(0);
  const wasFree = useRef(free);

  useEffect(() => {
    // `touch-action: pan-y` and the cursor are set on the stage's host element by StageCanvas.
    const el = gl.domElement;

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag.current = { active: true, id: e.pointerId, lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), vx: 0 };
      velocity.current = 0;
      idleFor.current = 0;
      el.setPointerCapture?.(e.pointerId);
      invalidate();
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT) / 1000;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      // Radians per pixel: a full turn is about a hand's width of screen on a phone.
      angle.current.y += dx * 0.008;
      // Tilt is clamped: tumbling the cloth past vertical does not help anyone judge it.
      angle.current.x = Math.max(-0.55, Math.min(0.55, angle.current.x + dy * 0.004));
      // Velocity is smoothed over the last few events so one jittery sample cannot launch it.
      d.vx = d.vx * 0.6 + ((dx * 0.008) / dt) * 0.4;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.lastT = now;
      idleFor.current = 0;
      invalidate();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      d.active = false;
      // A hold-and-release (no movement in the last 80ms) stops dead; a flick carries on.
      velocity.current = performance.now() - d.lastT > 80 ? 0 : Math.max(-14, Math.min(14, d.vx));
      el.releasePointerCapture?.(e.pointerId);
      invalidate();
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl, invalidate]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05);
    const a = angle.current;

    // Switching modes changes what happens *next*, not where the cloth is *now*.
    if (wasFree.current !== free) {
      wasFree.current = free;
      idleFor.current = 3;
      // Back into one revolution, so a later return to the rock takes the short way round.
      a.y = Math.atan2(Math.sin(a.y), Math.cos(a.y));
      rock.current = Math.asin(Math.max(-1, Math.min(1, a.y / 0.34)));
    }

    if (!drag.current.active) {
      if (Math.abs(velocity.current) > 0.02) {
        // Momentum, with friction. Exponential decay reads as a real bearing running down.
        a.y += velocity.current * delta;
        velocity.current *= Math.exp(-delta * 2.4);
        idleFor.current = 0;
      } else {
        velocity.current = 0;
        idleFor.current += delta;
        if (idle && idleFor.current > 3) {
          // Ease the automatic motion back in over two seconds rather than jerking into it.
          const ease = Math.min(1, (idleFor.current - 3) / 2);
          if (free) {
            a.y += 0.35 * ease * delta;
          } else {
            rock.current += delta * 0.5 * ease;
            a.y += shortestTurn(a.y, Math.sin(rock.current) * 0.34) * Math.min(1, delta * 1.5 * ease);
          }
          a.x += (0 - a.x) * Math.min(1, delta * 1.5 * ease);
          invalidate();
        }
      }
    }

    // The finger is followed directly; everything else is lightly smoothed.
    const follow = drag.current.active ? 1 : Math.min(1, delta * 14);
    g.rotation.y += (a.y - g.rotation.y) * follow;
    g.rotation.x += (a.x - g.rotation.x) * follow;
    if (Math.abs(velocity.current) > 0.02 || drag.current.active) invalidate();
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Applies the rig's exposure. Golden hour really is dimmer than a studio box, and a buyer
 * comparing two shades under two lights needs that difference to be real.
 *
 * Applied from inside the frame loop rather than during render. The renderer is shared state
 * owned by the canvas; writing to it while React is deciding what to draw is how a value ends up
 * applied to the wrong frame — and the frame callback is the one place that is guaranteed to be
 * between two draws.
 */
function Exposure({ light }: { light: LightKey }) {
  const target = (RIGS[light] ?? RIGS.studio).exposure;
  useFrame(({ gl }) => {
    if (gl.toneMappingExposure !== target) gl.toneMappingExposure = target;
  });
  return null;
}

export function FabricViewer({
  fabric,
  colour,
  light,
  wind = 0,
  pulled = false,
  shine = false,
  free = false,
  garment,
  captureId,
  fallback,
  label,
  onStats,
  rolled = false,
}: FabricViewerProps) {
  const detected = useCapability();
  // The measured tier, shared across every surface in the tab (M29).
  const tier = useEffectiveTier(detected.tier);
  const [, setStats] = useState<StageStats | null>(null);
  const spec = useMemo(() => fabricMaterialSpec(fabric, colour), [fabric, colour]);
  const onGarment = !!garment && garment !== 'roll';
  // A supplied model for this cut, if the owner has put one in public/models/.
  const modelUrl = useGarmentModel(onGarment ? garment : undefined);
  const metres = onGarment ? (GARMENT_METRES[garment] ?? 1.15) : 0;
  // Garments hang from a fixed shoulder line; the panel and roll are centred as before.
  const lift = onGarment ? SHOULDER_Y - metres / 2 : 0;
  const hem = onGarment ? lift - metres / 2 : -(rolled ? 1.5 : 1.35) / 2;

  const handleStats = useCallback(
    (s: StageStats) => {
      setStats(s);
      onStats?.(s);
    },
    [onStats]
  );

  return (
    <Stage
      label={label}
      animate
      fallback={fallback}
      onStats={handleStats}
      captureId={captureId}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Exposure light={light} />
      <LightingRig light={light} tier={tier} floor={onGarment ? FLOOR_Y : hem - 0.125} />
      <ShineSweep active={shine} sheen={fabric.sheen} />
      {free && !onGarment && <Stand hem={hem} />}
      <Turntable idle={!pulled} free={free}>
        {onGarment ? (
          // Lifted a little: the lab's test pills sit over the bottom of the stage on a phone,
          // and a hem hidden behind them reads as a garment cut off.
          <group position={[0, lift, 0]}>
            {(() => {
              // The form's floor, in the garment group's own space.
              const floor = FLOOR_Y - lift;
              const procedural = (
                <GarmentMesh
                  garment={garment}
                  spec={spec}
                  tier={tier}
                  flow={fabric.flow}
                  stretch={fabric.stretch}
                  wind={wind}
                  pulled={pulled}
                  metres={metres}
                  floor={floor}
                />
              );
              return modelUrl ? (
                <ModelledGarment url={modelUrl} garment={garment} spec={spec} tier={tier} wind={wind} metres={metres} floor={floor} fallback={procedural} />
              ) : (
                procedural
              );
            })()}
          </group>
        ) : (
          <FabricPanel
            spec={spec}
            tier={tier}
            flow={fabric.flow}
            stretch={fabric.stretch}
            wind={wind}
            pulled={pulled}
            width={rolled ? 0.42 : 0.9}
            height={rolled ? 1.5 : 1.35}
          />
        )}
      </Turntable>
    </Stage>
  );
}
