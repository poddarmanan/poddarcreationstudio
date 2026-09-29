'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Studio, Pin } from './state';
import type { FabricRow, ColourRow } from '@/lib/types';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';
import { BookCeremony } from './BookCeremony';

export type Cutting = { pin: Pin; colour: ColourRow };

export function roman(n: number) {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out;
}

// The book's materials, drawn once as small SVG tiles.
const svgTile = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;
/** Pebbled morocco: fine noise lit from the upper left, laid over the leather in overlay. */
const GRAIN = svgTile(
  `<filter id='g' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='.62' numOctaves='3' stitchTiles='stitch'/><feDiffuseLighting lighting-color='#fff' surfaceScale='1.5'><feDistantLight azimuth='225' elevation='58'/></feDiffuseLighting></filter><rect width='100%' height='100%' filter='url(#g)'/>`,
  180, 180,
);
/** Cotton-rag paper: a faint warm tooth. */
const PAPER = svgTile(
  `<filter id='p' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .42  0 0 0 0 .31  0 0 0 0 .18  .16 0 0 0 -.03'/></filter><rect width='100%' height='100%' filter='url(#p)'/>`,
  220, 220,
);
/** Marbled endpaper, in the leather's oxblood with cream, gold and ink. */
export const MARBLE = svgTile(
  `<filter id='m' x='0' y='0'><feTurbulence type='turbulence' baseFrequency='.006 .028' numOctaves='3' seed='11'/><feColorMatrix values='2.2 0 0 0 0  2.2 0 0 0 0  2.2 0 0 0 0  0 0 0 0 1'/><feComponentTransfer><feFuncR type='discrete' tableValues='.353 .937 .769 .122 .627 .937 .353 .769'/><feFuncG type='discrete' tableValues='.102 .890 .604 .165 .278 .890 .102 .604'/><feFuncB type='discrete' tableValues='.122 .784 .322 .227 .290 .784 .122 .322'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#m)'/>`,
  320, 420,
);
export const LEATHER = 'radial-gradient(130% 95% at 22% 8%, #5E1B21 0%, #40101A 44%, #2A080D 100%)';
const BRASS = 'linear-gradient(135deg, #F6E3A8 0%, #C9A04B 28%, #8A6524 52%, #D8B866 76%, #9C7630 100%)';
export const GOLD = '#CDA960';
export const INK = '#1C1917';
export const UMBER = '#8A6D45';

/** Cuttings per sheet, and how a sheet's slots are laid out for a number of cuttings: [columns, rows]. */
const PER_SHEET = 9;
const sheetGrid = (n: number): [number, number] => (n <= 1 ? [1, 1] : n <= 2 ? [1, 2] : n <= 4 ? [2, 2] : n <= 6 ? [2, 3] : [3, 3]);
/** The cutting area's height over its width, on a 3 : 4 sheet less its head and foot. */
const AREA_ASPECT = 1.13;

type Group = { x: FabricRow; items: Cutting[] };
type Sheet = { key: string; g: number; kind: 'title' } | { key: string; g: number; kind: 'plate'; page: number; pages: number; items: Cutting[] };

/**
 * The Swatch Book while it is being chosen: a stack of loose sheets, one fabric after another. Each
 * fabric opens on its title sheet; sliding it left opens that fabric's sheets of cuttings (nine to a
 * sheet, scattered, pinned and labelled), and sliding right from a title skips to the next fabric.
 * Sliding on past a fabric's last sheet comes to the next fabric's title; sliding right on a sheet
 * of cuttings goes back a sheet. The heading above names the fabric under the hand, and its arrows
 * and chapter numerals jump between fabrics. Ordering binds the sheets into the book.
 */
