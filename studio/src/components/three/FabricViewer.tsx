'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
}

/** Drag to turn, wheel to come closer. Cloth is judged at an angle, so turning is the point. */
/**
 * The stand the cloth hangs from once "Watch in 3D" is on. A length of fabric floating in
 * space has no scale; a stand of a known height gives the eye something to measure against,
 * which is the same reason a showroom drapes cloth over a rail rather than holding it up.
 */
function Stand() {
  return (
    <group position={[0, -0.72, 0]}>
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

function Turntable({ children, idle, free = false }: { children: ReactNode; idle: boolean; free?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const rock = useRef(0);

  const onDown = useCallback((e: PointerEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    gl.domElement.setPointerCapture(e.pointerId);
  }, [gl]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = target.current.y + (e.clientX - last.current.x) * 0.006;
      // "Watch in 3D" is the one case where turning all the way round is the point; otherwise
      // the arc is clamped to the one a bolt is actually rocked through.
      target.current.y = free ? next : Math.max(-1.2, Math.min(1.2, next));
      // Clamped: letting a buyer tumble the cloth past vertical does not help them judge it.
      target.current.x = Math.max(-0.5, Math.min(0.5, target.current.x + (e.clientY - last.current.y) * 0.004));
      last.current = { x: e.clientX, y: e.clientY };
      invalidate();
    },
    [invalidate, free]
  );

  const onUp = useCallback((e: PointerEvent) => {
    dragging.current = false;
    gl.domElement.releasePointerCapture?.(e.pointerId);
  }, [gl]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // Left alone, the cloth *rocks* rather than spins. A merchant rocks a bolt under the light
    // through maybe forty degrees to watch the shade shift; nobody turns it through 360°, and
    // letting it do so shows the back of a surface that has no back.
    if (idle && !dragging.current) {
      rock.current += delta * 0.5;
      // "Watch in 3D" is the one case where a full turn is the point — the buyer asked to see
      // the whole thing. Otherwise it rocks through the arc a bolt is actually rocked through.
      target.current.y = free ? rock.current * 0.7 : Math.sin(rock.current) * 0.34;
    }
    g.rotation.y += (target.current.y - g.rotation.y) * Math.min(1, delta * 6);
    g.rotation.x += (target.current.x - g.rotation.x) * Math.min(1, delta * 6);
    void state;
  });

  return (
    <group
      ref={group}
      onPointerDown={(e) => onDown(e.nativeEvent)}
      onPointerMove={(e) => onMove(e.nativeEvent)}
      onPointerUp={(e) => onUp(e.nativeEvent)}
      onPointerLeave={(e) => onUp(e.nativeEvent)}
    >
      {children}
    </group>
  );
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
      style={{ position: 'absolute', inset: 0 }}
    >
      <Exposure light={light} />
      <LightingRig light={light} tier={tier} />
      <ShineSweep active={shine} sheen={fabric.sheen} />
      {free && <Stand />}
      <Turntable idle={!pulled} free={free}>
        {garment && garment !== 'roll' ? (
          <GarmentMesh
            garment={garment}
            spec={spec}
            tier={tier}
            flow={fabric.flow}
            stretch={fabric.stretch}
            wind={wind}
            pulled={pulled}
          />
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
