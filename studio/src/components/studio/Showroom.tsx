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
        <div key={`e${room.k}`} style={{ fontSize: 10, letterSpacing: '.5em', color: room.accent, transition: 'color 1s ease', animation: 'pcVeil .9s ease both' }}>
          {t.showroom} · {ri + 1} / {rooms.length}
        </div>
        <h1 key={`h${room.k}`} style={{ margin: '8px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(32px,4.2vw,54px)', color: room.fg, animation: 'rise .9s cubic-bezier(.22,.8,.2,1) both' }}>
          {t[room.labelKey]}
        </h1>
        <Selvage style={{ margin: '10px auto 0' }} />
        <p key={`p${room.k}`} style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 300, color: room.sub, animation: 'rise .9s .08s cubic-bezier(.22,.8,.2,1) both' }}>{t[room.descKey]}</p>
        <div
          className="pc-nav"
          style={{
            position: 'relative', display: 'inline-flex', gap: 4, marginTop: 16, background: 'rgba(250,248,245,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(28,25,23,.1)', borderRadius: 999, padding: 5, maxWidth: '94vw',
          }}
        >
          {rooms.map((r) => (
            <button
              key={r.k}
              onClick={() => glideTo(r.k)}
              aria-pressed={active === r.k}
              style={{
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: active === r.k ? '#1C1917' : 'transparent',
                color: active === r.k ? '#FAF8F5' : '#1C1917',
                border: 'none', borderRadius: 999, padding: '8px 16px', fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.1em',
                transition: 'background .7s cubic-bezier(.22,.8,.2,1), color .7s ease',
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