export function SwatchBook({ studio }: { studio: Studio }) {
  const { t, fabrics, pins } = studio;

  const groups: Group[] = fabrics
    .map((x) => ({
      x,
      items: pins
        .filter((p) => p.fabricId === x.id)
        .map((p) => ({ pin: p, colour: x.colours.find((c) => c.order === p.colourOrder) }))
        .filter((c): c is Cutting => !!c.colour),
    }))
    .filter((g) => g.items.length);

  const sheets: Sheet[] = groups.flatMap((g, gi) => {
    const pages = Math.ceil(g.items.length / PER_SHEET);
    return [
      { key: `${g.x.id}:title`, g: gi, kind: 'title' as const },
      ...Array.from({ length: pages }, (_, page) => ({ key: `${g.x.id}:${page}`, g: gi, kind: 'plate' as const, page, pages, items: g.items.slice(page * PER_SHEET, (page + 1) * PER_SHEET) })),
    ];
  });

  const [pos, setPos] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const found = sheets.findIndex((s) => s.key === pos.key);
  const at = found >= 0 ? found : Math.min(pos.index, Math.max(0, sheets.length - 1));
  const sheet = sheets[at];
  // Which way the top sheet is being slid (-1 left, 1 right): it decides which sheet lies beneath.
  const [side, setSide] = useState<-1 | 0 | 1>(0);
  const topRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{ dir: 1 | -1; target: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean; dx: number } | null>(null);
  const dragged = useRef(false);
  const wheel = useRef({ dx: 0, t: 0 });

  const titleOf = (g: number) => sheets.findIndex((s) => s.g === g && s.kind === 'title');
  const forwardOf = (i: number) => (i + 1) % sheets.length;
  const backOf = (i: number) => (sheets[i].kind === 'title' ? titleOf((sheets[i].g + 1) % groups.length) : i - 1);

  /** Throws the top sheet off to one side (-1 left, 1 right) and brings `target` up from beneath. */
  const flyTo = (target: number, dir: 1 | -1) => {
    if (flying || target === at || target < 0) return;
    setFlying({ dir, target });
    window.setTimeout(() => {
      setPos({ key: sheets[target].key, index: target });
      setFlying(null);
      setSide(0);
    }, 420);
  };
  const forward = () => flyTo(forwardOf(at), -1);
  const back = () => flyTo(backOf(at), 1);
  const toFabric = (g: number) => {
    const target = titleOf(((g % groups.length) + groups.length) % groups.length);
    flyTo(target, g > sheet.g ? -1 : 1);
  };
  const flyRef = useRef({ forward, back });
  useEffect(() => {
    flyRef.current = { forward, back };
  });

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.dx = e.clientX - d.x;
      if (Math.abs(d.dx) > 6) d.moved = true;
      // The sheet follows the finger directly, without a render: only a change of side re-renders.
      const el = topRef.current;
      if (el) el.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 40}deg)`;
      const next = d.dx < 0 ? -1 : d.dx > 0 ? 1 : 0;
      setSide((was) => (was === next ? was : next));
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      dragged.current = !!d?.moved;
      setDragging(false);
      if (d && d.moved && Math.abs(d.dx) > 70) {
        if (d.dx < 0) flyRef.current.forward();
        else flyRef.current.back();
      } else {
        // Short of the threshold, the sheet falls back into place.
        const el = topRef.current;
        if (el) {
          el.style.transition = 'transform .55s cubic-bezier(.22,.8,.2,1), box-shadow .4s ease';
          el.style.transform = 'translateX(0px) rotate(0deg)';
        }
        setSide(0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  if (!sheet) return <EmptyBook studio={studio} />;
  const group = groups[sheet.g];
  const under = flying ? flying.target : side > 0 ? backOf(at) : forwardOf(at);
  const shown = under >= 0 && under !== at ? [sheets[under], sheet] : [sheet];

  return (
    <Room>
      <div style={{ textAlign: 'center', userSelect: 'none', WebkitUserSelect: 'none' }}>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(40px,7vw,64px)', lineHeight: 1.02, color: INK }}>{t.book}</h1>
        <div style={{ marginTop: 12 }}>
          <Fleuron width={30} color="rgba(138,109,69,.7)" />
        </div>
        {groups.length > 1 && (
          // The fabrics in the book, by their numerals: the one open is underlined in gold.
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
            {groups.map((g, i) => (
              <button
                key={g.x.id}
                aria-label={`${t.chapterWord} ${roman(i + 1)}: ${g.x.name}`}
                aria-current={i === sheet.g ? 'true' : undefined}
                onClick={() => i !== sheet.g && toFabric(i)}
                style={{
                  position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px 7px', fontFamily: FONT_DISPLAY,
                  fontSize: i === sheet.g ? 17 : 15, color: i === sheet.g ? UMBER : 'rgba(138,109,69,.45)', transition: 'color .5s ease, font-size .5s ease',
                }}
              >
                {roman(i + 1)}
                <span aria-hidden className="pc-foil-bg" style={{ position: 'absolute', left: '50%', bottom: 2, height: 1, width: i === sheet.g ? 18 : 0, transform: 'translateX(-50%)', transition: 'width .6s cubic-bezier(.22,.8,.2,1)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The stack of loose sheets. */}
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="sheets"
        aria-label={`${group.x.name}: ${sheet.kind === 'title' ? `${t.chapterWord} ${roman(sheet.g + 1)}` : `${t.sheetWord} ${sheet.page + 1} / ${sheet.pages}`}. ${sheet.kind === 'title' ? `${t.slideOpen}, ${t.slideSkip}` : `${t.slideMore}, ${t.slideBack}`}.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') forward();
          if (e.key === 'ArrowLeft') back();
        }}
        onPointerDown={(e) => {
          if (flying || e.button > 0) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false, dx: 0 };
          setDragging(true);
        }}
        onClickCapture={(e) => {
          // A slide is not a tap on a cutting.
          if (!dragged.current) return;
          dragged.current = false;
          e.stopPropagation();
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          if (e.timeStamp - wheel.current.t > 400) wheel.current.dx = 0;
          wheel.current = { dx: wheel.current.dx + e.deltaX, t: e.timeStamp };
          if (Math.abs(wheel.current.dx) > 70) {
            if (wheel.current.dx > 0) forward();
            else back();
            wheel.current.dx = -1e6 * Math.sign(wheel.current.dx);
          }
        }}
        style={{
          position: 'relative', width: 'min(100%, 440px)', aspectRatio: '3 / 4', margin: 'clamp(24px,4vw,34px) auto 0', outline: 'none',
          touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: dragging ? 'grabbing' : 'grab', animation: 'rise 1s .1s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', left: '4%', right: '2%', bottom: -14, height: 30, background: 'radial-gradient(closest-side, rgba(46,26,10,.3), transparent)', filter: 'blur(3px)' }} />
        {/* Sheets further down the stack, showing at the edges. */}
        <div aria-hidden style={{ ...SHEET_BASE, background: 'linear-gradient(180deg, #EFE9DC, #E6DCC8)', transform: 'translate(-7px, 7px) rotate(-2.4deg)' }} />
        <div aria-hidden style={{ ...SHEET_BASE, background: 'linear-gradient(180deg, #F5F0E4, #ECE3D1)', transform: 'translate(6px, 4px) rotate(1.7deg)' }} />
        {shown.map((s) => {
          const top = s.key === sheet.key;
          const transform = top ? (flying ? `translateX(${flying.dir * 125}%) rotate(${flying.dir * 9}deg)` : 'translateX(0px) rotate(0deg)') : 'rotate(-.7deg)';
          return (
            <div
              key={s.key}
              ref={top ? topRef : undefined}
              aria-hidden={!top || undefined}
              style={{
                // Each sheet is its own layer, so sliding it moves pixels already painted.
                ...SHEET_BASE, zIndex: top ? 3 : 2, transform, willChange: 'transform', contain: 'layout paint',
                boxShadow: top && (dragging || flying) ? '0 22px 40px rgba(40,24,10,.26), 0 2px 6px rgba(40,24,10,.12)' : SHEET_BASE.boxShadow,
                transition: dragging && top ? 'none' : flying && top ? 'transform .42s cubic-bezier(.25,.6,.35,1), box-shadow .3s ease' : 'transform .55s cubic-bezier(.22,.8,.2,1), box-shadow .4s ease',
              }}
            >
              <SheetFace studio={studio} sheet={s} group={groups[s.g]} interactive={top && !flying} />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: 'rise 1s .5s cubic-bezier(.22,.8,.2,1) both' }}>
        <Fleuron width={26} color="rgba(138,109,69,.6)" />
        <p style={{ margin: 0, maxWidth: 320, textAlign: 'center', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: 'rgba(28,25,23,.58)' }}>{t.looseNote}</p>
      </div>

      {/* The book's actions: order it — every shade in it, across all its fabrics — or see it bound first. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20, animation: 'rise 1s .35s cubic-bezier(.22,.8,.2,1) both' }}>
        <button
          onClick={studio.openQuoteBook}
          className="pc-book"
          style={{
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: 'min(100%, 460px)',
            borderRadius: 999, padding: '16px 18px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            background: 'linear-gradient(135deg, rgba(255,255,255,.72), rgba(250,248,245,.4))', color: INK, border: '1px solid rgba(201,169,110,.5)',
          }}
        >
          <span aria-hidden className="pc-book-star">✦</span>
          {t.orderBook}
        </button>
        <button
          onClick={() => setPreview(true)}
          className="pc-hv-ink"
          style={{ cursor: 'pointer', marginTop: 14, background: 'none', border: 'none', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(28,25,23,.62)' }}
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={UMBER} strokeWidth="1.4" strokeLinejoin="round">
            <path d="M3 5.5c3-1.3 6-1.3 9 .5v13c-3-1.8-6-1.8-9-.5v-13ZM21 5.5c-3-1.3-6-1.3-9 .5v13c3-1.8 6-1.8 9-.5v-13Z" />
          </svg>
          {t.previewBook}
        </button>
        <div style={{ marginTop: 6, fontSize: 11, letterSpacing: '.06em', color: 'rgba(28,25,23,.5)', fontVariantNumeric: 'lining-nums' }}>
          {studio.pins.length} {studio.pins.length === 1 ? t.shade : t.shades} · {groups.length} {groups.length === 1 ? t.fabricWordOne : t.fabricWordMany}
        </div>
      </div>
      {preview && <BookCeremony studio={studio} mode="preview" onDone={() => setPreview(false)} />}
    </Room>
  );
}

/** The reading room the book is read in: warm light pooling on it from above, and a darker surface beneath. */
function Room({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <div className="pc-view" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(26px,5vw,52px) clamp(16px,5vw,64px) 90px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(70% 42% at 50% 30%, rgba(255,246,228,.95), transparent 70%), linear-gradient(180deg, #F3ECE1 0%, #EBE1D2 46%, #DCCDB6 72%, #CDBC9F 88%, #E8DFD0 100%)' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(60,44,28,.16))' }} />
      <div style={{ position: 'relative', zIndex: 1, ...(center ? { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' } : {}) }}>{children}</div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: UMBER }}>
      <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(90deg, transparent, ${UMBER})`, opacity: 0.7 }} />
      <span>{children}</span>
      <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(270deg, transparent, ${UMBER})`, opacity: 0.7 }} />
    </div>
  );
}

// ─── The binding ────────────────────────────────────────────────────────────────────────────────

/** Leather grain, laid over whatever it sits in. */
function Grain({ radius, strength = 0.32 }: { radius?: string; strength?: number }) {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radius, background: GRAIN, mixBlendMode: 'overlay', opacity: strength, pointerEvents: 'none' }} />;
}

/** A brass corner protector over the board's outer corner. */
function BrassCorner({ at }: { at: 'top' | 'bottom' }) {
  const top = at === 'top';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', right: -1, [top ? 'top' : 'bottom']: -1, width: 28, height: 28, pointerEvents: 'none',
        [top ? 'borderTopRightRadius' : 'borderBottomRightRadius']: 10,
        clipPath: top ? 'polygon(0 0, 100% 0, 100% 100%)' : 'polygon(100% 0, 100% 100%, 0 100%)',
        background: `radial-gradient(circle at ${top ? '78% 22%' : '78% 78%'}, rgba(255,250,225,.75) 0 1.6px, rgba(90,62,20,.6) 2.2px, transparent 3px), ${BRASS}`,
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.4))',
      }}
    />
  );
}

