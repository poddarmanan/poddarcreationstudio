'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricNo } from './helpers';
import { FabricRoll } from './FabricRoll';
import { useDragScroll, scrollByEl } from './interactions';
import { ROOMS } from '@/lib/fabric-generator';

export function Showroom({ studio }: { studio: Studio }) {
  const { t, room: roomKey } = studio;
  const rooms = ROOMS;
  const room = rooms.find((r) => r.k === roomKey) ?? rooms[0];
  const ri = rooms.indexOf(room);
  const next = rooms[(ri + 1) % rooms.length];
  const prev = rooms[(ri + rooms.length - 1) % rooms.length];
  const walkDrag = useDragScroll();
  const roomFade = room.k === 'silk' ? 'rgba(35,30,26,.85)' : 'rgba(240,235,226,.85)';

  const rolls = room.ids.map((id) => ({ f: studio.fab(id) }));

  return (
    <div
      className="pc-view"
      style={{
        position: 'relative', background: room.bg, overflow: 'hidden',
        transition: 'background 1s', animation: 'layCloth .95s cubic-bezier(.22,.8,.2,1) both',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(40% 35% at 25% 0%, ${room.glow}, transparent 70%),radial-gradient(40% 35% at 75% 0%, ${room.glow}, transparent 70%)`,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 100% at 50% 40%, transparent 60%, rgba(28,25,23,.14))' }} />
      <div
        key={room.k}
        style={{ position: 'relative', textAlign: 'center', padding: 'clamp(24px,4vh,44px) 20px 0', animation: 'rise .95s cubic-bezier(.22,.8,.2,1) both' }}
      >
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: room.accent }}>
          {t.showroom} · {ri + 1} / {rooms.length}
        </div>
        <h1 style={{ margin: '8px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(32px,4.2vw,54px)', color: room.fg }}>
          {t[room.labelKey]}
        </h1>
        <Selvage style={{ margin: '10px auto 0' }} />
        <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 300, color: room.sub }}>{t[room.descKey]}</p>
        <div
          className="pc-nav"
          style={{
            display: 'inline-flex', gap: 6, marginTop: 16, background: 'rgba(250,248,245,.55)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(28,25,23,.1)', borderRadius: 999, padding: 5, maxWidth: '94vw', overflowX: 'auto',
          }}
        >
          <button onClick={() => studio.setRoom(prev.k)} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 15, padding: '5px 10px', color: '#1C1917' }}>
            ‹
          </button>
          {rooms.map((r) => (
            <button
              key={r.k}
              onClick={() => studio.setRoom(r.k)}
              style={{
                cursor: 'pointer',
                background: roomKey === r.k ? '#1C1917' : 'transparent',
                color: roomKey === r.k ? '#FAF8F5' : '#1C1917',
                border: 'none', borderRadius: 999, padding: '7px 15px', fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.1em',
              }}
            >
              {t[r.labelKey]}
            </button>
          ))}
          <button onClick={() => studio.setRoom(next.k)} style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 15, padding: '5px 10px', color: '#1C1917' }}>
            ›
          </button>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
      <div
        id="pc-walk"
        className="pc-nav"
        {...walkDrag}
        style={{ position: 'relative', overflowX: 'auto', padding: '34px 0 30px', cursor: 'grab', touchAction: 'pan-y' }}
      >
        <div
          key={room.k}
          style={{
            display: 'flex', alignItems: 'flex-end', gap: 'clamp(30px,4.5vw,64px)', padding: '0 clamp(34px,7vw,100px)',
            minWidth: 'max-content', animation: 'roomIn 1.05s cubic-bezier(.22,.8,.2,1) both',
          }}
        >
          {rolls.map((r) => (
            <FabricRoll
              key={r.f.id}
              f={r.f}
              no={fabricNo(studio.fabrics, r.f.id)}
              onClick={() => studio.unroll(r.f)}
              fg={room.fg}
              sub={room.sub}
              accent={room.accent}
              shades={t.shades}
            />
          ))}
          <div
            onClick={() => studio.setRoom(next.k)}
            className="pc-hv-gold-text"
            style={{ cursor: 'pointer', alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 20px', color: room.sub }}
          >
            <div style={{ width: 52, height: 110, border: '1px solid rgba(28,25,23,.2)', borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              ›
            </div>
            <div style={{ fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase' }}>{t[next.labelKey]}</div>
          </div>
        </div>
      </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 90, pointerEvents: 'none', background: `linear-gradient(270deg,${roomFade},transparent)` }} />
        <button
          onClick={() => scrollByEl('pc-walk', -520)}
          aria-label="Scroll left"
          className="pc-hv-ink-fill"
          style={{
            cursor: 'pointer', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%',
            border: '1px solid rgba(28,25,23,.15)', background: 'rgba(250,248,245,.82)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(28,25,23,.14)',
            fontSize: 18, color: '#1C1917', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .25s,color .25s',
          }}
        >
          ‹
        </button>
        <button
          onClick={() => scrollByEl('pc-walk', 520)}
          aria-label="Scroll right"
          className="pc-hv-ink-fill"
          style={{
            cursor: 'pointer', position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%',
            border: '1px solid rgba(28,25,23,.15)', background: 'rgba(250,248,245,.82)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(28,25,23,.14)',
            fontSize: 18, color: '#1C1917', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .25s,color .25s',
          }}
        >
          ›
        </button>
      </div>
      <div style={{ position: 'relative', textAlign: 'center', paddingBottom: 26, fontSize: 11, letterSpacing: '.24em', color: room.sub }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, animation: 'pulse 3s infinite' }}>
          <svg width="26" height="10" viewBox="0 0 26 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M0 5h22M18 1l4 4-4 4" />
          </svg>
          {t.scrollHint}
        </span>
      </div>
    </div>
  );
}
