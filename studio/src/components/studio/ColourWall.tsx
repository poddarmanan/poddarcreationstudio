'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { fabricTex, spectrum } from './helpers';

/** A shade in a closet, with where it comes from. */
type Shade = { key: string; c: ColourRow; x: FabricRow; j: number };

// The closet's measures, in px.
const SLIDE_MAX = 680; // a closet's slot in the row, at most
/** The room either side of a closet, where its doors swing: more on a phone, where the closet fills the screen. */
const slidePad = (slideW: number) => (slideW < 520 ? 30 : 16);
const CROWN_H = 24; // room above a closet for its crown, kept inside its box so nothing clips it
const STILE = 12; // the closet's side walls
const INSIDE_PAD = 12; // from a wall to the ends of the slips' run
const ROWS = 4; // every closet holds its range on four rods, so all stand the same height
const INSIDE_TOP = 16;
const DOORS_SHUT_MS = 800; // the doors' swing shut, before the row moves on
const SPACING = 56; // a loose rod's slips hang no further apart than this
/** A slip's size and the rod's pitch: smaller in a phone's closet, so a closet fits on a screen. */
const sizes = (slideW: number) => (slideW < 520 ? { w: 64, h: 104, rod: 134 } : { w: 84, h: 124, rod: 156 });

