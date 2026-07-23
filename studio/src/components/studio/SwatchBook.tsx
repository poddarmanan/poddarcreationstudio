'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';

export function SwatchBook({ studio }: { studio: Studio }) {
  const { t, fabrics, pins } = studio;

  const groups = fabrics
    .map((x) => ({ x, items: pins.filter((p) => p.fabricId === x.id) }))
    .filter((g) => g.items.length);

  const waBoard =
    'https://wa.me/?text=' +
    encodeURIComponent(
      'Poddar Creation swatch book: ' +
        pins
          .map((p) => {
            const x = studio.fab(p.fabricId);
            const c = x.colours.find((cc) => cc.order === p.colourOrder);
            return c ? `${c.name} (${x.name})` : '';
          })
          .filter(Boolean)
          .join(', ')
    );

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
          <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.book}</h1>
          <Selvage style={{ marginTop: 10 }} />
          <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 300, color: 'rgba(28,25,23,.55)' }}>{t.bookSub}</p>
        </div>
        <div className="pc-no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={studio.openQuoteBook}
            className="pc-hv-gold-bg"
            style={{
              cursor: 'pointer', background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999,
              padding: '9px 20px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.1em',
            }}
          >
            {t.quoteBook}
          </button>
          <button
            onClick={() => window.print()}
            className="pc-hv-border-ink"
            style={{
              cursor: 'pointer', border: '1px solid rgba(28,25,23,.2)', background: 'transparent', borderRadius: 999,
              padding: '9px 18px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.1em',
            }}
          >
            ↓ PDF / Print
          </button>
          <a
            href={waBoard}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '9px 18px', fontSize: 12, letterSpacing: '.1em', color: '#1C1917' }}
          >
            WhatsApp ↗
          </a>
        </div>
      </div>
      {pins.length === 0 && (
        <div style={{ marginTop: 40, border: '1px dashed rgba(28,25,23,.2)', borderRadius: 6, padding: '60px 24px', textAlign: 'center', color: 'rgba(28,25,23,.5)', fontWeight: 300 }}>
          {t.emptyBoard}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.x.id} style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600 }}>{g.x.name}</div>
            <span style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>
              {g.x.weight} · {g.x.width} · {g.items.length} {t.shades}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 16, marginTop: 18 }}>
            {g.items.map((p) => {
              const c = g.x.colours.find((cc) => cc.order === p.colourOrder);
              if (!c) return null;
              return (
                <div
                  key={`${p.fabricId}-${p.colourOrder}`}
                  className="pc-hv-lift-3"
                  style={{
                    background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 4, overflow: 'hidden',
                    boxShadow: '0 2px 10px rgba(28,25,23,.04)', transition: 'transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s',
                  }}
                >
                  <div
                    onClick={() => studio.openFabric(p.fabricId, p.colourOrder)}
                    className="pc-pink"
                    style={{ cursor: 'pointer', height: 148, background: fabricTex(g.x, c, 4), boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.06),inset 0 -18px 24px rgba(28,25,23,.06)' }}
                  />
                  <div style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600 }}>{c.name}</div>
                    </div>
                    <button
                      onClick={() => studio.removePin(p)}
                      className="pc-hv-ink pc-no-print"
                      style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 15, color: 'rgba(28,25,23,.4)', transition: 'color .2s' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
