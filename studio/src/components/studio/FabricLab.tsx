'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FabricViewer } from '@/components/three/FabricViewer';
import { ExportView } from '@/components/three/ExportView';
import { oklchToHex } from '@/lib/three/colour';
import { metamerism, shiftVerdict } from '@/lib/three/metamerism';
import { FONT_DISPLAY, FONT_BODY, fabricTex, fabricWeave, colourCss, colourFg, colourShade, chipStyle, heroColour } from './helpers';
import { useDragScroll, scrollByEl } from './interactions';
import {
  GARMENTS, LIGHTS, FABRIC_STORIES, PHYSICS_NOTES, STRETCH_TEST_NOTES,
  type GarmentKey, type LightKey,
} from '@/lib/fabric-generator';

const SCOPE_LEVELS: [string, number][] = [['100×', 26], ['200×', 48], ['500×', 96]];
const SCENE_SPANS: [number, number][] = [[2, 2], [1, 1], [1, 1], [1, 2], [1, 1], [1, 1], [2, 1], [1, 1], [1, 1]];
const GARMENT_KEYS = Object.keys(GARMENTS) as GarmentKey[];
const DIAL_LABELS: Record<GarmentKey, string> = { kurti: 'Kurti', shirt: 'Shirt', dress: 'Dress', top: 'Top', tshirt: 'T-Shirt', roll: 'Roll' };

