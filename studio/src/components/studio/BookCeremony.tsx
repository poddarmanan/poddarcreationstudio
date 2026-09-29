'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { ColourRow } from '@/lib/types';
import { FONT_DISPLAY, FONT_BODY, fabricTex } from './helpers';
import { Binding, BindingStrip, CoverFace, GiltBlock, HINGE, MARBLE, paperFace } from './SwatchBook';
import { buildSwatchBookPdf, resolveFont, saveBlob } from '@/lib/swatch-book-pdf';

/** How an order placed from the ceremony went: still going, saved, refused, or the static preview (which has no server). */
export type OrderState = 'pending' | 'sent' | 'failed' | 'demo';

/**
 * The ceremony's stages: the room darkens (0), the open book comes up (1), the cuttings are
 * strewn round it (2), fly one by one onto its page (3), the binding is screwed home (4), the cover
 * swings shut and is clasped (5), and the finished book is handed over (6).
 */
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MAX_SHOWN = 24;
const FLIGHT = 850;
const FILE_NAME = 'Poddar-Swatch-Book.pdf';

/**
 * The swatch book compiled and bound in front of the buyer. After an order, it ends on the book
 * going out on WhatsApp to the number they gave; as a preview, on the bound book itself. Either way
 * the book can be downloaded as a PDF.
 *
 * Only transforms and opacity move. Each cutting is one element from start to finish: it is laid
 * out in its place on the page, measured there, set out across the room by a transform, and flies
 * home by taking that transform away — so it lands exactly where it stays, with nothing swapped.
 */
