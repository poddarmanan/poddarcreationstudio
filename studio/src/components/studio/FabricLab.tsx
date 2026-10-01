'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence, Reveal } from './motion';
import { FabricRoll } from './FabricRoll';
import type { Studio } from './state';
import { FabricViewer } from '@/components/three/FabricViewer';
import { ExportView } from '@/components/three/ExportView';
import { oklchToHex } from '@/lib/three/colour';
import { metamerism, shiftVerdict } from '@/lib/three/metamerism';
import { FONT_DISPLAY, FONT_BODY, fabricTex, fabricWeave, colourCss, colourShade, fabricNo } from './helpers';
import { useDragScroll } from './interactions';
import { AddChooser, AddedToast, flyInto } from './AddChooser';
import { ShadeStrip } from './ShadeStrip';
import { PriceCall } from './brand';
import {
  GARMENTS, LIGHTS, PHYSICS_NOTES, STRETCH_TEST_NOTES,
  type GarmentKey, type LightKey,
} from '@/lib/fabric-generator';

const SCOPE_LEVELS: [string, number][] = [['100×', 26], ['200×', 48], ['500×', 96]];
/**
 * The Scenes layout, from the owner's sketch: a wide banner, then one large tile beside two small
 * ones stacked, then the next wide banner — a four-tile beat on a three-column grid, which nine
 * scenes fill exactly (banner, large, small, small, banner, large, small, small, banner).
 */
const sceneSpan = (i: number): [number, number] => [[3, 1], [2, 2], [1, 1], [1, 1]][i % 4] as [number, number];
const GARMENT_KEYS = Object.keys(GARMENTS) as GarmentKey[];
/**
 * The loader holds at least this long on a change of cut, cached model or not, and for as long as
 * a model is still arriving; the garment before it fades out first. After a real load the reveal
 * waits a beat more, so the new model's first frames draw under cover.
 */
const HOLD_MS = 1500;
const AFTER_LOAD_MS = 300;
const FADE_OUT_MS = 450;
const DIAL_LABELS: Record<GarmentKey, string> = { kurti: 'Kurti', shirt: 'Shirt', saree: 'Saree', top: 'Top', tshirt: 'T-Shirt', roll: 'Roll' };