/** A quality's shades, cut into the closet's rods, of about equal length. */
function hang(shades: Shade[]) {
  const per = Math.max(1, Math.ceil(shades.length / ROWS));
  const out: Shade[][] = [];
  for (let i = 0; i < shades.length; i += per) out.push(shades.slice(i, i + per));
  return out;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Each quality's closet is made differently: its wood or lacquer, its doors, its pulls, its crown,
 * the lining inside, and the room it stands in (the page's wall, washed in a colour suited to the
 * cloth, and a glow behind the closet). Qualities the table does not know take one in turn.
 */
type Door = 'panel' | 'arch' | 'fluted' | 'louvre' | 'cane' | 'jaali' | 'lacquer';
type Pull = 'knob' | 'bar' | 'ring' | 'tassel';
type Crown = 'flat' | 'arch' | 'pediment' | 'scallop';
type Look = { en: string; hi: string; door: Door; pull: Pull; crown: Crown; wood: [string, string, string]; metal: 'brass' | 'silver'; inside: string; room: [string, string, string]; tassel?: string };
const LOOKS: Record<string, Look> = {
  pcpc: { en: 'Whitewashed ash · fluted doors', hi: 'सफ़ेद ऐश · नालीदार दरवाज़े', door: 'fluted', pull: 'bar', crown: 'flat', wood: ['#EDE6DA', '#DED4C4', '#CBBFAC'], metal: 'brass', inside: '#4A4036', room: ['#F2F4F3', '#DEE5E8', '#C3D3DA'] },
  cambric: { en: 'Sage lacquer · shaker panels', hi: 'सेज लैकर · पैनल दरवाज़े', door: 'panel', pull: 'knob', crown: 'pediment', wood: ['#AEBBA3', '#9AA98F', '#86967B'], metal: 'brass', inside: '#2F3A2C', room: ['#F3F5ED', '#E1E9D7', '#C6D5B4'] },
  jaam11: { en: 'Teak · woven cane', hi: 'सागौन · बुनी बेंत', door: 'cane', pull: 'ring', crown: 'flat', wood: ['#9C6B3F', '#875A30', '#704A25'], metal: 'brass', inside: '#2E2014', room: ['#F7F0E4', '#EBDCC5', '#D9BD94'] },
  jaam125: { en: 'Rosewood · carved jaali', hi: 'शीशम · नक्काशीदार जाली', door: 'jaali', pull: 'ring', crown: 'arch', wood: ['#6E3427', '#5A281D', '#461D15'], metal: 'brass', inside: '#2A1410', room: ['#F8EDE7', '#EED4C8', '#DDAC97'] },
  lycra: { en: 'Light oak · louvred doors', hi: 'हल्का ओक · झिलमिली दरवाज़े', door: 'louvre', pull: 'bar', crown: 'flat', wood: ['#D6B98F', '#C4A378', '#AD8B61'], metal: 'silver', inside: '#3A2C1D', room: ['#EFF6F3', '#D9EBE4', '#B5D8CA'] },
  rayon14: { en: 'Powder-blue lacquer · arched panels', hi: 'हल्का नीला लैकर · मेहराबी पैनल', door: 'arch', pull: 'knob', crown: 'scallop', wood: ['#A7BDD0', '#91A9BE', '#7B93A9'], metal: 'silver', inside: '#1F2A36', room: ['#F1F3F9', '#DDE2F0', '#BCC6E3'] },
  rayon17: { en: 'Walnut · raised panels', hi: 'अखरोट · उभरे पैनल', door: 'panel', pull: 'knob', crown: 'pediment', wood: ['#6F4A2B', '#5E3D22', '#4F331C'], metal: 'brass', inside: '#2A1B10', room: ['#F5F0EA', '#E6DBCE', '#CDB8A1'] },
  slub: { en: 'Honey mango wood · cane', hi: 'शहद रंग आम की लकड़ी · बेंत', door: 'cane', pull: 'tassel', crown: 'scallop', wood: ['#C38D4C', '#AE7A3D', '#956530'], metal: 'brass', inside: '#33220F', room: ['#FBF4E3', '#F2E0BA', '#E4C283'], tassel: '#B5452F' },
  wrinkle: { en: 'Charcoal oak · fluted doors', hi: 'चारकोल ओक · नालीदार दरवाज़े', door: 'fluted', pull: 'bar', crown: 'flat', wood: ['#4C4946', '#3C3936', '#2C2A28'], metal: 'silver', inside: '#1A1918', room: ['#F3F2F4', '#E2DFE6', '#C6BFCF'] },
  roman: { en: 'Black lacquer & gold · velvet lined', hi: 'काला लैकर और सोना · मखमली अस्तर', door: 'lacquer', pull: 'tassel', crown: 'arch', wood: ['#2B2727', '#1F1C1C', '#141212'], metal: 'brass', inside: '#3E0F18', room: ['#F8EFEA', '#ECD9D0', '#D6B0A1'], tassel: '#9E1B2F' },
  gajji: { en: 'Crimson lacquer · jaali', hi: 'लाल लैकर · जाली', door: 'jaali', pull: 'ring', crown: 'arch', wood: ['#932537', '#7C1C2C', '#631522'], metal: 'brass', inside: '#2B0A10', room: ['#FAEEF0', '#F1D4DA', '#E1A8B5'] },
};
const LOOK_ORDER = Object.values(LOOKS);
const lookOf = (id: string, k: number) => LOOKS[id] ?? LOOK_ORDER[k % LOOK_ORDER.length];
const METAL = { brass: ['#F6E3A8', '#D2AC5C', '#8D6B28'], silver: ['#F7F7F4', '#C4C4BE', '#7A7972'] } as const;
/** A closet's look as the variables its CSS reads. */
const lookVars = (l: Look) =>
  ({
    ['--w1' as string]: l.wood[0],
    ['--w2' as string]: l.wood[1],
    ['--w3' as string]: l.wood[2],
    ['--in' as string]: l.inside,
    ['--m1' as string]: METAL[l.metal][0],
    ['--m2' as string]: METAL[l.metal][1],
    ['--m3' as string]: METAL[l.metal][2],
    ['--tassel' as string]: l.tassel ?? '#8A1F2B',
  }) as CSSProperties;

/** A door's face, by the closet's make. */
function DoorFace({ look, side }: { look: Look; side: 'left' | 'right' }) {
  const { door, pull } = look;
  return (
    <span className={`pc-door-face is-${door}`}>
      {door === 'panel' && (
        <>
          <span className="pc-door-panel is-top" />
          <span className="pc-door-panel is-bottom" />
        </>
      )}
      {door === 'arch' && (
        <>
          <span className="pc-door-panel is-archtop" />
          <span className="pc-door-panel is-bottom" />
        </>
      )}
      {door === 'fluted' && <span className="pc-door-flutes" />}
      {door === 'louvre' && (
        <>
          <span className="pc-door-louvres is-top" />
          <span className="pc-door-louvres is-bottom" />
        </>
      )}
      {door === 'cane' && (
        <>
          <span className="pc-door-cane is-top" />
          <span className="pc-door-cane is-bottom" />
        </>
      )}
      {door === 'jaali' && (
        <>
          <span className="pc-door-jaali" />
          <span className="pc-door-panel is-foot" />
        </>
      )}
      {door === 'lacquer' && (
        <span className="pc-door-lacquer">
          <span className="pc-door-lacquer-motif" />
        </span>
      )}
      <span className={`pc-pull is-${pull} is-${side}`}>
        {pull === 'ring' && <span className="pc-pull-ring" />}
        {pull === 'tassel' && <span className="pc-pull-tassel" />}
      </span>
    </span>
  );
}

/**
 * The Colour Closet: every quality is a walnut wardrobe of its own, in a row to swipe through (or
 * step through with the arrows, or pick from the list, in the bar pinned above). A closet's doors are shut until they are
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
  // One closet is open at a time. Leaving it (by swipe, flick, arrow or name) first shuts its
  // doors, and only once they have met does the row move on; the one arrived at stays shut until
  // tapped. While the doors shut, a second call is ignored.
  const [openId, setOpenId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const closing = useRef(0);
  const leaving = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(closing.current);
      window.clearTimeout(leaving.current);
    },
    [],
  );
  const goTo = (k: number) => {
    const next = fabrics[Math.max(0, Math.min(fabrics.length - 1, k))];
    if (!next || next.id === fab?.id || leaving.current) return;
    if (!openId) return studio.setWallFab(next.id);
    setClosingId(openId);
    setOpenId(null);
    window.clearTimeout(closing.current);
    leaving.current = window.setTimeout(() => {
      leaving.current = 0;
      studio.setWallFab(next.id);
      closing.current = window.setTimeout(() => setClosingId(null), 700);
    }, reduced() ? 0 : DOORS_SHUT_MS);
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
  // Where a swipe along the row may start: the closets and the line naming the one looked at.
  const zone = useRef<HTMLDivElement | null>(null);
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
  const pad = slidePad(slideW);
  const len = slideW - 2 * pad - 2 * STILE - 2 * INSIDE_PAD;
  const size = sizes(slideW);
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
  const openRef = useRef<string | null>(null);
  const baseRef = useRef(base);
  const goToRef = useRef(goTo);
  useEffect(() => {
    idxRef.current = idx;
    openRef.current = openId;
    baseRef.current = base;
    goToRef.current = goTo;
  });

  // Swiping the row: a sideways drag anywhere but along a rod of slips (which parts it). The page still scrolls up and down.
  const swipe = useRef<{ id: number; x: number; y: number; dx: number; on: boolean; run: HTMLElement | null } | null>(null);
  const swipedAt = useRef(0);
  useEffect(() => {
    const el = zone.current;
    const vw0 = view.current;
    const tr = track.current;
    if (!el || !vw0 || !tr) return;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Anywhere on a closet, the slips too: a quick sideways swipe moves the row. A rod held and
      // slid along is being browsed instead, and says so (data-scrub), and the swipe stands down.
      swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false, run: (e.target as HTMLElement).closest<HTMLElement>('.pc-crod-run') };
    };
    const move = (e: PointerEvent) => {
      const s = swipe.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (s.run?.dataset.scrub) {
        swipe.current = null;
        return;
      }
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
      // An open closet gives only a little: its doors will shut before the row moves.
      s.dx = atEnd ? dx * 0.3 : openRef.current ? dx * 0.35 : dx;
      tr.style.transform = `translate3d(${baseRef.current + s.dx}px,0,0)`;
    };
    const up = (e: PointerEvent) => {
      const s = swipe.current;
      if (!s || s.id !== e.pointerId) return;
      swipe.current = null;
      if (!s.on) return;
      swipedAt.current = e.timeStamp;
      tr.style.transition = 'transform .5s cubic-bezier(.22,.8,.2,1)';
      const w = Math.min(vw0.clientWidth, SLIDE_MAX);
      const raw = openRef.current ? s.dx / 0.35 : s.dx;
      const step = Math.abs(raw) > Math.min(70, w * 0.18) ? (raw < 0 ? 1 : -1) : 0;
      const wasOpen = !!openRef.current;
      if (step) goToRef.current(idxRef.current + step);
      // From an open closet the row settles back while the doors shut, then moves on its own.
      tr.style.transform = `translate3d(${baseRef.current - (wasOpen ? 0 : step * w)}px,0,0)`;
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

  // The closet arrived at opens by itself, once the page's curtain lifts.
  const firstId = useRef(fab?.id);
  useEffect(() => {
    const id = firstId.current;
    if (!id) return;
    const tm = window.setTimeout(() => setOpenId((o) => o ?? id), reduced() ? 0 : 950);
    return () => window.clearTimeout(tm);
  }, []);

  // The list of closets, opened from the name in the bar; shut by a tap outside it or Escape.
  const [listOpen, setListOpen] = useState(false);
  const bar = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!listOpen) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setListOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [listOpen]);

  // The room: the page's wall washed in the colour of the closet looked at, blending as the row
  // moves. It is one fixed layer behind the page, made here and taken away with the page.
  const room = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'pc-closet-room';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    room.current = el;
    return () => {
      el.remove();
      room.current = null;
    };
  }, []);
  useEffect(() => {
    const el = room.current;
    if (!el || !fab) return;
    const [a, b, c] = lookOf(fab.id, idx).room;
    el.style.setProperty('--cb1', a);
    el.style.setProperty('--cb2', b);
    el.style.setProperty('--cb3', c);
  }, [fab, idx]);

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
    else setOpenId(id);
  };

  return (
    <div className="pc-closetpage" style={{ padding: 'clamp(18px,3.5vw,40px) clamp(16px,5vw,64px) 80px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      {/* The page's name, and nothing more: the closets say the rest. */}
      <header className="pc-closet-head">
        <h1>
          {t.closetTitleA ?? 'The Colour'} <em>{t.closetTitleB ?? 'Closet'}</em>
        </h1>
        <div aria-hidden className="pc-closet-orn">
          <i />
          <b />
          <i />
        </div>
      </header>

      <div ref={zone}>
      {/* The one bar for moving between closets, pinned under the header: back, the closet looked
          at (its number over the count, its name, its shades; a tap lists them all), forward. */}
      <div ref={bar} className="pc-closet-count">
        <button className="pc-closet-step" aria-label="‹" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button className="pc-closet-pick" aria-haspopup="listbox" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
          <span className="pc-closet-no">
            <b>{String(idx + 1).padStart(2, '0')}</b>
            <i>/{fabrics.length}</i>
          </span>
          <span className="pc-closet-nm">{fab?.name}</span>
          <span className="pc-closet-sh">
            {fab?.colours.length} {t.shades}
          </span>
          <svg className="pc-closet-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button className="pc-closet-step" aria-label="›" disabled={idx === fabrics.length - 1} onClick={() => goTo(idx + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {listOpen && (
          <div className="pc-closet-list" role="listbox" aria-label={t.colourWall}>
            {fabrics.map((f, k) => {
              const look = lookOf(f.id, k);
              return (
                <button
                  key={f.id}
                  role="option"
                  aria-selected={k === idx}
                  className={k === idx ? 'is-on' : undefined}
                  style={{ ...lookVars(look), animationDelay: `${k * 18}ms` }}
                  onClick={() => {
                    setListOpen(false);
                    goTo(k);
                  }}
                >
                  <span aria-hidden className="pc-closet-list-wood" />
                  <b>{String(k + 1).padStart(2, '0')}</b>
                  <span className="pc-closet-list-nm">
                    {f.name}
                    <i>{look[studio.lang === 'hi' ? 'hi' : 'en']}</i>
                  </span>
                  <em>{f.colours.length}</em>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={view} className={`pc-closets${size.w < 80 ? ' is-compact' : ''}`} style={{ ['--sw' as string]: `${size.w}px`, ['--sh' as string]: `${size.h}px`, ['--rod' as string]: `${size.rod}px` } as CSSProperties}>
        <div ref={track} className="pc-closets-track">
          {vw > 0 &&
            fabrics.map((f, k) => {
              const rods = hang(runs[k]);
              const look = lookOf(f.id, k);
              const isOpen = openId === f.id;
              const isClosing = closingId === f.id;
              const here = k === idx;
              return (
                <div
                  key={f.id}
                  className={`pc-closet${isOpen ? ' is-open' : ''}${isClosing ? ' is-closing' : ''}${here ? ' is-here' : ''}${k < idx ? ' is-before' : k > idx ? ' is-after' : ''}`}
                  style={{ width: slideW, padding: `${CROWN_H}px ${pad}px 18px`, ...lookVars(look) }}
                  onClick={(e) => tapCloset(e, k, f.id)}
                >
                  <div className={`pc-closet-top is-${look.crown}`}>
                    <span className="pc-closet-plaque">
                      <i>No. {String(k + 1).padStart(2, '0')}</i>
                      <b>{f.name}</b>
                    </span>
                  </div>
                  <div className="pc-closet-body" style={{ height: INSIDE_TOP + ROWS * size.rod + 6 }}>
                    <div className="pc-closet-inside">
                      <span aria-hidden className="pc-closet-lamp" />
                      {(isOpen || isClosing) &&
                        rods.map((rod, r) => (
                          <Rod key={`${len}-${r}`} shades={rod} len={len} slipW={size.w} top={INSIDE_TOP + r * size.rod} delay={r * 0.12} onPick={pick} onFlick={(dir) => goTo(idx + dir)} />
                        ))}
                    </div>
                    {(['left', 'right'] as const).map((side) => (
                      <button key={side} aria-label={`${t.closetOpen ?? 'Open'} · ${f.name}`} tabIndex={isOpen ? -1 : 0} aria-hidden={isOpen} className={`pc-door is-${side}`}>
                        <DoorFace look={look} side={side} />
                        <span className="pc-door-face is-back">
                          {side === 'left' ? <span className="pc-door-mirror" /> : <span className="pc-door-panel is-inner" />}
                        </span>
                      </button>
                    ))}
                    {!isOpen && !isClosing && here && <span className="pc-closet-tag">{t.closetOpen ?? 'Open'}</span>}
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
      </div>
      {/* What the closet is made of, and once it is open, how to look through it. */}
      {fab && <p key={fab.id} className="pc-closet-make">{lookOf(fab.id, idx)[studio.lang === 'hi' ? 'hi' : 'en']}</p>}
      {fab && openId === fab.id && <p className="pc-closet-hint">{t.slideHint}</p>}
    </div>
  );
}

/**
 * One rod of slips, packed close as in a closet. A finger drawn along the rod (or the pointer
 * moved over it) parts the slips around it, as a hand parts hangers: the one there is given its
 * full width and turns to face you, its neighbours part a little, and the rest close up. A quick
 * flick along it is a swipe to the next closet. A tap on a packed slip parts the rod there; a tap
 * on the parted slip takes it out. Each slip swings from
 * its hook as it moves. Everything is moved a frame at a time, and only while something moves.
 */
function Rod({
  shades, len, slipW, top, delay, onPick, onFlick,
}: {
  shades: Shade[]; len: number; slipW: number; top: number; delay: number; onPick: (s: Shade) => boolean; onFlick: (dir: 1 | -1) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const pickRef = useRef(onPick);
  const flickRef = useRef(onFlick);
  useEffect(() => {
    pickRef.current = onPick;
    flickRef.current = onFlick;
  });

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.pc-cslip'));
    const n = els.length;
    const quiet = reduced();
    const W = slipW;
    const room = Math.max(0, len - W);
    const MIN = 3; // a packed slip's edge, at the least

    // Where each slip hangs for a rod parted at `f` (none: evenly, or bunched left on a loose rod).
    const layout = (f: number) => {
      if (n < 2) return [0];
      const g = new Array<number>(n - 1).fill(0);
      if (f < 0) {
        g.fill(Math.min(room / (n - 1), SPACING));
      } else {
        const want = new Map<number, number>();
        if (f < n - 1) want.set(f, W + 6);
        for (const [d, k] of [[1, 0.5], [2, 0.28]] as const) {
          if (f - d >= 0) want.set(f - d, W * k);
          if (f + d < n - 1) want.set(f + d, W * k * 0.8);
        }
        let special = 0;
        want.forEach((v) => (special += v));
        const others = n - 1 - want.size;
        let each = others ? (room - special) / others : 0;
        let scale = 1;
        if (others && each < MIN) {
          scale = Math.max(0, (room - others * MIN) / special);
          each = MIN;
        } else if (!others && special > room) scale = room / special;
        for (let i = 0; i < n - 1; i++) g[i] = want.has(i) ? want.get(i)! * scale : Math.min(each, SPACING * 1.4);
      }
      const x = [0];
      for (let i = 0; i < n - 1; i++) x.push(x[i] + g[i]);
      return x;
    };

    let focus = -1;
    let target = layout(focus);
    const st = els.map((_, i) => ({ x: target[i], px: target[i], a: 0, w: 0, s: 0 }));
    let picked = -1;
    let raf = 0;

    const paint = () => {
      for (let i = 0; i < n; i++) {
        const h = st[i];
        const gap = i < n - 1 ? st[i + 1].x - h.x : W;
        const turn = 36 * Math.max(0, Math.min(1, (W - gap) / (W - MIN))) * (1 - h.s);
        els[i].style.transform = `translate3d(${h.x.toFixed(2)}px,${(h.s * 8).toFixed(2)}px,0) rotateZ(${h.a.toFixed(2)}deg) rotateY(${turn.toFixed(2)}deg) scale(${(1 + h.s * 0.12).toFixed(3)})`;
      }
    };
    const frame = () => {
      raf = 0;
      let busy = false;
      for (let i = 0; i < n; i++) {
        const h = st[i];
        h.x += (target[i] - h.x) * (quiet ? 1 : 0.2);
        const vel = h.x - h.px;
        h.px = h.x;
        // A hanger swings against the way it is moved, and settles back.
        const want = quiet ? 0 : Math.max(-12, Math.min(12, -vel * 1.3));
        h.w = (h.w + (want - h.a) * 0.07) * 0.88;
        h.a += h.w;
        const lift = i === picked ? 1 : 0;
        h.s += (lift - h.s) * (quiet ? 1 : 0.2);
        if (Math.abs(target[i] - h.x) > 0.05 || Math.abs(h.w) > 0.02 || Math.abs(h.a) > 0.05 || Math.abs(lift - h.s) > 0.002) busy = true;
      }
      paint();
      if (busy) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const part = (f: number) => {
      const next = Math.max(-1, Math.min(n - 1, f));
      if (next === focus) return;
      focus = next;
      target = layout(focus);
      els.forEach((el, i) => el.classList.toggle('is-parted', i === focus));
      kick();
    };
    // The rod is read in even zones, one to a slip, so parting it never moves what is under the finger.
    const zone = (clientX: number) => Math.floor(((clientX - root.getBoundingClientRect().left) / len) * n);

    const at = (e: Event) => els.indexOf((e.target as HTMLElement).closest('.pc-cslip') as HTMLElement);
    // A finger drawn along the rod parts it as it goes, and the row's swipe stands down (the rod
    // says so, data-scrub). A quick flick instead (short and fast) is a swipe to the next closet.
    let drag: { id: number; sx: number; sy: number; t0: number; on: boolean } | null = null;
    let moved = false;
    const release = () => {
      delete root.dataset.scrub;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // a mouse parts the rod by passing over it, and drags the row
      moved = false;
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: e.timeStamp, on: false };
    };
    const move = (e: PointerEvent) => {
      const d = drag;
      if (!d) {
        if (e.pointerType === 'mouse') part(zone(e.clientX));
        return;
      }
      if (d.id !== e.pointerId) return;
      if (!d.on) {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          d.on = moved = true;
          root.dataset.scrub = '1';
          try {
            root.setPointerCapture(d.id);
          } catch {}
        } else if (Math.abs(dy) > 10) {
          drag = null;
          return;
        }
        if (!d.on) return;
      }
      part(zone(e.clientX));
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      if (d && d.id === e.pointerId) {
        drag = null;
        const dx = e.clientX - d.sx;
        const ms = Math.max(1, e.timeStamp - d.t0);
        // A flick: short, and fast (over 0.3px a millisecond), not a browse.
        if (d.on && ms < 380 && Math.abs(dx) > 44 && Math.abs(dx) / ms > 0.3) flickRef.current(dx < 0 ? 1 : -1);
      }
      release();
    };
    const click = (e: MouseEvent) => {
      const i = at(e);
      if (i < 0) return;
      if (moved) {
        moved = false;
        return;
      }
      // A mouse has parted the rod at the slip it is over; a finger parts it with the first tap.
      if (i !== focus && !(e.detail > 0 && focus >= 0 && Math.abs(i - focus) <= 1 && matchMedia('(hover: hover)').matches)) return part(i);
      const take = focus >= 0 ? focus : i;
      if (pickRef.current(shades[take])) {
        picked = take;
        els[take].classList.add('is-picked');
        kick();
      }
    };
    const onFocus = (e: FocusEvent) => {
      const i = at(e);
      if (i >= 0) part(i);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = Math.max(0, Math.min(n - 1, (focus < 0 ? 0 : focus) + (e.key === 'ArrowLeft' ? -1 : 1)));
      els[next].focus();
    };

    // Hung in: the doors' draught sets them swinging, rod by rod.
    paint();
    const tm = window.setTimeout(() => {
      if (quiet) return;
      st.forEach((h, i) => {
        h.a = -6 + (i % 3) * 1.5;
        h.w = 0;
      });
      kick();
    }, delay * 1000 + 200);

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('click', click);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(tm);
      release();
      cancelAnimationFrame(raf);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('click', click);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('keydown', key);
    };
  }, [shades, len, slipW, delay]);

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
                {s.x.name} · {String(s.c.order + 1).padStart(2, '0')}
              </i>
            </span>
            <span aria-hidden className="pc-card-cloth" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.1), transparent 30%, rgba(255,255,255,.08) 55%, rgba(0,0,0,.14)), ${fabricTex(s.x, s.c, 3)}` }} />
          </button>
        ))}
      </div>
    </div>
  );
}
