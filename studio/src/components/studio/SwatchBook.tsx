'use client';

import { useEffect, useRef, useState } from 'react';
import type { Studio, Pin } from './state';
import type { FabricRow, ColourRow } from '@/lib/types';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';

/** How a page of up to six cuttings is laid out: [columns, rows, does the last cutting span both columns]. */
const LAYOUT: Record<number, [number, number, boolean]> = {
  1: [1, 1, false],
  2: [1, 2, false],
  3: [1, 3, false],
  4: [2, 2, false],
  5: [2, 3, true],
  6: [2, 3, false],
};
const PER_PAGE = 6;

type Cutting = { pin: Pin; colour: ColourRow };

/**
 * The Swatch Book: one fabric at a time. Its name is the heading, its particulars beneath; when more
 * than one fabric is in the book, the heading can be swiped (or its arrows tapped) to change fabric.
 * Below it, the book itself — a cloth-bound hardcover with a paper page holding up to six of that
 * fabric's shades as pinked cuttings (one fills the page, two and three share it in horizontal
 * bands, four is a 2 × 2 grid, five is 2 + 2 + 1, six is 2 × 3). More than six fill further pages,
 * stacked beneath; sliding the top page to the right tucks it under the stack and brings the next
 * one forward.
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

  // The heading swipes and scrolls sideways to change fabric, as the lab's number strip does.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ dx: 0, t: 0 });

  if (!group) return <EmptyBook studio={studio} />;

  return (
    <div className="pc-view" style={{ padding: 'clamp(26px,5vw,52px) clamp(16px,5vw,64px) 90px', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: '#8A6D45' }}>
          <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: 'linear-gradient(90deg, transparent, #8A6D45)', opacity: 0.7 }} />
          <span>
            {t.book}
            {groups.length > 1 && (
              <span style={{ fontVariantNumeric: 'lining-nums' }}>
                {' '}
                · {String(at + 1).padStart(2, '0')} / {String(groups.length).padStart(2, '0')}
              </span>
            )}
          </span>
          <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: 'linear-gradient(270deg, transparent, #8A6D45)', opacity: 0.7 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: groups.length > 1 ? '40px minmax(0,1fr) 40px' : 'minmax(0,1fr)', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {groups.length > 1 && <ArrowButton label="Previous fabric" onClick={() => step(-1)} glyph="‹" />}
          <div key={group.x.id} style={{ minWidth: 0, animation: `${dir > 0 ? 'pcBookInRight' : 'pcBookInLeft'} .8s cubic-bezier(.22,.8,.2,1) both` }}>
            <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(36px,6vw,62px)', lineHeight: 1.02, color: '#1C1917', textWrap: 'balance' }}>{group.x.name}</h1>
            <div style={{ marginTop: 10, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(28,25,23,.55)', lineHeight: 1.7 }}>
              {group.x.weight} · {group.x.width} · {group.x.comp}
            </div>
            <div style={{ marginTop: 2, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, color: '#8A6D45' }}>
              {group.x.hand} — {group.items.length} {group.items.length === 1 ? t.shade : t.shades} {t.inBookWord}
            </div>
          </div>
          {groups.length > 1 && <ArrowButton label="Next fabric" onClick={() => step(1)} glyph="›" />}
        </div>
        {groups.length > 1 && (
          <div aria-hidden style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
            {groups.map((g, i) => (
              <span key={g.x.id} style={{ width: i === at ? 18 : 6, height: 6, borderRadius: 3, background: i === at ? '#8A6D45' : 'rgba(138,109,69,.28)', transition: 'width .6s cubic-bezier(.22,.8,.2,1), background .6s ease' }} />
            ))}
          </div>
        )}
      </div>

      <Book key={group.x.id} studio={studio} fabric={group.x} items={group.items} t={t} />
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
        border: '1px solid rgba(201,169,110,.45)', color: '#8A6D45', fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 1,
        boxShadow: '0 8px 20px rgba(28,25,23,.08)',
      }}
    >
      <span style={{ marginTop: -3 }}>{glyph}</span>
    </button>
  );
}

/**
 * The hardcover and its pages. The pages are a stack: the top page follows a finger or the pointer
 * sideways, and let go past a threshold (or with the corner button) it slides away to the right,
 * tucks under the stack and the next page comes forward; short of it, it springs back.
 */
