'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Studio } from './state';
import { WeaveMark, Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricTex, colourCss, heroColour } from './helpers';
import { assistant } from '@/lib/fabric-generator';

export function Entrance({ studio }: { studio: Studio }) {
  const { t, fabrics, q, setQ, reduceMotion } = studio;

  const heroCloth = useMemo(() => fabricTex(fabrics[9], fabrics[9].colours[4], 7), [fabrics]);
  const heroCloth2 = useMemo(() => fabricTex(fabrics[4], fabrics[4].colours[2], 6), [fabrics]);

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

  const query = q.trim();
  const asst = query ? assistant(query) : null;

  type ResultItem = { key: string; label: string; sub: string; dot: string; go: () => void };

  // Instant, offline-safe baseline (in-memory substring/prefix match over loaded fabrics).
  const localResults = useMemo<ResultItem[]>(() => {
    if (!query) return [];
    const ql = query.toLowerCase();
    const out: ResultItem[] = [];
    fabrics.forEach((f) => {
      if ((f.name + ' ' + f.comp + ' ' + f.weight + ' ' + f.width).toLowerCase().includes(ql)) {
        out.push({ key: `f-${f.id}`, label: f.name, sub: `${f.weight} · ${f.width}`, dot: colourCss(heroColour(f)), go: () => { setQ(''); studio.openFabric(f.id); } });
      }
      f.colours.forEach((c, j) => {
        if (c.name.toLowerCase().startsWith(ql)) {
          out.push({ key: `c-${f.id}-${j}`, label: c.name, sub: f.name, dot: colourCss(c), go: () => { setQ(''); studio.openFabric(f.id, j); } });
        }
      });
    });
    return out.slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, fabrics]);

  // Typo-tolerant results from the search service (Meilisearch / Postgres trigram). Falls
  // back to the instant local list until the request resolves, and if it ever fails.
  // Keyed by the query they answer, so a stale response never renders against a newer
  // query and the short-query case needs no state reset.
  const [apiResults, setApiResults] = useState<{ query: string; items: ResultItem[] } | null>(null);
  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { hits: Array<{ type: string; name: string; fabricId: string; colourId?: string; hex?: string }> };
        const items: ResultItem[] = data.hits.map((h) => {
          const fab = fabrics.find((f) => f.id === h.fabricId);
          if (h.type === 'colour' && fab) {
            const j = fab.colours.findIndex((c) => c.id === h.colourId);
            const col = j >= 0 ? fab.colours[j] : fab.colours[0];
            return { key: `a-c-${h.colourId}`, label: h.name, sub: fab.name, dot: h.hex ?? colourCss(col), go: () => { setQ(''); studio.openFabric(fab.id, Math.max(0, j)); } };
          }
          return { key: `a-f-${h.fabricId}`, label: h.name, sub: fab ? `${fab.weight} · ${fab.width}` : '', dot: fab ? colourCss(heroColour(fab)) : '#8A6D45', go: () => { setQ(''); studio.openFabric(h.fabricId); } };
        });
        setApiResults({ query, items });
      } catch {
        /* aborted or offline — keep the instant local results */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, fabrics]);

  const results = apiResults?.query === query ? apiResults.items : localResults;
  const hasResults = !!(results.length || asst);

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background:
            'radial-gradient(60% 50% at 25% 15%, rgba(214,184,130,.25), transparent 70%),radial-gradient(50% 60% at 82% 25%, rgba(185,150,160,.18), transparent 70%),radial-gradient(80% 60% at 50% 110%, rgba(150,160,185,.15), transparent 70%)',
          backgroundSize: '170% 170%,170% 170%,170% 170%',
          animation: reduceMotion ? 'none' : 'heroDrift 16s ease-in-out infinite alternate',
        }}
      />
      <div
        style={{
          position: 'absolute', left: '-12%', right: '-12%', bottom: '-24%', height: '64%', background: heroCloth,
          animation: reduceMotion ? 'none' : 'clothWave 11s ease-in-out infinite alternate',
          boxShadow: 'inset 0 40px 80px rgba(255,255,255,.25), 0 -30px 90px rgba(138,109,69,.18)',
        }}
      />
      <div
        style={{
          position: 'absolute', left: '-10%', right: '-10%', bottom: '-30%', height: '46%', background: heroCloth2, opacity: 0.55,
          animation: reduceMotion ? 'none' : 'clothWave 15s ease-in-out -4s infinite alternate-reverse',
        }}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', bottom: 0, left: p.left, width: p.size, height: p.size, borderRadius: '50%',
            background: '#C9A96A', filter: 'blur(1px)',
            ['--op' as string]: p.op,
            animation: reduceMotion ? 'none' : `floatUp ${p.dur} linear ${p.delay} infinite`,
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 90% at 50% 50%, transparent 55%, rgba(28,25,23,.07))' }} />
      <div style={{ position: 'relative', textAlign: 'center', padding: '56px 24px', animation: 'rise 1.2s cubic-bezier(.2,.8,.2,1) both' }}>
        <div style={{ marginBottom: 16 }}>
          <WeaveMark size={22} />
        </div>
        <div style={{ fontSize: 11, letterSpacing: '.55em', color: '#8A6D45', marginBottom: 14 }}>{t.est}</div>
        <Selvage style={{ margin: '0 auto 26px' }} />
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(52px,8.5vw,120px)', lineHeight: 1 }}>
          Poddar
          <br />
          <em style={{ fontWeight: 400 }}>Creation</em>
        </h1>
        <p style={{ maxWidth: 400, margin: '26px auto 0', fontSize: 15, fontWeight: 300, lineHeight: 1.8, letterSpacing: '.02em', color: 'rgba(28,25,23,.6)', textWrap: 'balance' }}>
          {t.heroSub}
        </p>
        <div style={{ marginTop: 40 }}>
          <button
            onClick={() => studio.go('showroom')}
            className="pc-hv-gold-fill"
            style={{
              cursor: 'pointer', background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917', borderRadius: 999,
              padding: '17px 44px', fontFamily: FONT_BODY, fontSize: 13, letterSpacing: '.22em', textTransform: 'uppercase',
              boxShadow: '0 20px 50px rgba(28,25,23,.22)',
            }}
          >
            {t.enter}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 26, justifyContent: 'center', marginTop: 26, fontSize: 12, letterSpacing: '.2em' }}>
          {[
            { label: t.collection, go: () => studio.go('collection') },
            { label: t.explore, go: () => studio.go('colours') },
          ].map((b) => (
            <button
              key={b.label}
              onClick={b.go}
              className="pc-hv-ink-border"
              style={{
                cursor: 'pointer', background: 'none', border: 'none', color: 'rgba(28,25,23,.55)', fontFamily: FONT_BODY,
                fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', borderBottom: '1px solid rgba(28,25,23,.2)', padding: '0 0 3px',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', maxWidth: 520, margin: '44px auto 0' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.65)', backdropFilter: 'blur(14px)',
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
                position: 'absolute', top: 56, left: 0, right: 0, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(16px)',
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