/** The spine at the hinge: rounded leather with four raised bands, each between gold fillets. */
function Spine() {
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 26, borderRadius: '6px 0 0 6px', overflow: 'hidden', background: 'linear-gradient(90deg, #170405 0%, #4C141A 38%, #3A0E13 62%, #1A0507 100%)' }}>
      <Grain strength={0.28} />
      {[13, 37, 63, 87].map((y) => (
        <div key={y} style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, transform: 'translateY(-50%)' }}>
          <div className="pc-foil-bg" style={{ height: 1, opacity: 0.9 }} />
          <div style={{ height: 7, margin: '2px 0', background: 'linear-gradient(180deg, rgba(255,214,196,.2), rgba(0,0,0,.05) 45%, rgba(0,0,0,.45))' }} />
          <div className="pc-foil-bg" style={{ height: 1, opacity: 0.9 }} />
        </div>
      ))}
    </div>
  );
}

/** A tooled corner ornament: a curled quarter-rosette in gold, turned to fit its corner. */
function CornerOrnament({ corner, inset, size = 22 }: { corner: 'tl' | 'tr' | 'bl' | 'br'; inset: number; size?: number }) {
  const flip = { tl: 'none', tr: 'scaleX(-1)', bl: 'scaleY(-1)', br: 'scale(-1,-1)' }[corner];
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={GOLD}
      strokeWidth="1"
      strokeLinecap="round"
      style={{ position: 'absolute', [corner[0] === 't' ? 'top' : 'bottom']: inset, [corner[1] === 'l' ? 'left' : 'right']: inset, transform: flip, pointerEvents: 'none' }}
    >
      <path d="M1 1h9M1 1v9" />
      <path d="M4.5 4.5c5 0 7.5 2.6 6 5.4-1.2 2.1-3.8 1.3-3.2-.6" />
      <path d="M4.5 4.5c0 5 2.6 7.5 5.4 6 2.1-1.2 1.3-3.8-.6-3.2" />
      <circle cx="14.5" cy="14.5" r="1.1" fill={GOLD} stroke="none" />
      <path d="M1 1l2.2 2.2" />
    </svg>
  );
}

