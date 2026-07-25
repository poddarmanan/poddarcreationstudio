'use client';

import { Component, useCallback, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useCapability } from './useCapability';
import { reportClientEvent } from '@/lib/telemetry-client';
import { primeQuality, recordFrameSample, useEffectiveTier } from './quality';

/**
 * The host every 3D surface in the studio mounts into (Phase 4 M21).
 *
 * The contract is that **3D is an enhancement, never a requirement**. A buyer on a five-year-old
 * Android in a Surat market must see the fabric. So the stage decides, before it loads a single
 * byte of three.js, whether this device can render — and if it cannot, if the GL context is
 * lost, or if the scene throws, it shows the flat rendering the studio has always had instead.
 * There is no state in which a customer gets a blank rectangle.
 *
 * three.js and React Three Fiber are behind a dynamic import so they cost nothing on a page
 * that never opens a fabric, and nothing at all on a device that cannot use them.
 */

export interface StageStats {
  fps: number;
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

const StageCanvas = dynamic(() => import('./StageCanvas'), {
  // The canvas is browser-only: there is no GL context on the server, and importing three.js
  // there would put ~600KB into a bundle that cannot use it.
  ssr: false,
});

/** Why the flat rendering is showing, when it is. */
export type FallbackReason = 'unsupported' | 'context-lost' | 'error';

interface BoundaryProps {
  onError: (err: Error) => void;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * A scene that throws must not take the page with it. React unmounts the whole tree above an
 * uncaught render error, which for a fabric page means the customer loses the specification,
 * the price and the quote button because a shader failed to compile.
 */
class SceneBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error) {
    this.props.onError(err);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface StageProps {
  /** The flat rendering to show whenever 3D is unavailable. Required — there is no blank state. */
  fallback: ReactNode;
  /** The R3F scene. */
  children: ReactNode;
  /** `true` while something in the scene moves. Off means frames are drawn only on demand. */
  animate?: boolean;
  /** Accessible description of what the canvas is showing. */
  label: string;
  /** Frame statistics, once a second, while frames are being drawn. */
  onStats?: (stats: StageStats) => void;
  /** Told which way the stage resolved, so a caller can label or instrument it. */
  onFallback?: (reason: FallbackReason) => void;
  className?: string;
  style?: React.CSSProperties;
  /** Name this stage so its frame can be exported (M30). */
  captureId?: string;
}

export function Stage({ fallback, children, animate = false, label, onStats, onFallback, className, style, captureId }: StageProps) {
  const detected = useCapability();
  const [lost, setLost] = useState(false);

  // The tier the device *earned* at startup is the ceiling; what it can hold right now is
  // measured (M29). Every surface in the tab shares the verdict — see `quality.ts`.
  const tier = useEffectiveTier(detected.tier);
  const capability = useMemo(() => ({ ...detected, tier }), [detected, tier]);

  const fail = useCallback(
    (reason: FallbackReason, props?: Record<string, unknown>) => {
      onFallback?.(reason);
      reportClientEvent('three.fallback', { reason, tier: capability.tier, renderer: capability.renderer, ...props });
    },
    [onFallback, capability.tier, capability.renderer]
  );

  const onContextLost = useCallback(() => {
    setLost(true);
    fail('context-lost');
  }, [fail]);

  const onContextRestored = useCallback(() => setLost(false), []);

  const onError = useCallback((err: Error) => fail('error', { message: err.message.slice(0, 200) }), [fail]);

  const onReady = useCallback(() => {
    primeQuality(detected.tier);
    reportClientEvent('three.ready', {
      tier: capability.tier,
      webgl: capability.webgl,
      renderer: capability.renderer,
      maxTextureSize: capability.maxTextureSize,
      pixelRatio: capability.pixelRatio,
      mobile: capability.mobile,
    });
  }, [capability, detected.tier]);

  // `webgl: 0` covers both the server snapshot and a browser without WebGL, so the first
  // paint is always the flat rendering and 3D arrives after hydration if the device can.
  const supported = capability.webgl > 0 && capability.tier !== 'off';

  const handleStats = useCallback(
    (s: StageStats) => {
      // One second of measurement. The worst frame in the window, not the mean: a scene at a
      // steady 55fps with one 400ms hitch averages fine and feels broken.
      recordFrameSample(s.worstFrameMs);
      onStats?.(s);
    },
    [onStats]
  );

  const shell = useMemo<React.CSSProperties>(
    () => ({ position: 'relative', width: '100%', height: '100%', ...style }),
    [style]
  );

  if (!supported) {
    return (
      <div className={className} style={shell} data-stage="fallback" data-stage-reason="unsupported">
        {fallback}
      </div>
    );
  }

  return (
    <div className={className} style={shell} data-stage={lost ? 'fallback' : 'canvas'} data-stage-reason={lost ? 'context-lost' : undefined} aria-label={label} role="img">
      {/* The flat rendering stays mounted underneath. When the context is lost there is
          something to see immediately, with no flash of empty canvas while it comes back. */}
      <div style={{ position: 'absolute', inset: 0, visibility: lost ? 'visible' : 'hidden' }} aria-hidden={!lost}>
        {fallback}
      </div>
      <SceneBoundary onError={onError} fallback={<div style={{ position: 'absolute', inset: 0 }}>{fallback}</div>}>
        <StageCanvas
          capability={capability}
          animate={animate}
          onStats={handleStats}
          onContextLost={onContextLost}
          onContextRestored={onContextRestored}
          onReady={onReady}
          captureId={captureId}
        >
          {children}
        </StageCanvas>
      </SceneBoundary>
    </div>
  );
}