export function BookCeremony({ studio, mode, whatsapp = '', order = 'sent', onDone }: { studio: Studio; mode: 'order' | 'preview'; whatsapp?: string; order?: OrderState; onDone: () => void }) {
  const { t, fabrics, pins } = studio;
  const chapters = fabrics
    .map((fabric) => ({
      fabric,
      colours: pins
        .filter((p) => p.fabricId === fabric.id)
        .map((p) => fabric.colours.find((c) => c.order === p.colourOrder))
        .filter((c): c is ColourRow => !!c),
    }))
    .filter((ch) => ch.colours.length);
  const cuts = chapters.flatMap((ch) => ch.colours.map((c) => ({ x: ch.fabric, c })));
  const shown = cuts.slice(0, MAX_SHOWN);
  const n = shown.length;
  const cols = n <= 9 ? 3 : 4;
  const counts = `${cuts.length} ${cuts.length === 1 ? t.shade : t.shades} · ${chapters.length} ${chapters.length === 1 ? t.fabricWordOne : t.fabricWordMany}`;
  const STEP = Math.round(Math.min(95, 1300 / Math.max(1, n)));

  const [stage, setStage] = useState<Stage>(0);
  const [bound, setBound] = useState(false);
  const [offsets, setOffsets] = useState<{ x: number; y: number; r: number }[] | null>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const [quick] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // The timeline, up to the book being bound; handing it over waits for the order to settle.
  useEffect(() => {
    if (quick) {
      const tm = window.setTimeout(() => {
        setStage(5);
        setBound(true);
      }, 60);
      return () => window.clearTimeout(tm);
    }
    const landed = 2050 + (n - 1) * STEP + FLIGHT;
    const measure = () => {
      // Where each cutting is strewn: across the table below the caption, in an even, seeded spread.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = (captionRef.current?.getBoundingClientRect().bottom ?? vh * 0.2) + 40;
      setOffsets(
        tiles.current.slice(0, n).map((el, i) => {
          const r = el?.getBoundingClientRect();
          if (!r) return { x: 0, y: 0, r: 0 };
          const u = (i * 0.618034 + 0.13) % 1;
          const v = (i * 0.754877 + 0.41) % 1;
          const x = vw * (0.1 + 0.8 * u);
          const y = top + (vh - top - 70) * v;
          return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2), r: ((i * 53) % 50) - 25 };
        }),
      );
    };
    const at: [number, () => void][] = [
      [300, () => setStage(1)],
      [1150, measure],
      [1250, () => setStage(2)],
      [2050, () => setStage(3)],
      // As the last cutting settles the posts are screwed home; then the cover swings shut
      // (1.2 s) and is clasped (0.55 s), and the bound book is held a moment before it is handed over.
      [landed - 150, () => setStage(4)],
      [landed + 550, () => setStage(5)],
      [landed + 550 + 2250, () => setBound(true)],
    ];
    const timers = at.map(([ms, f]) => window.setTimeout(f, ms));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [n, STEP, quick]);

  // The book is handed over once it is bound and — for an order — the order has settled.
  useEffect(() => {
    if (!bound || (mode === 'order' && order === 'pending')) return;
    const tm = window.setTimeout(() => setStage(6), quick ? 0 : 200);
    return () => window.clearTimeout(tm);
  }, [bound, mode, order, quick]);

  // The PDF is made once the book has been handed over and the room is still, so drawing its pages
  // never competes with the animation; saving it is then one tap.
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const book = useRef({ chapters, userName: studio.userName, t });
  useEffect(() => {
    if (stage !== 6) return;
    let live = true;
    const tm = window.setTimeout(() => {
      const { chapters: chs, userName, t: s } = book.current;
      buildSwatchBookPdf({
        chapters: chs,
        preparedFor: userName,
        fonts: { display: resolveFont(FONT_DISPLAY), body: resolveFont(FONT_BODY) },
        strings: {
          book: s.book, chapterWord: s.chapterWord, shade: s.shade, shades: s.shades, fabricWordOne: s.fabricWordOne, fabricWordMany: s.fabricWordMany,
          preparedFor: s.preparedFor, shadeNo: s.shadeNo, contents: s.contents, compiledOn: s.compiledOn, colophon: s.colophon,
        },
      })
        .then((b) => live && setPdf(b))
        .catch(() => live && setPdfError(true));
    }, 1800);
    return () => {
      live = false;
      window.clearTimeout(tm);
    };
  }, [stage]);
  const download = () => pdf && saveBlob(pdf, FILE_NAME);

  const delivering = stage === 6 && mode === 'order' && (order === 'sent' || order === 'demo');
  const handedOver = stage === 6 && !delivering;
  const captions = [t.compiling, t.bindingWord, t.boundWord, t.bookReady];
  const captionAt = stage <= 3 ? 0 : stage === 4 ? 1 : stage === 5 ? 2 : 3;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.book}
      style={{
        position: 'fixed', inset: 0, zIndex: 120, overflow: 'hidden', color: '#F3E9D6', fontFamily: FONT_BODY,
        background: 'radial-gradient(80% 60% at 50% 42%, #3B2618 0%, #22150D 55%, #120B06 100%)', animation: 'pcFadeIn .5s ease both',
        ['--bw' as string]: 'min(70vw, 300px)',
      } as CSSProperties}
    >
      {/* A pool of lamplight on the table. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(38% 30% at 50% 54%, rgba(255,214,150,.16), transparent 70%)', pointerEvents: 'none' }} />

      {/* The caption: what is happening now, each line crossfading into the next. */}
      <div ref={captionRef} style={{ position: 'absolute', top: 'max(6vh, 30px)', left: 16, right: 16, textAlign: 'center', opacity: delivering || stage === 0 ? 0 : 1, transition: 'opacity .6s ease' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: 'rgba(214,180,120,.85)' }}>{t.book}</div>
        <div style={{ position: 'relative', height: 'clamp(34px,8vw,50px)', marginTop: 10 }}>
          {captions.map((c, i) => (
            <div
              key={i}
              aria-hidden={i !== captionAt || undefined}
              className="pc-foil"
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 'clamp(26px,6.4vw,40px)', lineHeight: 1.15,
                opacity: i === captionAt ? 1 : 0, transform: i === captionAt ? 'none' : i < captionAt ? 'translateY(-8px)' : 'translateY(8px)',
                // The outgoing line leaves before the next arrives, so the two never overlap.
                transition: i === captionAt ? 'opacity .6s ease .35s, transform .7s cubic-bezier(.22,.8,.2,1) .35s' : 'opacity .3s ease, transform .4s ease',
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(243,233,214,.55)', fontVariantNumeric: 'lining-nums' }}>{counts}</div>
      </div>

      {/* The book, open on the table and bound as the ceremony goes on. */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '54%', width: 'var(--bw)',
          // Only transform and opacity move: up from the table, and at the end aside for what follows.
          transform: `translate(-50%,-50%) ${stage === 0 ? 'translateY(24px) scale(.97)' : delivering ? 'scale(.9)' : handedOver ? 'translateY(-7vh) scale(.84)' : ''}`,
          opacity: stage === 0 || delivering ? 0 : 1,
          transition: 'transform .9s cubic-bezier(.22,.8,.2,1), opacity .7s ease',
        }}
      >
        <Binding width="100%" padded>
          {/* The front cover lies open to the left from the start, beneath the pages and the flying
              cuttings, and swings shut over them; then the clasp is pushed home. */}
          {stage >= 1 && (
            <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0, zIndex: stage >= 5 ? 60 : undefined, transformOrigin: 'left center', transformStyle: 'preserve-3d', transform: 'rotateY(-178deg)', animation: stage >= 5 ? 'pcCoverClose 1.2s cubic-bezier(.45,.05,.3,1) both' : 'none' }}>
              <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                <CoverFace t={t} userName={studio.userName} line={counts} claspAnimation={stage >= 5 ? 'pcClaspOn .55s 1.2s cubic-bezier(.3,.7,.3,1) both' : 'none'} />
              </div>
              <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: '10px 0 0 10px', background: `${MARBLE} center / cover`, boxShadow: 'inset 0 0 0 10px #40101A, inset 0 0 0 11px rgba(205,169,96,.7), inset 0 0 30px rgba(0,0,0,.35)' }} />
            </div>
          )}
          <div style={{ position: 'relative', width: '100%', height: '100%', perspective: '1400px' }}>
            <GiltBlock />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: paperFace('left'), padding: `12px 12px 12px ${HINGE + 11}px`, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: `minmax(0, ${cols === 3 ? 15 : 14}%)`, gap: 6, alignContent: 'start' }}>
              {shown.map(({ x, c }, i) => {
                const o = offsets?.[i];
                const away = o && stage <= 2 ? `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) rotate(${o.r}deg) scale(${stage === 2 ? 1.55 : 1.3})` : 'none';
                return (
                  <div
                    key={`${x.id}-${c.order}`}
                    ref={(el) => {
                      tiles.current[i] = el;
                    }}
                    className="pc-pinked"
                    style={{
                      position: 'relative', zIndex: 40, background: fabricTex(x, c, 3), willChange: stage >= 2 && stage <= 3 ? 'transform' : undefined,
                      transform: away,
                      opacity: quick || stage >= 3 || (stage === 2 && o) ? 1 : 0,
                      transition:
                        stage === 3
                          ? `transform ${FLIGHT}ms cubic-bezier(.42,.06,.24,1) ${i * STEP}ms`
                          : stage === 2
                            ? `transform .7s cubic-bezier(.2,.8,.25,1) ${i * 28}ms, opacity .5s ease ${i * 28}ms`
                            : 'none',
                    }}
                  />
                );
              })}
            </div>
            <BindingStrip turning={stage >= 4} />
          </div>
        </Binding>
      </div>

      {/* A preview, or an order that could not be placed: the bound book, to download or close. */}
      {handedOver && (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'max(5vh, 22px)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'rise .8s .3s cubic-bezier(.22,.8,.2,1) both' }}>
          {mode === 'order' && order === 'failed' && <p style={{ margin: '0 0 12px', maxWidth: 340, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: 'rgba(243,233,214,.75)' }}>{t.orderFailed}</p>}
          <PdfButton t={t} pdf={pdf} error={pdfError} onClick={download} />
          <GhostButton onClick={onDone}>{t.closeWord}</GhostButton>
        </div>
      )}

      {/* The finished book, going out on WhatsApp to the buyer's number. */}
      {delivering && <Delivery t={t} whatsapp={whatsapp} counts={counts} userName={studio.userName} demo={order === 'demo'} pdf={pdf} pdfError={pdfError} onDownload={download} onDone={onDone} />}
    </div>,
    document.body,
  );
}

