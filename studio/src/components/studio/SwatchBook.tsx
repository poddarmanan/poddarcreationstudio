'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Studio, Pin } from './state';
import type { FabricRow, ColourRow } from '@/lib/types';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';

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

/**
 * The Swatch Book: one fabric at a time, each fabric a chapter. Its name is the heading, its
 * particulars beneath; when more than one fabric is in the book, the heading can be swiped (or its
 * arrows or chapter numerals tapped) to change fabric. Below it, the book itself — bound in oxblood
 * morocco with gold tooling and brass corners — holding up to six of that fabric's shades per page
 * as pinked cuttings mounted with photo corners (one fills the page, two and three share it in
 * bands, four is 2 × 2, five is 2 + 2 + 1, six is 2 × 3). More than six fill further pages; sliding
 * the top page to the right tucks it under the stack and brings the next one forward.
 */
export function SwatchBook({ studio }: { studio: Studio }) {
  const { t, fabrics, pins } = studio;

  const groups = fabrics
    .map((x) => ({
      x,
      items: pins
        .filter((p) => p.fabricId === x.id)
        .map((p) => ({ pin: p, colour: x.colours.find((c) => c.order === p.colourOrder) }))
        .filter((c): c is Cutting => !!c.colour),
    }))
    .filter((g) => g.items.length);

  const [chosen, setChosen] = useState<string | null>(null);
  const at = Math.max(0, groups.findIndex((g) => g.x.id === chosen));
  const group = groups[at];
  const [dir, setDir] = useState<1 | -1>(1);

  const step = (d: 1 | -1) => {
    if (groups.length < 2) return;
    setDir(d);
    setChosen(groups[(at + d + groups.length) % groups.length].x.id);
  };
  const jump = (i: number) => {
    if (i === at) return;
    setDir(i > at ? 1 : -1);
    setChosen(groups[i].x.id);
  };

  // The heading swipes and scrolls sideways to change fabric, as the lab's number strip does.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ dx: 0, t: 0 });

  if (!group) return <EmptyBook studio={studio} />;

  return (
    <Room>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${t.book}: ${group.x.name}${groups.length > 1 ? `, fabric ${at + 1} of ${groups.length}. Swipe sideways for the next.` : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
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
          if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          if (e.timeStamp - wheel.current.t > 400) wheel.current.dx = 0;
          wheel.current = { dx: wheel.current.dx + e.deltaX, t: e.timeStamp };
          if (Math.abs(wheel.current.dx) > 60) {
            step(wheel.current.dx > 0 ? 1 : -1);
            wheel.current.dx = 0;
          }
        }}
        style={{ outline: 'none', textAlign: 'center', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: groups.length > 1 ? 'grab' : 'default' }}
      >
        <Eyebrow>{t.book}</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: groups.length > 1 ? '40px minmax(0,1fr) 40px' : 'minmax(0,1fr)', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {groups.length > 1 && <ArrowButton label="Previous fabric" onClick={() => step(-1)} glyph="‹" />}
          <div key={group.x.id} style={{ minWidth: 0, animation: `${dir > 0 ? 'pcBookInRight' : 'pcBookInLeft'} .8s cubic-bezier(.22,.8,.2,1) both` }}>
            <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(36px,6vw,62px)', lineHeight: 1.02, color: INK, textWrap: 'balance' }}>{group.x.name}</h1>
            <div style={{ marginTop: 10, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(28,25,23,.55)', lineHeight: 1.7 }}>
              {group.x.weight} · {group.x.width} · {group.x.comp}
            </div>
            <div style={{ marginTop: 2, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, color: UMBER }}>
              {group.x.hand} — {group.items.length} {group.items.length === 1 ? t.shade : t.shades} {t.inBookWord}
            </div>
          </div>
          {groups.length > 1 && <ArrowButton label="Next fabric" onClick={() => step(1)} glyph="›" />}
        </div>
        {groups.length > 1 && (
          // The chapters, by their numerals: the one open is underlined in gold.
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
            {groups.map((g, i) => (
              <button
                key={g.x.id}
                aria-label={`${t.chapterWord} ${roman(i + 1)}: ${g.x.name}`}
                aria-current={i === at ? 'true' : undefined}
                onClick={() => jump(i)}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 8px 7px', fontFamily: FONT_DISPLAY,
                  fontSize: i === at ? 17 : 15, color: i === at ? UMBER : 'rgba(138,109,69,.45)', transition: 'color .5s ease, font-size .5s ease',
                }}
              >
                {roman(i + 1)}
                <span aria-hidden className="pc-foil-bg" style={{ position: 'absolute', left: '50%', bottom: 2, height: 1, width: i === at ? 18 : 0, transform: 'translateX(-50%)', transition: 'width .6s cubic-bezier(.22,.8,.2,1)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <LooseCuttings key={group.x.id} studio={studio} fabric={group.x} items={group.items} dir={dir} />
      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: 'rise 1s .6s cubic-bezier(.22,.8,.2,1) both' }}>
        <Fleuron width={26} color="rgba(138,109,69,.6)" />
        <p style={{ margin: 0, maxWidth: 320, textAlign: 'center', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: 'rgba(28,25,23,.58)' }}>{t.looseNote}</p>
      </div>

      {/* The book's one action: order it — every shade in it, across all its fabrics. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 22, animation: 'rise 1s .35s cubic-bezier(.22,.8,.2,1) both' }}>
        <button
          onClick={studio.openQuoteBook}
          className="pc-book"
          style={{
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: 'min(100%, 460px)',
            borderRadius: 999, padding: '16px 18px', fontFamily: FONT_BODY, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
            background: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(250,248,245,.22))', color: INK, border: '1px solid rgba(201,169,110,.5)',
          }}
        >
          <span aria-hidden className="pc-book-star">✦</span>
          {t.orderBook}
        </button>
        <div style={{ marginTop: 10, fontSize: 11, letterSpacing: '.06em', color: 'rgba(28,25,23,.5)', fontVariantNumeric: 'lining-nums' }}>
          {studio.pins.length} {studio.pins.length === 1 ? t.shade : t.shades} · {groups.length} {groups.length === 1 ? t.fabricWordOne : t.fabricWordMany}
        </div>
      </div>
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

function ArrowButton({ label, onClick, glyph }: { label: string; onClick: () => void; glyph: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="pc-hv-scale-06"
      style={{
        cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: 'rgba(250,248,245,.7)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(201,169,110,.45)', color: UMBER, fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 1,
        boxShadow: '0 8px 20px rgba(28,25,23,.08)',
      }}
    >
      <span style={{ marginTop: -3 }}>{glyph}</span>
    </button>
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
function Screw({ y, x }: { y: number; x: number }) {
  return (
    <span
      style={{
        position: 'absolute', left: x, top: `${y}%`, width: 10, height: 10, transform: 'translate(-50%,-50%)', borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #FFF4CF, #D9B464 35%, #8A6524 75%, #5E4214)',
        boxShadow: '0 1px 1.5px rgba(0,0,0,.6), inset 0 0 0 .5px rgba(60,40,10,.6), 0 0 0 1.5px rgba(0,0,0,.25)',
      }}
    >
      <span style={{ position: 'absolute', left: 2, right: 2, top: '50%', height: 1.2, marginTop: -0.6, background: 'rgba(70,45,12,.8)', transform: 'rotate(-35deg)' }} />
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
          position: 'absolute', right: '24%', top: '50%', width: 13, height: 'calc(50% + 46px)', transformOrigin: 'top center', animation: 'pcRibbon 7s ease-in-out infinite',
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
export function BindingStrip() {
  return (
    <div aria-hidden style={{ position: 'absolute', left: -10, top: -3, bottom: -3, width: HINGE + 10, zIndex: 25, borderRadius: '0 3px 3px 0', background: LEATHER, overflow: 'hidden', boxShadow: '3px 0 6px rgba(30,10,4,.32), inset -1px 0 0 rgba(255,220,200,.14)' }}>
      <Grain />
      <div className="pc-foil-bg" style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 1, opacity: 0.85 }} />
      {[12, 50, 88].map((y) => <Screw key={y} y={y} x={HINGE + 10 - 11} />)}
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

/**
 * While browsing, the book is not yet bound: its cuttings lie loose on the table, each dropped at
 * its own slight angle and pinned with its label, and a new fabric's cuttings fall in from the side
 * it was reached from. Ordering binds them into the book.
 */
function LooseCuttings({ studio, fabric, items, dir }: { studio: Studio; fabric: FabricRow; items: Cutting[]; dir: 1 | -1 }) {
  const { t } = studio;
  const n = items.length;
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  return (
    <div
      style={{
        margin: 'clamp(26px,4vw,40px) auto 0', width: n === 1 ? 'min(100%, 330px)' : cols === 2 ? 'min(100%, 440px)' : 'min(100%, 540px)',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, columnGap: cols === 3 ? 'clamp(6px,2vw,18px)' : 'clamp(12px,3vw,24px)', rowGap: 'clamp(4px,1.6vw,14px)',
        padding: '6px 8px 10px',
      }}
    >
      {items.map(({ pin, colour }, i) => {
        const key = `${pin.fabricId}-${pin.colourOrder}`;
        const r = (seeded(key, 3) - 0.5) * 16;
        const vars = {
          '--jx': `${((seeded(key, 1) - 0.5) * 12).toFixed(1)}%`,
          '--jy': `${((seeded(key, 2) - 0.5) * 10).toFixed(1)}%`,
          '--r': `${r.toFixed(1)}deg`,
          '--dx': `${dir * 90}px`,
        } as CSSProperties;
        const small = cols === 3;
        return (
          <div key={key} className="pc-loose" style={{ ...vars, position: 'relative', aspectRatio: n === 1 ? '5 / 4' : '4 / 5', zIndex: 1 + ((i * 7) % n), animation: `pcDrop .95s ${140 + i * 75}ms cubic-bezier(.2,.8,.25,1) backwards` }}>
            <div style={{ position: 'absolute', inset: 0, filter: 'drop-shadow(0 2px 2px rgba(40,26,12,.28)) drop-shadow(0 10px 14px rgba(40,26,12,.16))' }}>
              <div
                onClick={() => studio.openFabric(pin.fabricId, fabric.colours.indexOf(colour))}
                className="pc-pinked"
                style={{ position: 'absolute', inset: 0, cursor: 'pointer', background: fabricTex(fabric, colour, 4) }}
              />
              <div aria-hidden className="pc-pinked" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(155deg, rgba(255,255,255,.2), transparent 38%, transparent 68%, rgba(0,0,0,.16))' }} />
              {/* A dressmaker's pin through the top, pearl head and steel shank. */}
              <span aria-hidden style={{ position: 'absolute', top: small ? 7 : 10, left: small ? 12 : 16, width: small ? 24 : 32, height: 1.4, transformOrigin: '0 50%', transform: 'rotate(-22deg)', background: 'linear-gradient(90deg, #8E9297, #E6E8EA 45%, #9EA3A8)', borderRadius: 1, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', top: small ? 3 : 6, left: small ? 8 : 12, width: small ? 8 : 10, height: small ? 8 : 10, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FFFFFF, #F1E6D2 45%, #BFA27A)', boxShadow: '0 1px 2px rgba(0,0,0,.35)', pointerEvents: 'none' }} />
              {/* The label, a small luggage tag with its punched hole. */}
              <div
                style={{
                  position: 'absolute', left: small ? 5 : 9, bottom: small ? 9 : 13, maxWidth: `calc(100% - ${small ? 10 : 18}px)`, pointerEvents: 'none',
                  padding: small ? '3px 7px 3px 13px' : '5px 10px 5px 17px', background: '#FBF6EA',
                  clipPath: `polygon(${small ? 7 : 9}px 0, 100% 0, 100% 100%, ${small ? 7 : 9}px 100%, 0 50%)`,
                  display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                <span aria-hidden style={{ position: 'absolute', left: small ? 5 : 7, top: '50%', width: 4, height: 4, marginTop: -2, borderRadius: '50%', background: 'rgba(60,40,20,.35)' }} />
                <span style={{ fontSize: small ? 6.5 : 8, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9C7A45', fontVariantNumeric: 'lining-nums' }}>
                  {t.shadeNo} {String(colour.order).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: small ? 12 : n === 1 ? 17 : 14.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{colour.name}</span>
              </div>
              <button
                aria-label={`Remove ${colour.name}`}
                onClick={() => studio.removePin(pin)}
                className="pc-hv-scale-06"
                style={{
                  position: 'absolute', top: small ? 6 : 9, right: small ? 6 : 9, width: small ? 20 : 24, height: small ? 20 : 24, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
                  background: 'rgba(252,249,241,.94)', border: '1px solid rgba(201,169,110,.6)', fontSize: 13, lineHeight: 1, color: '#6B5433',
                }}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
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
          backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          background: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(250,248,245,.22))', color: INK, border: '1px solid rgba(201,169,110,.5)',
        }}
      >
        {t.showroom} →
      </button>
    </Room>
  );
}
