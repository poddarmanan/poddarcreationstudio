'use client';

import type { CSSProperties } from 'react';
import type { FabricRow } from '@/lib/types';
import { GARMENTS, SHOWCASE, type GarmentKey } from '@/lib/fabric-generator';
import { FONT_DISPLAY, fabricTex, heroColour } from './helpers';

/** The box every garment outline is drawn in, so the necklines line up from cut to cut. */
const VIEW = '30 10 140 245';
/** Each cut's outline as a mask image: the cloth is a box of the fabric's own texture, cut to it. */
const masks = new Map<string, string>();
function maskOf(g: GarmentKey): string {
  const hit = masks.get(g);
  if (hit) return hit;
  const d = GARMENTS[g]?.d || GARMENTS.kurti.d;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${VIEW}' preserveAspectRatio='none'><path d='${d}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  masks.set(g, url);
  return url;
}

/**
 * A quality on its dress form, as the halls show it: the garment it is most bought for, made up
 * in its signature shade, on a black tailor's form with a brass cap, a pole and a round foot. The
 * cloth is the fabric's own texture cut to the garment's outline, shaded round, and it sways a
 * little, more for a cloth that flows. A page can turn it towards the viewer (`--turnf`, -1 to 1,
 * set on the element as it moves). Every length is in the form's unit, --rk (1px unless a page
 * sets it larger). Used by the Showroom, the Entrance's window and the Lab's "more fabrics".
 */
export function FabricForm({ f, no, onClick, fg, sub, accent, shades, className = 'pc-hv-lift-14', style, compact = false }: {
  f: FabricRow; no: string; onClick: (from: DOMRect) => void; fg: string; sub: string; accent: string; shades: string;
  className?: string; style?: CSSProperties;
  /** A little smaller, for a strip seen a few forms at a time. */
  compact?: boolean;
}) {
  const k = (n: number) => `calc(${n * (compact ? 0.86 : 1)} * var(--rk, 1px))`;
  const o = heroColour(f);
  const garment = SHOWCASE[f.id] ?? 'kurti';
  const mask = maskOf(garment);
  // Colours given as live variables (the Showroom blends them as it is walked) follow at once;
  // plain colours ease over a second.
  const ease = fg.startsWith('var(') ? undefined : 'color 1s ease';
  const cut: CSSProperties = { position: 'absolute', inset: 0, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' };
  return (
    <div
      onClick={(e) => onClick((e.currentTarget.querySelector('.pc-form-dress') ?? e.currentTarget).getBoundingClientRect())}
      className={`pc-form ${className}`}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'transform .6s cubic-bezier(.22,.8,.2,1)', ...style }}
    >
      <div className="pc-form-stand" style={{ position: 'relative', width: k(126), height: k(262), perspective: k(700) }}>
        {/* The foot and the pole, behind the cloth. */}
        <span aria-hidden className="pc-form-foot" style={{ width: k(66), height: k(12) }} />
        <span aria-hidden className="pc-form-pole" style={{ width: k(5), top: k(90) }} />
        <div className="pc-form-figure" style={{ position: 'absolute', left: 0, top: k(8), width: k(126), height: k(220) }}>
          {/* The form's neck, rising out of the neckline, and its brass cap. */}
          <span aria-hidden className="pc-form-neck" style={{ width: k(20), height: k(26), top: k(-12) }} />
          <span aria-hidden className="pc-form-cap" style={{ width: k(24), height: k(7), top: k(-15) }} />
          <div className="pc-form-dress" style={{ position: 'absolute', inset: 0, ['--flow' as string]: f.flow } as CSSProperties}>
            <div style={{ ...cut, background: fabricTex(f, o, 3) }} />
            <div aria-hidden className={`pc-form-detail is-${garment}`} style={cut} />
            <div aria-hidden className="pc-form-shade" style={cut} />
          </div>
        </div>
      </div>
      <div data-form-label style={{ marginTop: k(16), textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div className="pc-form-no" style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, letterSpacing: '.14em', color: accent, marginBottom: 3, transition: ease }}>{no}</div>
        <div className="pc-form-name" style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: fg, transition: ease }}>{f.name}</div>
        <div className="pc-form-spec" style={{ fontSize: 11, letterSpacing: '.14em', color: sub, marginTop: 3, transition: ease }}>
          {f.weight} · {f.width}
        </div>
        <div className="pc-form-shades" style={{ fontSize: 10.5, letterSpacing: '.1em', color: accent, marginTop: 3, transition: ease }}>
          {f.nc} {shades}
        </div>
      </div>
    </div>
  );
}