/** A small printer's rule: two hairlines and a diamond. */
export function Fleuron({ width = 30, color = GOLD }: { width?: number; color?: string }) {
  return (
    <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
      <span style={{ width, height: 1, background: `linear-gradient(90deg, transparent, ${color})` }} />
      <span style={{ width: 5, height: 5, transform: 'rotate(45deg)', background: color }} />
      <span style={{ width, height: 1, background: `linear-gradient(270deg, transparent, ${color})` }} />
    </div>
  );
}

/** A brass binding post, its slotted head sunk in the leather. */
function Screw({ y, x, turn, glow }: { y: number; x: number; turn?: string; glow?: string }) {
  return (
    <span
      style={{
        position: 'absolute', left: x, top: `${y}%`, width: 10, height: 10, transform: 'translate(-50%,-50%)', borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #FFF4CF, #D9B464 35%, #8A6524 75%, #5E4214)',
        boxShadow: '0 1px 1.5px rgba(0,0,0,.6), inset 0 0 0 .5px rgba(60,40,10,.6), 0 0 0 1.5px rgba(0,0,0,.25)',
        animation: glow,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, animation: turn }}>
        <span style={{ position: 'absolute', left: 2, right: 2, top: '50%', height: 1.2, marginTop: -0.6, background: 'rgba(70,45,12,.8)', transform: 'rotate(-35deg)' }} />
      </span>
    </span>
  );
}

