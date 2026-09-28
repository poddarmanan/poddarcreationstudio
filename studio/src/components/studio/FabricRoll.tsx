'use client';

import type { FabricRow } from '@/lib/types';
import { FONT_DISPLAY, colourShade, fabricWeave, heroColour } from './helpers';

/**
 * A bolt of cloth standing on its end, as the Showroom draws it: the top of the roll with its
 * core, the body shaded round, the weave over it, a shadow at its foot and a faint reflection in
 * the floor. Heavier cloth stands taller. Used by the Showroom and by the lab's "more fabrics",
 * so the two are one drawing.
 */
export function FabricRoll({ f, no, onClick, fg, sub, accent, shades, className = 'pc-hv-lift-14', style, compact = false }: {
  f: FabricRow; no: string; onClick: () => void; fg: string; sub: string; accent: string; shades: string;
  className?: string; style?: React.CSSProperties;
  /** A narrower spread of heights, for a strip seen a few rolls at a time: heavier cloth still
   * stands taller, but the lightest roll no longer leaves a band of empty wall above it. */
  compact?: boolean;
}) {
  const o = heroColour(f);
  const w = parseFloat(f.weight);
  const h = Math.round(compact ? 232 + w * 2.6 : 190 + w * 7);
  const top1 = colourShade(o, 0.1);
  const top2 = colourShade(o, -0.07);
  const s1 = colourShade(o, -0.28);
  const s2 = colourShade(o, -0.1);
  const mid = colourShade(o, 0.08);
  const s3 = colourShade(o, -0.12);
  const s4 = colourShade(o, -0.32);
  const body = `linear-gradient(90deg, ${s1} 0%, ${s2} 16%, ${mid} 42%, ${mid} 58%, ${s3} 84%, ${s4} 100%)`;
  return (
    <div
      onClick={onClick}
      className={className}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'transform .6s cubic-bezier(.22,.8,.2,1)', ...style }}
    >
      <div style={{ position: 'relative', width: 92, height: h }}>
        <div style={{ position: 'absolute', top: -12, left: 0, width: 92, height: 24, borderRadius: '50%', background: `radial-gradient(ellipse at 42% 40%, ${top1}, ${top2} 70%)`, border: '1px solid rgba(28,25,23,.12)' }} />
        <div style={{ position: 'absolute', top: -4, left: 33, width: 26, height: 9, borderRadius: '50%', background: '#EFE9DF', border: '1px solid rgba(28,25,23,.18)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '0 0 7px 7px', background: body, boxShadow: 'inset 0 -34px 44px rgba(28,25,23,.13)' }} />
        <div style={{ position: 'absolute', inset: 0, background: fabricWeave(f, o, 3), opacity: 0.5, borderRadius: '0 0 7px 7px' }} />
        <div style={{ position: 'absolute', left: -16, right: -16, bottom: -13, height: 20, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(28,25,23,.32), transparent 70%)' }} />
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, height: 60, marginTop: 14, borderRadius: '7px 7px 0 0',
            background: body, opacity: 0.14, transform: 'scaleY(-1)', maskImage: 'linear-gradient(180deg,transparent, #000)',
          }}
        />
      </div>
      <div style={{ marginTop: 32, textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, letterSpacing: '.14em', color: accent, marginBottom: 3 }}>{no}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: fg }}>{f.name}</div>
        <div style={{ fontSize: 11, letterSpacing: '.14em', color: sub, marginTop: 3 }}>
          {f.weight} · {f.width}
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: '.1em', color: accent, marginTop: 3 }}>
          {f.nc} {shades}
        </div>
      </div>
    </div>
  );
}
