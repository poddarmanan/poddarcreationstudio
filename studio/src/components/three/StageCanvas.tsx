'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Capability } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import { getTextureCache } from '@/lib/three/texture-cache';
import type { StageStats } from './Stage';

/**
 * The real canvas (Phase 4 M21). Loaded only when a device can use it, and only in the
 * browser — this module pulls in three.js and React Three Fiber, so it must never reach the
 * server bundle or the initial download.
 *
 * Everything in here is about the things that go wrong in production rather than in a demo:
 * losing the GL context when a phone sleeps, leaking GPU memory across route changes, and
 * burning a battery rendering a scene nobody is looking at.
 */

/** Samples frame time and reports it upward. M29 turns these numbers into quality decisions. */
function FrameStats({ onStats }: { onStats?: (s: StageStats) => void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const worst = useRef(0);
  const since = useRef(0);

  useFrame((_, delta) => {
    if (!onStats) return;
    const ms = delta * 1000;
    frames.current += 1;
    worst.current = Math.max(worst.current, ms);
    since.current += ms;
    // Report once a second: often enough to react to, rare enough not to become the load.
    if (since.current < 1000) return;
    onStats({
      fps: Math.round((frames.current * 1000) / since.current),
      worstFrameMs: Math.round(worst.current * 10) / 10,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    frames.current = 0;
    worst.current = 0;
    since.current = 0;
  });

  return null;
}

/**
 * Context loss is not an error — a phone that sleeps, a driver that resets, or a browser
 * reclaiming GPU memory from a background tab all take the context away and usually give it
 * back. Left unhandled the canvas goes black and stays black, so we tell the host, let it
 * show the flat fallback, and pick the scene back up when the context returns.
 */
function ContextGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault(); // without this the browser will not attempt a restore
      onLost();
    };
    const restored = () => {
      onRestored();
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, invalidate, onLost, onRestored]);

  return null;
}

/**
 * Frees the GPU's working set when the stage goes away. React unmounts the tree; it does not
 * unmount VRAM. Without this, walking through a dozen fabrics leaves a dozen render targets
 * and their textures resident until the tab is closed.
 */
function Reclaim() {
  const gl = useThree((s) => s.gl);
  useEffect(
    () => () => {
      getTextureCache().clear();
      gl.dispose();
    },
    [gl]
  );
  return null;
}

/**
 * True while the canvas is both on screen and in a foreground tab.
 *
 * A fabric drifting behind a modal, or in a tab someone left open yesterday, costs exactly as
 * much to render as one being looked at. Both observers report asynchronously, so this never
 * sets state during the effect that installs them.
 */
function useVisible(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    let tabVisible = !document.hidden;
    const report = () => setVisible(onScreen && tabVisible);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      report();
    });
    io.observe(el);

    const onTab = () => {
      tabVisible = !document.hidden;
      report();
    };
    document.addEventListener('visibilitychange', onTab);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onTab);
    };
  }, [ref]);
  return visible;
}

export interface StageCanvasProps {
  capability: Capability;
  /** `true` while something in the scene moves; otherwise frames are drawn on demand. */
  animate: boolean;
  children: React.ReactNode;
  onStats?: (stats: StageStats) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
  onReady?: () => void;
}

export default function StageCanvas({
  capability,
  animate,
  children,
  onStats,
  onContextLost,
  onContextRestored,
  onReady,
}: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(hostRef);

  // Continuous frames only when something moves, someone is looking, and they asked for
  // motion at all. Everything else draws on demand.
  const frameloop = animate && visible && !capability.reducedMotion ? 'always' : 'demand';

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        frameloop={frameloop}
        dpr={capability.pixelRatio}
        shadows={shadowsAllowed(capability.tier)}
        gl={{
          antialias: capability.tier !== 'low',
          alpha: true,
          powerPreference: 'high-performance',
          // Keeping the drawing buffer costs memory and is only needed to read pixels back;
          // the export milestone (M30) asks for it explicitly when it needs a frame.
          preserveDrawingBuffer: false,
        }}
        camera={{ position: [0, 0, 2.6], fov: 35 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          onReady?.();
        }}
      >
        <ContextGuard onLost={onContextLost} onRestored={onContextRestored} />
        <Reclaim />
        <FrameStats onStats={onStats} />
        {children}
      </Canvas>
    </div>
  );
}
