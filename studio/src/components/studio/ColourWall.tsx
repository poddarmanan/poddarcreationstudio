'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, chipStyle, fabricTex } from './helpers';

/** A shade on the wall, with where it comes from. */
type Shade = { key: string; c: ColourRow; x: FabricRow; j: number };

/** Below this OKLCH chroma a shade reads as a grey, and is hung with the neutrals. */
const NEUTRAL_C = 0.035;
/** Where the colour wheel is cut to lay it out in a line: between the pinks and the reds. */
const HUE_START = 350;

/**
 * One run of colour, as a mill hangs its cards: the neutrals first, light to dark, then round the
 * colour wheel from red, each hue light to dark where two sit close.
 */
function spectrum(a: ColourRow, b: ColourRow) {
  const an = a.c < NEUTRAL_C;
  const bn = b.c < NEUTRAL_C;
  if (an !== bn) return an ? -1 : 1;
  if (an) return b.l - a.l;
  const ha = (a.h - HUE_START + 720) % 360;
  const hb = (b.h - HUE_START + 720) % 360;
  return Math.abs(ha - hb) < 6 ? b.l - a.l : ha - hb;
}

/** A card's width, its step along the rail (its width less the overlap), and the rail's padding. */
const CARD_W = 92;
const CARD_STEP = 38;
const RAIL_PAD = 84;

/**
 * The Colour Wall, as a swatch rail: one quality at a time, every shade a hanging swatch card on
 * brass rails, stacked one under another and read as one run of colour, like a mill's card wall.
 * The cards stand turned in depth, overlapping like cards in a file; the one under the hand (or
 * tapped) swings round to face you, those after it slide along, and a tap opens its fabric.
 */
export function ColourWall({ studio }: { studio: Studio }) {
  const { t, fabrics, wallFab } = studio;
  // Always one quality at a time: the one chosen, or the first.
  const fab = fabrics.find((x) => x.id === wallFab) ?? fabrics[0];

  const shades = useMemo(() => {
    if (!fab) return [];
    return fab.colours
      .map((c, j): Shade => ({ key: `${fab.id}-${j}`, c, x: fab, j }))
      .sort((a, b) => spectrum(a.c, b.c));
  }, [fab]);

  // As many cards to a rail as the wall is wide; the run carries on along the next rail below.
  const wall = useRef<HTMLDivElement | null>(null);
  const [perRail, setPerRail] = useState(12);
  useEffect(() => {
    const el = wall.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPerRail(Math.max(6, Math.floor((el.clientWidth - RAIL_PAD - CARD_W) / CARD_STEP) + 1)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rails = useMemo(() => {
    const out: Shade[][] = [];
    for (let i = 0; i < shades.length; i += perRail) out.push(shades.slice(i, i + perRail));
    return out;
  }, [shades, perRail]);

  // Taking a card off the rail: it swings out, then its fabric opens.
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (s: Shade) => {
    if (picked) return;
    setPicked(s.key);
    window.setTimeout(() => {
      setPicked(null);
      studio.openFabric(s.x.id, s.j);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
  };

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
      <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.colourWall}</h1>
      <Selvage style={{ marginTop: 12 }} />
      <p style={{ margin: '8px 0 18px', fontSize: 14, fontWeight: 300, color: 'rgba(28,25,23,.55)' }}>
        {fab?.name} · {shades.length} {t.shades} · {t.wallSub}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 26px' }}>
        {fabrics.map((chip) => {
          const on = fab?.id === chip.id;
          const cs = chipStyle(on);
          return (
            <button
              key={chip.id}
              aria-pressed={on}
              onClick={() => studio.setWallFab(chip.id)}
              style={{ cursor: 'pointer', background: cs.background, color: cs.color, border: `1px solid ${cs.borderColor}`, borderRadius: 999, padding: '8px 16px', fontFamily: FONT_BODY, fontSize: 12 }}
            >
              {chip.name}
            </button>
          );
        })}
      </div>

      <div ref={wall} className="pc-rails">
        {rails.map((rail, ri) => (
          <div key={`${fab?.id}-${ri}`} className="pc-rail" style={{ animationDelay: `${ri * 0.08}s` }}>
            <div className="pc-rail-track">
              <span aria-hidden className="pc-rail-rod" />
              {rail.map((s, i) => (
                <button
                  key={s.key}
                  title={`${s.c.name} · ${s.x.name}`}
                  aria-label={`${s.c.name}, ${s.x.name}`}
                  className={`pc-card${picked === s.key ? ' is-picked' : ''}`}
                  style={{ animationDelay: `${i * 0.03 + ri * 0.08}s`, zIndex: i + 1 } as CSSProperties}
                  onClick={() => pick(s)}
                >
                  <span aria-hidden className="pc-card-hook" />
                  <span className="pc-card-head">
                    <b>{s.c.name}</b>
                    <i>
                      {s.x.name} · {String(s.c.order).padStart(2, '0')}
                    </i>
                  </span>
                  <span aria-hidden className="pc-card-cloth" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.1), transparent 30%, rgba(255,255,255,.08) 55%, rgba(0,0,0,.14)), ${fabricTex(s.x, s.c, 3)}` }} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