/** Two brass rivets on a plate, top and bottom. */
function Rivets() {
  const dot = { position: 'absolute' as const, left: '50%', width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FFF6D8, #B08A3E 60%, #6B4C18)', boxShadow: '0 .5px 1px rgba(0,0,0,.5)' };
  return (
    <>
      <span style={{ ...dot, top: 5 }} />
      <span style={{ ...dot, bottom: 5 }} />
    </>
  );
}

/** The brass catch on the back board's fore-edge, which the clasp fastens over. */
function Catch() {
  return (
    <div aria-hidden style={{ position: 'absolute', right: -7, top: '50%', width: 11, height: 46, marginTop: -23, borderRadius: '0 5px 5px 0', background: 'linear-gradient(90deg, #7D5E22, #D8B866 40%, #F6E3A8 55%, #B8913F 80%, #7D5E22)', boxShadow: '1px 1px 2px rgba(0,0,0,.4)' }}>
      <Rivets />
    </div>
  );
}

/**
 * The fore-edge clasp: a stitched leather strap across the cover's right edge ending in a brass plate
 * over the catch; it can be animated sliding on (as the book is fastened) or off.
 */
function Clasp({ animation }: { animation?: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', right: -9, top: '50%', width: 84, height: 34, marginTop: -17, animation }}>
      <div style={{ position: 'absolute', inset: '0 8px 0 0', borderRadius: '17px 3px 3px 17px', overflow: 'hidden', background: 'linear-gradient(180deg, #52151C, #300A0F)', boxShadow: '0 3px 7px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,220,200,.16)' }}>
        <Grain />
        <div style={{ position: 'absolute', inset: 4, borderRadius: '13px 2px 2px 13px', border: '1px dashed rgba(215,182,112,.75)' }} />
      </div>
      <div style={{ position: 'absolute', right: 0, top: -6, bottom: -6, width: 20, borderRadius: '6px 4px 4px 6px', background: 'linear-gradient(90deg, #8A6524, #E6CB85 35%, #F8E9B8 50%, #C9A04B 72%, #7D5E22)', boxShadow: '0 2px 4px rgba(0,0,0,.5), inset 0 0 0 .5px rgba(60,40,10,.5)' }}>
        <Rivets />
        <span style={{ position: 'absolute', left: 4, right: 4, top: '50%', height: 1, background: 'rgba(90,62,20,.55)' }} />
      </div>
    </div>
  );
}

/**
 * The front cover: oxblood morocco, a blind-tooled frame, a double gold fillet with ornaments at its
 * corners, a monogram cartouche, the title in gold foil, and — for a signed-in buyer — their name.
 */
export function CoverFace({ t, userName, line, claspAnimation }: { t: Record<string, string>; userName: string | null; line?: string; claspAnimation?: string }) {
  return (
    <>
    <div style={{ position: 'absolute', inset: 0, borderRadius: '0 10px 10px 0', background: LEATHER, overflow: 'hidden', boxShadow: 'inset 16px 0 22px -16px rgba(0,0,0,.75), inset 0 0 0 1px rgba(0,0,0,.35)' }}>
      <Grain />
      {/* The hinge groove, pressed into the board beside the spine. */}
      <div aria-hidden style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 4, background: 'linear-gradient(90deg, rgba(0,0,0,.4), rgba(255,220,200,.07))' }} />
      <div aria-hidden style={{ position: 'absolute', inset: '14px 14px 14px 22px', border: '1px solid rgba(0,0,0,.4)', boxShadow: '1px 1px 0 rgba(255,220,200,.07), inset 1px 1px 0 rgba(255,220,200,.07)', borderRadius: 2 }} />
      <div aria-hidden style={{ position: 'absolute', inset: '24px 24px 24px 32px', border: `1px solid ${GOLD}`, opacity: 0.9 }} />
      <div aria-hidden style={{ position: 'absolute', inset: '28px 28px 28px 36px', border: `.5px solid ${GOLD}`, opacity: 0.55 }} />
      <div aria-hidden style={{ position: 'absolute', inset: '31px 31px 31px 39px' }}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => <CornerOrnament key={c} corner={c} inset={0} />)}
      </div>
      <BrassCorner at="top" />
      <BrassCorner at="bottom" />
      <div style={{ position: 'absolute', inset: '40px 40px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.6))' }}>
        <div className="pc-foil" style={{ fontSize: 8.5, letterSpacing: '.42em', textTransform: 'uppercase', paddingLeft: '.42em', whiteSpace: 'nowrap' }}>Poddar Creation</div>
        {/* The monogram, in an oval cartouche. */}
        <div style={{ position: 'relative', width: 'clamp(70px,20vw,88px)', aspectRatio: '4 / 5', margin: '16px 0 14px', display: 'grid', placeItems: 'center' }}>
          <svg aria-hidden viewBox="0 0 80 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} fill="none" stroke={GOLD}>
            <ellipse cx="40" cy="50" rx="38" ry="48" strokeWidth="1.2" />
            <ellipse cx="40" cy="50" rx="33.5" ry="43.5" strokeWidth=".6" opacity=".7" />
            <path d="M40 0.5l2.4 3.2-2.4 3.2-2.4-3.2zM40 93.1l2.4 3.2-2.4 3.2-2.4-3.2z" fill={GOLD} stroke="none" />
          </svg>
          <span className="pc-foil" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(30px,8vw,38px)', letterSpacing: '-.06em', lineHeight: 1, marginLeft: '-.06em' }}>PC</span>
        </div>
        <div className="pc-foil" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(28px,7.4vw,38px)', lineHeight: 1.05 }}>{t.book}</div>
        <div style={{ margin: '12px 0 10px' }}>
          <Fleuron width={26} />
        </div>
        {line && <div className="pc-foil" style={{ fontSize: 7.5, letterSpacing: '.22em', textTransform: 'uppercase', fontVariantNumeric: 'lining-nums', whiteSpace: 'nowrap' }}>{line}</div>}
      </div>
      <div style={{ position: 'absolute', left: 48, right: 40, bottom: 44, textAlign: 'center', filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.6))' }}>
        {userName ? (
          <>
            <div className="pc-foil" style={{ fontSize: 7.5, letterSpacing: '.36em', textTransform: 'uppercase' }}>{t.preparedFor}</div>
            <div className="pc-foil" style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
          </>
        ) : (
          <div className="pc-foil" style={{ fontSize: 7.5, letterSpacing: '.42em', textTransform: 'uppercase' }}>Surat</div>
        )}
      </div>
    </div>
    <Clasp animation={claspAnimation} />
    </>
  );
}

