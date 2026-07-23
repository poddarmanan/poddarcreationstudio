'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricTex, fabricWeave, colourCss, colourShade, chipStyle } from './helpers';
import {
  GARMENTS, LIGHTS, FABRIC_STORIES, PHYSICS_NOTES, STRETCH_TEST_NOTES, WATER_TEST_NOTES, WATER_OPACITY,
  type GarmentKey, type LightKey,
} from '@/lib/fabric-generator';

const WIND_NAMES = ['None', 'Low', 'Medium', 'Strong'];
const SCOPE_LEVELS: [string, number][] = [['100×', 26], ['200×', 48], ['500×', 96]];
const SCENE_SPANS: [number, number][] = [[2, 2], [1, 1], [1, 1], [1, 2], [1, 1], [1, 1], [2, 1], [1, 1], [1, 1]];

export function FabricLab({ studio }: { studio: Studio }) {
  const { t, currentFabric: f, currentColour: col, tests, garment, light: lightKey, wind, reduceMotion, approved, isStaff } = studio;
  const light = LIGHTS[lightKey];
  const priced = approved || isStaff;
  const amp = reduceMotion ? 0 : f.flow * wind * 1.5;
  const story = FABRIC_STORIES[f.id] ?? '';
  const colCssV = colourCss(col);

  const sceneDefs: { label: string; css: string; moving?: boolean }[] = [
    { label: 'Flat Lay', css: `radial-gradient(120% 90% at 50% -10%, rgba(255,255,255,.35), transparent 60%), ${fabricTex(f, col, 4)}` },
    { label: 'Rolled', css: `linear-gradient(180deg, rgba(255,255,255,.12), transparent 30%), repeating-linear-gradient(0deg, ${colourShade(col, -0.08)} 0 6px, ${colourShade(col, 0.05)} 6px 30px)` },
    { label: 'Fold', css: `linear-gradient(90deg, rgba(28,25,23,.12), transparent 18%), repeating-linear-gradient(180deg, ${colourShade(col, 0.05)} 0 26px, ${colourShade(col, -0.08)} 26px 34px)` },
    { label: 'Macro', css: fabricTex(f, col, 15) },
    { label: 'Backlight', css: `${fabricWeave(f, col, 4)}, radial-gradient(60% 60% at 50% 45%, ${colourShade(col, 0.2)}, ${colCssV} 75%)` },
    { label: 'Wrinkle Test', css: `repeating-linear-gradient(70deg, rgba(0,0,0,.07) 0 3px, rgba(255,255,255,.08) 3px 7px), repeating-linear-gradient(160deg, rgba(0,0,0,.05) 0 5px, transparent 5px 12px), ${fabricTex(f, col, 4)}` },
    { label: 'Movement', css: fabricTex(f, col, 4), moving: true },
    { label: 'Light Test', css: `linear-gradient(100deg, transparent 30%, rgba(255,255,255,${0.2 + f.sheen * 0.5}) 48%, transparent 62%), ${fabricTex(f, col, 4)}` },
    { label: 'Garment', css: `radial-gradient(70% 80% at 50% 40%, ${colourShade(col, 0.08)}, ${colourShade(col, -0.08)} 90%), ${fabricWeave(f, col, 4)}` },
  ];

  const specRows = [
    { k: t.weight, v: f.weight },
    { k: t.width, v: f.width },
    { k: t.comp, v: f.comp },
    { k: t.hand, v: f.hand },
    { k: t.price, v: priced ? `₹${f.price} / metre` : t.lock },
    { k: t.stock, v: t.inStock },
  ];

  const qr = Array.from({ length: 64 }, (_, i) => ((i * 7 + f.seed * 13 + i * i) % 5 < 2 || i < 3 || (i % 8 < 1 && i < 25) ? '#1C1917' : 'transparent'));

  const waFabric = 'https://wa.me/919999999999?text=' + encodeURIComponent(`Enquiry: ${f.name} · ${col.name} · ${f.weight} · ${f.width}`);
  const fg = col.l > 0.62 ? '#1C1917' : '#FAF8F5';
  const isRoll = garment === 'roll';
  const testNoteOn = tests.stretch || tests.water;
  const testNote = tests.water ? WATER_TEST_NOTES[f.family] : STRETCH_TEST_NOTES[f.family];

  return (
    <div style={{ paddingBottom: 80, animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap', padding: '22px clamp(16px,5vw,64px) 16px' }}>
        <button
          onClick={() => studio.go('showroom')}
          style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.18em', color: '#8A6D45' }}
        >
          ← {t.showroom}
        </button>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(30px,3.6vw,46px)' }}>{f.name}</h1>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(28,25,23,.55)' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: colCssV, border: '1px solid rgba(28,25,23,.18)', display: 'inline-block' }} />
          {col.name} · {f.comp}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, letterSpacing: '.3em', color: '#8A6D45' }}>{t.lab}</span>
      </div>
      <div style={{ padding: '0 clamp(16px,5vw,64px) 18px' }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17.5, color: 'rgba(28,25,23,.62)' }}>{story}</div>
        <Selvage style={{ marginTop: 10 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 0, borderTop: '1px solid rgba(28,25,23,.08)', borderBottom: '1px solid rgba(28,25,23,.08)' }}>
        {/* Stage */}
        <div style={{ position: 'relative', minHeight: '66vh', background: light.bg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', gridColumn: 'span 1' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(50% 40% at 50% 15%, ${light.glow}, transparent 70%)` }} />
          <div style={{ position: 'absolute', left: '15%', right: '15%', bottom: '7%', height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(28,25,23,.3), transparent 70%)' }} />
          {tests.shine && (
            <div
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '34%',
                background: `linear-gradient(100deg,transparent, rgba(255,255,255,${(0.25 + f.sheen * 0.6).toFixed(2)}), transparent)`,
                animation: 'shineSweep 2.4s ease-in-out infinite', zIndex: 5, pointerEvents: 'none',
              }}
            />
          )}
          {isRoll ? (
            <div style={{ position: 'relative', width: 120, height: 340, filter: light.filter }}>
              <div
                style={{
                  position: 'absolute', top: -14, left: 0, width: 120, height: 28, borderRadius: '50%',
                  background: `radial-gradient(ellipse at 42% 40%, ${colourShade(col, 0.12)}, ${colourShade(col, -0.05)} 70%)`,
                  border: '1px solid rgba(28,25,23,.15)', zIndex: 2,
                }}
              />
              <div style={{ position: 'absolute', top: -5, left: 44, width: 32, height: 10, borderRadius: '50%', background: '#EFE9DF', border: '1px solid rgba(28,25,23,.2)', zIndex: 3 }} />
              <div
                style={{
                  position: 'absolute', inset: 0, borderRadius: '0 0 10px 10px',
                  background: `linear-gradient(90deg,${colourShade(col, -0.22)} 0%,${colourShade(col, -0.08)} 16%,${colourShade(col, 0.06)} 42%,${colourShade(col, 0.06)} 58%,${colourShade(col, -0.1)} 84%,${colourShade(col, -0.26)} 100%)`,
                }}
              />
              <div style={{ position: 'absolute', inset: 0, background: fabricWeave(f, col, 3), opacity: 0.45, borderRadius: '0 0 10px 10px' }} />
            </div>
          ) : (
            <div
              style={{
                ['--amp' as string]: amp.toFixed(2) + 'deg',
                animation: `sway ${(4.6 - wind * 0.9).toFixed(1)}s ease-in-out infinite`,
                transformOrigin: '50% 8%',
                filter: light.filter,
              }}
            >
              <div style={{ animation: tests.rotate && !reduceMotion ? 'rotateOsc 5.5s ease-in-out infinite' : 'none' }}>
                <div
                  style={{
                    ['--sx' as string]: (1 + f.stretch * 0.16).toFixed(3),
                    animation: tests.stretch && !reduceMotion ? 'stretchPulse 1.7s ease-in-out infinite' : 'none',
                    transformOrigin: '50% 50%',
                    position: 'relative',
                    filter: 'drop-shadow(0 30px 28px rgba(28,25,23,.26))',
                  }}
                >
                  <svg width="290" height="378" viewBox="0 0 200 260">
                    <defs>
                      <linearGradient id="pcSheen" x1="0" y1="0" x2="1" y2=".2">
                        <stop offset=".25" stopColor="#fff" stopOpacity="0" />
                        <stop offset=".45" stopColor="#fff" stopOpacity={(f.sheen * 1.4).toFixed(2)} />
                        <stop offset=".6" stopColor="#fff" stopOpacity="0" />
                      </linearGradient>
                      <pattern id="pcWeave" width="4" height="4" patternUnits="userSpaceOnUse">
                        <rect width="4" height="4" fill={colCssV} />
                        <path d="M0 0H4M0 2H4" stroke={colourShade(col, -0.06)} strokeWidth=".5" />
                      </pattern>
                    </defs>
                    <path d={GARMENTS[garment].d || GARMENTS.kurti.d} fill="url(#pcWeave)" stroke={colourShade(col, -0.14)} strokeWidth="1.5" />
                    <path d={GARMENTS[garment].d || GARMENTS.kurti.d} fill="url(#pcSheen)" />
                    <path d="M84 95C81 140 83 190 81 228M100 96C100 142 100 192 100 230M116 95C119 140 117 190 119 228" fill="none" stroke={colourShade(col, -0.1)} strokeWidth="1.2" opacity=".5" />
                    <path d="M92 96C90 150 91 200 90 230M108 96C110 150 109 200 110 230" fill="none" stroke={colourShade(col, -0.1)} strokeWidth=".8" opacity=".3" />
                  </svg>
                  {tests.water && (
                    <div
                      style={{
                        position: 'absolute', top: '44%', left: '38%', width: 74, height: 88, borderRadius: '50%',
                        background: `radial-gradient(ellipse, rgba(20,16,12,${WATER_OPACITY[f.family]}) 0 55%, transparent 75%)`,
                        animation: 'waterSpread 1.4s ease-out both', pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 10.5, letterSpacing: '.22em', color: light.fg, opacity: 0.75 }}>
            {light.en.toUpperCase()} · {WIND_NAMES[wind].toUpperCase()}
          </span>
          <div
            style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6,
              background: 'rgba(250,248,245,.62)', backdropFilter: 'blur(12px)', border: '1px solid rgba(28,25,23,.1)', borderRadius: 999, padding: 5,
            }}
          >
            {([['stretch', 'Stretch'], ['shine', 'Shine'], ['water', 'Water drop'], ['rotate', 'Rotate']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => studio.toggleTest(k)}
                style={{
                  cursor: 'pointer',
                  background: tests[k] ? '#1C1917' : 'transparent',
                  color: tests[k] ? '#FAF8F5' : '#1C1917',
                  border: 'none', borderRadius: 999, padding: '8px 14px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.08em',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {testNoteOn && (
            <div
              style={{
                position: 'absolute', top: 14, right: 16, maxWidth: 230, background: 'rgba(250,248,245,.85)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(28,25,23,.1)', borderRadius: 10, padding: '10px 13px', fontSize: 11.5, fontWeight: 300, lineHeight: 1.55, color: 'rgba(28,25,23,.75)',
              }}
            >
              {testNote}
            </div>
          )}
        </div>
        {/* Controls */}
        <div style={{ padding: 'clamp(24px,3.5vw,44px)', display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center', background: '#FAF8F5' }}>
          <ChipGroup label={t.garment}>
            {(Object.keys(GARMENTS) as GarmentKey[]).map((k) => (
              <Chip key={k} on={garment === k} onClick={() => studio.setGarment(k)}>
                {GARMENTS[k].label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label={t.lighting}>
            {(Object.keys(LIGHTS) as LightKey[]).map((k) => (
              <Chip key={k} on={lightKey === k} onClick={() => studio.setLight(k)}>
                {LIGHTS[k].en}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label={t.windL}>
            {WIND_NAMES.map((w, i) => (
              <Chip key={w} on={wind === i} onClick={() => studio.setWind(i)}>
                {w}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label={t.scope}>
            {SCOPE_LEVELS.map(([label, p]) => (
              <Chip key={label} on={false} onClick={() => studio.openScope(p)}>
                {label}
              </Chip>
            ))}
          </ChipGroup>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.6)', maxWidth: 420, textWrap: 'pretty' }}>
            {PHYSICS_NOTES[f.family]}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {f.colours.map((c, j) => (
              <button
                key={j}
                onClick={() => studio.setCi(j)}
                title={c.name}
                className="pc-hv-scale-15"
                style={{
                  cursor: 'pointer', width: 34, height: 34, borderRadius: '50%', background: colourCss(c),
                  border: j === studio.ci ? '2px solid #1C1917' : '1px solid rgba(28,25,23,.12)', padding: 0, transition: 'transform .2s',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Scenes */}
      <section style={{ padding: 'clamp(30px,4.5vw,54px) clamp(16px,5vw,64px) 0' }}>
        <h2 style={{ margin: '0 0 20px', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(24px,2.8vw,36px)' }}>{t.scenes}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gridAutoRows: 150, gridAutoFlow: 'dense', gap: 12 }}>
          {sceneDefs.map((sd, i) => (
            <div
              key={sd.label}
              onClick={() => studio.openScene({ label: sd.label, css: sd.css, moving: !!sd.moving, fg })}
              className="pc-hv-lift-4"
              style={{
                cursor: 'pointer', position: 'relative',
                gridColumn: `span ${SCENE_SPANS[i][0]}`, gridRow: `span ${SCENE_SPANS[i][1]}`,
                borderRadius: 4, overflow: 'hidden', background: sd.css,
                boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.06)', transition: 'transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s',
              }}
            >
              <span style={{ position: 'absolute', bottom: 10, left: 10, fontSize: 9.5, letterSpacing: '.22em', color: fg, textTransform: 'uppercase' }}>
                {sd.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Specs + actions */}
      <section style={{ padding: 'clamp(30px,4.5vw,54px) clamp(16px,5vw,64px) 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 36 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(28,25,23,.08)', border: '1px solid rgba(28,25,23,.08)' }}>
            {specRows.map((sRow) => (
              <div key={sRow.k} style={{ background: '#FAF8F5', padding: '14px 16px' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' }}>{sRow.k}</div>
                <div style={{ fontSize: 15, marginTop: 4 }}>{sRow.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={studio.openQuote}
              className="pc-hv-gold-fill"
              style={{
                cursor: 'pointer', background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917', borderRadius: 999,
                padding: '13px 28px', fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase',
              }}
            >
              {t.quote}
            </button>
            <a
              href={waFabric}
              target="_blank"
              rel="noreferrer"
              className="pc-hv-border-ink"
              style={{
                display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(28,25,23,.25)', borderRadius: 999,
                padding: '13px 28px', fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#1C1917',
              }}
            >
              {t.whats}
            </a>
            <button
              onClick={() => studio.pinShade(f.id, col.order)}
              className="pc-hv-gold-text-border"
              style={{
                cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.25)', borderRadius: 999,
                padding: '13px 22px', fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#1C1917',
              }}
            >
              ✦ {t.pin}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 26, paddingTop: 22, borderTop: '1px solid rgba(28,25,23,.08)' }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 8 }}>{t.downloads}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="pc-hv-border-ink" style={{ border: '1px solid rgba(28,25,23,.15)', borderRadius: 999, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                  ↓ {t.spec}
                </span>
                <span className="pc-hv-border-ink" style={{ border: '1px solid rgba(28,25,23,.15)', borderRadius: 999, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                  ↓ {t.cat}
                </span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, border: '1px solid rgba(28,25,23,.2)', padding: 5, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 1 }}>
                {qr.map((on, i) => (
                  <span key={i} style={{ background: on }} />
                ))}
              </div>
              <div style={{ fontSize: 9.5, letterSpacing: '.16em', color: 'rgba(28,25,23,.45)', marginTop: 5 }}>{t.qr}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  const cs = chipStyle(on);
  return (
    <button
      onClick={onClick}
      className="pc-hv-gold-border"
      style={{
        cursor: 'pointer', background: cs.background, color: cs.color,
        border: `1px solid ${cs.borderColor}`, borderRadius: 999, padding: '9px 17px',
        fontFamily: FONT_BODY, fontSize: 12.5, transition: 'background .25s,border-color .25s,color .25s',
      }}
    >
      {children}
    </button>
  );
}