function PdfButton({ t, pdf, error, onClick }: { t: Record<string, string>; pdf: Blob | null; error: boolean; onClick: () => void }) {
  if (error) return null;
  return (
    <button
      onClick={onClick}
      disabled={!pdf}
      className="pc-book"
      style={{
        cursor: pdf ? 'pointer' : 'wait', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: 'min(100%, 340px)', borderRadius: 999, padding: '14px 18px',
        fontFamily: FONT_BODY, fontSize: 11.5, letterSpacing: '.2em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: '#1C1917',
        background: 'linear-gradient(135deg, #F6E7BE, #D8B670 55%, #E9CF8F)', border: '1px solid rgba(255,240,200,.6)', boxShadow: '0 10px 26px rgba(0,0,0,.35)',
        opacity: pdf ? 1 : 0.7, transition: 'opacity .4s ease',
      }}
    >
      <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
      </svg>
      {pdf ? t.downloadPdf : t.preparing}
    </button>
  );
}

function GhostButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className="pc-hv-scale-06"
      style={{
        cursor: 'pointer', marginTop: 12, borderRadius: 999, padding: '12px 36px', fontFamily: FONT_BODY, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase',
        background: 'linear-gradient(135deg, rgba(255,255,255,.1), rgba(255,255,255,.03))', color: '#F3E9D6', border: '1px solid rgba(205,169,96,.55)',
      }}
    >
      {children}
    </button>
  );
}

