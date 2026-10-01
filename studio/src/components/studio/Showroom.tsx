'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricNo } from './helpers';
import { FabricForm } from './FabricForm';
import { useDragScroll } from './interactions';
import { ROOMS, type RoomKey } from '@/lib/fabric-generator';

/** The fade at the walk's right edge, and the slider's glass, in a light room and in the dark one. */
const EDGE = { light: 'rgba(240,235,226,.85)', dark: 'rgba(35,30,26,.85)' };
const GLASS = { light: 'rgba(250,248,245,.62)', dark: 'rgba(20,17,15,.45)' };
const RIM = { light: 'rgba(28,25,23,.08)', dark: 'rgba(201,169,110,.22)' };

const smooth = (k: number) => k * k * (3 - 2 * k);
/** A room's wall and floor, with the line where they meet set by --hz: just behind the forms' feet,
 * wherever the layout puts them, so the forms always stand on the floor. */
const onFloor = (bg: string) => bg.replace('62.2%', 'calc(var(--hz, 62%) + 2px)').replace(' 62%', ' var(--hz, 62%)');
const mix = (a: string, b: string, k: number) => `color-mix(in oklab, ${b} ${(k * 100).toFixed(2)}%, ${a})`;

/**
 * The Showroom: one continuous walk past every roll, 01 to 11, in the catalogue's order — the
 * Cotton Gallery, then the Rayon Room, then the Silk Gallery. The rooms blend into one another as
 * the walk is scrolled or dragged, in step with it: where the walk is between two rooms, their walls
 * and light, their headings, the slider's marker, its glass, the fade at the edge and the colours
 * of the forms' lettering are that far from one to the other. Nothing jumps at a threshold, and the
 * page is not re-rendered as it moves: every frame is set on the elements directly. A room in the
 * slider glides the walk to that room's first roll.
 */