/**
 * The bound volume's shell: the silk ribbon marker hanging from its foot, its shadow on the table,
 * and the leather boards with spine and brass corners. What lies on the board comes as children.
 */
export function Binding({ children, width, padded }: { children: ReactNode; width: string; padded: boolean }) {
  return (
    <div style={{ position: 'relative', width, animation: 'rise 1s .1s cubic-bezier(.22,.8,.2,1) both' }}>
      <div aria-hidden style={{ position: 'absolute', left: '4%', right: '2%', bottom: -16, height: 34, background: 'radial-gradient(closest-side, rgba(46,26,10,.42), transparent)', filter: 'blur(3px)' }} />
      {/* The ribbon: champagne silk with a fine rib, cut to a swallowtail. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', right: '24%', top: '50%', width: 13, height: 'calc(50% + 46px)', transformOrigin: 'top center', animation: 'pcRibbon 7s ease-in-out 2',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 9px), 0 100%)',
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.07) 0 1px, transparent 1px 3px), linear-gradient(90deg, #8E6A2E, #D9B770 34%, #F4E2AE 50%, #C9A45A 66%, #8E6A2E)',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.25))',
        }}
      />
      <div
        style={{
          position: 'relative', aspectRatio: '3 / 4', borderRadius: '6px 10px 10px 6px', background: LEATHER,
          boxShadow: '0 34px 64px rgba(40,20,10,.34), 0 10px 20px rgba(40,20,10,.22), inset 0 0 0 1px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,220,200,.12)',
          padding: padded ? '11px 19px 19px 36px' : 0, perspective: '1800px',
        }}
      >
        <Grain radius="6px 10px 10px 6px" />
        <Spine />
        <BrassCorner at="top" />
        <BrassCorner at="bottom" />
        <Catch />
        {children}
      </div>
    </div>
  );
}

// ─── The book ───────────────────────────────────────────────────────────────────────────────────

/** How much of the pages' inner margin the binding strip covers; pages turn on its edge (px). */
export const HINGE = 18;

export const paperFace = (gutter: 'left' | 'right') =>
  `${PAPER}, linear-gradient(${gutter === 'left' ? 90 : 270}deg, rgba(92,64,30,.22) 0%, rgba(92,64,30,.05) 5%, rgba(92,64,30,0) 9%), linear-gradient(180deg, #FDFAF2, #F6EFE0)`;

/** The text block under the pages, its fore-edge and foot gilt. */
export function GiltBlock() {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 2, background: '#F7F1E4', boxShadow: '1px 1px 0 #EADFC4, 2px 2px 0 #C7A45C, 3px 3px 0 #F0E4C6, 4px 4px 0 #B48C45, 5px 5px 0 #E6D3A3, 6px 6px 0 #9E7736, 7px 8px 12px rgba(0,0,0,.4)' }} />;
}

/**
 * The binding: a leather strip over the pages' inner margin, screwed through with brass posts, so
 * the pages are held to the book and turn on it.
 */
export function BindingStrip({ turning }: { turning?: boolean }) {
  // As the book is bound, each post is screwed home in turn and a glint runs down the fillet.
  return (
    <div aria-hidden style={{ position: 'absolute', left: -10, top: -3, bottom: -3, width: HINGE + 10, zIndex: 25, borderRadius: '0 3px 3px 0', background: LEATHER, overflow: 'hidden', boxShadow: '3px 0 6px rgba(30,10,4,.32), inset -1px 0 0 rgba(255,220,200,.14)' }}>
      <Grain />
      <div key={turning ? 'b' : 'a'} className="pc-foil-bg" style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 1, opacity: 0.85 }} />
      {[12, 50, 88].map((y, i) => <Screw key={y} y={y} x={HINGE + 10 - 11} turn={turning ? `pcScrew .6s ${i * 180}ms cubic-bezier(.4,0,.2,1) both` : undefined} glow={turning ? `pcScrewGlow .9s ${i * 180}ms ease-out both` : undefined} />)}
    </div>
  );
}

