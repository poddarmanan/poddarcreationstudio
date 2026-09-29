'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';
import { Binding, BindingStrip, CoverFace, Fleuron, GiltBlock, HINGE, MARBLE, paperFace } from './SwatchBook';

/** The ceremony's stages: the cuttings scattered, gathering into the book, its leaves collated, the cover shut, and the book sent. */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const MAX_SHOWN = 18;

/**
 * After a swatch book is ordered: the buyer's loose cuttings are compiled and bound. They appear
 * scattered round the room, fly one by one onto the open book's page, the leaves are collated, the
 * leather cover swings shut and its clasp is pushed home, and the finished book is shown going out
 * on WhatsApp to the number the buyer gave.
 */
export function BookCeremony({ studio, whatsapp, onDone }: { studio: Studio; whatsapp: string; onDone: () => void }) {
  const { t, fabrics, pins } = studio;
  const cuts = fabrics.flatMap((x) =>
    pins
      .filter((p) => p.fabricId === x.id)
      .map((p) => ({ x, c: x.colours.find((cc) => cc.order === p.colourOrder) }))
      .filter((k): k is { x: FabricRow; c: ColourRow } => !!k.c),
  );
  const shown = cuts.slice(0, MAX_SHOWN);
  const n = shown.length;
  const nFabrics = new Set(cuts.map((k) => k.x.id)).size;
  const counts = `${cuts.length} ${cuts.length === 1 ? t.shade : t.shades} · ${nFabrics} ${nFabrics === 1 ? t.fabricWordOne : t.fabricWordMany}`;

  // One cutting lands every STEP ms; the rest of the timeline follows from when the last one lands.
  const STEP = Math.round(Math.min(120, 1500 / Math.max(1, n)));
  const [stage, setStage] = useState<Stage>(0);
  const [read, setRead] = useState(false);
  useEffect(() => {
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gathered = 1400 + n * STEP + 700;
    const at: [number, Stage][] = quick
      ? [[50, 5]]
      : [[60, 1], [1400, 2], [gathered, 3], [gathered + 1200, 4], [gathered + 1200 + 2300, 5]];
    const timers = at.map(([ms, s]) => window.setTimeout(() => setStage(s), ms));
    timers.push(window.setTimeout(() => setRead(true), (quick ? 50 : gathered + 3500) + 1600));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [n, STEP]);

  const caption = stage < 3 ? t.compiling : stage === 3 ? t.bindingWord : t.boundWord;
  const sending = stage === 5;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.orderBook}
      style={{
        position: 'fixed', inset: 0, zIndex: 120, overflow: 'hidden', color: '#F3E9D6', fontFamily: FONT_BODY,
        background: 'radial-gradient(80% 60% at 50% 42%, #3B2618 0%, #22150D 55%, #120B06 100%)', animation: 'pcFadeIn .6s ease both',
        // The book's width, which the flying cuttings aim by.
        ['--bw' as string]: 'min(72vw, 300px)',
      } as CSSProperties}
    >
      {/* A pool of lamplight on the table. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(38% 30% at 50% 52%, rgba(255,214,150,.16), transparent 70%)', pointerEvents: 'none' }} />

      {/* The caption: what is happening now. */}
      <div style={{ position: 'absolute', top: 'max(6vh, 34px)', left: 16, right: 16, textAlign: 'center', transition: 'opacity .6s ease, transform .6s ease', opacity: sending ? 0 : 1, transform: sending ? 'translateY(-10px)' : 'none' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: 'rgba(214,180,120,.85)' }}>{t.book}</div>
        <div key={caption} className="pc-foil" style={{ marginTop: 12, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(26px,6.4vw,40px)', lineHeight: 1.1, animation: 'rise .7s cubic-bezier(.22,.8,.2,1) both' }}>
          {caption}
        </div>
        <div style={{ marginTop: 10, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(243,233,214,.55)', fontVariantNumeric: 'lining-nums' }}>{counts}</div>
      </div>

      {/* The book, open on the table, and bound as the ceremony goes on. */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '53%', width: 'var(--bw)', transform: sending ? 'translate(-50%,-50%) translateY(-6vh) scale(.42)' : 'translate(-50%,-50%)',
          opacity: sending ? 0 : 1, transition: 'transform .9s cubic-bezier(.6,.02,.3,1), opacity .7s .25s ease',
        }}
      >
        <Binding width="100%" padded>
          <div style={{ position: 'relative', width: '100%', height: '100%', perspective: '1400px' }}>
            <GiltBlock />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: paperFace('left'), padding: `10px 10px 10px ${HINGE + 9}px`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gridAutoRows: 'minmax(0, 15%)', gap: 6, alignContent: 'start' }}>
              {shown.map(({ x, c }, i) => (
                <div
                  key={`${x.id}-${c.order}`}
                  className="pc-pinked"
                  style={{
                    background: fabricTex(x, c, 3), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
                    opacity: stage >= 2 ? 1 : 0, transform: stage >= 2 ? 'none' : 'scale(1.3)',
                    transition: `opacity .35s ease ${i * STEP + 560}ms, transform .45s cubic-bezier(.2,.8,.25,1) ${i * STEP + 540}ms`,
                  }}
                />
              ))}
            </div>
            {/* Leaves collated over the page as the book is made up. */}
            {stage === 3 &&
              [0, 1, 2].map((k) => (
                <div
                  key={k}
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, zIndex: 20 + k, transformOrigin: `${HINGE}px 50%`, transformStyle: 'preserve-3d', animation: `pcLeafTurn .75s cubic-bezier(.55,.06,.35,1) ${k * 220}ms both` }}
                >
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: 2, background: paperFace('left'), boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: 2, background: paperFace('right'), filter: 'brightness(.95)' }} />
                </div>
              ))}
            <BindingStrip />
          </div>
          {/* The cover swings shut over the pages, and the clasp is pushed home. */}
          {stage >= 4 && (
            <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0, zIndex: 30, transformOrigin: 'left center', transformStyle: 'preserve-3d', animation: 'pcCoverClose 1.4s cubic-bezier(.6,.02,.3,1) both' }}>
              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                <CoverFace t={t} userName={studio.userName} line={counts} claspAnimation="pcClaspOn .55s 1.45s cubic-bezier(.3,.7,.3,1) both" />
              </div>
              <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: '10px 0 0 10px', background: `${MARBLE} center / cover`, boxShadow: 'inset 0 0 0 10px #40101A, inset 0 0 0 11px rgba(205,169,96,.7), inset 0 0 30px rgba(0,0,0,.35)' }} />
            </div>
          )}
        </Binding>
      </div>

      {/* The loose cuttings: scattered round the room, then flying one by one onto the page. */}
      {shown.map(({ x, c }, i) => {
        const a = i * 2.39996; // the golden angle, so they spread evenly
        const rad = 34 + ((i * 37) % 12);
        const sx = Math.cos(a) * Math.min(rad, 40);
        // Kept below the caption at the top of the room.
        const sy = Math.max(-26, Math.sin(a) * rad * 0.95);
        const r = ((i * 53) % 44) - 22;
        const col = i % 3;
        const row = Math.floor(i / 3);
        const scattered = `translate(${sx.toFixed(1)}vw, ${sy.toFixed(1)}vh) rotate(${r}deg)`;
        // Where its miniature sits on the page: the page grid's column and row centres, as fractions of the book's width.
        const landed = `translate(calc(var(--bw) * ${((col - 1) * 0.235 + 0.059).toFixed(3)}), calc(var(--bw) * ${(row * 0.195 - 0.509).toFixed(3)} + 3vh)) rotate(0deg) scale(.72)`;
        return (
          <div
            key={`${x.id}-${c.order}`}
            aria-hidden
            style={{
              position: 'absolute', left: '50%', top: '50%', width: 70, height: 86, marginLeft: -35, marginTop: -43, zIndex: 50, pointerEvents: 'none',
              filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.45))',
              transform: stage >= 2 ? landed : stage === 1 ? scattered : `${scattered} scale(.5)`,
              opacity: stage >= 2 ? 0 : stage === 1 ? 1 : 0,
              transition:
                stage >= 2
                  ? `transform .62s cubic-bezier(.55,.05,.3,1) ${i * STEP}ms, opacity .18s ease ${i * STEP + 520}ms`
                  : `transform .8s cubic-bezier(.2,.8,.25,1) ${i * 45}ms, opacity .5s ease ${i * 45}ms`,
            }}
          >
            <div className="pc-pinked" style={{ position: 'absolute', inset: 0, background: fabricTex(x, c, 3) }} />
          </div>
        );
      })}

      {/* The finished book, going out on WhatsApp to the buyer's number. */}
      {sending && <Delivery t={t} whatsapp={whatsapp} counts={counts} userName={studio.userName} read={read} onDone={onDone} />}
    </div>,
    document.body,
  );
}