export function Showroom({ studio }: { studio: Studio }) {
  const { t } = studio;
  const rooms = ROOMS;
  const [active, setActive] = useState<RoomKey>(rooms.some((r) => r.k === studio.room) ? studio.room : rooms[0].k);
  const ri = Math.max(0, rooms.findIndex((r) => r.k === active));
  // The room the page opened in: the starting opacities and positions are written from it once,
  // so that re-rendering as the walk moves never writes over what the walk has set.
  const [ri0] = useState(ri);
  const dark = active === 'silk';
  const walkDrag = useDragScroll();
  const walk = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const heads = useRef<(HTMLDivElement | null)[]>([]);
  const marker = useRef<HTMLSpanElement>(null);
  const stands = rooms.flatMap((r) => r.ids.map((id) => ({ f: studio.fab(id), room: r.k })));

  // Where each room's forms stand along the walk, measured once and again on a resize.
  const spans = useRef<{ start: number; end: number }[]>([]);
  const measure = () => {
    const el = walk.current;
    if (!el) return;
    spans.current = rooms.map((r) => {
      const ns = Array.from(el.querySelectorAll<HTMLElement>(`[data-room="${r.k}"]`));
      const first = ns[0];
      const last = ns[ns.length - 1];
      return { start: first ? first.offsetLeft : 0, end: last ? last.offsetLeft + last.offsetWidth : 0 };
    });
    forms.current = Array.from(el.querySelectorAll<HTMLElement>('.pc-form')).map((f) => ({ el: f, mid: (f.parentElement?.offsetLeft ?? 0) + f.offsetWidth / 2 }));
    // The floor meets the wall a little behind the forms' feet.
    const row = el.firstElementChild as HTMLElement | null;
    const label = el.querySelector<HTMLElement>('[data-form-label]');
    const box = root.current;
    if (row && label && box) {
      const feet = row.getBoundingClientRect().bottom - box.getBoundingClientRect().top - label.offsetHeight - parseFloat(getComputedStyle(label).marginTop);
      box.style.setProperty('--hz', `${Math.round(feet - 26)}px`);
    }
  };

  // How far along the rooms the walk is, as a number: 0 in the first room, 1 in the second, 1.5
  // halfway from the second to the third. Between two rooms it runs smoothly across a stretch of
  // the walk as wide as most of the screen, centred on the gap between their forms.
  // At either end of the walk it eases fully into the first room or the last, over the last
  // stretch of scrolling, so a short walk (a wide screen) starts pure and ends pure, with no jump.
  const natural = (scroll: number, width: number) => {
    const sp = spans.current;
    const mid = scroll + width / 2;
    const w = width * 0.7;
    let x = 0;
    for (let i = 0; i < sp.length - 1; i++) {
      const gap = (sp[i].end + sp[i + 1].start) / 2;
      x = i + smooth(Math.max(0, Math.min(1, (mid - (gap - w / 2)) / w)));
      if (mid < gap + w / 2) break;
    }
    return x;
  };
  const place = () => {
    const el = walk.current;
    if (!el || !spans.current.length) return 0;
    const last = rooms.length - 1;
    const max = Math.max(1, el.scrollWidth - el.clientWidth);
    const s = Math.max(0, Math.min(max, el.scrollLeft));
    const ramp = Math.min(max / 2, el.clientWidth * 0.6);
    const x =
      natural(s, el.clientWidth) -
      natural(0, el.clientWidth) * (1 - smooth(Math.min(1, s / ramp))) +
      (last - natural(max, el.clientWidth)) * smooth(Math.max(0, 1 - (max - s) / ramp));
    return Math.max(0, Math.min(last, x));
  };

  // The room remembered for the rest of the studio: written once the walk has come to rest.
  const remember = useRef(0);
  const shown = useRef(ri);
  // The forms turn towards the buyer as the walk carries them past: one at the middle of the
  // screen faces square on, one to either side turns its front in towards the middle.
  const forms = useRef<{ el: HTMLElement; mid: number }[]>([]);
  const turnForms = () => {
    const el = walk.current;
    if (!el) return;
    const centre = el.scrollLeft + el.clientWidth / 2;
    const reach = Math.max(320, el.clientWidth * 0.6);
    for (const f of forms.current) {
      const d = Math.max(-1, Math.min(1, (f.mid - centre) / reach));
      f.el.style.setProperty('--turnf', (-d).toFixed(3));
    }
  };
  const paint = (x: number) => {
    turnForms();
    const n = rooms.length;
    const k = Math.min(n - 2, Math.floor(x));
    const f = x - k;
    const weight = (j: number) => Math.max(0, 1 - Math.abs(x - j));
    layers.current.forEach((l, j) => {
      if (l) l.style.opacity = weight(j).toFixed(3);
    });
    heads.current.forEach((h, j) => {
      if (!h) return;
      const w = weight(j);
      h.style.opacity = w.toFixed(3);
      h.style.transform = `translate3d(${((j - x) * 26).toFixed(1)}px, ${((1 - w) * 8).toFixed(1)}px, 0)`;
      h.style.visibility = w < 0.01 ? 'hidden' : 'visible';
    });
    if (marker.current) marker.current.style.transform = `translateX(${(x * 100).toFixed(2)}%)`;
    const a = rooms[k];
    const b = rooms[k + 1] ?? a;
    const s = root.current?.style;
    if (s) {
      s.setProperty('--room-fg', mix(a.fg, b.fg, f));
      s.setProperty('--room-sub', mix(a.sub, b.sub, f));
      s.setProperty('--room-accent', mix(a.accent, b.accent, f));
      const dk = weight(rooms.findIndex((r) => r.k === 'silk'));
      s.setProperty('--room-edge', mix(EDGE.light, EDGE.dark, dk));
      s.setProperty('--room-glass', mix(GLASS.light, GLASS.dark, dk));
      s.setProperty('--room-rim', mix(RIM.light, RIM.dark, dk));
    }
    // The room you are in, for the slider's labels: only when it changes, and the studio told of
    // it once the walk is still.
    const near = Math.round(x);
    if (near !== shown.current) {
      shown.current = near;
      setActive(rooms[near].k);
      window.clearTimeout(remember.current);
      remember.current = window.setTimeout(() => studio.setRoom(rooms[near].k), 300);
    }
  };
  const raf = useRef(0);
  const onScroll = () => {
    if (!raf.current)
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        paint(place());
      });
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(remember.current);
    },
    [],
  );

  const glideTo = (k: RoomKey, at: 'smooth' | 'now' = 'smooth') => {
    const el = walk.current;
    const first = el?.querySelector<HTMLElement>(`[data-room="${k}"]`);
    if (!el || !first) return;
    const pad = parseFloat(getComputedStyle(el.firstElementChild as HTMLElement).paddingLeft) || 0;
    const left = k === rooms[0].k ? 0 : Math.max(0, first.offsetLeft - pad);
    if (at === 'now') el.scrollLeft = left;
    else el.scrollTo({ left, behavior: 'smooth' });
  };

  // Measured and painted before the first frame, and again on a resize. Arriving in a room other
  // than the first (from elsewhere in the studio), the walk starts there.
  useLayoutEffect(() => {
    measure();
    if (ri > 0) glideTo(rooms[ri].k, 'now');
    paint(place());
    const ro = new ResizeObserver(() => {
      measure();
      paint(place());
    });
    if (walk.current) ro.observe(walk.current);
    if (root.current) ro.observe(root.current);
    document.fonts?.ready.then(() => measure()).catch(() => {});
    return () => ro.disconnect();
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={root}
      className="pc-view pc-showroom"
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', background: rooms[0].bg, overflow: 'hidden', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' } as CSSProperties}
    >
      {/* Each room's wall, floor and light, one layer apiece, blended by the walk. */}
      {rooms.map((r, j) => (
        <div
          key={r.k}
          ref={(el) => {
            layers.current[j] = el;
          }}
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: onFloor(r.bg), opacity: j === ri0 ? 1 : 0, willChange: 'opacity' }}
        >
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(40% 35% at 25% 0%, ${r.glow}, transparent 70%),radial-gradient(40% 35% at 75% 0%, ${r.glow}, transparent 70%)`,
            }}
          />
        </div>
      ))}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 100% at 50% 40%, transparent 60%, rgba(28,25,23,.14))' }} />
      <div style={{ position: 'relative', textAlign: 'center', padding: 'clamp(24px,4vh,44px) 20px 0' }}>
        {/* Every room's heading, set as a catalogue sets a section (an eyebrow between hairlines
            with the room's place in the walk, the name with its second word in gold italic, a
            fine gold rule, a line about the room), stacked in one place: the walk blends one into
            the next, each sliding a little the way the walk goes. */}
        <div style={{ display: 'grid', animation: 'rise .95s cubic-bezier(.22,.8,.2,1) both' }}>
          {rooms.map((room, j) => {
            const words = String(t[room.labelKey]).split(' ');
            const last = words.pop();
            return (
              <div
                key={room.k}
                ref={(el) => {
                  heads.current[j] = el;
                }}
                aria-hidden={j !== ri}
                style={{ gridArea: '1 / 1', opacity: j === ri0 ? 1 : 0, visibility: j === ri0 ? 'visible' : 'hidden', willChange: 'opacity, transform' }}
              >
                <div className="pc-sr-eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: room.accent }}>
                  <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(90deg, transparent, ${room.accent})`, opacity: 0.7 }} />
                  <span>
                    {t.theShowroom} · <span style={{ fontVariantNumeric: 'lining-nums' }}>{String(j + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}</span>
                  </span>
                  <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(270deg, transparent, ${room.accent})`, opacity: 0.7 }} />
                </div>
                {j === ri ? (
                  <h1 className="pc-sr-title" style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,5.4vw,64px)', lineHeight: 1.02, color: room.fg }}>
                    {words.join(' ')} <em style={{ fontWeight: 400, color: room.accent }}>{last}</em>
                  </h1>
                ) : (
                  <div className="pc-sr-title" style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,5.4vw,64px)', lineHeight: 1.02, color: room.fg }}>
                    {words.join(' ')} <em style={{ fontWeight: 400, color: room.accent }}>{last}</em>
                  </div>
                )}
                <Selvage style={{ margin: '16px auto 0', width: 64 }} />
                <p className="pc-sr-desc" style={{ margin: '12px auto 0', maxWidth: 420, fontFamily: FONT_DISPLAY, fontSize: 'clamp(16px,1.6vw,19px)', color: room.sub }}>{t[room.descKey]}</p>
              </div>
            );
          })}
        </div>
        {/* The rooms: three equal places in a glass pill, centred, with one dark marker that
            travels between them in step with the walk. */}
        <div
          role="group"
          data-guide="rooms"
          className="pc-sr-rooms"
          aria-label={t.showroom}
          style={{
            position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${rooms.length}, minmax(0, 1fr))`, width: 'min(100%, 420px)', margin: '20px auto 0',
            background: 'var(--room-glass, rgba(250,248,245,.62))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--room-rim, rgba(28,25,23,.08))', borderRadius: 999, padding: 4,
            boxShadow: dark ? '0 10px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)' : '0 10px 30px rgba(28,25,23,.08), inset 0 1px 0 rgba(255,255,255,.6)',
            transition: 'box-shadow 1.2s ease',
          }}
        >
          <span
            ref={marker}
            aria-hidden
            style={{
              position: 'absolute', top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${rooms.length})`, borderRadius: 999,
              background: 'linear-gradient(135deg,#26211D,#141110)', boxShadow: 'inset 0 0 0 1px rgba(201,169,110,.35), 0 6px 16px rgba(28,25,23,.25)',
              transform: `translateX(${ri0 * 100}%)`, willChange: 'transform',
            }}
          />
          {rooms.map((r) => (
            <button
              key={r.k}
              onClick={() => glideTo(r.k)}
              aria-pressed={active === r.k}
              className="pc-sr-room"
              style={{
                position: 'relative', cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent', border: 'none', borderRadius: 999,
                color: active === r.k ? '#FAF8F5' : dark ? 'rgba(250,248,245,.72)' : 'rgba(28,25,23,.7)',
                padding: '10px 6px', fontFamily: FONT_BODY, fontSize: 'clamp(10.5px, 2.9vw, 11.5px)', letterSpacing: '.08em',
                transition: 'color .5s ease',
              }}
            >
              {t[r.labelKey]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <div
          id="pc-walk"
          ref={walk}
          className="pc-nav"
          {...walkDrag}
          onScroll={onScroll}
          style={{ position: 'relative', overflowX: 'auto', overflowY: 'hidden', padding: '34px 0 30px', cursor: 'grab', touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
        >
          <div
            className="is-in pc-walk-row"
            style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(30px,4.5vw,64px)', padding: '0 clamp(34px,7vw,100px)', width: 'max-content', margin: '0 auto' }}
          >
            {stands.map((r, i) => (
              <div key={r.f.id} data-room={r.room}>
                <FabricForm
                  className="pc-hv-lift-14 pc-form-rise"
                  style={{ ['--d' as string]: `${720 + Math.min(i, 6) * 110}ms` }}
                  f={r.f}
                  no={fabricNo(studio.fabrics, r.f.id)}
                  onClick={(from) => studio.unroll(r.f, undefined, from)}
                  fg="var(--room-fg)"
                  sub="var(--room-sub)"
                  accent="var(--room-accent)"
                  shades={t.shades}
                />
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 90, pointerEvents: 'none', background: 'linear-gradient(270deg, var(--room-edge, rgba(240,235,226,.85)), transparent)' }} />
      </div>
      <div className="pc-sr-hint" style={{ position: 'relative', textAlign: 'center', paddingBottom: 26, fontSize: 11, letterSpacing: '.24em', color: 'var(--room-sub)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'pulse 3s infinite' }}>
          <svg width="26" height="10" viewBox="0 0 26 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden style={{ animation: 'pcNudge 2.4s ease-in-out infinite' }}>
            <path d="M0 5h22M18 1l4 4-4 4" />
          </svg>
          {t.scrollHint}
        </span>
      </div>
    </div>
  );
}
