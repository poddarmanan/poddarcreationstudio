'use client';

import { useMemo } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, colourCss, colourFg, chipStyle } from './helpers';

export function ColourWall({ studio }: { studio: Studio }) {
  const { t, fabrics, wallFab, lang } = studio;
  const totalShades = fabrics.reduce((a, b) => a + b.nc, 0);

  const wall = useMemo(() => {
    const items = fabrics
      .filter((x) => !wallFab || x.id === wallFab)
      .flatMap((x) =>
        x.colours.map((c, j) => ({
          key: `${x.id}-${j}`,
          name: c.name,
          fab: x.name,
          css: colourCss(c),
          fg: colourFg(c),
          h: c.h,
          l: c.l,
          go: () => studio.openFabric(x.id, j),
        }))
      );
    // With no filter, arrange every shade as one continuous spectrum (hue, then lightness).
    if (!wallFab) items.sort((a, b) => a.h - b.h || b.l - a.l);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabrics, wallFab]);

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
      <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.colourWall}</h1>
      <Selvage style={{ marginTop: 12 }} />
      <p style={{ margin: '8px 0 26px', fontSize: 14, fontWeight: 300, color: 'rgba(28,25,23,.55)' }}>
        {totalShades} {t.shades} · {t.wallSub}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {[{ id: null as string | null, label: lang === 'hi' ? 'सभी' : 'All qualities' }, ...fabrics.map((x) => ({ id: x.id as string | null, label: x.name }))].map((chip) => {
          const on = wallFab === chip.id;
          const cs = chipStyle(on);
          return (
            <button
              key={chip.id ?? 'all'}
              onClick={() => studio.setWallFab(chip.id)}
              style={{
                cursor: 'pointer', background: cs.background, color: cs.color, border: `1px solid ${cs.borderColor}`,
                borderRadius: 999, padding: '8px 16px', fontFamily: FONT_BODY, fontSize: 12,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
        {wall.map((c) => (
          <div
            key={c.key}
            onClick={c.go}
            className="pc-pink pc-hv-scale-06"
            style={{
              cursor: 'pointer', aspectRatio: '1', borderRadius: '3px 3px 0 0', background: c.css,
              boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.07)', display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', padding: '9px 9px 13px', transition: 'transform .25s',
            }}
          >
            <span style={{ fontSize: 11, color: c.fg }}>{c.name}</span>
            <span style={{ fontSize: 9, color: c.fg, opacity: 0.65 }}>{c.fab}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
