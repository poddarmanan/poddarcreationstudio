'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricTex, colourCss, colourFg, heroColour, fabricNo } from './helpers';

const TRENDING: [number, number][] = [[4, 11], [9, 8], [1, 6], [8, 15], [2, 18], [6, 12], [10, 9], [5, 17], [0, 19], [3, 13]];

export function Collection({ studio }: { studio: Studio }) {
  const { t, fabrics, compare, approved, isStaff } = studio;
  const priced = approved || isStaff;
  const totalShades = fabrics.reduce((a, b) => a + b.nc, 0);

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 60px', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      {/* Wraps on a phone: the shade count squeezed beside the title breaks "PODDAR CREATION"
          across two lines and reads as damage. The Swatch Book header already does this. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
          <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(32px,4vw,52px)' }}>{t.collection}</h1>
          <Selvage style={{ marginTop: 12 }} />
        </div>
        <span style={{ fontSize: 12, letterSpacing: '.2em', color: 'rgba(28,25,23,.5)' }}>
          {totalShades} {t.shades} · 11 QUALITIES
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 26 }}>
        {fabrics.map((f) => {
          const on = compare.includes(f.id);
          const dots = f.colours.filter((_, j) => j % 4 === 1).slice(0, 6);
          return (
            <div
              key={f.id}
              onClick={() => studio.openFabric(f.id)}
              className="pc-hv-lift-6"
              style={{
                cursor: 'pointer', background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 4,
                overflow: 'hidden', transition: 'transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s',
              }}
            >
              <div style={{ position: 'relative', aspectRatio: '4/3', background: fabricTex(f, heroColour(f), 4) }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 55%,rgba(28,25,23,.14))', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.06)' }} />
                {/* The plate number, as the catalogue prints it; the shade count moves to the right. */}
                <span
                  style={{
                    position: 'absolute', top: 12, left: 12, fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 500, lineHeight: 1, letterSpacing: '.04em',
                    background: 'rgba(250,248,245,.85)', backdropFilter: 'blur(6px)', padding: '6px 9px 5px', borderRadius: 999,
                  }}
                >
                  {fabricNo(fabrics, f.id)}
                </span>
                <span
                  style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 10, letterSpacing: '.24em',
                    background: 'rgba(250,248,245,.85)', backdropFilter: 'blur(6px)', padding: '5px 10px', borderRadius: 999,
                  }}
                >
                  {f.nc} {t.shades}
                </span>
              </div>
              <div style={{ padding: '18px 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <h3 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 23 }}>{f.name}</h3>
                  <span style={{ fontSize: 12.5, color: '#8A6D45', whiteSpace: 'nowrap' }}>{priced ? `₹${f.price}/m` : t.lock}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(28,25,23,.55)', marginTop: 4 }}>
                  {f.weight} · {f.width} · {f.hand}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
                  {dots.map((d, j) => (
                    <span key={j} style={{ width: 15, height: 15, borderRadius: '50%', background: colourCss(d), border: '1px solid rgba(28,25,23,.12)' }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>+{f.nc - 6}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      studio.toggleCompare(f.id);
                    }}
                    style={{
                      cursor: 'pointer', marginLeft: 'auto',
                      background: on ? '#1C1917' : 'transparent',
                      color: on ? '#FAF8F5' : '#1C1917',
                      border: '1px solid rgba(28,25,23,.18)', borderRadius: 999, padding: '5px 12px',
                      fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.1em',
                    }}
                  >
                    {on ? t.cmpOn : t.cmp}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <h2 style={{ margin: '52px 0 22px', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(24px,2.6vw,34px)' }}>{t.trending}</h2>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10 }}>
        {TRENDING.map(([fi, ciIdx], i) => {
          const f = fabrics[fi];
          const c = f.colours[ciIdx];
          return (
            <div
              key={i}
              onClick={() => studio.openFabric(f.id, ciIdx)}
              className="pc-pink pc-hv-lift-5"
              style={{
                cursor: 'pointer', flex: 'none', width: 120, height: 150, borderRadius: '4px 4px 0 0',
                background: fabricTex(f, c, 3), boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.07)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 12px 16px', transition: 'transform .3s',
              }}
            >
              <span style={{ fontSize: 12.5, color: colourFg(c) }}>{c.name}</span>
              <span style={{ fontSize: 10, color: colourFg(c), opacity: 0.7 }}>{f.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
