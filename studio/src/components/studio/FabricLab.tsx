'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FabricViewer } from '@/components/three/FabricViewer';
import { FONT_DISPLAY, FONT_BODY, fabricTex, fabricWeave, colourCss, colourFg, colourShade, chipStyle, heroColour } from './helpers';
import { useDragScroll, scrollByEl } from './interactions';
import {
  GARMENTS, LIGHTS, FABRIC_STORIES, PHYSICS_NOTES, STRETCH_TEST_NOTES,
  type GarmentKey, type LightKey,
} from '@/lib/fabric-generator';

const WIND_NAMES = ['None', 'Low', 'Medium', 'Strong'];
const SCOPE_LEVELS: [string, number][] = [['100×', 26], ['200×', 48], ['500×', 96]];
const SCENE_SPANS: [number, number][] = [[2, 2], [1, 1], [1, 1], [1, 2], [1, 1], [1, 1], [2, 1], [1, 1], [1, 1]];
const GARMENT_KEYS = Object.keys(GARMENTS) as GarmentKey[];
const DIAL_LABELS: Record<GarmentKey, string> = { kurti: 'Kurti', shirt: 'Shirt', dress: 'Dress', top: 'Top', tshirt: 'T-Shirt', roll: 'Roll' };

export function FabricLab({ studio }: { studio: Studio }) {
  const { t, currentFabric: f, currentColour: col, tests, garment, light: lightKey, wind, reduceMotion, approved, isStaff } = studio;
  const light = LIGHTS[lightKey];
  const priced = approved || isStaff;
  const amp = reduceMotion ? 0 : f.flow * wind * 1.5;
  const story = FABRIC_STORIES[f.id] ?? '';
  const colCssV = colourCss(col);
  const fg = col.l > 0.62 ? '#1C1917' : '#FAF8F5';
  const isRoll = garment === 'roll';
  const modelOn = tests.d3 && !isRoll;
  const testNoteOn = tests.stretch;
  const testNote = STRETCH_TEST_NOTES[f.family];

  const lightingDrag = useDragScroll();
  const moreDrag = useDragScroll();

  // Garment rotary dial — a drag rotates the disc and snaps the selection through the six
  // garment keys; a tap on any labelled chip jumps straight to it (spring-eased).
  const [dialAngle, setDialAngle] = useState<number | null>(null);
  const dialDrag = useRef<{ x: number; id: number; captured: boolean; start: number } | null>(null);
  const gi = GARMENT_KEYS.indexOf(garment);
  const restAngle = -80 + gi * 32;
  const dialRot = `${dialAngle != null ? dialAngle : restAngle}deg`;
  const dialTrans = dialAngle != null ? 'none' : 'transform .7s cubic-bezier(.34,1.3,.4,1)';

  const dialDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dialDrag.current = { x: e.clientX, id: e.pointerId, captured: false, start: dialAngle != null ? dialAngle : restAngle };
  };
  const dialMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dialDrag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4 && !d.captured) {
      d.captured = true;
      try { e.currentTarget.setPointerCapture(d.id); } catch { /* best-effort */ }
    }
    if (!d.captured) return;
    const ang = Math.max(-80, Math.min(80, d.start + dx * 0.8));
    const i = Math.max(0, Math.min(5, Math.round((ang + 80) / 32)));
    const k = GARMENT_KEYS[i];
    setDialAngle(ang);
    if (garment !== k) studio.setGarment(k);
  };
  const dialUp = () => {
    if (!dialDrag.current) return;
    dialDrag.current = null;
    setDialAngle(null);
  };
  const garmentDial = GARMENT_KEYS.map((k, i) => {
    const th = ((170 - i * 32) * Math.PI) / 180;
    return { k, label: DIAL_LABELS[k], x: `${(148 + 118 * Math.cos(th)).toFixed(0)}px`, y: `${(176 - 118 * Math.sin(th)).toFixed(0)}px`, on: garment === k };
  });

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
          <div style={{ position: 'relative', flex: 1, minHeight: '56vh', background: light.bg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .8s ease' }}>
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
            <FabricViewer
              fabric={f}
              colour={col}
              light={studio.light}
              wind={wind}
              pulled={tests.stretch}
              rolled={isRoll}
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
            <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 10.5, letterSpacing: '.22em', color: light.fg, opacity: 0.75 }}>
              {light.en.toUpperCase()} · {WIND_NAMES[wind].toUpperCase()}
            </span>
            <div
              style={{
                position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6,
                background: 'rgba(250,248,245,.62)', backdropFilter: 'blur(12px)', border: '1px solid rgba(28,25,23,.1)', borderRadius: 999, padding: 5,
              }}
            >
              {([['stretch', 'Stretch'], ['shine', 'Shine'], ['d3', 'Watch in 3D']] as const).map(([k, label]) => (
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
          {/* Lighting + wind rails */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '18px clamp(16px,2.5vw,28px) 20px', borderTop: '1px solid rgba(28,25,23,.08)', background: '#FAF8F5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span style={{ fontSize: 10, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', width: 64, flex: 'none' }}>{t.lighting}</span>
              <div className="pc-nav" {...lightingDrag} style={{ display: 'flex', gap: 2, background: 'rgba(28,25,23,.05)', borderRadius: 999, padding: 3, overflowX: 'auto', minWidth: 0, cursor: 'grab', touchAction: 'pan-y' }}>
                {(Object.keys(LIGHTS) as LightKey[]).map((k) => (
                  <RailChip key={k} on={lightKey === k} onClick={() => studio.setLight(k)}>{LIGHTS[k].en}</RailChip>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span style={{ fontSize: 10, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', width: 64, flex: 'none' }}>{t.windL}</span>
              <div className="pc-nav" style={{ display: 'inline-flex', gap: 2, background: 'rgba(28,25,23,.05)', borderRadius: 999, padding: 3, overflowX: 'auto', maxWidth: '100%' }}>
                {WIND_NAMES.map((w, i) => (
                  <RailChip key={w} on={wind === i} onClick={() => studio.setWind(i)}>{w}</RailChip>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls: garment dial, scope, physics, shades */}
        <div style={{ padding: 'clamp(24px,3.5vw,44px)', display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center', background: '#FAF8F5' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 4 }}>{t.garment}</div>
            <div
              onPointerDown={dialDown}
              onPointerMove={dialMove}
              onPointerUp={dialUp}
              onPointerCancel={dialUp}
              style={{ position: 'relative', width: 296, maxWidth: '100%', height: 176, margin: '0 auto', touchAction: 'none', cursor: 'grab', userSelect: 'none', overflow: 'hidden' }}
            >
              <div
                style={{
                  position: 'absolute', left: 52, top: 80, width: 192, height: 192, borderRadius: '50%',
                  background: 'radial-gradient(circle at 50% 40%, #F0EDE7, #DFDAD1 68%, #CEC8BD)',
                  boxShadow: 'inset 0 2px 6px rgba(255,255,255,.9),inset 0 -8px 16px rgba(28,25,23,.14),0 10px 26px rgba(28,25,23,.16)',
                  transform: `rotate(${dialRot})`, transition: dialTrans, pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    position: 'absolute', inset: 5, borderRadius: '50%',
                    background: 'repeating-conic-gradient(rgba(28,25,23,.14) 0deg 1deg, transparent 1deg 7.5deg)',
                    WebkitMask: 'radial-gradient(circle, transparent 70%, #000 71%)', mask: 'radial-gradient(circle, transparent 70%, #000 71%)',
                  }}
                />
                <span style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: '#8A6D45', boxShadow: '0 1px 3px rgba(28,25,23,.35)' }} />
                <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.55)', boxShadow: 'inset 0 1px 3px rgba(28,25,23,.12)' }} />
              </div>
              {garmentDial.map((g) => {
                const cs = chipStyle(g.on);
                return (
                  <button
                    key={g.k}
                    onClick={() => studio.setGarment(g.k)}
                    className="pc-hv-gold-border"
                    style={{
                      position: 'absolute', left: g.x, top: g.y, transform: 'translate(-50%,-50%)', cursor: 'pointer',
                      background: cs.background, color: cs.color, border: `1px solid ${cs.borderColor}`, borderRadius: 999,
                      padding: '6px 11px', fontFamily: FONT_BODY, fontSize: 10.5, letterSpacing: '.04em', whiteSpace: 'nowrap',
                      transition: 'background .25s,border-color .25s,color .25s',
                    }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
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

function RailChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="pc-hv-gold-text"
      style={{
        cursor: 'pointer', background: on ? '#1C1917' : 'transparent', color: on ? '#FAF8F5' : 'rgba(28,25,23,.65)',
        border: 'none', borderRadius: 999, padding: '7px 14px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.04em',
        whiteSpace: 'nowrap', transition: 'background .25s,color .25s',
      }}
    >
      {children}
    </button>
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
