'use client';

import { useEffect, useRef, useState } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricNo } from './helpers';
import { FabricRoll } from './FabricRoll';
import { useDragScroll } from './interactions';
import { ROOMS, type RoomKey } from '@/lib/fabric-generator';

/**
 * The Showroom: one continuous walk past every roll, 01 to 11, in the catalogue's order — the
 * Cotton Gallery, then the Rayon Room, then the Silk Gallery. As the walk is scrolled or dragged
 * from one room's rolls into the next, the slider follows and the room around it changes: its
 * wall and floor, its light, its title and its colours all cross-fade. A room in the slider glides
 * the walk to that room's first roll.
 */
export function Showroom({ studio }: { studio: Studio }) {
  const { t } = studio;
  const rooms = ROOMS;
  const [active, setActive] = useState<RoomKey>(rooms.some((r) => r.k === studio.room) ? studio.room : rooms[0].k);
  const room = rooms.find((r) => r.k === active) ?? rooms[0];
  const ri = rooms.indexOf(room);
  const walkDrag = useDragScroll();
  const walk = useRef<HTMLDivElement>(null);
  // While the walk glides to a room chosen in the slider, its scroll does not re-pick the room.
  const settling = useRef(0);
  const dark = room.k === 'silk';
  const roomFade = room.k === 'silk' ? 'rgba(35,30,26,.85)' : 'rgba(240,235,226,.85)';
  const rolls = rooms.flatMap((r) => r.ids.map((id) => ({ f: studio.fab(id), room: r.k })));

  const choose = (k: RoomKey) => {
    setActive(k);
    studio.setRoom(k);
  };

  // The room at the middle of the walk is the room you are in; at the far end, the last room.
  const onScroll = () => {
    const el = walk.current;
    if (!el || Date.now() < settling.current) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let here: RoomKey = rooms[0].k;
    el.querySelectorAll<HTMLElement>('[data-room]').forEach((n) => {
      if (n.offsetLeft + n.offsetWidth / 2 <= mid) here = n.dataset.room as RoomKey;
    });
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) here = rooms[rooms.length - 1].k;
    if (here !== active) choose(here);
  };

  const glideTo = (k: RoomKey, behavior: ScrollBehavior = 'smooth') => {
    const el = walk.current;
    const first = el?.querySelector<HTMLElement>(`[data-room="${k}"]`);
    if (!el || !first) return;
    settling.current = Date.now() + 1100;
    choose(k);
    const pad = parseFloat(getComputedStyle(el.firstElementChild as HTMLElement).paddingLeft) || 0;
    el.scrollTo({ left: k === rooms[0].k ? 0 : Math.max(0, first.offsetLeft - pad), behavior });
  };

  // Arriving in a room other than the first (from elsewhere in the studio): start the walk there.
  useEffect(() => {
    if (active === rooms[0].k) return;
    const tm = window.setTimeout(() => glideTo(active, 'auto'), 0);
    return () => window.clearTimeout(tm);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="pc-view"
      style={{ position: 'relative', background: rooms[0].bg, overflow: 'hidden', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both' }}
    >
      {/* Each room's wall, floor and light, one layer apiece, cross-fading as the walk moves. */}
      {rooms.map((r) => (
        <div
          key={r.k}
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: r.bg, opacity: r.k === active ? 1 : 0, transition: 'opacity 1.4s cubic-bezier(.4,0,.2,1)' }}
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
        {/* The room's heading, set as a catalogue sets a section: an eyebrow between hairlines with
            the room's place in the walk, the room's name with its second word in gold italic, a
            fine gold rule, and a line about the room in the display serif. Each part rises in
            again as the walk moves into the next room. */}
        <div key={`e${room.k}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: room.accent, transition: 'color 1s ease', animation: 'pcVeil .9s ease both' }}>
          <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(90deg, transparent, ${room.accent})`, opacity: 0.7 }} />
          <span>{t.theShowroom} · <span style={{ fontVariantNumeric: 'lining-nums' }}>{String(ri + 1).padStart(2, '0')} / {String(rooms.length).padStart(2, '0')}</span></span>
          <span aria-hidden style={{ width: 'clamp(22px,6vw,48px)', height: 1, background: `linear-gradient(270deg, transparent, ${room.accent})`, opacity: 0.7 }} />
        </div>
        <h1 key={`h${room.k}`} style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,5.4vw,64px)', lineHeight: 1.02, color: room.fg, transition: 'color 1s ease', animation: 'rise .95s cubic-bezier(.22,.8,.2,1) both' }}>
          {(() => {
            const words = String(t[room.labelKey]).split(' ');
            const last = words.pop();
            return (
              <>
                {words.join(' ')} <em style={{ fontWeight: 400, color: room.accent, transition: 'color 1s ease' }}>{last}</em>
              </>
            );
          })()}
        </h1>
        <Selvage key={`r${room.k}`} style={{ margin: '16px auto 0', width: 64 }} />
        <p key={`p${room.k}`} style={{ margin: '12px auto 0', maxWidth: 420, fontFamily: FONT_DISPLAY, fontSize: 'clamp(16px,1.6vw,19px)', color: room.sub, transition: 'color 1s ease', animation: 'rise .95s .1s cubic-bezier(.22,.8,.2,1) both' }}>{t[room.descKey]}</p>
        {/* The rooms: three equal places in a glass pill, centred, with one dark marker that
            slides between them as the walk moves — no chip is repainted, the marker travels. */}
        <div
          role="group"
          aria-label={t.showroom}
          style={{
            position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${rooms.length}, minmax(0, 1fr))`, width: 'min(100%, 420px)', margin: '20px auto 0',
            // Light glass in the light rooms, dark glass in the Silk Gallery, easing between them.
            background: dark ? 'rgba(20,17,15,.45)' : 'rgba(250,248,245,.62)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: dark ? '1px solid rgba(201,169,110,.22)' : '1px solid rgba(28,25,23,.08)', borderRadius: 999, padding: 4,
            boxShadow: dark ? '0 10px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)' : '0 10px 30px rgba(28,25,23,.08), inset 0 1px 0 rgba(255,255,255,.6)',
            transition: 'background 1.2s ease, border-color 1.2s ease, box-shadow 1.2s ease',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute', top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${rooms.length})`, borderRadius: 999,
              background: 'linear-gradient(135deg,#26211D,#141110)', boxShadow: 'inset 0 0 0 1px rgba(201,169,110,.35), 0 6px 16px rgba(28,25,23,.25)',
              transform: `translateX(${ri * 100}%)`, transition: 'transform .8s cubic-bezier(.22,.8,.2,1)',
            }}
          />
          {rooms.map((r) => (
            <button
              key={r.k}
              onClick={() => glideTo(r.k)}
              aria-pressed={active === r.k}
              style={{
                position: 'relative', cursor: 'pointer', whiteSpace: 'nowrap', background: 'transparent', border: 'none', borderRadius: 999,
                color: active === r.k ? '#FAF8F5' : dark ? 'rgba(250,248,245,.72)' : 'rgba(28,25,23,.7)',
                padding: '10px 6px', fontFamily: FONT_BODY, fontSize: 'clamp(10.5px, 2.9vw, 11.5px)', letterSpacing: '.08em',
                transition: 'color .7s ease',
              }}
            >
              {t[r.labelKey]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div
          id="pc-walk"
          ref={walk}
          className="pc-nav"
          {...walkDrag}
          onScroll={onScroll}
          style={{ position: 'relative', overflowX: 'auto', padding: '34px 0 30px', cursor: 'grab', touchAction: 'pan-y' }}
        >
          <div
            className="is-in"
            style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(30px,4.5vw,64px)', padding: '0 clamp(34px,7vw,100px)', minWidth: 'max-content' }}
          >
            {rolls.map((r, i) => (
              <div key={r.f.id} data-room={r.room}>
                <FabricRoll
                  className="pc-hv-lift-14 pc-roll-rise"
                  style={{ ['--d' as string]: `${720 + Math.min(i, 6) * 110}ms` }}
                  f={r.f}
                  no={fabricNo(studio.fabrics, r.f.id)}
                  onClick={() => studio.unroll(r.f)}
                  fg={room.fg}
                  sub={room.sub}
                  accent={room.accent}
                  shades={t.shades}
                />
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 90, pointerEvents: 'none', background: `linear-gradient(270deg,${roomFade},transparent)`, transition: 'background 1s ease' }} />
      </div>
      <div style={{ position: 'relative', textAlign: 'center', paddingBottom: 26, fontSize: 11, letterSpacing: '.24em', color: room.sub, transition: 'color 1s ease' }}>
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
