'use client';

import { useMemo } from 'react';
import type { Studio } from './state';
import { FONT_BODY, fabricTex, heroColour } from './helpers';

export function Entrance({ studio }: { studio: Studio }) {
  const { t, fabrics, q, setQ, reduceMotion } = studio;

  const heroCloth = useMemo(() => { const g = fabrics.find((x) => x.id === 'gajji') ?? fabrics[0]; return fabricTex(g, g.colours[4] ?? g.colours[0], 7); }, [fabrics]);
  const heroCloth2 = useMemo(() => { const r = fabrics.find((x) => x.id === 'rayon14') ?? fabrics[0]; return fabricTex(r, r.colours[2] ?? r.colours[0], 6); }, [fabrics]);

  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: ((i * 67 + 13) % 100) + '%',
        size: 2 + (i % 3),
        dur: (13 + ((i * 3.7) % 9)).toFixed(1) + 's',
        delay: (-(i * 1.9)).toFixed(1) + 's',
        op: (0.15 + (i % 4) * 0.09).toFixed(2),
      })),
    []
  );

  const { results, asst, hasResults } = studio.search;
  const promise = t.heroSub.split(/(?<=[.।])\s+/);

  return (
    <div className="pc-view" style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* The glow drifts by moving an oversized, already-painted layer — not by moving its
          gradients, which would repaint the whole screen on every frame. Everything that moves on
          this page moves by transform or opacity alone, so a phone composites it for nearly free. */}
      <div
        style={{
          position: 'absolute', inset: '-35%', willChange: 'transform',
          background:
            'radial-gradient(34% 28% at 38% 33%, rgba(214,184,130,.25), transparent 70%),radial-gradient(28% 34% at 62% 36%, rgba(185,150,160,.18), transparent 70%),radial-gradient(46% 34% at 50% 70%, rgba(150,160,185,.15), transparent 70%)',
          animation: reduceMotion ? 'none' : 'heroDrift 16s ease-in-out infinite alternate',
        }}
      />
      <div
        style={{
          position: 'absolute', left: '-12%', right: '-12%', bottom: '-30%', height: '52%', background: heroCloth,
          borderRadius: '50% 50% 0 0/90% 88% 0 0', willChange: 'transform',
          animation: reduceMotion ? 'none' : 'clothWave 11s ease-in-out infinite alternate',
          boxShadow: 'inset 0 40px 80px rgba(255,255,255,.25), 0 -30px 90px rgba(138,109,69,.18)',
        }}
      />
      <div
        style={{
          position: 'absolute', left: '-10%', right: '-10%', bottom: '-34%', height: '40%', background: heroCloth2, opacity: 0.55,
          borderRadius: '50% 50% 0 0/90% 88% 0 0', willChange: 'transform',
          animation: reduceMotion ? 'none' : 'clothWave 15s ease-in-out -4s infinite alternate-reverse',
        }}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', bottom: 0, left: p.left, width: p.size * 1.8, height: p.size * 1.8, borderRadius: '50%',
            // A soft-edged dot drawn by its own gradient, not a blur filter.
            background: 'radial-gradient(circle, #C9A96A 0 35%, rgba(201,169,106,0) 72%)',
            ['--op' as string]: p.op,
            animation: reduceMotion ? 'none' : `floatUp ${p.dur} linear ${p.delay} infinite`,
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 90% at 50% 50%, transparent 55%, rgba(28,25,23,.07))' }} />
      {/* The vertical rhythm is written as clamps rather than fixed pixels so the whole
          entrance — mark, title, promise, call to action and search — fits a phone screen
          without scrolling. Every value reaches its original number at about 615px wide, so
          nothing above a large phone moves. */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 640, textAlign: 'center', padding: 'clamp(16px,4vw,56px) 20px', animation: 'rise 1.2s cubic-bezier(.2,.8,.2,1) both' }}>
        {/* The house, set as a title page: an ornament, what the house is, its name, where it was
            founded between hairlines, its promise, and the way in. */}
        <div aria-hidden className="pc-hero-orn">
          <i />
          <b />
          <i />
        </div>
        <div className="pc-hero-eyebrow">{t.estWhat ?? t.est}</div>
        <h1 className="pc-hero-title">
          Poddar <em>Creation</em>
        </h1>
        <div className="pc-hero-est">
          <i aria-hidden />
          <span>{t.estWhere ?? ''}</span>
          <i aria-hidden />
        </div>
        {/* The promise, its last sentence on a line of its own. */}
        <p className="pc-hero-promise">
          {promise.slice(0, -1).join(' ')}
          {promise.length > 1 && <br />}
          {promise[promise.length - 1]}
        </p>
        <div className="pc-hero-ways">
          <button onClick={() => studio.go('showroom')} className="pc-hero-enter pc-cta">
            <span>{t.enter}</span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <button onClick={() => studio.go('colours')} className="pc-hero-link pc-link-cta">
            {t.explore}
          </button>
        </div>
        <div className="pc-hero-search" style={{ position: 'relative', maxWidth: 520, margin: 'clamp(26px,7.2vw,44px) auto 0' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.86)',
              border: '1px solid rgba(28,25,23,.12)', borderRadius: 999, padding: '6px 8px 6px 20px', boxShadow: '0 12px 40px rgba(28,25,23,.08)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6D45" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.searchPh}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: FONT_BODY, fontSize: 14, color: '#1C1917', minWidth: 0 }}
            />
            <button
              onClick={studio.runAi}
              className="pc-hv-gold-bg"
              style={{
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: '#1C1917', color: '#FAF8F5',
                border: 'none', borderRadius: 999, padding: '9px 16px', fontFamily: FONT_BODY, fontSize: 12, whiteSpace: 'nowrap',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {t.byImage}
            </button>
          </div>
          {hasResults && (
            <div
              style={{
                position: 'absolute', top: 56, left: 0, right: 0, background: 'rgba(255,255,255,.98)',
                border: '1px solid rgba(28,25,23,.1)', borderRadius: 18, boxShadow: '0 24px 60px rgba(28,25,23,.14)',
                overflow: 'hidden', textAlign: 'left', zIndex: 20,
              }}
            >
              {asst && (
                <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                  <div style={{ fontSize: 10, letterSpacing: '.28em', color: '#8A6D45', marginBottom: 6 }}>STUDIO ASSISTANT</div>
                  <div style={{ fontSize: 13.5, fontWeight: 300, color: 'rgba(28,25,23,.75)' }}>{asst.note}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {asst.ids.map((id) => {
                      const x = studio.fab(id);
                      return (
                        <div
                          key={id}
                          onClick={() => {
                            setQ('');
                            studio.openFabric(x.id);
                          }}
                          className="pc-hv-gold-border"
                          style={{ cursor: 'pointer', flex: 1, border: '1px solid rgba(28,25,23,.1)', borderRadius: 8, overflow: 'hidden' }}
                        >
                          <div style={{ height: 44, background: fabricTex(x, heroColour(x), 3) }} />
                          <div style={{ padding: '7px 9px' }}>
                            <div style={{ fontSize: 12 }}>{x.name}</div>
                            <div style={{ fontSize: 10, color: 'rgba(28,25,23,.5)' }}>
                              {x.weight} · {x.hand}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {results.map((r) => (
                <div
                  key={r.key}
                  onClick={r.go}
                  className="pc-hv-row"
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid rgba(28,25,23,.05)' }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: r.dot, border: '1px solid rgba(28,25,23,.1)', flex: 'none' }} />
                  <span style={{ fontSize: 14 }}>{r.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(28,25,23,.5)' }}>{r.sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