export function FabricLab({ studio }: { studio: Studio }) {
  const { t, currentFabric: f, currentColour: col, tests, garment, light: lightKey, wind, reduceMotion } = studio;
  const light = LIGHTS[lightKey];
  // The same sRGB the weave texture is generated from, so the strip and the canvas start
  // from one colour rather than two conversions of it.
  const renderHex = oklchToHex(col.l, col.c, col.h);
  const amp = reduceMotion ? 0 : f.flow * wind * 1.5;
  // The catalogue's numbering: this fabric's plate number and the count, as "03 / 11".
  const fabricIndex = fabricNo(studio.fabrics, f.id);
  // "Select multiple": the buyer ticks several shades of this fabric, and the quote, the book and
  // the shade count all take the ticked set. Kept per fabric, so it clears on a change.
  const [multi, setMulti] = useState<{ fid: string; picked: number[] } | null>(null);
  const picking = multi?.fid === f.id;
  const picked = picking ? multi.picked : [];
  const toggleMulti = () => setMulti(picking ? null : { fid: f.id, picked: [studio.ci] });
  const pickShade = (j: number) => {
    if (!picking) {
      studio.setCi(j);
      return;
    }
    const on = picked.includes(j);
    setMulti({ fid: f.id, picked: on ? picked.filter((x) => x !== j) : [...picked, j] });
    if (!on) studio.setCi(j);
  };
  // What the actions act on: the ticked shades, or the shade on the stage.
  const targets = picking && picked.length ? picked : [studio.ci];
  const targetColours = targets.map((j) => f.colours[j]).filter(Boolean);
  const pinned = targetColours.every((c) => studio.pins.some((p) => p.fabricId === f.id && p.colourOrder === c.order));
  // "Add to…" asks where the shades go: the cart (the fabric itself, by the metre) or the swatch
  // book. The choice is made in a sheet; either way the cuttings fly into that tab, which bumps as
  // they land, and a small note points at it with the way there.
  const [choosing, setChoosing] = useState(false);
  const chooserPresence = usePresence(choosing, 400);
  const [chosenColours, setChosenColours] = useState(targetColours);
  const [toast, setToast] = useState<{ kind: 'cart' | 'book'; eyebrow: string; text: string; swatches: string[]; open: boolean; n: number }>({ kind: 'cart', eyebrow: '', text: '', swatches: [], open: false, n: 0 });
  const toastPresence = usePresence(toast.open, 360);
  const toastTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const openChooser = () => {
    setChosenColours(targetColours);
    setChoosing(true);
  };
  const added = (kind: 'cart' | 'book', from: DOMRect | null, text: string) => {
    const swatches = chosenColours.map((c) => fabricTex(f, c, 3));
    setChoosing(false);
    setMulti(null);
    window.setTimeout(() => flyInto(kind, from, swatches), 120);
    window.clearTimeout(toastTimer.current);
    // A fresh note each time (its key), so it plays in again over one still showing.
    setToast((was) => ({ kind, eyebrow: kind === 'cart' ? t.addedCart : t.addedBook, text, swatches, open: true, n: was.n + 1 }));
    toastTimer.current = window.setTimeout(() => setToast((x) => ({ ...x, open: false })), 3600);
  };
  const names = (cs: typeof chosenColours) => (cs.length > 2 ? `${cs.length} ${t.shades}` : cs.map((c) => c.name).join(', '));
  // Into the cart with no metres: the buyer chooses them there.
  const toCart = (from: DOMRect | null) => {
    studio.addToCart(f.id, chosenColours.map((c) => c.order), 0);
    added('cart', from, `${names(chosenColours)} · ${t.chooseInCart}`);
  };
  const toBook = (from: DOMRect | null) => {
    chosenColours.forEach((c) => studio.pinShade(f.id, c.order));
    studio.bumpBook();
    added('book', from, `${names(chosenColours)} · ${f.name}`);
  };
  const inCart = targetColours.length > 0 && targetColours.every((c) => studio.cart.some((l) => l.fabricId === f.id && l.colourOrder === c.order));
  // In the book or the cart already: the button wears the house's "added" beige, with a tick.
  const alreadyIn = pinned || inCart;
  // The chooser and the note are fixed to the viewport, so they are portalled to the body: the lab's root animates a
  // transform while it lays in, and a transformed ancestor turns a fixed child page-positioned.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);
  const fabricCount = String(studio.fabrics.length).padStart(2, '0');
  // Swiping the plate sideways (or scrolling it, or its arrows, or the arrow keys) moves to the
  // neighbouring fabric in catalogue order, wrapping round, through the Showroom's own unroll.
  const order = studio.fabrics;
  const at = Math.max(0, order.findIndex((x) => x.id === f.id));
  // Which way the plate's number is sliding out, for the fabric it is leaving; clears itself once
  // the next fabric is on.
  const [leavingFrom, setLeavingFrom] = useState<{ fid: string; dir: 1 | -1 } | null>(null);
  const leaving = leavingFrom?.fid === f.id ? leavingFrom.dir : 0;
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ dx: 0, t: 0 });
  const stepFabric = (dir: 1 | -1) => {
    if (leaving) return;
    setLeavingFrom({ fid: f.id, dir });
    studio.unroll(order[(at + dir + order.length) % order.length]);
  };
  const colCssV = colourCss(col);
  const fg = col.l > 0.62 ? '#1C1917' : '#FAF8F5';
  const isRoll = garment === 'roll';
  const modelOn = tests.d3 && !isRoll;
  const testNoteOn = tests.stretch && isRoll;
  // (The stretch test's reading is shown by StretchCallout, beside the Stretch button.)
  const testNote = STRETCH_TEST_NOTES[f.family];

  const moreDrag = useDragScroll();
  // The two controls that live on the stage itself: the wind toggle and the garment picker.
  const [windOpen, setWindOpen] = useState(false);
  // Scenes, as a panel from the stage's camera button, with the microscope inside it.
  const [scenesOpen, setScenesOpen] = useState(false);
  const scenesPresence = usePresence(scenesOpen, 560);
  const [pickerOpen, setPickerOpen] = useState(false);
  // True while a supplied model is on its way; the stage shows a loader rather than the
  // built-in cut, which used to stand in and read as the wrong garment appearing first.
  const [modelLoading, setModelLoading] = useState(false);
  const onModelLoading = useCallback((loading: boolean) => setModelLoading(loading), []);
  // Every change of cut is a staged transition, cached model or not: the garment on the stage
  // fades out, the loader comes up and holds for a few seconds while the new cut is prepared
  // under it, then the loader fades away as the new garment fades in. A garment that simply
  // snapped into place read as a glitch. `shown` is the cut the stage is drawing, which lags
  // the chosen cut by the fade-out; `veiled` hides the stage; the loader has its own phase so
  // it can fade out rather than vanish.
  const [shown, setShown] = useState<GarmentKey>(garment);
  const [veiled, setVeiled] = useState(true);
  const [loaderPhase, setLoaderPhase] = useState<'hidden' | 'in' | 'out'>('in');
  const [holdUntil, setHoldUntil] = useState(0);
  useEffect(() => {
    const timers = [
      window.setTimeout(() => {
        setVeiled(true);
        setLoaderPhase('in');
        setHoldUntil(0);
      }, 0),
      window.setTimeout(() => setShown(garment), FADE_OUT_MS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // A change of fabric replays the same staged reveal as a change of cut, so a fabric reached
    // from the plate or the "more fabrics" strip loads exactly as one opened from the Showroom.
    // (The lab is not remounted for it: tearing the canvas down trips a dispose-order fault in
    // drei's Environment, and keeping the canvas makes the switch cheaper besides.)
  }, [garment, f.id]);
  // The hold is timed from the first frame the loader is actually on screen, not from the tap:
  // a phone busy for a moment after the tap would otherwise spend the hold before it painted,
  // and the loader would flash rather than hold. Two frames: the one that paints, then the next.
  useEffect(() => {
    if (!veiled || holdUntil) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setHoldUntil(Date.now() + HOLD_MS));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [veiled, holdUntil]);
  // The reveal: once the hold is over and nothing is still loading.
  useEffect(() => {
    if (!veiled || modelLoading || !holdUntil) return;
    const wait = Math.max(AFTER_LOAD_MS, holdUntil - Date.now());
    const reveal = window.setTimeout(() => {
      setVeiled(false);
      setLoaderPhase('out');
    }, wait);
    return () => window.clearTimeout(reveal);
  }, [veiled, modelLoading, holdUntil]);
  useEffect(() => {
    if (loaderPhase !== 'out') return;
    const done = window.setTimeout(() => setLoaderPhase('hidden'), 700);
    return () => window.clearTimeout(done);
  }, [loaderPhase]);
  // The stretch test is the roll's: a length of cloth can be pulled, a made-up garment cannot.
  // Choosing the roll points the button out for a few seconds, once the roll is on.
  const [stretchHint, setStretchHint] = useState(false);
  // Once the buyer has used Stretch, the hint has done its job and never comes back for this cloth
  // (it used to reappear if Stretch was tapped before the hint's timer fired).
  const [stretchUsed, setStretchUsed] = useState(false);
  useEffect(() => {
    if (!isRoll) return;
    const show = window.setTimeout(() => setStretchHint(true), HOLD_MS + 900);
    const hide = window.setTimeout(() => setStretchHint(false), HOLD_MS + 7900);
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
  ];
  // The stretch reading lives in full under "i"; the stage shows only its two figures while testing.
  const stretchReading = {
    along: ((0.012 + f.stretch * 0.2) * 100).toFixed(1),
    across: ((0.015 + f.stretch * 0.1) * 100).toFixed(1),
    note: testNote,
  };

  const qr = Array.from({ length: 64 }, (_, i) => ((i * 7 + f.seed * 13 + i * i) % 5 < 2 || i < 3 || (i % 8 < 1 && i < 25) ? '#1C1917' : 'transparent'));

  const moreFabrics = studio.fabrics
    .filter((x) => x.id !== f.id)
    .map((x, i) => ({ id: x.id, no: fabricNo(studio.fabrics, x.id), dl: `${200 + i * 90}ms` }));

  const shadeChart = (
            <div>
          <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div className="pc-lab-label" style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' }}>
                  {f.nc} {t.shades}
                  {picking && picked.length > 0 && <span style={{ color: '#8A6D45' }}> · {picked.length} {t.selected}</span>}
                </div>
                <button
                  onClick={toggleMulti}
                  aria-pressed={picking}
                  className="pc-hv-scale-06 pc-lab-multi"
                  style={{
                    cursor: 'pointer', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '4px 9px',
                    fontFamily: FONT_BODY, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', lineHeight: 1.4,
                    ...(picking ? { background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917' } : { background: 'transparent', color: '#1C1917', border: '1px solid rgba(28,25,23,.22)' }),
                    transition: 'background .45s ease, color .45s ease, transform .5s cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="8" height="8" rx="1.5" />
                    <rect x="13" y="13" width="8" height="8" rx="1.5" />
                    {picking ? <path d="M14.5 5.5l2 2 4-4" /> : <rect x="13" y="3" width="8" height="8" rx="1.5" />}
                  </svg>
                  {picking ? t.done : t.selectMulti}
                </button>
              </div>
              <ShadeStrip colours={f.colours} current={studio.ci} picking={picking} picked={picked} onPick={pickShade} />
            </div>
            </div>
  );

  return (
    <div style={{ paddingBottom: 80, animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      {/* Header: a catalogue plate. The number over its count in the house gold, a rule, the
          name in display capitals with its spec line, and the lab's own mark at the right
          (hidden on a phone, where the stage is a thumb away). */}
      {/* Sizes live in the pc-fab-* classes (smaller on a phone); the name and the spec line
          each stay on one line, shrinking to fit rather than wrapping. */}
      {/* The whole head of the page — padding and all — is the swipe and scroll area for the
          number strip, not just the numbers themselves. */}
      <div
        className="pc-fab-head"
          tabIndex={0}
          role="group"
          aria-label={`Fabric ${fabricIndex} of ${fabricCount}. Swipe sideways or use the arrow keys for the next fabric.`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') stepFabric(1);
            if (e.key === 'ArrowLeft') stepFabric(-1);
          }}
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const from = swipe.current;
            swipe.current = null;
            if (!from) return;
            const dx = e.clientX - from.x;
            const dy = e.clientY - from.y;
            // A deliberate sideways stroke: long enough, and clearly more across than down.
            if (Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy) * 1.3) stepFabric(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            const now = e.timeStamp;
            if (now - wheel.current.t > 400) wheel.current.dx = 0;
            wheel.current = { dx: wheel.current.dx + e.deltaX, t: now };
            if (Math.abs(wheel.current.dx) > 60) {
              stepFabric(wheel.current.dx > 0 ? 1 : -1);
              wheel.current.dx = 0;
            }
          }}
        style={{ touchAction: 'pan-y', outline: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab' }}
      >
        <div className="pc-fab-plate">
          {/* The number strip: this fabric's number large in gold, its neighbours small and faded
              either side, as on a dial. A sideways swipe or scroll (or a tap on a neighbour, or
              the arrow keys) slides the strip one place and unrolls the next fabric. */}
          <div className="pc-fab-numcol" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignSelf: 'stretch', borderRight: '1px solid rgba(28,25,23,.14)', overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '.25em',
                transform: leaving ? `translateX(${leaving * -38}%)` : 'none', opacity: leaving ? 0.35 : 1,
                transition: 'transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease',
              }}
            >
              {[-2, -1, 0, 1, 2].map((d) => {
                const n = String(((at + d + order.length * 2) % order.length) + 1).padStart(2, '0');
                if (d === 0) {
                  return <span key={d} className="pc-fab-num" style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, lineHeight: 1, color: '#8A6D45' }}>{n}</span>;
                }
                return (
                  <button
                    key={d}
                    aria-label={`${d < 0 ? 'Previous' : 'Next'} fabric, ${n}`}
                    onClick={() => stepFabric(d < 0 ? -1 : 1)}
                    className={`pc-fab-side pc-hv-ink${Math.abs(d) === 2 ? ' pc-fab-side-far' : ''}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <span className="pc-fab-count" style={{ fontFamily: FONT_DISPLAY, color: '#8A6D45', opacity: 0.75, textAlign: 'center' }}>
              /{fabricCount}
            </span>
          </div>
          <div className="pc-fab-namecol" style={{ minWidth: 0 }}>
            <FitLine heading className="pc-fab-name" fitKey={f.name} style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, lineHeight: 1.05 }} lineStyle={{ letterSpacing: '.02em', textTransform: 'uppercase' }}>
              {f.name}
            </FitLine>
            <FitLine className="pc-fab-spec" min={6.5} fitKey={`${f.comp}|${f.hand}|${col.name}`} style={{ color: 'rgba(28,25,23,.55)' }} lineStyle={{ gap: '0 .6em', textTransform: 'uppercase' }}>
              <span>{f.comp}</span>
              <span style={{ color: 'rgba(28,25,23,.3)' }}>·</span>
              <span>{f.hand}</span>
              <span style={{ color: 'rgba(28,25,23,.3)' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.6em' }}>
                <span style={{ width: '1em', height: '1em', borderRadius: '50%', background: colCssV, border: '1px solid rgba(28,25,23,.18)', flex: 'none' }} />
                {col.name}
              </span>
            </FitLine>
          </div>
          <button
            onClick={() => document.querySelector('[data-stage]')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })}
            className="pc-fab-aside pc-hv-ink"
            style={{ cursor: 'pointer', background: 'none', border: 'none', borderLeft: '1px solid rgba(28,25,23,.14)', padding: '6px 0 6px clamp(14px,2.4vw,28px)', alignSelf: 'stretch', textAlign: 'left', fontFamily: FONT_BODY, textTransform: 'uppercase', color: '#1C1917' }}
          >
            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, letterSpacing: '.28em', whiteSpace: 'nowrap' }}>{t.lab} →</span>
            <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.28em', color: 'rgba(28,25,23,.5)', marginTop: 4, whiteSpace: 'nowrap' }}>{t.study}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 0, borderTop: '1px solid rgba(28,25,23,.08)', borderBottom: '1px solid rgba(28,25,23,.08)' }}>
        {/* Stage column: preview + lighting/wind rails */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid rgba(28,25,23,.06)' }}>
          <div className="pc-lab-stage" style={{ position: 'relative', flex: 1, background: light.bg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 1.2s ease' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(50% 40% at 50% 15%, ${light.glow}, transparent 70%)`, transition: 'background 1.2s ease' }} />
            <div style={{ position: 'absolute', left: '15%', right: '15%', bottom: '7%', height: 26, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(28,25,23,.3), transparent 70%)' }} />
            {/* The shine is the raking light the stage walks across the cloth (ShineSweep); the
                screen-wide band that used to sweep the whole stage with it is gone. */}
            <FabricViewer
              fabric={f}
              colour={col}
              light={studio.light}
              wind={wind}
              pulled={tests.stretch && shown === 'roll'}
              shine={tests.shine}
              rolled={shown === 'roll'}
              garment={shown}
              captureId="fabric-lab"
              onLoading={onModelLoading}
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
            {/* The curtain: the stage's own backdrop, drawn over the canvas and faded. It fades in
                over a leaving garment and out over an arriving one. The garment is not faded by
                putting the canvas in a CSS opacity group — Chromium composites a WebGL canvas in
                an opacity group through an offscreen surface, and on a software renderer that
                stalled the page outright. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
                opacity: veiled ? 1 : 0,
                transition: `opacity ${veiled ? `${FADE_OUT_MS}ms ease` : '1.1s cubic-bezier(.2,.8,.2,1)'}, background 1.2s ease`,
                background: `radial-gradient(35% 13px at 50% calc(93% - 13px), rgba(28,25,23,.3), transparent 70%), radial-gradient(50% 40% at 50% 15%, ${light.glow}, transparent 70%), ${light.bg}`,
              }}
            />
            {/* On a small frosted chip, so the roll's wires pass behind it rather than through it. */}
            <span style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, fontSize: 'clamp(7.5px, 1.1vw, 9.5px)', letterSpacing: '.2em', color: light.fg, transition: 'color 1.2s ease', maxWidth: '55%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '5px 10px', borderRadius: 999, background: light.fg === '#FAF8F5' ? 'rgba(28,25,23,.42)' : 'rgba(250,248,245,.62)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: '0 0 0 1px rgba(28,25,23,.05)' }}>
              {light.en.toUpperCase()} · {wind ? 'WIND' : 'STILL'}
            </span>
            {loaderPhase !== 'hidden' && <StageLoader label={isRoll ? 'Unrolling the cloth' : `Draping the ${DIAL_LABELS[garment].toLowerCase()}`} leaving={loaderPhase === 'out'} />}
            <LightControl albedoHex={renderHex} current={lightKey} setLight={studio.setLight} />
            <InfoControl title={f.name} shade={col.name} shadeCss={colCssV} rows={specRows} heading={t.sheet} stretch={stretchReading} />
            <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: 6 }}>
              {isRoll && (
                <div style={{ position: 'relative', display: 'flex' }}>
                  <StretchCallout hint={stretchHint && !stretchUsed && !tests.stretch} on={testNoteOn} stretch={f.stretch} />
                  <IconToggle label="Stretch" on={tests.stretch} onClick={() => { setStretchHint(false); setStretchUsed(true); studio.toggleTest('stretch'); }} delay={0.1}>
                    <StretchIcon on={tests.stretch} />
                  </IconToggle>
                </div>
              )}
              <IconToggle label="Shine" on={tests.shine} onClick={() => studio.toggleTest('shine')} delay={0.15}>
                <ShineIcon on={tests.shine} />
              </IconToggle>
              <WindControl wind={wind} setWind={studio.setWind} open={windOpen} setOpen={setWindOpen} />
            </div>
            <div style={{ position: 'absolute', left: 14, bottom: 66, zIndex: 6 }}>
              <IconToggle label={t.scenes} on={scenesOpen} dimWhenOff={false} onClick={() => setScenesOpen(true)} delay={0.2}>
                <CameraIcon />
              </IconToggle>
            </div>
            <GarmentPicker garment={garment} setGarment={studio.setGarment} open={pickerOpen} setOpen={setPickerOpen} />
          </div>
          {/* The shade chart: under the stage on a phone, in the right column on a desktop. */}
          <div className="pc-shades-mobile" style={{ padding: '18px clamp(16px,2.5vw,28px) 20px', borderTop: '1px solid rgba(28,25,23,.08)', background: '#FAF8F5' }}>
            {shadeChart}
          </div>
        </div>

        {/* The buyer's column: on a desktop the shade chart first, beside the cloth, then the price
            and Add to below it. The product details live behind the stage's "i"; a quote is asked
            for from the Swatch Book; the microscope sits down the page beside the downloads. */}
        <div className="pc-buyer-col" style={{ padding: 'clamp(24px,3.5vw,44px)', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: 'flex-start', background: '#FAF8F5' }}>
          <div className="pc-shades-desktop">{shadeChart}</div>
          <PriceLine price={f.price} t={t} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: -14 }}>
            {/* The column's one action, dressed as the Entrance's: ink with a fine gold edge, a slow
                light crossing it, a lift on hover and a give when pressed, and a star that
                twinkles. Gold once the shade is in the book, the tick popping in. */}
            <button
              onClick={openChooser}
              aria-haspopup="dialog"
              className={`pc-book pc-lab-add${alreadyIn ? ' is-done' : ''}`}
              style={{
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 999, whiteSpace: 'nowrap',
                padding: '16px 14px', fontFamily: FONT_BODY, fontSize: 'clamp(11px, 3vw, 12.5px)', letterSpacing: '.2em', textTransform: 'uppercase',
                // Frosted glass: a translucent fill that blurs what is behind it, ink lettering and a
                // fine gold edge; translucent gold once the shade is in the book.
                backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
                ...(alreadyIn
                  ? { background: 'linear-gradient(135deg, rgba(201,169,110,.34), rgba(138,109,69,.22))', color: '#5E4626', border: '1px solid rgba(138,109,69,.45)' }
                  : { background: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(250,248,245,.22))', color: '#1C1917', border: '1px solid rgba(201,169,110,.5)' }),
                flex: '1 1 150px',
              }}
            >
              <span key={alreadyIn ? 'done' : 'add'} aria-hidden className={alreadyIn ? 'pc-book-tick' : 'pc-book-star'}>{alreadyIn ? '✓' : '✦'}</span>
              {t.addTo}
              {targets.length > 1 && <CountBadge n={targets.length} light />}
            </button>
          </div>
        </div>
      </div>

      {/* More fabrics: large cards, the plate number over the cloth, a few of its shades, snap
          scrolling; each opens through the Showroom's unroll. */}
      <Reveal as="section" style={{ padding: 'clamp(40px,6vw,64px) 0 0' }}>
        {/* The heading, as a catalogue sets one: a gold eyebrow with the count on a hairline, the
            title in the display serif with its second word in italic, and the selvage stitch. */}
        <div style={{ padding: '0 clamp(16px,5vw,64px)', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 10, letterSpacing: '.38em', color: '#8A6D45', textTransform: 'uppercase' }}>
            <span aria-hidden style={{ width: 'clamp(24px,6vw,56px)', height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.6))' }} />
            {t.theCollection} · {moreFabrics.length} {t.qualities}
            <span aria-hidden style={{ width: 'clamp(24px,6vw,56px)', height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.6))' }} />
          </div>
          <h2 style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(40px,6vw,68px)', lineHeight: 1, letterSpacing: '-.005em', color: '#1C1917' }}>
            {t.moreWord} <em style={{ fontWeight: 400, color: '#8A6D45' }}>{t.fabricsWord}</em>
          </h2>
          <span aria-hidden className="pc-underline" style={{ display: 'block', width: 'clamp(64px,10vw,110px)', height: 1.5, margin: '16px auto 0', background: 'linear-gradient(90deg, transparent, #8A6D45 18%, #8A6D45 82%, transparent)' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <div
            id="pc-morefab"
            className="pc-nav"
            {...moreDrag}
            style={{
              display: 'flex', alignItems: 'flex-end', gap: 'clamp(30px,4.5vw,64px)', overflowX: 'auto', overflowY: 'hidden', padding: '30px clamp(34px,7vw,100px) 44px', marginTop: 4,
              cursor: 'grab', touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain',
              // The Showroom's hall, in miniature: a pale wall meeting a floor the rolls stand on,
              // fading out of the page at the top and back into it at the bottom so the hall and the
              // page read as one piece. No scroll snapping: it fought the hold-and-drag, pulling
              // the strip back as it moved, where the Fabric Hall's walk drags freely.
              background: 'linear-gradient(180deg,#FAF8F5 0%,#F6F3EE 16%,#EFEAE2 60%,#E0DACE 60.3%,#D8D1C4 78%,#E8E3D9 90%,#FAF8F5 100%)',
            }}
          >
            {moreFabrics.map((m) => (
              <div key={m.id} className="pc-roll-rise" style={{ flex: 'none', ['--d' as string]: m.dl }}>
                <FabricRoll compact f={studio.fab(m.id)} no={m.no} onClick={() => studio.unroll(studio.fab(m.id))} fg="#1C1917" sub="rgba(28,25,23,.55)" accent="#8A6D45" shades={t.shades} />
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 70, pointerEvents: 'none', background: 'linear-gradient(270deg,rgba(250,248,245,.9),transparent)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 40, pointerEvents: 'none', background: 'linear-gradient(90deg,rgba(250,248,245,.75),transparent)' }} />
        </div>
        {/* The Showroom's hint, as it is there: an arrow that breathes, and what to do. */}
        <div style={{ textAlign: 'center', padding: '4px 16px 0', fontSize: 10.5, letterSpacing: '.24em', color: 'rgba(28,25,23,.5)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'pulse 3s infinite' }}>
            <svg width="26" height="10" viewBox="0 0 26 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden style={{ animation: 'pcNudge 2.4s ease-in-out infinite' }}>
              <path d="M0 5h22M18 1l4 4-4 4" />
            </svg>
            {t.scrollHint}
          </span>
        </div>
      </Reveal>

      {/* Downloads, after the other fabrics: the spec sheet, the colour catalogue, this view, and
          the QR to share it. */}
      <Reveal as="section" delay={80} style={{ margin: 'clamp(34px,5vw,56px) clamp(16px,5vw,64px) 0', paddingTop: 'clamp(22px,3vw,30px)', borderTop: '1px solid rgba(28,25,23,.08)' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
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
      </Reveal>
      {mounted && scenesPresence.shown && createPortal(
        <ScenesPanel
          leaving={scenesPresence.leaving}
          t={t}
          fg={fg}
          scenes={sceneDefs}
          note={PHYSICS_NOTES[f.family]}
          onScene={(sd) => studio.openScene({ label: sd.label, css: sd.css, moving: !!sd.moving, fg })}
          onScope={(p) => studio.openScope(p)}
          onClose={() => setScenesOpen(false)}
        />,
        document.body,
      )}
      {mounted && chooserPresence.shown && (
        <AddChooser studio={studio} fabric={f} colours={chosenColours} leaving={chooserPresence.leaving} onBook={toBook} onCart={toCart} onClose={() => setChoosing(false)} />
      )}
      {mounted && toastPresence.shown && (
        <AddedToast
          key={toast.n}
          studio={studio}
          kind={toast.kind}
          eyebrow={toast.eyebrow}
          text={toast.text}
          swatches={toast.swatches}
          leaving={toastPresence.leaving}
          onView={() => {
            setToast((x) => ({ ...x, open: false }));
            studio.go(toast.kind);
          }}
        />
      )}
    </div>
  );
}

/**
 * The price, above "Add to book": a quiet line that still carries the most important number on
 * the page — one price per metre for every customer, in the display serif, with stock opposite.
 */
function PriceLine({ price, t }: { price: number; t: Record<string, string> }) {
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px 16px',
        padding: '14px 2px 14px', borderTop: '1px solid rgba(138,109,69,.35)', borderBottom: '1px solid rgba(28,25,23,.07)',
        animation: 'rise 1s .2s cubic-bezier(.22,.8,.2,1) both',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="pc-price-lbl" style={{ fontSize: 9.5, letterSpacing: '.3em', color: '#8A6D45', textTransform: 'uppercase' }}>{t.pricePerMetre}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6, fontFamily: FONT_DISPLAY, color: '#1C1917' }}>
          <span style={{ fontSize: 18, color: '#8A6D45', transform: 'translateY(-10px)' }}>₹</span>
          <span className="pc-price-num" style={{ fontSize: 40, fontWeight: 500, lineHeight: 0.9, letterSpacing: '.01em' }}>{price}</span>
          <span className="pc-price-per" style={{ fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.16em', color: 'rgba(28,25,23,.5)', textTransform: 'uppercase', marginLeft: 4 }}>/ {t.metre}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        <div className="pc-price-stock" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.6)', textTransform: 'uppercase' }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: '#5E8C61', boxShadow: '0 0 0 3px rgba(94,140,97,.16)', animation: 'pulse 3s infinite' }} />
          {t.inStockShort}
        </div>
        <div className="pc-price-fresh" style={{ fontSize: 10.5, color: 'rgba(28,25,23,.45)', marginTop: 5, letterSpacing: '.04em' }}>{t.millFresh}</div>
      </div>
      {/* Under the price and the stock, a quiet way to talk about the price: a row of its own, on
          one line. */}
      <PriceCall ask={t.priceAsk ?? 'Not satisfied with the price?'} call={t.priceCall ?? 'Give us a call'} style={{ flexBasis: '100%' }} />
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
function IconToggle({ label, on, onClick, delay = 0, dimWhenOff = true, children }: { label: string; on: boolean; onClick: () => void; delay?: number; dimWhenOff?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className="pc-hv-scale-06"
      style={{
        cursor: 'pointer', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
        // As the wind button: always glass, the icon in ink when the test is on and a light grey
        // when it is off; the icon itself carries the animation that says it is running.
        ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter,
        color: on || !dimWhenOff ? '#1C1917' : 'rgba(28,25,23,.42)',
        transition: 'transform .5s cubic-bezier(.2,.8,.2,1), color .6s ease',
        animation: `pcPop .9s ${delay}s cubic-bezier(.22,.8,.2,1) both`,
      }}
    >
      {children}
    </button>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4Z" />
      <circle cx="12" cy="13.2" r="3.6" />
    </svg>
  );
}

function ScopeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M8 10.5h5M10.5 8v5" />
    </svg>
  );
}

type SceneDef = { label: string; css: string; moving?: boolean };

/**
 * Scenes, opened from the stage's camera button: the cloth in the owner's sketched layout (a
 * banner, a large tile beside two small, the next banner), each opening full size. The
 * microscope lives in the panel's corner — a round button that opens into 100×, 200× and 500×.
 */
function ScenesPanel({ leaving, t, fg, scenes, note, onScene, onScope, onClose }: {
  leaving: boolean; t: Record<string, string>; fg: string; scenes: SceneDef[]; note: string;
  onScene: (s: SceneDef) => void; onScope: (p: number) => void; onClose: () => void;
}) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const scope = usePresence(scopeOpen, 420);
  // The page behind stays put while the sheet is up: without this, scrolling past the last
  // picture carried on down the page underneath, and the sheet seemed to have no end.
  useEffect(() => {
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = was;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(28,25,23,.36)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: leaving ? 'pcVeilOut .55s ease both' : 'pcVeil .75s ease both' }} />
      <div
        role="dialog"
        aria-label={t.scenes}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 980, maxHeight: 'calc(100svh - 56px)', overflowY: 'auto',
          overscrollBehavior: 'contain', background: '#FAF8F5', borderRadius: '22px 22px 0 0',
          padding: '18px clamp(16px,3vw,28px) calc(20px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -24px 60px rgba(28,25,23,.22)',
          animation: leaving ? 'pcSheetDown .55s cubic-bezier(.4,0,.6,1) both' : 'pcSheetUp .9s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(28,25,23,.15)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(26px,3vw,36px)', flex: 1 }}>{t.scenes}</h2>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* The magnifications pop out of the magnifier the way the wind's On and Off pop out
                of the wind button: a glass pill sliding in from its left. It floats beside the
                button rather than taking room in the row, so nothing in the header moves when it
                opens — on a phone it used to push the buttons sideways in a single frame. */}
            {scope.shown && (
              <div
                role="group"
                aria-label={t.scope}
                style={{
                  position: 'absolute', right: 'calc(100% + 4px)', top: '50%', marginTop: -22, zIndex: 2, whiteSpace: 'nowrap',
                  display: 'flex', gap: 2, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, background: 'rgba(255,255,255,.94)', borderRadius: 999, padding: 4,
                  animation: scope.leaving ? 'pcSlideOut .42s ease both' : 'pcSlideIn .7s cubic-bezier(.22,.8,.2,1) both',
                }}
              >
                {SCOPE_LEVELS.map(([label, p], k) => (
                  <button
                    key={label}
                    onClick={() => onScope(p)}
                    className="pc-hv-ink-fill"
                    style={{
                      cursor: 'pointer', background: 'transparent', color: '#1C1917', border: 'none', borderRadius: 999, padding: '9px 10px',
                      fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.04em', minWidth: 46,
                      animation: scope.leaving ? undefined : `pcPop .6s ${120 + k * 70}ms cubic-bezier(.22,.8,.2,1) both`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              aria-label={t.scope}
              aria-expanded={scopeOpen}
              title={t.scope}
              onClick={() => setScopeOpen(!scopeOpen)}
              className="pc-hv-scale-06"
              style={{
                cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: scopeOpen ? '1px solid #1C1917' : '1px solid rgba(28,25,23,.18)',
                background: scopeOpen ? '#1C1917' : '#fff', color: scopeOpen ? '#FAF8F5' : '#1C1917',
                transition: 'background .55s ease, color .55s ease, transform .7s cubic-bezier(.22,.8,.2,1)',
                transform: scopeOpen ? 'rotate(-12deg)' : 'none',
              }}
            >
              <ScopeIcon />
            </button>
            <button
              aria-label="Close"
              onClick={onClose}
              className="pc-hv-ink"
              style={{ cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'none', fontSize: 22, color: 'rgba(28,25,23,.6)' }}
            >
              ×
            </button>
          </div>
        </div>
        {/* The physics note opens and closes by easing its height, not by appearing: a grid row
            going from 0fr to 1fr, so the pictures below glide down rather than jump. */}
        <div aria-hidden={!scopeOpen} style={{ display: 'grid', gridTemplateRows: scopeOpen ? '1fr' : '0fr', transition: 'grid-template-rows .7s cubic-bezier(.22,.8,.2,1)' }}>
          <div style={{ overflow: 'hidden' }}>
          <p style={{ opacity: scopeOpen ? 1 : 0, transition: 'opacity .6s ease', margin: '-6px 0 14px', fontSize: 12.5, fontWeight: 300, lineHeight: 1.6, color: 'rgba(28,25,23,.6)', textWrap: 'pretty' }}>{note}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'clamp(90px, 20vw, 170px)', gap: 'clamp(8px, 1.2vw, 12px)' }}>
          {scenes.map((sd, i) => (
            <button
              key={sd.label}
              onClick={() => onScene(sd)}
              className="pc-hv-lift-4"
              style={{
                cursor: 'pointer', position: 'relative', border: 'none', padding: 0, textAlign: 'left',
                gridColumn: `span ${sceneSpan(i)[0]}`, gridRow: `span ${sceneSpan(i)[1]}`,
                borderRadius: 8, overflow: 'hidden', background: sd.css,
                boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.06)', transition: 'transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s',
                animation: `tileIn .8s ${160 + i * 70}ms cubic-bezier(.22,.8,.2,1) both`,
              }}
            >
              <span style={{ position: 'absolute', bottom: 10, left: 10, fontSize: 9.5, letterSpacing: '.22em', color: fg, textTransform: 'uppercase' }}>{sd.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The stretch button's icon: switching the test on pulls its two bars apart and holds them there,
 * the shaft lengthening between them; switching it off eases them back together. One movement
 * each way, as the cloth itself is pulled and let go — not a loop.
 */
function StretchIcon({ on }: { on: boolean }) {
  const ease = 'transform .75s cubic-bezier(.22,.8,.2,1)';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ overflow: 'visible' }}>
      <path d="M7 4h10M9.5 9.5 12 7l2.5 2.5" style={{ transform: on ? 'translateY(-2.4px)' : 'none', transition: ease }} />
      <path d="M12 7v10" style={{ transformOrigin: '12px 12px', transform: on ? 'scaleY(1.48)' : 'none', transition: ease }} />
      <path d="M7 20h10M9.5 14.5 12 17l2.5-2.5" style={{ transform: on ? 'translateY(2.4px)' : 'none', transition: ease }} />
    </svg>
  );
}

/**
 * The shine button's sun, alive the way the wind's gust is: switching it on turns it a quarter,
 * and while it is on its rays wheel slowly round and breathe, as a light being walked across.
 */
function ShineIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden
      style={{
        transform: on ? 'rotate(45deg)' : 'none', transition: 'transform .9s cubic-bezier(.22,.8,.2,1), color .6s ease, filter .6s ease',
        // Lit: warm gold, glowing softly; off, the button's grey.
        color: on ? '#B8893E' : undefined,
        filter: on ? 'drop-shadow(0 0 3px rgba(232,184,96,.85)) drop-shadow(0 0 7px rgba(232,184,96,.45))' : 'none',
        animation: on ? 'pcGlow 2.8s ease-in-out infinite' : 'none',
      }}
    >
      <g style={{ transformOrigin: '12px 12px', animation: on ? 'pcSpin 16s linear infinite' : 'none' }}>
        <path
          d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
          style={{ transformOrigin: '12px 12px', animation: on ? 'pcRays 2.8s ease-in-out infinite' : 'none' }}
        />
      </g>
      <circle cx="12" cy="12" r="3.2" style={{ transition: 'fill .6s ease', fill: on ? 'currentColor' : 'none' }} />
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
  const menu = usePresence(open, 440);
  const { readings, worst } = metamerism(albedoHex);
  const now = readings.find((r) => r.light === current) ?? readings[0];
  const verdict = shiftVerdict(worst);
  return (
    // Open, the menu stands above the stage's other buttons (the pull, the shine and the wind
    // below it on the right), which would otherwise be drawn over it.
    <div style={{ position: 'absolute', right: 14, top: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: menu.shown ? 9 : 6, animation: 'pcPop .7s .2s cubic-bezier(.2,.8,.2,1) both' }}>
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
      {menu.shown && (
        <div role="group" aria-label="Light setting" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, borderRadius: 18, padding: 5, animation: menu.leaving ? 'pcMenuOut .42s ease both' : 'pcMenuIn .7s cubic-bezier(.22,.8,.2,1) both', transformOrigin: 'top right' }}>
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
                  cursor: 'pointer', minWidth: 108, padding: '7px 13px', borderRadius: 999, border: 'none', textAlign: 'left',
                  background: r.hex, color: inkOn(r.hex), fontFamily: FONT_BODY, fontSize: 10.5, letterSpacing: '.08em',
                  boxShadow: on ? '0 0 0 2px #FAF8F5, 0 0 0 3.5px #8A6D45' : 'inset 0 0 0 1px rgba(28,25,23,.1)',
                  animation: menu.leaving ? undefined : `pcPop .7s ${100 + i * 70}ms cubic-bezier(.22,.8,.2,1) both`,
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

/**
 * The Stretch button's callout. Before the test, a hint to its left ("Pull the cloth →"). While the
 * cloth is pulled, only a small single-line tag above the button — how far the cloth gives along
 * (↕) and across (↔) — so it never sits between the buyer and the cloth being stretched; the full
 * reading, with the fabric's note, is in the product details under the stage's "i". It keeps what
 * it shows while it animates out, and only its inner card is animated so the centring holds.
 */
function StretchCallout({ hint, on, stretch }: { hint: boolean; on: boolean; stretch: number }) {
  const shown = usePresence(hint || on, 420);
  const [mode, setMode] = useState<'hint' | 'reading'>(on ? 'reading' : 'hint');
  useEffect(() => {
    if (!hint && !on) return;
    const tm = window.setTimeout(() => setMode(on ? 'reading' : 'hint'), 0);
    return () => window.clearTimeout(tm);
  }, [hint, on]);
  const along = ((0.012 + stretch * 0.2) * 100).toFixed(1);
  const across = ((0.015 + stretch * 0.1) * 100).toFixed(1);
  if (!shown.shown) return null;
  const reading = mode === 'reading';
  const card = {
    ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, background: 'rgba(250,248,245,.86)',
    boxShadow: '0 8px 20px rgba(28,25,23,.12), inset 0 1px 0 rgba(255,255,255,.8)',
    border: '1px solid rgba(201,169,110,.35)', borderRadius: 999, whiteSpace: 'nowrap' as const,
  };
  if (reading) {
    return (
      <div style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', pointerEvents: 'none', zIndex: 2 }}>
        <div
          role="note"
          key="reading"
          title={`${along}% along · ${across}% across`}
          style={{
            ...card, display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px',
            fontFamily: FONT_DISPLAY, fontSize: 12.5, color: '#1C1917', fontVariantNumeric: 'lining-nums',
            transformOrigin: 'bottom right',
            animation: shown.leaving ? 'pcPopOut .4s ease both' : 'pcPop .6s cubic-bezier(.22,.8,.2,1) both',
          }}
        >
          <span><span style={{ color: '#8A6D45' }}>↕</span> {along}%</span>
          <span><span style={{ color: '#8A6D45' }}>↔</span> {across}%</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', right: 54, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }}>
      <div
        role="note"
        key="hint"
        style={{
          ...card, position: 'relative', padding: '8px 12px', transformOrigin: 'right center',
          animation: shown.leaving ? 'pcSlideOut .42s ease both' : 'pcSlideIn .7s .5s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        <span aria-hidden style={{ position: 'absolute', right: -4.5, top: '50%', width: 8, height: 8, marginTop: -4, transform: 'rotate(45deg)', background: 'rgba(250,248,245,.95)', borderTop: '1px solid rgba(201,169,110,.35)', borderRight: '1px solid rgba(201,169,110,.35)' }} />
        <span style={{ fontFamily: FONT_BODY, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1C1917' }}>
          Pull the cloth <span style={{ color: '#8A6D45' }}>→</span>
        </span>
      </div>
    </div>
  );
}

/** How many shades a button acts on, as a small round badge beside its label. */
function CountBadge({ n, light = false }: { n: number; light?: boolean }) {
  return (
    <span
      aria-label={`${n} shades`}
      style={{
        minWidth: 19, height: 19, padding: '0 5px', borderRadius: 999, display: 'inline-grid', placeItems: 'center', flex: 'none',
        fontSize: 10, letterSpacing: 0, fontWeight: 500,
        background: light ? '#FAF8F5' : '#8A6D45', color: light ? '#1C1917' : '#FAF8F5',
      }}
    >
      {n}
    </span>
  );
}

/**
 * The product information on the stage: an "i" under the corner label that opens the product
 * sheet as a glass card over the stage, so a buyer can read the specifications without leaving
 * the garment. Closes on a second tap, on Escape, or on a tap outside the card.
 */
/**
 * One line of text that never wraps. The outer box carries the CSS size; the inner line is
 * scaled in em so it fits the box, shrinking only as far as it must (never below `min` px, where
 * it clips) and growing back when there is room. Measured without touching anything React owns,
 * and re-fitted when the text, the box or the web fonts change.
 */
function FitLine({ heading = false, className, style, lineStyle, fitKey, min = 7, children }: { heading?: boolean; className?: string; style?: React.CSSProperties; lineStyle?: React.CSSProperties; fitKey: string; min?: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const spanLine = useRef<HTMLSpanElement>(null);
  const headLine = useRef<HTMLHeadingElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const box = outer.current;
    const line = heading ? headLine.current : spanLine.current;
    if (!box || !line) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const css = parseFloat(getComputedStyle(box).fontSize) || 16;
        const room = box.clientWidth;
        const used = line.getBoundingClientRect().width;
        if (!room || !used) return;
        setScale((prev) => {
          const next = Math.min(1, Math.max(min / css, (prev * room * 0.995) / used));
          return Math.abs(next - prev) < 0.004 ? prev : next;
        });
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(line);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [fitKey, min, heading]);
  const shared: React.CSSProperties = { ...lineStyle, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', fontSize: `${scale}em`, margin: 0, fontWeight: 'inherit', fontFamily: 'inherit' };
  return (
    <div ref={outer} className={className} style={{ ...style, overflow: 'hidden', whiteSpace: 'nowrap' }}>
      {heading ? (
        <h1 ref={headLine} className="pc-fit" style={shared}>
          {children}
        </h1>
      ) : (
        <span ref={spanLine} className="pc-fit" style={shared}>
          {children}
        </span>
      )}
    </div>
  );
}

function InfoControl({ title, shade, shadeCss, rows, heading, stretch }: {
  title: string; shade: string; shadeCss: string; rows: { k: string; v: string }[]; heading: string;
  stretch: { along: string; across: string; note: string };
}) {
  const [open, setOpen] = useState(false);
  const card = usePresence(open, 440);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 6 }} />}
      <div style={{ position: 'absolute', left: 14, top: 38, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, zIndex: 7, maxWidth: 'calc(100% - 28px)', animation: 'pcPop .7s .25s cubic-bezier(.2,.8,.2,1) both' }}>
        <button
          aria-label="Product information"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="pc-hv-scale-06"
          style={{
            cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
            ...(open ? { background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917' } : { ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, color: '#1C1917' }),
            fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, lineHeight: 1,
            transition: 'background .5s ease, color .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)',
          }}
        >
          i
        </button>
        {card.shown && (
          <div
            role="dialog"
            aria-label={heading}
            style={{
              // Near-opaque: the card sits over the garment, and the specifications must read cleanly.
              width: 300, maxWidth: '100%', ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, background: 'rgba(250,248,245,.95)', borderRadius: 18, padding: '14px 16px 12px',
              animation: card.leaving ? 'pcPopOut .42s ease both' : 'pcPop .75s cubic-bezier(.22,.8,.2,1) both', transformOrigin: 'top left',
            }}
          >
            <div style={{ fontSize: 9.5, letterSpacing: '.24em', color: '#8A6D45', textTransform: 'uppercase' }}>{heading}</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 500, marginTop: 4, lineHeight: 1.1 }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, fontSize: 11.5, color: 'rgba(28,25,23,.6)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: shadeCss, border: '1px solid rgba(28,25,23,.18)', flex: 'none' }} />
              {shade}
            </div>
            <dl style={{ margin: '10px 0 0', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 0 }}>
              {rows.map((r, i) => (
                <div key={r.k} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 9.5, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', padding: '8px 14px 8px 0', borderTop: '1px solid rgba(28,25,23,.08)', animation: `pcSlideIn .45s ${i * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>{r.k}</dt>
                  <dd style={{ margin: 0, fontSize: 13, padding: '7px 0', borderTop: '1px solid rgba(28,25,23,.08)', textAlign: 'right', animation: `pcSlideIn .45s ${i * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>{r.v}</dd>
                </div>
              ))}
            </dl>
            {/* Stretch, as its own closing section: the two figures side by side in the display
                serif, each labelled beneath, and the fabric's note across the card. */}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid rgba(28,25,23,.08)', animation: `pcSlideIn .45s ${rows.length * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
              <div style={{ fontSize: 9.5, letterSpacing: '.2em', color: '#8A6D45', textTransform: 'uppercase' }}>Stretch</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', alignItems: 'center', marginTop: 8 }}>
                {[['↕', stretch.along, 'Along'], null, ['↔', stretch.across, 'Across']].map((cell, n) =>
                  cell ? (
                    <div key={n} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 500, lineHeight: 1, color: '#1C1917', fontVariantNumeric: 'lining-nums' }}>
                        <span style={{ fontSize: 14, color: '#8A6D45', marginRight: 5 }}>{cell[0]}</span>
                        {cell[1]}%
                      </div>
                      <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginTop: 5 }}>{cell[2]}</div>
                    </div>
                  ) : (
                    <span key={n} aria-hidden style={{ alignSelf: 'stretch', background: 'linear-gradient(180deg, transparent, rgba(138,109,69,.45), transparent)' }} />
                  ),
                )}
              </div>
              <p style={{ margin: '10px 0 0', textAlign: 'center', fontFamily: FONT_DISPLAY, fontSize: 14, lineHeight: 1.4, color: 'rgba(28,25,23,.68)', textWrap: 'balance' }}>{stretch.note}</p>
            </div>
          </div>
        )}
      </div>
    </>
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
  const opts = usePresence(open, 420);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'pcPop .7s .2s cubic-bezier(.2,.8,.2,1) both' }}>
      {opts.shown && (
        <div role="group" aria-label="Wind setting" style={{ display: 'flex', gap: 2, ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter, borderRadius: 999, padding: 4, animation: opts.leaving ? 'pcSlideOut .42s ease both' : 'pcSlideIn .7s cubic-bezier(.22,.8,.2,1) both' }}>
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
function StageLoader({ label, leaving = false }: { label: string; leaving?: boolean }) {
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px 12px 14px', borderRadius: 999,
          ...GLASS, WebkitBackdropFilter: GLASS.backdropFilter,
          animation: leaving ? 'pcFadeOut .6s ease both' : 'pcPop .7s .2s cubic-bezier(.2,.8,.2,1) both',
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
  const veil = usePresence(open, 520);
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
      {veil.shown && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 7, background: 'rgba(250,248,245,.4)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            animation: veil.leaving ? 'pcVeilOut .5s ease both' : 'pcVeil .8s ease both', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
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
                    animation: veil.leaving ? `pcPopOut .4s ${i * 25}ms ease both` : `pcPop .8s ${120 + i * 70}ms cubic-bezier(.22,.8,.2,1) both`,
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