function Delivery({ t, whatsapp, counts, userName, read, onDone }: { t: Record<string, string>; whatsapp: string; counts: string; userName: string | null; read: boolean; onDone: () => void }) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', animation: 'rise .8s .1s cubic-bezier(.22,.8,.2,1) both' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: 'rgba(214,180,120,.85)' }}>{t.onItsWay}</div>
        <div className="pc-foil" style={{ marginTop: 10, fontFamily: FONT_DISPLAY, fontSize: 'clamp(26px,6.6vw,38px)', lineHeight: 1.1, fontVariantNumeric: 'lining-nums' }}>{whatsapp}</div>
        <div style={{ marginTop: 6, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, color: 'rgba(243,233,214,.7)' }}>{t.onWhatsApp}</div>
      </div>

      {/* The chat: the book as it arrives in the buyer's WhatsApp. */}
      <div style={{ marginTop: 22, width: 'min(100%, 360px)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)', animation: 'rise .9s .25s cubic-bezier(.22,.8,.2,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: '#075E54', color: '#fff' }}>
          <span aria-hidden style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #5E1B21, #2A080D)', color: '#E9CF8F', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, boxShadow: 'inset 0 0 0 1px rgba(205,169,96,.6)' }}>PC</span>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '.01em' }}>Poddar Creation</div>
            <div style={{ fontSize: 11, opacity: 0.75, fontVariantNumeric: 'lining-nums' }}>
              {t.youWord}: {whatsapp}
            </div>
          </div>
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', opacity: 0.9 }}>
            <path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8.6 8.2c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5l.7 1.7c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.4 0 .6.6 1 1.4 1.8 2.5 2.4.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.4 0 .6-.2 1.2-.8 1.6-.6.4-1.5.6-2.6.2-2.2-.8-4-2.5-5.1-4.5-.6-1.1-.6-2.2-.3-2.8Z" fill="#fff" />
          </svg>
        </div>
        <div style={{ padding: '16px 12px 14px', background: '#ECE5DD', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', width: 'min(100%, 250px)', padding: 5, borderRadius: '10px 2px 10px 10px', background: '#DCF8C6', boxShadow: '0 1px 1px rgba(0,0,0,.12)', animation: 'pcBubbleIn .7s .7s cubic-bezier(.2,.8,.25,1) both', color: '#1C1917' }}>
            {/* The cover, as the file's preview. */}
            <div style={{ height: 150, borderRadius: 7, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'radial-gradient(80% 80% at 50% 40%, #F6EFE2, #E1D5C0)' }}>
              <div style={{ width: 96, height: 128, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 240, transform: 'scale(.4)', transformOrigin: '0 0' }}>
                  <Binding width="240px" padded={false}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0 }}>
                      <CoverFace t={t} userName={userName} />
                    </div>
                  </Binding>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '6px 2px 0', padding: '8px 8px', borderRadius: 6, background: 'rgba(0,0,0,.05)' }}>
              <span aria-hidden style={{ width: 26, height: 32, borderRadius: 3, background: '#C9402F', color: '#fff', fontSize: 7.5, fontWeight: 600, display: 'grid', placeItems: 'end center', paddingBottom: 4, flex: 'none' }}>PDF</span>
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.bookFile}.pdf</div>
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,.5)', fontVariantNumeric: 'lining-nums' }}>{counts}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, margin: '4px 4px 0', fontSize: 10.5, color: 'rgba(0,0,0,.45)', fontVariantNumeric: 'lining-nums' }}>
              {time}
              <svg aria-label={read ? 'Delivered' : 'Sent'} width="17" height="11" viewBox="0 0 17 11" fill="none" stroke={read ? '#34B7F1' : 'rgba(0,0,0,.4)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke .5s ease' }}>
                <path d="M1 6l3 3 6-7.5" />
                {read && <path d="M7 9l1 .9 6.5-8" />}
              </svg>
            </div>
          </div>
        </div>
      </div>

      <p style={{ margin: '18px 0 10px', maxWidth: 330, textAlign: 'center', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: 'rgba(243,233,214,.62)', animation: 'rise .8s .5s cubic-bezier(.22,.8,.2,1) both' }}>{t.bookDone}</p>
      <div style={{ marginTop: 6, animation: 'rise .8s .6s cubic-bezier(.22,.8,.2,1) both' }}>
        <Fleuron width={26} color="rgba(205,169,96,.7)" />
      </div>
      <button
        onClick={onDone}
        className="pc-hv-scale-06"
        style={{
          cursor: 'pointer', marginTop: 16, borderRadius: 999, padding: '13px 40px', fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.22em', textTransform: 'uppercase',
          background: 'linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.03))', color: '#F3E9D6', border: '1px solid rgba(205,169,96,.6)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', animation: 'rise .8s .7s cubic-bezier(.22,.8,.2,1) both',
        }}
      >
        {t.done}
      </button>
    </div>
  );
}
