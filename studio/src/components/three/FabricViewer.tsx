'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GarmentKey, LightKey } from '@/lib/fabric-generator';
import type { ColourLike, FabricLike, FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { fabricMaterialSpec, tileRepeat } from '@/lib/three/fabric-spec';
import type { QualityTier } from '@/lib/three/capability';
import { FabricMaterial } from './FabricMaterial';
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
  /** Told when a supplied model is being fetched or decoded, so the lab can show a loader. */
  onLoading?: (loading: boolean) => void;
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

/**
 * The bolt the roll hangs from: a length of the same cloth wound on a core, lying across the
 * top of the panel, so the panel reads as fabric coming off a roll rather than a sheet pinned
 * to nothing. It turns very slowly, as a bolt being unrolled does.
 */
function Bolt({ spec, tier, width, top, pulled = false }: { spec: FabricMaterialSpec; tier: QualityTier; width: number; top: number; pulled?: boolean }) {
  const roll = useRef<THREE.Mesh>(null);
  const pull = useRef(0);
  const radius = 0.07;
  const length = width + 0.08;
  const repeat = useMemo(() => tileRepeat(spec, length), [spec, length]);
  useFrame((_, delta) => {
    // Turning slowly on its own; faster while the cloth is pulled, as a bolt being unrolled.
    pull.current += ((pulled ? 1 : 0) - pull.current) * Math.min(1, delta * 4);
    if (roll.current) roll.current.rotation.y -= delta * (0.12 + pull.current * 0.45);
  });
  return (
    // Laid across by the group; the bolt itself turns about its own axis inside it. It sits on
    // a brass rod through its core, hung from two wires — the way a bolt is displayed.
    <group position={[0, top, -radius]} rotation={[0, 0, Math.PI / 2]}>
      <mesh ref={roll} castShadow>
        <cylinderGeometry args={[radius, radius, length, 48, 1]} />
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
      {/* The cardboard core, showing at each end. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, (side * length) / 2 + side * 0.001, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 0.004, 24]} />
          <meshBasicMaterial color="#D8CDB9" />
        </mesh>
      ))}
      {/* The rod, and its end caps. */}
      <mesh>
        <cylinderGeometry args={[0.009, 0.009, length + 0.22, 20]} />
        <meshBasicMaterial color="#8F7A55" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cap${side}`} position={[0, (side * (length + 0.22)) / 2, 0]}>
          <sphereGeometry args={[0.016, 16, 12]} />
          <meshBasicMaterial color="#A88E62" />
        </mesh>
      ))}
      {/* Two wires up from the rod, out of the top of the frame. In the group's frame (turned a
          quarter about z) the world's up is local +x, so each wire is turned the same quarter. */}
      {[-1, 1].map((side) => (
        <mesh key={`wire${side}`} position={[0.45, (side * (length + 0.14)) / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.9, 8]} />
          <meshBasicMaterial color="#6E6459" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The roll as one thing: bolt, wires and cloth hung from the wires' top, rocking front and back
 * together in the wind. The cloth's own drape sways more the further down it hangs; what this
 * adds is the swing of the rod it hangs from, in the same phase, so the top of the cloth and
 * the bolt move as one and nothing reads as pinned to a fixed point in the air.
 */
function RollRig({ children, top, wind }: { children: ReactNode; top: number; wind: number }) {
  const swing = useRef<THREE.Group>(null);
  const pivot = top + 0.45;
  useFrame((state) => {
    const g = swing.current;
    if (!g) return;
    // Matches the drape function's gust at the top edge (sin(t·1.4 + y·3.1)), eased in with the rail.
    g.rotation.x = Math.min(1, wind / 3) * 0.022 * Math.sin(state.clock.elapsedTime * 1.4 + top * 3.1);
  });
  return (
    <group position={[0, pivot, 0]}>
      <group ref={swing}>
        <group position={[0, -pivot, 0]}>{children}</group>
      </group>
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
function Turntable({ children, idle, free = false, square = false }: { children: ReactNode; idle: boolean; free?: boolean; square?: boolean }) {
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
          if (square) {
            // A bolt on a rod hangs square to the room: left alone, it settles back to face the
            // buyer rather than rocking, which made the rod look tilted.
            a.y += shortestTurn(a.y, 0) * Math.min(1, delta * 1.2 * ease);
          } else if (free) {
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
  onLoading,
  rolled = false,
}: FabricViewerProps) {
  const detected = useCapability();
  // The measured tier, shared across every surface in the tab (M29).
  const tier = useEffectiveTier(detected.tier);
  const [, setStats] = useState<StageStats | null>(null);
  const spec = useMemo(() => fabricMaterialSpec(fabric, colour), [fabric, colour]);
  const onGarment = !!garment && garment !== 'roll';
  // A supplied model for this cut, if the owner has put one in public/models/.
  const model = useGarmentModel(onGarment ? garment : undefined);
  // While the model's presence is being checked, nothing stands on the stage and the lab is
  // told; the built-in cut only appears for a cut that has no model at all.
  const checking = model.status === 'checking';
  useEffect(() => {
    if (!checking) return;
    onLoading?.(true);
    return () => onLoading?.(false);
  }, [checking, onLoading]);
  const metres = onGarment ? (GARMENT_METRES[garment] ?? 1.15) : 0;
  // Garments hang from a fixed shoulder line; the panel and roll are centred as before.
  const lift = onGarment ? SHOULDER_Y - metres / 2 : 0;
  // The roll is a little shorter and sits a little lower, to leave room for the bolt across its
  // top, and its hem meets the floor: a length of cloth off a roll rests on the ground.
  const rollHeight = 1.3;
  const rollDrop = 0.1;
  const hem = onGarment ? lift - metres / 2 : -(rolled ? rollHeight : 1.35) / 2;
  const floorY = onGarment ? FLOOR_Y : rolled ? hem - rollDrop : hem - 0.125;

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
      <LightingRig light={light} tier={tier} floor={floorY} />
      <ShineSweep active={shine} sheen={fabric.sheen} />
      {free && !onGarment && <Stand hem={hem} />}
      <Turntable idle={!pulled} free={free} square={rolled && !onGarment}>
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
              if (model.status === 'checking') return null;
              return model.url ? (
                <ModelledGarment url={model.url} garment={garment} spec={spec} tier={tier} wind={wind} metres={metres} floor={floor} fallback={procedural} onLoading={onLoading} />
              ) : (
                procedural
              );
            })()}
          </group>
        ) : (
          <group position={[0, rolled ? -rollDrop : 0, 0]}>
            {rolled ? (
              <RollRig top={rollHeight / 2} wind={wind}>
                <Bolt spec={spec} tier={tier} width={0.5} top={rollHeight / 2} pulled={pulled} />
                <FabricPanel spec={spec} tier={tier} flow={fabric.flow} stretch={fabric.stretch} wind={wind} pulled={pulled} width={0.5} height={rollHeight} />
              </RollRig>
            ) : (
              <FabricPanel spec={spec} tier={tier} flow={fabric.flow} stretch={fabric.stretch} wind={wind} pulled={pulled} width={0.9} height={1.35} />
            )}
          </group>
        )}
      </Turntable>
    </Stage>
  );
}
