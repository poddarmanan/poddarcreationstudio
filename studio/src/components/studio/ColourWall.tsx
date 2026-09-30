'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { Selvage } from './brand';
import { FONT_DISPLAY, fabricTex } from './helpers';

/** A shade in a closet, with where it comes from. */
type Shade = { key: string; c: ColourRow; x: FabricRow; j: number };

/** Below this OKLCH chroma a shade reads as a grey, and is hung with the neutrals. */
const NEUTRAL_C = 0.035;
/** Where the colour wheel is cut to lay it out in a line: between the pinks and the reds. */
const HUE_START = 350;

/**
 * One run of colour, as a mill hangs its cards: the neutrals first, light to dark, then round the
 * colour wheel from red, each hue light to dark where two sit close.
 */
function spectrum(a: ColourRow, b: ColourRow) {
  const an = a.c < NEUTRAL_C;
  const bn = b.c < NEUTRAL_C;
  if (an !== bn) return an ? -1 : 1;
  if (an) return b.l - a.l;
  const ha = (a.h - HUE_START + 720) % 360;
  const hb = (b.h - HUE_START + 720) % 360;
  return Math.abs(ha - hb) < 6 ? b.l - a.l : ha - hb;
}

// The closet's measures, in px.
const SLIDE_MAX = 680; // a closet's slot in the row, at most
const SLIDE_PAD = 16; // the gap either side of a closet, where its doors swing
const STILE = 12; // the closet's side walls
const INSIDE_PAD = 12; // from a wall to the ends of the slips' run
const SLIP_W = 84; // a slip
const ROD_H = 176; // one rod and the slips hanging from it
const INSIDE_TOP = 18;
const PER_ROD_MAX = 8;
const SPACING = 56; // slips' natural spacing along a rod, at most
const MIN_GAP = 12; // how close two hooks can be pushed

