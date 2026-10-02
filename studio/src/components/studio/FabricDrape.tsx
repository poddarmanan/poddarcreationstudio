'use client';

import type { CSSProperties } from 'react';
import type { FabricRow } from '@/lib/types';
import { FONT_DISPLAY, fabricTex, heroColour } from './helpers';

/** How many folds a length falls into: a stiff cotton in a few broad ones, a fluid rayon in many. */
const foldsOf = (flow: number) => Math.round(4 + Math.min(1, Math.max(0, flow)) * 3);

/**
 * The cloth's outline as a mask: gathered a little under the hanger, flaring to the hem, and the
 * hem falling in a soft wave, one dip for every fold. Cached per fold count and seed.
 */
const masks = new Map<string, string>();
function outline(folds: number, seed: number): string {
  const key = `${folds}:${seed}`;
  const hit = masks.get(key);
  if (hit) return hit;
  // Down the right side, back along the hem from right to left, and up the left side.
  const path = `M5,0 L95,0 C97,30 99,62 100,96.4 ${reverseHem(folds, seed)} C1,62 3,30 5,0 Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${path}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  masks.set(key, url);
  return url;
}

/** The hem from the right-hand corner back to the left, as quadratic curves. */
function reverseHem(folds: number, seed: number): string {
  const w = 100 / folds;
  let s = '';
  for (let i = folds - 1; i >= 0; i--) {
    const x0 = i * w;
    const deep = 97 + (((i * 7 + seed * 3) % 4) * 0.7);
    s += `Q${(x0 + (3 * w) / 4).toFixed(2)},${(deep + 2).toFixed(2)} ${(x0 + w / 2).toFixed(2)},${deep.toFixed(2)} Q${(x0 + w / 4).toFixed(2)},${(deep - 1.6).toFixed(2)} ${x0.toFixed(2)},${(96.4 + ((i + seed) % 2) * 0.8).toFixed(2)} `;
  }
  return s;
}

/** The folds' light and shade, a valley at each fold's edge and a crest at its middle. */
function foldLight(folds: number): string {
  const stops: string[] = [];
  for (let i = 0; i < folds; i++) {
    const a = (i / folds) * 100;
    const m = ((i + 0.5) / folds) * 100;
    const step = 100 / folds;
    stops.push(
      `rgba(18,10,6,.34) ${a.toFixed(2)}%`,
      `rgba(18,10,6,.08) ${(a + step * 0.18).toFixed(2)}%`,
      `rgba(255,250,240,.2) ${m.toFixed(2)}%`,
      `rgba(255,250,240,.04) ${(a + step * 0.78).toFixed(2)}%`,
    );
  }
  stops.push('rgba(18,10,6,.38) 100%');
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * A quality as the halls show it: a length of the cloth hung from a polished sheesham hanger with
 * brass caps and a brass hook, as cloth is shown in a merchant's showroom. The cloth is the
 * fabric's own texture in its signature shade, falling into soft folds (more and deeper for a
 * cloth that flows), gathered a little at the hanger and flaring to a waved hem. It sways from
 * the hook, and a page can turn it towards the viewer (`--turnf`, -1 to 1), its light sliding
 * across the folds. Every length is in the drape's unit, --rk (1px unless a page sets it larger).
 * Used by the Showroom, the Entrance's window and the Lab's "more fabrics".
 */
export function FabricDrape({ f, no, onClick, fg, sub, accent, shades, className = 'pc-hv-lift-14', style, compact = false }: {
  f: FabricRow; no: string; onClick: (from: DOMRect) => void; fg: string; sub: string; accent: string; shades: string;
  className?: string; style?: CSSProperties;
  /** A little smaller, for a strip seen a few drapes at a time. */
  compact?: boolean;
}) {
  const k = (n: number) => `calc(${n * (compact ? 0.86 : 1)} * var(--rk, 1px))`;
  const o = heroColour(f);
  const folds = foldsOf(f.flow);
  const mask = outline(folds, f.seed);
  // Heavier cloth hangs a longer length, within a narrow spread so the hall reads as one line.
  const kg = parseFloat(f.weight) || 12;
  const len = Math.round(186 + Math.min(22, kg) * 2.2);
  // Colours given as live variables (the Showroom blends them as it is walked) follow at once;
  // plain colours ease over a second.
  const ease = fg.startsWith('var(') ? undefined : 'color 1s ease';
  // The folds soften towards the hanger, where the cloth is gathered flat: the outline and a fade.
  const fadeMask = `${mask}, linear-gradient(180deg, rgba(0,0,0,.3), #000 32%)`;
  const fade: CSSProperties = {
    position: 'absolute', inset: 0, WebkitMaskImage: fadeMask, maskImage: fadeMask, WebkitMaskSize: '100% 100%, 100% 100%', maskSize: '100% 100%, 100% 100%',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskComposite: 'source-in', maskComposite: 'intersect',
  };
  const cut: CSSProperties = { position: 'absolute', inset: 0, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' };
  return (
    <div
      onClick={(e) => onClick((e.currentTarget.querySelector('.pc-drape-cloth') ?? e.currentTarget).getBoundingClientRect())}
      className={`pc-drape ${className}`}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'transform .6s cubic-bezier(.22,.8,.2,1)', ...style }}
    >
      <div className="pc-drape-stand" style={{ position: 'relative', width: k(124), height: k(len + 64), perspective: k(700) }}>
        <div className="pc-drape-figure" style={{ position: 'absolute', inset: 0, ['--flow' as string]: f.flow } as CSSProperties}>
          {/* The wire down from above, the hook on it, and the hanger. */}
          <span aria-hidden className="pc-drape-wire" style={{ height: k(30) }} />
          <span aria-hidden className="pc-drape-hook" style={{ top: k(24), width: k(18), height: k(16) }} />
          <span aria-hidden className="pc-drape-bar" style={{ top: k(38), width: k(114), height: k(11) }}>
            <i />
            <i />
          </span>
          <div className="pc-drape-cloth" style={{ top: k(45), left: k(9), width: k(106), height: k(len) }}>
            <div style={{ ...cut, background: fabricTex(f, o, 3) }} />
            <div aria-hidden className="pc-drape-folds" style={{ ...fade, ['--folds-light' as string]: foldLight(folds) } as CSSProperties} />
            <div aria-hidden className="pc-drape-depth" style={cut} />
          </div>
        </div>
        <span aria-hidden className="pc-drape-floor" style={{ width: k(110), height: k(14) }} />
      </div>
      <div data-drape-label style={{ marginTop: k(12), textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div className="pc-drape-no" style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, letterSpacing: '.14em', color: accent, marginBottom: 3, transition: ease }}>{no}</div>
        <div className="pc-drape-name" style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: fg, transition: ease }}>{f.name}</div>
        <div className="pc-drape-spec" style={{ fontSize: 11, letterSpacing: '.14em', color: sub, marginTop: 3, transition: ease }}>
          {f.weight} · {f.width}
        </div>
        <div className="pc-drape-shades" style={{ fontSize: 10.5, letterSpacing: '.1em', color: accent, marginTop: 3, transition: ease }}>
          {f.nc} {shades}
        </div>
      </div>
    </div>
  );
}