function Book({ studio, fabric, items, t }: { studio: Studio; fabric: FabricRow; items: Cutting[]; t: Record<string, string> }) {
  const pages: Cutting[][] = [];
  for (let i = 0; i < items.length; i += PER_PAGE) pages.push(items.slice(i, i + PER_PAGE));
  const [orderRaw, setOrder] = useState<number[]>(pages.map((_, i) => i));
  const order = orderRaw.length === pages.length ? orderRaw : pages.map((_, i) => i);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flinging, setFlinging] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const turn = () => {
    if (pages.length < 2 || flinging) return;
    setFlinging(true);
    window.setTimeout(() => {
      setOrder([...order.slice(1), order[0]]);
      setFlinging(false);
      setDx(0);
    }, 560);
  };

  useEffect(() => {
    const up = () => {
      setDragging(false);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  return (
    <div style={{ marginTop: 'clamp(22px,4vw,34px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* The hardcover: cloth over boards, a darker spine at the left with two gold foil rules, and
          the cover's own edge showing round the page. */}
      <div
        style={{
          position: 'relative', width: 'min(100%, 460px)', aspectRatio: '3 / 4', borderRadius: '6px 10px 10px 6px',
          background: 'linear-gradient(135deg, #2B2521, #1B1714 60%, #231E1A)',
          boxShadow: '0 30px 60px rgba(28,25,23,.28), 0 8px 18px rgba(28,25,23,.18), inset 0 0 0 1px rgba(201,169,110,.18)',
          padding: '14px 14px 14px 30px', animation: 'rise 1s .1s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, borderRadius: '6px 0 0 6px', background: 'linear-gradient(90deg, #120F0D, #2A2420 70%, #1A1613)', boxShadow: 'inset -1px 0 0 rgba(201,169,110,.25)' }}>
          <span style={{ position: 'absolute', left: 7, right: 7, top: 22, height: 1, background: 'rgba(201,169,110,.7)' }} />
          <span style={{ position: 'absolute', left: 7, right: 7, bottom: 22, height: 1, background: 'rgba(201,169,110,.7)' }} />
        </div>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {order.slice(0, 3).map((pi, k) => {
            const top = k === 0;
            const page = pages[pi];
            const transform = top
              ? flinging
                ? 'translateX(118%) rotate(7deg)'
                : `translateX(${dx}px) rotate(${dx / 45}deg)`
              : `translate(${k * 4}px, ${k * 5}px) rotate(${k * 0.9}deg)`;
            return (
              <div
                key={pi}
                onPointerDown={
                  top
                    ? (e) => {
                        start.current = { x: e.clientX, y: e.clientY, moved: false };
                        setDragging(true);
                      }
                    : undefined
                }
                onPointerMove={
                  top
                    ? (e) => {
                        const s = start.current;
                        if (!s || !dragging || pages.length < 2) return;
                        const mx = e.clientX - s.x;
                        if (Math.abs(mx) > 6) s.moved = true;
                        // Rightward is the turn; leftward only gives a little.
                        setDx(mx > 0 ? mx : mx / 4);
                      }
                    : undefined
                }
                onPointerUp={
                  top
                    ? () => {
                        const s = start.current;
                        start.current = null;
                        setDragging(false);
                        if (s?.moved && dx > 70) turn();
                        else setDx(0);
                      }
                    : undefined
                }
                style={{
                  position: 'absolute', inset: 0, zIndex: 10 - k, borderRadius: 3,
                  background: 'linear-gradient(90deg, #EFE9DE 0%, #FBF9F4 7%, #FBF9F4 100%)',
                  boxShadow: '0 2px 6px rgba(0,0,0,.18), inset 8px 0 14px -10px rgba(28,25,23,.35)',
                  padding: '14px 14px 30px 18px', transform, touchAction: 'pan-y',
                  transition: dragging && top ? 'none' : 'transform .56s cubic-bezier(.4,0,.2,1)',
                  cursor: top && pages.length > 1 ? 'grab' : 'default',
                }}
              >
                <Page studio={studio} fabric={fabric} cuttings={page} interactive={top} />
                <div style={{ position: 'absolute', left: 18, right: 14, bottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 8.5, letterSpacing: '.24em', textTransform: 'uppercase', color: 'rgba(28,25,23,.42)' }}>
                  <span>{fabric.name}</span>
                  <span style={{ fontVariantNumeric: 'lining-nums' }}>
                    {pages.length > 1 ? `${t.pageWord} ${pi + 1} / ${pages.length}` : `${page.length} ${page.length === 1 ? t.shade : t.shades}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pages.length > 1 && (
        <button
          onClick={turn}
          className="pc-hv-ink"
          style={{ cursor: 'pointer', marginTop: 18, background: 'none', border: 'none', fontFamily: FONT_BODY, fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(28,25,23,.5)', display: 'inline-flex', alignItems: 'center', gap: 10 }}
        >
          {t.turnPage}
          <svg width="22" height="10" viewBox="0 0 26 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden style={{ animation: 'pcNudge 2.4s ease-in-out infinite' }}>
            <path d="M0 5h22M18 1l4 4-4 4" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** One page: up to six cuttings in the layout for their number. */
function Page({ studio, fabric, cuttings, interactive }: { studio: Studio; fabric: FabricRow; cuttings: Cutting[]; interactive: boolean }) {
  const [cols, rows, spanLast] = LAYOUT[cuttings.length] ?? LAYOUT[6];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`, gap: 10, height: '100%' }}>
      {cuttings.map(({ pin, colour }, i) => {
        const last = i === cuttings.length - 1;
        return (
          <div
            key={`${pin.fabricId}-${pin.colourOrder}`}
            style={{ position: 'relative', minHeight: 0, gridColumn: spanLast && last ? '1 / -1' : undefined, animation: `tileIn .8s ${150 + i * 80}ms cubic-bezier(.22,.8,.2,1) both` }}
          >
            <div
              onClick={interactive ? () => studio.openFabric(pin.fabricId, fabric.colours.indexOf(colour)) : undefined}
              className="pc-pink"
              style={{
                position: 'absolute', inset: 0, cursor: interactive ? 'pointer' : 'default',
                background: fabricTex(fabric, colour, 4),
                boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08), inset 0 -22px 28px rgba(28,25,23,.08)',
              }}
            />
            <span
              style={{
                position: 'absolute', left: 8, bottom: 12, padding: '4px 9px', borderRadius: 999, pointerEvents: 'none',
                background: 'rgba(250,248,245,.88)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                fontFamily: FONT_DISPLAY, fontSize: cuttings.length <= 2 ? 16 : 13, color: '#1C1917', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {colour.name}
            </span>
            {interactive && (
              <button
                aria-label={`Remove ${colour.name}`}
                onClick={() => studio.removePin(pin)}
                className="pc-hv-scale-06"
                style={{
                  position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer',
                  background: 'rgba(250,248,245,.85)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(28,25,23,.08)',
                  fontSize: 14, lineHeight: 1, color: 'rgba(28,25,23,.6)',
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Nothing in the book yet: the closed hardcover, its title in gold foil, and the way to the Showroom. */
function EmptyBook({ studio }: { studio: Studio }) {
  const { t } = studio;
  return (
    <div className="pc-view" style={{ padding: 'clamp(26px,5vw,52px) clamp(16px,5vw,64px) 90px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: '#8A6D45' }}>Poddar Creation</div>
      <h1 style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(36px,6vw,62px)', lineHeight: 1.02 }}>{t.book}</h1>
      <div
        style={{
          position: 'relative', marginTop: 28, width: 'min(78%, 320px)', aspectRatio: '3 / 4', borderRadius: '6px 10px 10px 6px',
          background: 'linear-gradient(135deg, #2B2521, #1B1714 60%, #231E1A)',
          boxShadow: '0 30px 60px rgba(28,25,23,.28), inset 0 0 0 1px rgba(201,169,110,.18)', display: 'grid', placeItems: 'center',
          animation: 'rise 1s .1s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 20, borderRadius: '6px 0 0 6px', background: 'linear-gradient(90deg, #120F0D, #2A2420 70%, #1A1613)' }} />
        <div style={{ color: '#C9A96E' }}>
          <div style={{ fontSize: 9, letterSpacing: '.42em', textTransform: 'uppercase', opacity: 0.8 }}>Poddar</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 30, marginTop: 6 }}>{t.book}</div>
          <div style={{ width: 48, height: 1, background: 'rgba(201,169,110,.7)', margin: '12px auto 0' }} />
        </div>
      </div>
      <p style={{ margin: '26px 0 0', maxWidth: 360, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17, color: 'rgba(28,25,23,.6)' }}>{t.emptyBoard}</p>
      <button
        onClick={() => studio.go('showroom')}
        className="pc-book"
        style={{
          cursor: 'pointer', marginTop: 18, borderRadius: 999, padding: '14px 26px', fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.2em', textTransform: 'uppercase',
          backdropFilter: 'blur(18px) saturate(1.4)', WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          background: 'linear-gradient(135deg, rgba(255,255,255,.55), rgba(250,248,245,.22))', color: '#1C1917', border: '1px solid rgba(201,169,110,.5)',
        }}
      >
        {t.showroom} →
      </button>
    </div>
  );
}