export function FabricLab({ studio }: { studio: Studio }) {
  const { t, currentFabric: f, currentColour: col, tests, garment, light: lightKey, wind, reduceMotion, approved, isStaff } = studio;
  const light = LIGHTS[lightKey];
  // The same sRGB the weave texture is generated from, so the strip and the canvas start
  // from one colour rather than two conversions of it.
  const renderHex = oklchToHex(col.l, col.c, col.h);
  const priced = approved || isStaff;
  const amp = reduceMotion ? 0 : f.flow * wind * 1.5;
  const story = FABRIC_STORIES[f.id] ?? '';
  const colCssV = colourCss(col);
  const fg = col.l > 0.62 ? '#1C1917' : '#FAF8F5';
  const isRoll = garment === 'roll';
  const modelOn = tests.d3 && !isRoll;
  const testNoteOn = tests.stretch && isRoll;
  const testNote = STRETCH_TEST_NOTES[f.family];

  const moreDrag = useDragScroll();
  // The two controls that live on the stage itself: the wind toggle and the garment picker.
  const [windOpen, setWindOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // True while a supplied model is on its way; the stage shows a loader rather than the
  // built-in cut, which used to stand in and read as the wrong garment appearing first.
  const [modelLoading, setModelLoading] = useState(false);
  const onModelLoading = useCallback((loading: boolean) => setModelLoading(loading), []);
  // Every change of cut shows the loader for a moment, cached model or not: a garment that
  // simply snaps into place reads as a glitch, one that is announced reads as a change.
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    const on = window.setTimeout(() => setSettling(true), 0);
    const off = window.setTimeout(() => setSettling(false), 1100);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [garment]);
  // The stretch test is the roll's: a length of cloth can be pulled, a made-up garment cannot.
  // Choosing the roll points the button out for a few seconds.
  const [stretchHint, setStretchHint] = useState(false);
  useEffect(() => {
    if (!isRoll) return;
    const show = window.setTimeout(() => setStretchHint(true), 400);
    const hide = window.setTimeout(() => setStretchHint(false), 7400);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [isRoll]);

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

  const moreFabrics = studio.fabrics
    .filter((x) => x.id !== f.id)
    .map((x, i) => {
      const o = heroColour(x);
      return { id: x.id, name: x.name, meta: `${x.weight} · ${x.width} · ${x.nc} ${t.shades}`, tex: fabricTex(x, o, 3), dl: `${i * 45}ms` };
    });

  const shadeChart = (
            <div>
          <div>
              <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 10 }}>{f.nc} {t.shades}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(52px,1fr))', gap: 6 }}>
                {f.colours.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => studio.setCi(j)}
                    title={c.name}
                    className="pc-pink pc-hv-scale-15"
                    style={{
                      cursor: 'pointer', aspectRatio: '1', border: 'none', borderRadius: '3px 3px 0 0', background: colourCss(c),
                      boxShadow: j === studio.ci ? 'inset 0 0 0 3px #1C1917' : 'inset 0 0 0 1px rgba(28,25,23,.1)',
                      padding: '0 2px 7px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                      animation: `tileIn .4s ${j * 22}ms both`, transition: 'transform .25s',
                    }}
                  >
                    <span style={{ fontSize: 8.5, letterSpacing: '.03em', color: colourFg(c), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            </div>
  );

  return (
    <div style={{ paddingBottom: 80, animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      {/* Header */}
      <div style={{ padding: '26px clamp(16px,5vw,64px) 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <button
            onClick={() => studio.go('showroom')}
            className="pc-hv-ink"
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.18em', color: '#8A6D45', textTransform: 'uppercase' }}
          >
            ← {t.showroom}
          </button>
          <span style={{ fontSize: 10.5, letterSpacing: '.3em', color: '#8A6D45' }}>{t.lab}</span>
        </div>
        <h1 style={{ margin: '14px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.2vw,54px)', lineHeight: 1.05 }}>{f.name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10, fontSize: 13.5, letterSpacing: '.04em', color: 'rgba(28,25,23,.6)' }}>
          <span style={{ width: 13, height: 13, borderRadius: '50%', background: colCssV, border: '1px solid rgba(28,25,23,.18)', flex: 'none' }} />
          <span>{col.name}</span>
          <span style={{ color: 'rgba(28,25,23,.3)' }}>·</span>
          <span>{f.comp}</span>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17.5, color: 'rgba(28,25,23,.55)', marginTop: 14, maxWidth: 520, textWrap: 'pretty' }}>{story}</div>
        <Selvage style={{ marginTop: 14 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 0, borderTop: '1px solid rgba(28,25,23,.08)', borderBottom: '1px solid rgba(28,25,23,.08)' }}>
        {/* Stage column: preview + lighting/wind rails */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid rgba(28,25,23,.06)' }}>
          <div style={{ position: 'relative', flex: 1, minHeight: 'clamp(440px, 62vh, 760px)', background: light.bg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 1.2s ease' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(50% 40% at 50% 15%, ${light.glow}, transparent 70%)`, transition: 'background 1.2s ease' }} />
            <div style={{ position: 'absolute', left: '15%', right: '15%', bottom: '7%', height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(28,25,23,.3), transparent 70%)' }} />
            {/* The shine is the raking light the stage walks across the cloth (ShineSweep); the
                screen-wide band that used to sweep the whole stage with it is gone. */}
            <FabricViewer
              fabric={f}
              colour={col}
              light={studio.light}
              wind={wind}
              pulled={tests.stretch && isRoll}
              shine={tests.shine}
              rolled={isRoll}
              garment={studio.garment}
              captureId="fabric-lab"
              onLoading={onModelLoading}
              curtain={settling}
              label={`${f.name} in ${col.name}, rendered in three dimensions`}
              fallback={
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <div style={{ animation: tests.d3 && !reduceMotion ? 'rotateOsc 5.5s ease-in-out infinite' : 'none' }}>
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
                    {modelOn && (
                      <>
                        <div style={{ position: 'absolute', left: '50%', top: -56, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: -1, animation: 'modelIn .8s cubic-bezier(.2,.8,.2,1) both' }}>
                          <div style={{ width: 46, height: 58, borderRadius: '50% 50% 46% 46%', background: 'linear-gradient(180deg,#E6D8C3,#CDBA9F)' }} />
                          <div style={{ width: 17, height: 18, background: 'linear-gradient(180deg,#D9C7AC,#CDBA9F)' }} />
                        </div>
                        <div style={{ position: 'absolute', left: '50%', bottom: -86, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: -1, animation: 'modelIn .8s .12s cubic-bezier(.2,.8,.2,1) both' }}>
                          <div style={{ width: 7, height: 66, background: 'linear-gradient(180deg,#B9A88E,#8F8069)' }} />
                          <div style={{ width: 88, height: 12, borderRadius: '50%', background: '#8F8069' }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
                </div>
              }
            />
            <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 'clamp(7.5px, 1.1vw, 9.5px)', letterSpacing: '.2em', color: light.fg, opacity: 0.7, transition: 'color 1.2s ease', maxWidth: '55%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {light.en.toUpperCase()} · {wind ? 'WIND' : 'STILL'}
            </span>
            {(modelLoading || settling) && <StageLoader label={isRoll ? 'Unrolling the cloth' : `Draping the ${DIAL_LABELS[garment].toLowerCase()}`} />}
            <LightControl albedoHex={renderHex} current={lightKey} setLight={studio.setLight} />
            <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: 6 }}>
              {isRoll && (
                <div style={{ position: 'relative', display: 'flex' }}>
                  {stretchHint && !tests.stretch && (
                    <div
                      role="note"
                      style={{
                        position: 'absolute', right: 54, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap',
                        padding: '8px 12px', borderRadius: 999, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter,
                        fontFamily: FONT_BODY, fontSize: 10.5, letterSpacing: '.08em', color: '#1C1917',
                        animation: 'pcSlideIn .5s .6s cubic-bezier(.2,.8,.2,1) both', pointerEvents: 'none',
                      }}
                    >
                      Pull the cloth · Stretch →
                    </div>
                  )}
                  <IconToggle label="Stretch" on={tests.stretch} onClick={() => { setStretchHint(false); studio.toggleTest('stretch'); }} delay={0.1}>
                    <StretchIcon />
                  </IconToggle>
                </div>
              )}
              <IconToggle label="Shine" on={tests.shine} onClick={() => studio.toggleTest('shine')} delay={0.15}>
                <ShineIcon />
              </IconToggle>
              <WindControl wind={wind} setWind={studio.setWind} open={windOpen} setOpen={setWindOpen} />
            </div>
            <GarmentPicker garment={garment} setGarment={studio.setGarment} open={pickerOpen} setOpen={setPickerOpen} />
            {testNoteOn && (
              <div
                style={{
                  position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(240px, 52%)', background: 'rgba(250,248,245,.85)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(28,25,23,.1)', borderRadius: 10, padding: '10px 13px', fontSize: 11.5, fontWeight: 300, lineHeight: 1.55, color: 'rgba(28,25,23,.75)',
                }}
              >
                {testNote}
              </div>
            )}
          </div>
          {/* The shade chart: under the stage on a phone, in the right column on a desktop. */}
          <div className="pc-shades-mobile" style={{ padding: '18px clamp(16px,2.5vw,28px) 20px', borderTop: '1px solid rgba(28,25,23,.08)', background: '#FAF8F5' }}>
            {shadeChart}
          </div>
        </div>

        {/* Controls: garment dial, scope, physics, shades */}
        <div style={{ padding: 'clamp(24px,3.5vw,44px)', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: 'flex-start', background: '#FAF8F5' }}>
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
          <div className="pc-shades-desktop">{shadeChart}</div>
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
      <section style={{ padding: 'clamp(30px,4.5vw,54px) clamp(16px,5vw,64px) 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 36 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 1, background: 'rgba(28,25,23,.08)', border: '1px solid rgba(28,25,23,.08)' }}>
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
                {/* The frame itself, not a screenshot of a browser window — named so it is
                    still identifiable in a folder of forty images a week later. */}
                <ExportView
                  captureId="fabric-lab"
                  filename={`${f.name}-${col.name}`.replace(/[^\w-]+/g, '-').toLowerCase()}
                  label={`Save this view of ${f.name} in ${col.name} as an image`}
                />
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

      {/* More fabrics */}
      <section style={{ padding: 'clamp(36px,5vw,60px) 0 0' }}>
        <h2 style={{ margin: '0 0 18px', padding: '0 clamp(16px,5vw,64px)', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(24px,2.8vw,36px)' }}>{t.moreFab}</h2>
        <div style={{ position: 'relative' }}>
          <div id="pc-morefab" className="pc-nav" {...moreDrag} style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px clamp(16px,5vw,64px) 8px', cursor: 'grab', touchAction: 'pan-y' }}>
            {moreFabrics.map((m) => (
              <div
                key={m.id}
                onClick={() => studio.openFabric(m.id)}
                className="pc-hv-lift-3"
                style={{
                  cursor: 'pointer', flex: 'none', width: 170, background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 4, overflow: 'hidden',
                  animation: `tileIn .45s ${m.dl} both`, transition: 'transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s',
                }}
              >
                <div className="pc-pink" style={{ height: 96, background: m.tex }} />
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize: 11, letterSpacing: '.06em', color: 'rgba(28,25,23,.5)', marginTop: 2 }}>{m.meta}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', top: 0, bottom: 8, right: 0, width: 70, pointerEvents: 'none', background: 'linear-gradient(270deg,#FAF8F5,transparent)' }} />
          <button
            onClick={() => scrollByEl('pc-morefab', -400)}
            aria-label="Scroll left"
            className="pc-hv-ink-fill"
            style={{
              cursor: 'pointer', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%',
              border: '1px solid rgba(28,25,23,.15)', background: 'rgba(255,255,255,.9)', boxShadow: '0 6px 18px rgba(28,25,23,.14)',
              fontSize: 16, color: '#1C1917', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .25s,color .25s',
            }}
          >
            ‹
          </button>
          <button
            onClick={() => scrollByEl('pc-morefab', 400)}
            aria-label="Scroll right"
            className="pc-hv-ink-fill"
            style={{
              cursor: 'pointer', position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%',
              border: '1px solid rgba(28,25,23,.15)', background: 'rgba(255,255,255,.9)', boxShadow: '0 6px 18px rgba(28,25,23,.14)',
              fontSize: 16, color: '#1C1917', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .25s,color .25s',
            }}
          >
            ›
          </button>
        </div>
      </section>
    </div>
  );
}

/** The frosted glass the stage's controls sit on. */
const GLASS = {
  background: 'rgba(250,248,245,.66)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(28,25,23,.1)',
  boxShadow: '0 10px 30px rgba(28,25,23,.12)',
};

/** Ink that reads on a given colour: dark on a light shade, cream on a dark one. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#1C1917' : '#FAF8F5';
}

/** A round glass button on the stage that is either on or off — the stretch and shine tests. */
function IconToggle({ label, on, onClick, delay = 0, children }: { label: string; on: boolean; onClick: () => void; delay?: number; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className="pc-hv-scale-06"
      style={{
        cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
        ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter,
        background: on ? '#1C1917' : GLASS.background, color: on ? '#FAF8F5' : '#1C1917',
        transition: 'transform .5s cubic-bezier(.2,.8,.2,1), color .45s ease, background .45s ease',
        animation: `pcPop .7s ${delay}s cubic-bezier(.2,.8,.2,1) both`,
      }}
    >
      {children}
    </button>
  );
}

function StretchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4h10M7 20h10" />
      <path d="M12 7v10M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

function ShineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

/**
 * The light, top right: a round button painted the shade as it renders under the current light,
 * which opens into the five lights — each a button painted the shade under that light, named.
 * The lighting control and the metamerism reading are one thing: choosing a light is choosing
 * which of those five to look at. The worst shift is in the button's tooltip.
 */
function LightControl({ albedoHex, current, setLight }: { albedoHex: string; current: LightKey; setLight: (l: LightKey) => void }) {
  const [open, setOpen] = useState(false);
  const { readings, worst } = metamerism(albedoHex);
  const now = readings.find((r) => r.light === current) ?? readings[0];
  const verdict = shiftVerdict(worst);
  return (
    <div style={{ position: 'absolute', right: 14, top: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: 6, animation: 'pcPop .7s .2s cubic-bezier(.2,.8,.2,1) both' }}>
      <button
        aria-label="Light"
        aria-expanded={open}
        title={`${LIGHTS[current].en} — the shade ${verdict === 'steady' ? 'holds its colour' : verdict === 'noticeable' ? 'shifts noticeably' : 'shifts strongly'} between lights (${worst.toFixed(1)})`}
        onClick={() => setOpen(!open)}
        className="pc-hv-scale-06"
        style={{
          cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: now.hex, color: inkOn(now.hex), border: '1px solid rgba(28,25,23,.12)',
          boxShadow: `0 0 0 2px #FAF8F5, 0 0 0 3px rgba(28,25,23,.12), ${GLASS.boxShadow}`,
          transition: 'transform .5s cubic-bezier(.2,.8,.2,1), background .8s ease, color .8s ease',
          transform: open ? 'rotate(15deg)' : 'none',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
        </svg>
      </button>
      {open && (
        <div role="group" aria-label="Light setting" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, borderRadius: 18, padding: 5, animation: 'pcPop .45s cubic-bezier(.2,.8,.2,1) both' }}>
          {readings.map((r, i) => {
            const key = r.light as LightKey;
            const on = key === current;
            return (
              <button
                key={key}
                onClick={() => { setLight(key); setOpen(false); }}
                aria-label={LIGHTS[key].en}
                aria-pressed={on}
                title={`${LIGHTS[key].en} — ${r.shiftFromNeutral.toFixed(1)} from neutral`}
                style={{
                  cursor: 'pointer', minWidth: 112, padding: '9px 14px', borderRadius: 999, border: 'none', textAlign: 'left',
                  background: r.hex, color: inkOn(r.hex), fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.08em',
                  boxShadow: on ? '0 0 0 2px #FAF8F5, 0 0 0 3.5px #8A6D45' : 'inset 0 0 0 1px rgba(28,25,23,.1)',
                  animation: `pcPop .5s ${i * 45}ms cubic-bezier(.2,.8,.2,1) both`,
                  transition: 'box-shadow .45s ease, transform .5s cubic-bezier(.2,.8,.2,1)',
                }}
              >
                {LIGHTS[key].en}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WindIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden style={{ animation: on ? 'pcBreathe 2.8s ease-in-out infinite' : 'none' }}>
      <path d="M3 8h9.5a2.5 2.5 0 1 0-2.4-3.2" />
      <path d="M3 12.5h13.5a2.5 2.5 0 1 1-2.4 3.2" />
      <path d="M3 17h7a2 2 0 1 1-1.9 2.6" />
    </svg>
  );
}

/**
 * The wind, on the stage: a round glass button, bottom right, that opens into On and Off. On is
 * the strong setting — a buyer wants to see the cloth move, not choose a breeze — and the lab
 * opens with it on.
 */
function WindControl({ wind, setWind, open, setOpen }: { wind: number; setWind: (w: number) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const on = wind > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'pcPop .7s .2s cubic-bezier(.2,.8,.2,1) both' }}>
      {open && (
        <div role="group" aria-label="Wind setting" style={{ display: 'flex', gap: 2, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, borderRadius: 999, padding: 4, animation: 'pcSlideIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
          {([['On', 3], ['Off', 0]] as const).map(([label, value]) => {
            const active = on === value > 0;
            return (
              <button
                key={label}
                onClick={() => { setWind(value); setOpen(false); }}
                aria-pressed={active}
                style={{
                  cursor: 'pointer', background: active ? '#1C1917' : 'transparent', color: active ? '#FAF8F5' : '#1C1917',
                  border: 'none', borderRadius: 999, padding: '9px 18px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.08em', minWidth: 64,
                  transition: 'background .45s ease, color .45s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <button
        aria-label="Wind"
        aria-expanded={open}
        title={on ? 'Wind on' : 'Wind off'}
        onClick={() => setOpen(!open)}
        className="pc-hv-scale-06"
        style={{
          cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
          ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, color: on ? '#1C1917' : 'rgba(28,25,23,.42)',
          transition: 'transform .5s cubic-bezier(.2,.8,.2,1), color .5s ease, background .5s ease',
          transform: open ? 'rotate(-10deg)' : 'none',
        }}
      >
        <WindIcon on={on} />
      </button>
    </div>
  );
}

/**
 * The loader for a supplied model: a single thread being drawn round a ring, and a word about
 * what is coming. Delayed a third of a second so a model already in the cache never flashes it.
 */
function StageLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px 12px 14px', borderRadius: 999,
          ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, animation: 'pcPop .6s .3s cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden style={{ animation: 'pcSpin 1.8s linear infinite' }}>
          <circle cx="13" cy="13" r="10" fill="none" stroke="rgba(28,25,23,.14)" strokeWidth="1.5" />
          <circle cx="13" cy="13" r="10" fill="none" stroke="#8A6D45" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="18 45" />
        </svg>
        <span style={{ fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(28,25,23,.7)' }}>{label}</span>
      </div>
    </div>
  );
}

/** A garment's silhouette, drawn small; the roll has no path and gets a bolt. */
function GarmentGlyph({ k, height }: { k: GarmentKey; height: number }) {
  const d = GARMENTS[k].d;
  if (!d) {
    return (
      <svg width={height * 0.77} height={height} viewBox="0 0 200 260" aria-hidden>
        <ellipse cx="100" cy="34" rx="70" ry="22" fill="currentColor" opacity=".55" />
        <rect x="30" y="34" width="140" height="196" rx="6" fill="currentColor" />
        <ellipse cx="100" cy="34" rx="18" ry="6" fill="#FAF8F5" opacity=".8" />
      </svg>
    );
  }
  return (
    <svg width={height * 0.77} height={height} viewBox="0 0 200 260" aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/**
 * The garment picker, on the stage: a small glass button, bottom left, naming the cut that is
 * up; a tap veils the stage in frosted glass and lays the six cuts out as silhouettes. Choose
 * one, or touch the veil, and it lifts.
 */
function GarmentPicker({ garment, setGarment, open, setOpen }: { garment: GarmentKey; setGarment: (g: GarmentKey) => void; open: boolean; setOpen: (o: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  return (
    <>
      <button
        aria-label="Garment"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="pc-hv-scale-06"
        style={{
          position: 'absolute', left: 14, bottom: 14, zIndex: 6, cursor: 'pointer', height: 44, borderRadius: 999, padding: '0 16px 0 10px',
          display: 'flex', alignItems: 'center', gap: 8, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, color: '#1C1917', fontFamily: FONT_BODY,
          transition: 'transform .5s cubic-bezier(.2,.8,.2,1), background .5s ease', animation: 'pcPop .7s .15s cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center' }}>
          <GarmentGlyph k={garment} height={20} />
        </span>
        <span style={{ fontSize: 11, letterSpacing: '.08em' }}>{DIAL_LABELS[garment]}</span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 7, background: 'rgba(250,248,245,.4)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            animation: 'pcVeil .55s ease both', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div role="group" aria-label="Choose a garment" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, width: '100%', maxWidth: 400 }}>
            {GARMENT_KEYS.map((k, i) => {
              const on = k === garment;
              return (
                <button
                  key={k}
                  onClick={() => { setGarment(k); setOpen(false); }}
                  aria-pressed={on}
                  className="pc-hv-scale-06"
                  style={{
                    cursor: 'pointer', background: on ? '#1C1917' : 'rgba(255,255,255,.72)', color: on ? '#FAF8F5' : '#1C1917',
                    border: '1px solid rgba(28,25,23,.1)', borderRadius: 18, padding: '16px 8px 13px', fontFamily: FONT_BODY,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    animation: `pcPop .6s ${i * 55}ms cubic-bezier(.2,.8,.2,1) both`,
                    transition: 'transform .5s cubic-bezier(.2,.8,.2,1), background .45s ease, color .45s ease',
                  }}
                >
                  <GarmentGlyph k={k} height={44} />
                  <span style={{ fontSize: 11, letterSpacing: '.08em' }}>{DIAL_LABELS[k]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
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
