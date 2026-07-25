'use client';

import { useMemo, useState } from 'react';
import { Stage, type StageStats } from './Stage';
import { useCapability } from './useCapability';
import { useEffectiveTier } from './quality';
import { WeaveSurface } from './WeaveSurface';
import { frameBudgetMs, shadowsAllowed, textureSizeFor } from '@/lib/three/capability';
import { fabricMaterialSpec } from '@/lib/three/fabric-spec';
import { FABRIC_DEFS, generateColours } from '@/lib/fabric-generator';

/**
 * 3D readiness, on the diagnostics page (Phase 4 M21).
 *
 * The capability numbers that matter are the ones from the device in a buyer's hand, and no
 * amount of local testing produces them. This panel renders the real pipeline — the same
 * `Stage`, the same generated weave, the same tier decisions — and prints what actually
 * happened, so support can ask a customer to open one page and read back an answer.
 *
 * It is also the surface the M21 smoke drives: if this renders, the foundation works.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
      <span style={{ fontSize: 11.5, letterSpacing: '.06em', color: 'rgba(28,25,23,.55)', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, color: tone ?? INK, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

export function ThreeReadiness() {
  const capability = useCapability();
  // What the device earned at startup, and what it is actually holding right now (M29).
  const tier = useEffectiveTier(capability.tier);
  const [stats, setStats] = useState<StageStats | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  const size = textureSizeFor(tier, capability.maxTextureSize);
  // A real catalogue row rather than an invented one: if the spec-sheet mapping breaks, this
  // panel is where it shows, and a made-up fabric would hide exactly that.
  const spec = useMemo(() => {
    const fabric = FABRIC_DEFS.find((f) => f.id === 'gajji') ?? FABRIC_DEFS[0];
    const colours = generateColours(fabric);
    return fabricMaterialSpec(fabric, colours[fabric.heroIndex] ?? colours[0]);
  }, []);

  const budget = frameBudgetMs(tier);
  const slow = stats ? stats.worstFrameMs > budget * 1.6 : false;

  return (
    <div data-three-readiness style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
      <div style={{ position: 'relative', minHeight: 200, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(28,25,23,.08)', background: '#EFEAE1' }}>
        <Stage
          label="A generated weave, rendered to prove the 3D pipeline works on this device"
          animate
          onStats={setStats}
          onFallback={setFallback}
          fallback={
            <div
              data-three-fallback
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                padding: 20,
                textAlign: 'center',
                fontSize: 12,
                color: 'rgba(28,25,23,.6)',
                background: 'repeating-linear-gradient(45deg,#E5DDD0 0 3px,#DCD3C4 3px 6px)',
              }}
            >
              {capability.reason ?? 'The flat rendering — 3D is not available here'}
            </div>
          }
        >
          <WeaveSurface spec={spec} tier={tier} spin repeat={4} />
        </Stage>
      </div>

      <div>
        <Row label="WebGL" value={capability.webgl === 0 ? 'unavailable' : `version ${capability.webgl}`} tone={capability.webgl === 0 ? '#A33' : undefined} />
        <Row label="Quality tier" value={tier === capability.tier ? capability.tier : `${tier} (from ${capability.tier})`} />
        <Row label="Renderer" value={capability.renderer} />
        <Row label="Max texture" value={`${capability.maxTextureSize}px`} />
        <Row label="Map resolution" value={`${size}px`} />
        <Row label="Pixel ratio" value={capability.pixelRatio.toFixed(2)} />
        <Row label="Shadows" value={shadowsAllowed(tier) ? 'on' : 'off'} />
        <Row label="Frame budget" value={`${budget}ms`} />
        <Row
          label="Measured"
          value={stats ? `${stats.fps}fps · worst ${stats.worstFrameMs}ms · ${stats.drawCalls} calls` : 'sampling…'}
          tone={slow ? GOLD : undefined}
        />
        <Row label="On the GPU" value={stats ? `${stats.textures} textures · ${stats.geometries} geometries` : '—'} />
        {fallback && <Row label="Fell back" value={fallback} tone="#A33" />}
        {capability.reason && <Row label="Note" value={capability.reason} tone={GOLD} />}
      </div>
    </div>
  );
}