function Delivery({ t, whatsapp, counts, userName, demo, pdf, pdfError, onDownload, onDone }: { t: Record<string, string>; whatsapp: string; counts: string; userName: string | null; demo: boolean; pdf: Blob | null; pdfError: boolean; onDownload: () => void; onDone: () => void }) {
  const [time] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [read, setRead] = useState(false);
  useEffect(() => {
    const tm = window.setTimeout(() => setRead(true), 2200);
    return () => window.clearTimeout(tm);
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', animation: 'rise .8s .35s cubic-bezier(.22,.8,.2,1) both' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: 'rgba(214,180,120,.85)' }}>{t.onItsWay}</div>
        <div className="pc-foil" style={{ marginTop: 10, fontFamily: FONT_DISPLAY, fontSize: 'clamp(26px,6.6vw,38px)', lineHeight: 1.1, fontVariantNumeric: 'lining-nums' }}>{whatsapp}</div>
        <div style={{ marginTop: 6, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, color: 'rgba(243,233,214,.7)' }}>{t.onWhatsApp}</div>
      </div>

      {/* The chat: the book as it arrives in the buyer's WhatsApp. */}
      <div style={{ marginTop: 20, width: 'min(100%, 360px)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)', animation: 'rise .9s .5s cubic-bezier(.22,.8,.2,1) both' }}>
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
          <div style={{ position: 'relative', width: 'min(100%, 250px)', padding: 5, borderRadius: '10px 2px 10px 10px', background: '#DCF8C6', boxShadow: '0 1px 1px rgba(0,0,0,.12)', animation: 'pcBubbleIn .7s 1s cubic-bezier(.2,.8,.25,1) both', color: '#1C1917' }}>
            {/* The cover, as the file's preview. */}
            <div style={{ height: 150, borderRadius: 7, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'radial-gradient(80% 80% at 50% 40%, #F6EFE2, #E1D5C0)' }}>
              <div style={{ width: 96, height: 128, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 314, transform: 'scale(.306)', transformOrigin: '0 0' }}>
                  <Binding width="314px" padded={false}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 26, right: 0 }}>
                      <CoverFace t={t} userName={userName} />
                    </div>
                  </Binding>
                </div>
              </div>
            </div>
            <button
              onClick={onDownload}
              disabled={!pdf}
              aria-label={t.downloadPdf}
              style={{ width: 'calc(100% - 4px)', display: 'flex', alignItems: 'center', gap: 9, margin: '6px 2px 0', padding: '8px 8px', borderRadius: 6, background: 'rgba(0,0,0,.05)', border: 'none', cursor: pdf ? 'pointer' : 'wait', color: 'inherit', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span aria-hidden style={{ width: 26, height: 32, borderRadius: 3, background: '#C9402F', color: '#fff', fontSize: 7.5, fontWeight: 600, display: 'grid', placeItems: 'end center', paddingBottom: 4, flex: 'none' }}>PDF</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{FILE_NAME}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'rgba(0,0,0,.5)', fontVariantNumeric: 'lining-nums' }}>{counts}</span>
              </span>
            </button>
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

      <p style={{ margin: '16px 0 12px', maxWidth: 330, textAlign: 'center', fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: 'rgba(243,233,214,.62)', animation: 'rise .8s .7s cubic-bezier(.22,.8,.2,1) both' }}>
        {demo ? t.demoNote : t.bookDone}
      </p>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'rise .8s .85s cubic-bezier(.22,.8,.2,1) both' }}>
        <PdfButton t={t} pdf={pdf} error={pdfError} onClick={onDownload} />
        <GhostButton onClick={onDone}>{t.done}</GhostButton>
      </div>
    </div>
  );
}
