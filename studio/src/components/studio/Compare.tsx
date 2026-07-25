'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { ComparisonStage } from '@/components/three/ComparisonStage';
import { FONT_DISPLAY, FONT_BODY, fabricTex, heroColour } from './helpers';

export function Compare({ studio }: { studio: Studio }) {
  const { t, compare, reduceMotion } = studio;

  return (
    <div style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
      <h1 style={{ margin: '0 0 6px', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.compare}</h1>
      <Selvage style={{ marginTop: 8 }} />
      {compare.length === 0 && (
        <div style={{ marginTop: 40, border: '1px dashed rgba(28,25,23,.2)', borderRadius: 6, padding: '60px 24px', textAlign: 'center', color: 'rgba(28,25,23,.5)', fontWeight: 300 }}>
          {t.emptyCompare}
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => studio.go('collection')}
              style={{
                cursor: 'pointer', background: '#1C1917', color: '#FAF8F5', border: 'none', borderRadius: 999,
                padding: '11px 24px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.12em',
              }}
            >
              {t.collection} →
            </button>
          </div>
        </div>
      )}
      {compare.length > 0 && (
        /* Every selected quality hanging under one light, at one moment — which is what a
           merchant does with real bolts, and the only honest way to answer "which of these
           drapes better". One canvas for all of them: browsers cap WebGL contexts, and a grid
           of separate viewers stops working at exactly the point enough fabrics are being
           compared for it to matter. */
        <div
          style={{
            position: 'relative', marginTop: 26, height: 'clamp(240px,32vw,380px)', borderRadius: 6,
            overflow: 'hidden', border: '1px solid rgba(28,25,23,.08)', background: '#F0EDE7',
          }}
        >
          <ComparisonStage
            entries={compare.map((id) => {
              const x = studio.fab(id);
              return { id, fabric: x, colour: heroColour(x) };
            })}
            light={studio.light}
            label={`${compare.length} qualities hanging side by side under one light`}
            fallback={
              <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                {compare.map((id) => {
                  const x = studio.fab(id);
                  return <div key={id} style={{ flex: 1, background: fabricTex(x, heroColour(x), 4) }} />;
                })}
              </div>
            }
          />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 20, marginTop: 26 }}>
        {compare.map((id) => {
          const x = studio.fab(id);
          const oc = heroColour(x);
          const rows = [
            { k: 'Sheen', v: x.sheen >= 0.35 ? 'High' : x.sheen >= 0.15 ? 'Soft' : 'Matte', w: ((x.sheen * 100) / 0.5).toFixed(0) + '%' },
            { k: 'Flow', v: x.flow >= 0.7 ? 'Fluid' : x.flow >= 0.45 ? 'Relaxed' : 'Structured', w: (x.flow * 100).toFixed(0) + '%' },
            { k: 'Stretch', v: x.stretch >= 0.5 ? '4-way' : 'Low', w: (x.stretch * 100).toFixed(0) + '%' },
            { k: t.weight, v: x.weight, w: ((parseFloat(x.weight) / 21) * 100).toFixed(0) + '%' },
          ];
          return (
            <div key={id} style={{ background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div className="pc-pink" style={{ height: 150, background: fabricTex(x, oc, 4), position: 'relative' }}>
                <button
                  onClick={() => studio.removeCompare(id)}
                  style={{
                    cursor: 'pointer', position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%',
                    border: 'none', background: 'rgba(250,248,245,.9)', fontSize: 13, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 600 }}>{x.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(28,25,23,.55)', margin: '2px 0 14px' }}>
                  {x.weight} · {x.width}
                </div>
                {rows.map((r) => (
                  <div key={r.k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.1em', color: 'rgba(28,25,23,.5)', textTransform: 'uppercase' }}>
                      <span>{r.k}</span>
                      <span>{r.v}</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(28,25,23,.08)', borderRadius: 2, marginTop: 5 }}>
                      <div style={{ height: 3, width: r.w, background: '#8A6D45', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    ['--amp' as string]: reduceMotion ? '0deg' : (x.flow * 2.2).toFixed(1) + 'deg',
                    animation: 'sway 3.4s ease-in-out infinite',
                    transformOrigin: '50% 0%',
                    margin: '16px auto 4px', width: 70, height: 88, background: fabricTex(x, oc, 3),
                    borderRadius: '0 0 32px 32px',
                    boxShadow: 'inset -10px 0 14px rgba(28,25,23,.12),inset 10px 0 14px rgba(255,255,255,.14)',
                  }}
                />
                <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.4)' }}>{t.drapeLive}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
