'use client';

import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, colourShade, fabricWeave, heroColour } from './helpers';
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

  const rolls = room.ids
    .map((id) => studio.fab(id))
    .map((f) => {
      const o = heroColour(f);
      const w = parseFloat(f.weight);
      return {
        f,
        h: Math.round(190 + w * 7),
        top1: colourShade(o, 0.1),
        top2: colourShade(o, -0.07),
        s1: colourShade(o, -0.28),
        s2: colourShade(o, -0.1),
        mid: colourShade(o, 0.08),
        s3: colourShade(o, -0.12),
        s4: colourShade(o, -0.32),
        weave: fabricWeave(f, o, 3),
      };
    });

  return (
    <div
      className="pc-view"
      style={{
        position: 'relative', background: room.bg, overflow: 'hidden',
        transition: 'background 1s', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both',
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
        style={{ position: 'relative', textAlign: 'center', padding: 'clamp(24px,4vh,44px) 20px 0', animation: 'rise .6s cubic-bezier(.2,.8,.2,1) both' }}
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
            minWidth: 'max-content', animation: 'roomIn .7s cubic-bezier(.2,.8,.2,1) both',
          }}
        >
          {rolls.map((r) => (
            <div
              key={r.f.id}
              onClick={() => studio.unroll(r.f)}
              className="pc-hv-lift-14"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'transform .4s cubic-bezier(.2,.8,.2,1)' }}
            >
              <div style={{ position: 'relative', width: 92, height: r.h }}>
                <div
                  style={{
                    position: 'absolute', top: -12, left: 0, width: 92, height: 24, borderRadius: '50%',
                    background: `radial-gradient(ellipse at 42% 40%, ${r.top1}, ${r.top2} 70%)`, border: '1px solid rgba(28,25,23,.12)',
                  }}
                />
                <div style={{ position: 'absolute', top: -4, left: 33, width: 26, height: 9, borderRadius: '50%', background: '#EFE9DF', border: '1px solid rgba(28,25,23,.18)' }} />
                <div
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '0 0 7px 7px',
                    background: `linear-gradient(90deg, ${r.s1} 0%, ${r.s2} 16%, ${r.mid} 42%, ${r.mid} 58%, ${r.s3} 84%, ${r.s4} 100%)`,
                    boxShadow: 'inset 0 -34px 44px rgba(28,25,23,.13)',
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, background: r.weave, opacity: 0.5, borderRadius: '0 0 7px 7px' }} />
                <div
                  style={{
                    position: 'absolute', left: -16, right: -16, bottom: -13, height: 20, borderRadius: '50%',
                    background: 'radial-gradient(ellipse, rgba(28,25,23,.32), transparent 70%)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, height: 60, marginTop: 14, borderRadius: '7px 7px 0 0',
                    background: `linear-gradient(90deg, ${r.s1} 0%, ${r.s2} 16%, ${r.mid} 42%, ${r.mid} 58%, ${r.s3} 84%, ${r.s4} 100%)`,
                    opacity: 0.14, transform: 'scaleY(-1)', maskImage: 'linear-gradient(180deg,transparent, #000)',
                  }}
                />
              </div>
              <div style={{ marginTop: 32, textAlign: 'center', position: 'relative', zIndex: 2 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: room.fg }}>{r.f.name}</div>
                <div style={{ fontSize: 11, letterSpacing: '.14em', color: room.sub, marginTop: 3 }}>
                  {r.f.weight} · {r.f.width}
                </div>
                <div style={{ fontSize: 10.5, letterSpacing: '.1em', color: room.accent, marginTop: 3 }}>
                  {r.f.nc} {t.shades}
                </div>
              </div>
            </div>
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