/** A seeded pseudo-random in [0, 1) — the same cutting always falls the same way. */
function seeded(key: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const SHEET_BASE: CSSProperties = {
  position: 'absolute', inset: 0, borderRadius: 3, background: 'linear-gradient(180deg, #FDFAF2, #F5EDDD)',
  boxShadow: '0 10px 24px rgba(40,24,10,.16), 0 1px 3px rgba(40,24,10,.12), inset 0 0 0 1px rgba(120,90,50,.08)',
};

/** One loose sheet: a fabric's title, or a sheet of its cuttings. */
function SheetFace({ studio, sheet, group, interactive }: { studio: Studio; sheet: Sheet; group: Group; interactive: boolean }) {
  const { t } = studio;
  const small = { fontSize: 7.5, letterSpacing: '.3em', textTransform: 'uppercase' as const, color: 'rgba(138,109,69,.85)' };
  const chapter = roman(sheet.g + 1);
  if (sheet.kind === 'title') {
    const pages = Math.ceil(group.items.length / PER_SHEET);
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(184,144,74,.7)' }} />
        <div style={{ position: 'absolute', inset: 18, border: '.5px solid rgba(184,144,74,.45)' }} />
        <div style={{ position: 'absolute', inset: 21 }}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => <CornerOrnament key={c} corner={c} inset={0} size={20} />)}
        </div>
        <div style={{ position: 'absolute', inset: '30px 30px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, letterSpacing: '.48em', textTransform: 'uppercase', color: UMBER, paddingLeft: '.48em' }}>{t.chapterWord}</div>
          <div className="pc-foil" style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(54px,13vw,74px)', fontWeight: 500, lineHeight: 1, marginTop: 6 }}>{chapter}</div>
          <div style={{ margin: '12px 0 10px' }}>
            <Fleuron width={28} color="#B8904A" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(26px,6vw,34px)', lineHeight: 1.1, color: INK }}>{group.x.name}</div>
          <div style={{ marginTop: 8, fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(28,25,23,.5)' }}>{group.x.hand}</div>
          {/* A die-cut window onto the chapter's first cutting. */}
          <div
            style={{
              width: 'clamp(58px,16vw,76px)', aspectRatio: '1', borderRadius: '50%', marginTop: 'clamp(14px,4vw,20px)', background: fabricTex(group.x, group.items[0].colour, 3),
              boxShadow: 'inset 0 3px 9px rgba(0,0,0,.5), inset 0 0 0 1px rgba(0,0,0,.25), 0 0 0 5px #FAF5EA, 0 0 0 6px rgba(184,144,74,.75)',
            }}
          />
          <div style={{ marginTop: 14, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 14, color: UMBER, fontVariantNumeric: 'lining-nums' }}>
            {group.items.length} {group.items.length === 1 ? t.shade : t.shades} · {pages} {t.sheetWord.toLowerCase()}{pages === 1 ? '' : 's'}
          </div>
        </div>
        {/* Which way to slide. */}
        <div aria-hidden style={{ position: 'absolute', left: 30, right: 30, bottom: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...small, fontSize: 7, letterSpacing: '.2em' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, letterSpacing: 0, animation: 'pcNudgeL 2.4s ease-in-out 3' }}>←</span>
            {t.slideOpen}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
            {t.slideSkip}
            <span style={{ fontSize: 12, letterSpacing: 0 }}>→</span>
          </span>
        </div>
      </div>
    );
  }

  const n = sheet.items.length;
  const [cols, rows] = sheetGrid(n);
  // Which slots of the grid this sheet's cuttings take, in an order seeded by the sheet.
  const slots = Array.from({ length: cols * rows }, (_, i) => i).sort((a, b) => seeded(`${sheet.key}:${a}`, 9) - seeded(`${sheet.key}:${b}`, 9)).slice(0, n).sort((a, b) => a - b);
  const cellW = 1 / cols;
  const cellH = AREA_ASPECT / rows;
  const cutW = Math.min(cellW * 0.8, cellH * 0.8 * (4 / 5));
  const tiny = cols === 3 || rows === 3;
  // With two or more to a row, a label gives the shade's name alone.
  const bare = cols >= 2;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '14px 16px 11px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, ...small }}>
        <span style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
          {t.chapterWord} {chapter}
        </span>
        <span aria-hidden style={{ width: 4, height: 4, transform: 'rotate(45deg)', background: '#B8904A' }} />
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.x.name}</span>
      </div>
      <div aria-hidden style={{ height: 1, marginTop: 7, background: 'linear-gradient(90deg, rgba(138,109,69,.1), rgba(138,109,69,.45), rgba(138,109,69,.1))' }} />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '8px 2px 4px' }}>
        {sheet.items.map(({ pin, colour }, i) => {
          const key = `${pin.fabricId}-${pin.colourOrder}`;
          const slot = slots[i];
          const cx = ((slot % cols) + 0.5) / cols + (seeded(key, 1) - 0.5) * cellW * 0.16;
          const cy = (Math.floor(slot / cols) + 0.5) / rows + (seeded(key, 2) - 0.5) * (1 / rows) * 0.12;
          const r = (seeded(key, 3) - 0.5) * 22;
          return (
            <div
              key={key}
              className="pc-loose"
              style={{ ['--jx' as string]: '-50%', ['--jy' as string]: '-50%', ['--r' as string]: `${r.toFixed(1)}deg`, position: 'absolute', left: `${(cx * 100).toFixed(2)}%`, top: `${(cy * 100).toFixed(2)}%`, width: `${(cutW * 100).toFixed(2)}%`, aspectRatio: '4 / 5', zIndex: 1 + ((i * 5) % n) } as CSSProperties}
            >
              <LooseCutting studio={studio} fabric={group.x} pin={pin} colour={colour} tiny={tiny} bare={bare} big={n === 1} interactive={interactive} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8, ...small, fontVariantNumeric: 'lining-nums' }}>
        <span style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
          {n} {n === 1 ? t.shade : t.shades}
        </span>
        <span style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 12, letterSpacing: 0, textTransform: 'none', color: UMBER }}>— {roman(sheet.page + 1).toLowerCase()} —</span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {t.sheetWord} {sheet.page + 1} / {sheet.pages}
        </span>
      </div>
    </div>
  );
}

