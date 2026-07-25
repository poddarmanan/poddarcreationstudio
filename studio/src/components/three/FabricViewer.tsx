'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LightKey } from '@/lib/fabric-generator';
import type { ColourLike, FabricLike } from '@/lib/three/fabric-spec';
import { fabricMaterialSpec } from '@/lib/three/fabric-spec';
import { useCapability } from './useCapability';
import { Stage, type StageStats } from './Stage';
import { FabricPanel } from './FabricPanel';
import { LightingRig, RIGS } from './LightingRig';

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
  /** Shown whenever 3D is unavailable — the studio's existing flat rendering. */
  fallback: ReactNode;
  label: string;
  onStats?: (stats: StageStats) => void;
  /** Roll rather than hanging panel: the showroom's bolt-on-the-shelf presentation. */
  rolled?: boolean;
}

/** Drag to turn, wheel to come closer. Cloth is judged at an angle, so turning is the point. */
function Turntable({ children, idle }: { children: ReactNode; idle: boolean }) {
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
      target.current.y = Math.max(-1.2, Math.min(1.2, target.current.y + (e.clientX - last.current.x) * 0.006));
      // Clamped: letting a buyer tumble the cloth past vertical does not help them judge it.
      target.current.x = Math.max(-0.5, Math.min(0.5, target.current.x + (e.clientY - last.current.y) * 0.004));
      last.current = { x: e.clientX, y: e.clientY };
      invalidate();
    },
    [invalidate]
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
      target.current.y = Math.sin(rock.current) * 0.34;
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
  fallback,
  label,
  onStats,
  rolled = false,
}: FabricViewerProps) {
  const capability = useCapability();
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
      <LightingRig light={light} tier={capability.tier} />
      <Turntable idle={!pulled}>
        <FabricPanel
          spec={spec}
          tier={capability.tier}
          flow={fabric.flow}
          stretch={fabric.stretch}
          wind={wind}
          pulled={pulled}
          width={rolled ? 0.42 : 0.9}
          height={rolled ? 1.5 : 1.35}
        />
      </Turntable>
    </Stage>
  );
}