/** A quality's shades, cut into rods of about equal length for a rod as long as `len`. */
function hang(shades: Shade[], len: number) {
  const cap = Math.max(3, Math.min(PER_ROD_MAX, Math.floor((len - SLIP_W) / 36) + 1));
  const rods = Math.max(1, Math.ceil(shades.length / cap));
  const per = Math.ceil(shades.length / rods);
  const out: Shade[][] = [];
  for (let i = 0; i < shades.length; i += per) out.push(shades.slice(i, i + per));
  return out;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The Colour Closet: every quality is a walnut wardrobe of its own, in a row to swipe through (or
 * step through with the arrows and the names above). A closet's doors are shut until they are
 * tapped, when they unlatch and swing wide and a lamp comes on inside; the one arrived at opens by
 * itself. Inside, each shade is a swatch slip hanging from a brass rod, turned in depth and
 * overlapping like cards in a file. A slip can be slid along its rod like a hanger, pushing its
 * neighbours; one given room turns to face you, and they swing as they move. A tap lifts the slip a
 * little and the page is covered by the Showroom's unroll, in that shade, into the Lab.
 */
export function ColourWall({ studio }: { studio: Studio }) {
  const { t, fabrics, wallFab } = studio;
  const idx = Math.max(0, fabrics.findIndex((x) => x.id === wallFab));
  const fab = fabrics[idx];
  const goTo = (k: number) => {
    const next = fabrics[Math.max(0, Math.min(fabrics.length - 1, k))];
    if (next && next.id !== fab?.id) studio.setWallFab(next.id);
  };

  // Each quality's shades as one run of colour.
  const runs = useMemo(
    () =>
      fabrics.map((f) =>
        f.colours.map((c, j): Shade => ({ key: `${f.id}-${j}`, c, x: f, j })).sort((a, b) => spectrum(a.c, b.c)),
      ),
    [fabrics],
  );

  // The row of closets is as wide as the screen; a closet takes at most SLIDE_MAX of it, so on a
  // wide screen its neighbours stand either side.
  const view = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const [vw, setVw] = useState(0);
  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    setVw(el.clientWidth);
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const slideW = Math.min(vw, SLIDE_MAX);
  const len = slideW - 2 * SLIDE_PAD - 2 * STILE - 2 * INSIDE_PAD;
  const base = (vw - slideW) / 2 - idx * slideW;

  // The row sits on the closet being looked at, gliding there when it changes.
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    el.style.transition = reduced() ? 'none' : 'transform .6s cubic-bezier(.22,.8,.2,1)';
    el.style.transform = `translate3d(${base}px,0,0)`;
  }, [base]);

  // What the swipe reads, kept current.
  const idxRef = useRef(idx);
  const baseRef = useRef(base);
  const goToRef = useRef(goTo);
  useEffect(() => {
    idxRef.current = idx;
    baseRef.current = base;
    goToRef.current = goTo;
  });

  // Swiping the row: a sideways drag anywhere but on a slip. The page still scrolls up and down.
  const swipe = useRef<{ id: number; x: number; y: number; dx: number; on: boolean } | null>(null);
  const swipedAt = useRef(0);
  useEffect(() => {
    const el = view.current;
    const tr = track.current;
    if (!el || !tr) return;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.pc-cslip')) return;
      swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false };
    };
    const move = (e: PointerEvent) => {
      const s = swipe.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          s.on = true;
          el.setPointerCapture(e.pointerId);
          tr.style.transition = 'none';
        } else if (Math.abs(dy) > 10) swipe.current = null;
        return;
      }
      // Past the first or the last closet it gives, but only a little.
      const atEnd = (dx > 0 && idxRef.current === 0) || (dx < 0 && idxRef.current === fabrics.length - 1);
      s.dx = atEnd ? dx * 0.3 : dx;
      tr.style.transform = `translate3d(${baseRef.current + s.dx}px,0,0)`;
    };
    const up = (e: PointerEvent) => {
      const s = swipe.current;
      if (!s || s.id !== e.pointerId) return;
      swipe.current = null;
      if (!s.on) return;
      swipedAt.current = e.timeStamp;
      tr.style.transition = 'transform .5s cubic-bezier(.22,.8,.2,1)';
      const w = Math.min(el.clientWidth, SLIDE_MAX);
      const step = Math.abs(s.dx) > Math.min(70, w * 0.18) ? (s.dx < 0 ? 1 : -1) : 0;
      if (step) goToRef.current(idxRef.current + step);
      tr.style.transform = `translate3d(${baseRef.current - step * w}px,0,0)`;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [fabrics.length]);

  // Opened closets stay open. The one arrived at opens by itself, once the page's curtain lifts.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const open = (id: string) => setOpened((o) => (o.has(id) ? o : new Set(o).add(id)));
  const firstId = useRef(fab?.id);
  useEffect(() => {
    const id = firstId.current;
    if (!id) return;
    const tm = window.setTimeout(() => setOpened((o) => new Set(o).add(id)), reduced() ? 0 : 950);
    return () => window.clearTimeout(tm);
  }, []);

  // The names above: the one looked at kept in view.
  const names = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = names.current;
    const on = row?.children[idx] as HTMLElement | undefined;
    if (row && on) row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: reduced() ? 'instant' : 'smooth' });
  }, [idx]);

  // Taking a slip out: it lifts, then the page unrolls in its shade.
  const picking = useRef(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pick = (s: Shade) => {
    if (picking.current) return false;
    picking.current = true;
    timer.current = window.setTimeout(() => studio.unroll(s.x, s.j), reduced() ? 0 : 380);
    return true;
  };

  const tapCloset = (e: ReactMouseEvent, k: number, id: string) => {
    if (e.timeStamp - swipedAt.current < 350) return;
    if (k !== idx) goTo(k);
    else open(id);
  };

  return (
    <div className="pc-closetpage" style={{ padding: 'clamp(30px,5vw,56px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div style={{ fontSize: 10, letterSpacing: '.5em', color: '#8A6D45', marginBottom: 8 }}>PODDAR CREATION</div>
      <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(34px,4.5vw,58px)' }}>{t.colourWall}</h1>
      <Selvage style={{ marginTop: 12 }} />
      <p style={{ margin: '8px 0 14px', fontSize: 14, fontWeight: 300, color: 'rgba(28,25,23,.55)' }}>{t.wallSub}</p>

      {/* The closets by name, to step straight to one. */}
      <div ref={names} className="pc-closet-names">
        {fabrics.map((f, k) => (
          <button key={f.id} aria-pressed={k === idx} className={k === idx ? 'is-on' : undefined} onClick={() => goTo(k)}>
            {f.name}
          </button>
        ))}
      </div>

      <div className="pc-closet-count">
        <button aria-label="‹" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          ‹
        </button>
        <span>
          {(t.closetOf ?? '{n} / {total}').replace('{n}', String(idx + 1)).replace('{total}', String(fabrics.length))}
          <i>
            {fab?.name} · {fab?.colours.length} {t.shades}
          </i>
        </span>
        <button aria-label="›" disabled={idx === fabrics.length - 1} onClick={() => goTo(idx + 1)}>
          ›
        </button>
      </div>

      <div ref={view} className="pc-closets">
        <div ref={track} className="pc-closets-track">
          {vw > 0 &&
            fabrics.map((f, k) => {
              const rods = hang(runs[k], len);
              const isOpen = opened.has(f.id);
              const here = k === idx;
              return (
                <div
                  key={f.id}
                  className={`pc-closet${isOpen ? ' is-open' : ''}${here ? ' is-here' : ''}`}
                  style={{ width: slideW, padding: `0 ${SLIDE_PAD}px` }}
                  onClick={(e) => tapCloset(e, k, f.id)}
                >
                  <div className="pc-closet-top">
                    <span className="pc-closet-plaque">
                      <i>No. {String(k + 1).padStart(2, '0')}</i>
                      <b>{f.name}</b>
                    </span>
                  </div>
                  <div className="pc-closet-body" style={{ height: INSIDE_TOP + rods.length * ROD_H + 8 }}>
                    <div className="pc-closet-inside">
                      <span aria-hidden className="pc-closet-lamp" />
                      {isOpen &&
                        rods.map((rod, r) => (
                          <Rod key={`${len}-${r}`} shades={rod} len={len} top={INSIDE_TOP + r * ROD_H} delay={r * 0.12} onPick={pick} />
                        ))}
                    </div>
                    {(['left', 'right'] as const).map((side) => (
                      <button key={side} aria-label={`${t.closetOpen ?? 'Open'} · ${f.name}`} tabIndex={isOpen ? -1 : 0} aria-hidden={isOpen} className={`pc-door is-${side}`}>
                        <span className="pc-door-face">
                          <span className="pc-door-panel is-top" />
                          <span className="pc-door-panel is-bottom" />
                          <span className="pc-door-knob" />
                        </span>
                        <span className="pc-door-face is-back">
                          {side === 'left' ? <span className="pc-door-mirror" /> : <span className="pc-door-panel is-inner" />}
                        </span>
                      </button>
                    ))}
                    {!isOpen && here && <span className="pc-closet-tag">{t.closetOpen ?? 'Open'}</span>}
                  </div>
                  <div className="pc-closet-base">
                    <span />
                    <span />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      {fab && opened.has(fab.id) && <p className="pc-closet-hint">{t.slideHint}</p>}
    </div>
  );
}

/**
 * One brass rod of slips. Each slip hangs from its hook at `x` along the rod and can be slid like a
 * hanger: dragged along, it pushes the slips it meets, and it glides a little when let go. A slip is
 * turned in depth by how much of it the next one covers, so one given room turns to face you, and
 * each swings from its hook as it moves. Everything is moved a frame at a time, and only while
 * something is moving.
 */
function Rod({ shades, len, top, delay, onPick }: { shades: Shade[]; len: number; top: number; delay: number; onPick: (s: Shade) => boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.pc-cslip'));
    const n = els.length;
    const quiet = reduced();
    const room = len - SLIP_W;
    const gap0 = n > 1 ? Math.min(room / (n - 1), SPACING) : 0;
    // Where each hangs (x), how fast it is sliding (v), its swing (a) and the swing's speed (w),
    // and how far it has been lifted when taken (s).
    const st = els.map((_, i) => ({ x: i * gap0, px: i * gap0, v: 0, a: 0, w: 0, s: 0 }));
    let picked = -1;
    let raf = 0;

    const place = (i: number, to: number) => {
      st[i].x = Math.max(i * MIN_GAP, Math.min(room - (n - 1 - i) * MIN_GAP, to));
      for (let k = i + 1; k < n; k++) st[k].x = Math.max(st[k].x, st[k - 1].x + MIN_GAP);
      for (let k = i - 1; k >= 0; k--) st[k].x = Math.min(st[k].x, st[k + 1].x - MIN_GAP);
    };
    const paint = () => {
      for (let i = 0; i < n; i++) {
        const h = st[i];
        const gap = i < n - 1 ? st[i + 1].x - h.x : SLIP_W;
        const turn = 34 * Math.max(0, Math.min(1, (SLIP_W - gap) / (SLIP_W - MIN_GAP))) * (1 - h.s);
        els[i].style.transform = `translate3d(${h.x.toFixed(2)}px,${(h.s * 10).toFixed(2)}px,0) rotateZ(${h.a.toFixed(2)}deg) rotateY(${turn.toFixed(2)}deg) scale(${(1 + h.s * 0.14).toFixed(3)})`;
      }
    };
    let drag: { i: number; id: number; sx: number; sy: number; x0: number; on: boolean; last: number; vx: number } | null = null;
    let moved = false;
    const frame = () => {
      raf = 0;
      let busy = !!drag?.on;
      for (let i = 0; i < n; i++) {
        const h = st[i];
        if (!(drag?.on && drag.i === i) && Math.abs(h.v) > 0.05) {
          place(i, h.x + h.v);
          h.v *= 0.9;
          busy = true;
        } else if (!(drag?.on && drag.i === i)) h.v = 0;
      }
      for (let i = 0; i < n; i++) {
        const h = st[i];
        const vel = h.x - h.px;
        h.px = h.x;
        // A hanger swings against the way it is moved, and settles back.
        const want = quiet ? 0 : Math.max(-14, Math.min(14, -vel * 1.5));
        h.w = (h.w + (want - h.a) * 0.07) * 0.88;
        h.a += h.w;
        const lift = i === picked ? 1 : 0;
        h.s += (lift - h.s) * (quiet ? 1 : 0.2);
        if (Math.abs(vel) > 0.02 || Math.abs(h.w) > 0.02 || Math.abs(h.a) > 0.05 || Math.abs(lift - h.s) > 0.002) busy = true;
      }
      paint();
      if (busy) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const at = (e: Event) => els.indexOf((e.target as HTMLElement).closest('.pc-cslip') as HTMLElement);
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const i = at(e);
      if (i < 0) return;
      moved = false;
      drag = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: st[i].x, on: false, last: e.clientX, vx: 0 };
    };
    const move = (e: PointerEvent) => {
      const d = drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx;
      if (!d.on) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - d.sy)) {
          d.on = moved = true;
          els[d.i].setPointerCapture(e.pointerId);
        } else if (Math.abs(e.clientY - d.sy) > 10) drag = null;
        return;
      }
      d.vx = d.vx * 0.6 + (e.clientX - d.last) * 0.4;
      d.last = e.clientX;
      place(d.i, d.x0 + dx);
      kick();
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      if (!d || d.id !== e.pointerId) return;
      drag = null;
      if (d.on && !quiet) st[d.i].v = Math.max(-24, Math.min(24, d.vx));
      kick();
    };
    const click = (e: MouseEvent) => {
      const i = at(e);
      if (i < 0) return;
      if (moved) {
        moved = false;
        return;
      }
      if (pickRef.current(shades[i])) {
        picked = i;
        els[i].classList.add('is-picked');
        kick();
      }
    };
    const key = (e: KeyboardEvent) => {
      const i = at(e);
      if (i < 0 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      st[i].v = e.key === 'ArrowLeft' ? -6 : 6;
      kick();
    };

    // Hung in: the doors' draught sets them swinging, rod by rod.
    paint();
    const tm = window.setTimeout(() => {
      if (quiet) return;
      st.forEach((h, i) => {
        h.a = -7 + (i % 3) * 1.5;
        h.w = 0;
      });
      kick();
    }, delay * 1000 + 200);

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('click', click);
    root.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(tm);
      cancelAnimationFrame(raf);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('click', click);
      root.removeEventListener('keydown', key);
    };
  }, [shades, len, delay]);

  return (
    <div className="pc-crod" style={{ top }}>
      <span aria-hidden className="pc-crod-bar" />
      <div ref={box} className="pc-crod-run" style={{ width: len }}>
        {shades.map((s, i) => (
          <button key={s.key} title={`${s.c.name} · ${s.x.name}`} aria-label={`${s.c.name}, ${s.x.name}`} className="pc-cslip" style={{ zIndex: i + 1 }}>
            <span aria-hidden className="pc-card-hook" />
            <span className="pc-card-head">
              <b>{s.c.name}</b>
              <i>
                {s.x.name} · {String(s.c.order).padStart(2, '0')}
              </i>
            </span>
            <span aria-hidden className="pc-card-cloth" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.1), transparent 30%, rgba(255,255,255,.08) 55%, rgba(0,0,0,.14)), ${fabricTex(s.x, s.c, 3)}` }} />
          </button>
        ))}
      </div>
    </div>
  );
}