/** A loose cutting: pinked, pinned through the top and labelled with a small tag. */
function LooseCutting({ studio, fabric, pin, colour, tiny, bare, big, interactive }: { studio: Studio; fabric: FabricRow; pin: Pin; colour: ColourRow; tiny: boolean; bare: boolean; big: boolean; interactive: boolean }) {
  const { t } = studio;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Its shadow on the sheet: a plain box shadow under the body of the cutting, which the
          pinked edges hide, is far cheaper to paint than a filter on the clipped cutting. */}
      <div aria-hidden style={{ position: 'absolute', left: '1%', right: '1%', top: '4%', bottom: '3%', boxShadow: '0 5px 10px rgba(40,26,12,.26), 0 1px 2px rgba(40,26,12,.18)' }} />
      <div
        onClick={interactive ? () => studio.openFabric(pin.fabricId, fabric.colours.indexOf(colour)) : undefined}
        className="pc-pinked"
        // The light falling across the cutting is one more layer of its own background, so each
        // cutting is a single clipped box.
        style={{ position: 'absolute', inset: 0, cursor: interactive ? 'pointer' : 'inherit', background: `linear-gradient(155deg, rgba(255,255,255,.2), transparent 38%, transparent 68%, rgba(0,0,0,.16)), ${fabricTex(fabric, colour, 4)}` }}
      />
      {/* A dressmaker's pin through the top, pearl head and steel shank. */}
      <span aria-hidden style={{ position: 'absolute', top: tiny ? 6 : 10, left: tiny ? 10 : 16, width: tiny ? 20 : 32, height: 1.3, transformOrigin: '0 50%', transform: 'rotate(-22deg)', background: 'linear-gradient(90deg, #8E9297, #E6E8EA 45%, #9EA3A8)', borderRadius: 1, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', top: tiny ? 3 : 6, left: tiny ? 7 : 12, width: tiny ? 7 : 10, height: tiny ? 7 : 10, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FFFFFF, #F1E6D2 45%, #BFA27A)', boxShadow: '0 1px 2px rgba(0,0,0,.35)', pointerEvents: 'none' }} />
      {/* The label, a small luggage tag with its punched hole. */}
      <div
        style={{
          position: 'absolute', left: tiny ? 3 : 9, bottom: tiny ? 7 : 13, maxWidth: `calc(100% - ${tiny ? 6 : 18}px)`, pointerEvents: 'none',
          padding: tiny ? '2px 6px 2px 11px' : '5px 10px 5px 17px', background: '#FBF6EA',
          clipPath: `polygon(${tiny ? 6 : 9}px 0, 100% 0, 100% 100%, ${tiny ? 6 : 9}px 100%, 0 50%)`,
          display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        <span aria-hidden style={{ position: 'absolute', left: tiny ? 4 : 7, top: '50%', width: tiny ? 3 : 4, height: tiny ? 3 : 4, marginTop: tiny ? -1.5 : -2, borderRadius: '50%', background: 'rgba(60,40,20,.35)' }} />
        {!bare && (
          <span style={{ fontSize: 8, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9C7A45', fontVariantNumeric: 'lining-nums' }}>
            {t.shadeNo} {String(colour.order).padStart(2, '0')}
          </span>
        )}
        <span style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: tiny ? 11 : big ? 17 : bare ? 13.5 : 14.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{colour.name}</span>
      </div>
      {/* Always drawn, so a sheet arriving on top shows the same marks it had beneath; only
          the top sheet's can be pressed. */}
      <button
        aria-label={`Remove ${colour.name}`}
        aria-hidden={!interactive || undefined}
        tabIndex={interactive ? 0 : -1}
        onClick={interactive ? () => studio.removePin(pin) : undefined}
        className="pc-hv-scale-06"
        style={{
          position: 'absolute', top: tiny ? 5 : 9, right: tiny ? 5 : 9, width: tiny ? 18 : 24, height: tiny ? 18 : 24, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
          background: 'rgba(252,249,241,.94)', border: '1px solid rgba(201,169,110,.6)', fontSize: tiny ? 11 : 13, lineHeight: 1, color: '#6B5433',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Nothing in the book yet: the closed volume, and the way to the Showroom. */
function EmptyBook({ studio }: { studio: Studio }) {
  const { t } = studio;
  return (
    <Room center>
      <Eyebrow>Poddar Creation</Eyebrow>
      <h1 style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(36px,6vw,62px)', lineHeight: 1.02 }}>{t.book}</h1>
      <div style={{ marginTop: 30 }} />
      <Binding width="min(80%, 330px)" padded={false}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0 }}>
          <CoverFace t={t} userName={studio.userName} />
        </div>
      </Binding>
      <p style={{ margin: '52px 0 0', maxWidth: 360, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17, color: 'rgba(28,25,23,.6)' }}>{t.emptyBoard}</p>
      <button
        onClick={() => studio.go('showroom')}
        className="pc-book"
        style={{
          cursor: 'pointer', marginTop: 18, borderRadius: 999, padding: '14px 26px', fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.2em', textTransform: 'uppercase',
          background: 'linear-gradient(135deg, rgba(255,255,255,.72), rgba(250,248,245,.4))', color: INK, border: '1px solid rgba(201,169,110,.5)',
        }}
      >
        {t.showroom} →
      </button>
    </Room>
  );
}
