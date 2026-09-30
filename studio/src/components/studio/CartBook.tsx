'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Studio } from './state';
import type { FabricRow } from '@/lib/types';
import { FONT_DISPLAY, fabricTex, spectrum } from './helpers';
import { Room, SheetStack, Fleuron, roman, UMBER, INK, type Cutting, type Group } from './SwatchBook';
import { FabricOrder, EmptyCart } from './FabricOrder';
import { usePresence } from './motion';

/**
 * The figures the slider stops at: every 25 m to 1,000 m, then every 100 m to 2,000 m, then every
 * 250 m to 5,000 m — fine where most orders fall, and still reaching a large one.
 */
const STOPS = [
  ...Array.from({ length: 41 }, (_, i) => i * 25),
  ...Array.from({ length: 10 }, (_, i) => 1100 + i * 100),
  ...Array.from({ length: 12 }, (_, i) => 2250 + i * 250),
];
const LAST = STOPS.length - 1;
const stopOf = (v: number) => {
  const i = STOPS.findIndex((x) => x >= v);
  return i < 0 ? LAST : i;
};
const inr = (n: number) => n.toLocaleString('en-IN');

/** What the metre picker is setting: one shade, or every shade of a fabric. */
type Picking = { g: Group; gi: number; cut: Cutting | null };

/**
 * The cart, read as the Swatch Book is: a title plate, then the loose sheets — each fabric's title
 * sheet with its price by the metre, what the fabric comes to and presets that set every shade of
 * it at once, then its sheets of scattered cuttings, each with its metres on a small ink tab.
 * Tapping a cutting opens the metre picker. A dock follows the page with the running total and the
 * way to checkout, where the order is placed.
 */
export function CartBook({ studio }: { studio: Studio }) {
  const { t, fabrics, cart } = studio;
  const [checkout, setCheckout] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [warn, setWarn] = useState(0);
  // Checking out is measured first: the open sheet's cuttings fly into a tailor's tape, which
  // unrolls to the order's metres and is snipped, and the review opens under it.
  const [measuring, setMeasuring] = useState<{ total: number; value: number; anchor: DOMRect; flights: { rect: DOMRect; bg: string }[] } | null>(null);
  const pickPresence = usePresence(!!picking, 380);
  // The picker keeps what it was showing while it animates out.
  const [shownPick, setShownPick] = useState<Picking | null>(null);
  const pick = shownPick ?? picking;

  const groups: Group[] = fabrics
    .map((x) => ({
      x,
      items: cart
        .filter((l) => l.fabricId === x.id)
        .map((l) => ({ pin: { fabricId: l.fabricId, colourOrder: l.colourOrder }, colour: x.colours.find((c) => c.order === l.colourOrder), metres: l.metres }))
        .filter((c): c is Cutting & { metres: number } => !!c.colour)
        .sort((a, b) => spectrum(a.colour, b.colour)),
    }))
    .filter((g) => g.items.length);

  const measure = measuring && (
    <MeasureMoment
      studio={studio}
      total={measuring.total}
      value={measuring.value}
      flights={measuring.flights}
      anchor={measuring.anchor}
      onCut={() => {
        // Straight to the top, not smoothly: the review plans its own glide from where the page is.
        window.scrollTo({ top: 0, behavior: 'instant' });
        setCheckout(true);
      }}
      onGone={() => setMeasuring(null)}
    />
  );

  if (checkout)
    return (
      <>
      {measure}
      <FabricOrder
        studio={studio}
        source="cart"
        onBack={() => {
          setCheckout(false);
          window.scrollTo(0, 0);
        }}
      />
      </>
    );
  if (!groups.length) return <EmptyCart studio={studio} />;

  const cuts = groups.flatMap((g) => g.items);
  // Shades still without metres: nothing is assumed, so the buyer is asked to choose them.
  const unset = cuts.filter((c) => !c.metres).length;
  const total = cuts.reduce((s, c) => s + (c.metres ?? 0), 0);
  const value = groups.reduce((s, g) => s + g.items.reduce((m, c) => m + (c.metres ?? 0), 0) * g.x.price, 0);
  const setAll = (g: Group, v: number) => g.items.forEach((c) => studio.setCartMetres(g.x.id, c.colour.order, v));
  const open = (p: Picking) => {
    setShownPick(null);
    setPicking(p);
  };
  const close = () => {
    setShownPick(picking);
    setPicking(null);
  };

  // The measuring sits first in both this and the checkout, so it carries on across the switch.
  return (
    <>
    {measure}
    <Room>
      <div style={{ textAlign: 'center', userSelect: 'none', WebkitUserSelect: 'none' }}>
        {/* The title plate, as the Swatch Book's. */}
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .15s cubic-bezier(.2,.8,.2,1) both' }} />
          <span style={{ fontSize: 9.5, letterSpacing: '.5em', paddingLeft: '.5em', textTransform: 'uppercase', color: UMBER, animation: 'pcRiseIn .9s .1s cubic-bezier(.2,.8,.2,1) both' }}>Poddar Creation</span>
          <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .15s cubic-bezier(.2,.8,.2,1) both' }} />
        </div>
        <h1 style={{ margin: '14px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(50px,13vw,84px)', lineHeight: 0.98, letterSpacing: '-.012em', color: INK, perspective: 500 }}>
          {[t.cartTitleA, t.cartTitleB].map((w, i, all) => (
            <span
              key={i}
              className={i === all.length - 1 ? 'pc-foil-deep' : undefined}
              style={{ display: 'inline-block', marginRight: i < all.length - 1 ? '.2em' : 0, fontStyle: i === all.length - 1 ? 'italic' : undefined, paddingRight: i === all.length - 1 ? '.06em' : 0, transformOrigin: '50% 100%', animation: `pcWordIn 1.1s ${0.25 + i * 0.12}s cubic-bezier(.2,.8,.2,1) both${i === all.length - 1 ? ', pcFoil 2.8s .7s cubic-bezier(.45,.05,.3,1) both' : ''}` }}
            >
              {w}
            </span>
          ))}
        </h1>
        <div style={{ marginTop: 10, fontFamily: FONT_DISPLAY, fontSize: 16.5, color: UMBER, fontVariantNumeric: 'lining-nums', animation: 'pcRiseIn .9s .55s cubic-bezier(.2,.8,.2,1) both' }}>
          {cuts.length} {cuts.length === 1 ? t.shade : t.shades} · {groups.length} {groups.length === 1 ? t.fabricWordOne : t.fabricWordMany}
          {total > 0 ? ` — ${inr(total)} m` : ''}
        </div>
        {unset > 0 && (
          <div key={warn} className="pc-cart-ask" style={{ animation: warn ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
            <span aria-hidden>✦</span>
            {(unset === 1 ? t.metresNeededOne : t.metresNeeded.replace('{n}', String(unset)))}
            <small>{t.tapForMetres}</small>
          </div>
        )}
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ width: 30, height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .75s cubic-bezier(.2,.8,.2,1) both' }} />
          <span style={{ width: 6, height: 6, background: 'rgba(168,134,79,.95)', animation: 'pcDiamondIn .8s .65s cubic-bezier(.2,.8,.2,1) both' }} />
          <span style={{ width: 30, height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .75s cubic-bezier(.2,.8,.2,1) both' }} />
        </div>
        <SheetStack
          studio={studio}
          groups={groups}
          cart={{
            onPick: (cut, g) => open({ g, gi: groups.indexOf(g), cut }),
            onAll: (g) => open({ g, gi: groups.indexOf(g), cut: null }),
          }}
        />
      </div>

      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: 'rise 1s .5s cubic-bezier(.22,.8,.2,1) both' }}>
        <Fleuron width={26} color="rgba(138,109,69,.6)" />
        <p style={{ margin: 0, maxWidth: 320, textAlign: 'center', fontFamily: FONT_DISPLAY, fontSize: 15, lineHeight: 1.45, color: 'rgba(28,25,23,.58)' }}>{t.cartNote}</p>
      </div>

      {/* The dock: the running total, the estimate, and the way to checkout. */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="pc-order-dock" style={{ animation: 'pcDockIn .9s .8s cubic-bezier(.2,.9,.25,1) both' }}>
          <div style={{ minWidth: 0 }}>
            <div key={total} className="pc-dock-total">
              {inr(total)} <span>m</span>
            </div>
            <div className="pc-dock-meta">
              {unset ? <span style={{ color: '#A5392B' }}>{unset} {t.notSet.toLowerCase()}</span> : `${cuts.length} ${cuts.length === 1 ? t.shade : t.shadesChosen}`}
              <br />
              <b>₹ {inr(value)}</b>
            </div>
          </div>
          <button
            key={warn}
            className={`pc-order-place${unset ? ' is-waiting' : ''}${measuring ? ' is-measuring' : ''}`}
            style={{ animation: warn ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}
            onClick={(e) => {
              // Every shade needs its metres first: the button shakes, and the ask above does too.
              if (unset) return setWarn((n) => n + 1);
              if (measuring) return;
              if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                window.scrollTo(0, 0);
                return setCheckout(true);
              }
              // The cuttings on the sheet in view, to fly into the tape.
              const flights = [...document.querySelectorAll<HTMLElement>('[aria-roledescription="sheets"] > div:last-child .pc-pinked')]
                .slice(0, 9)
                .map((el) => ({ rect: el.getBoundingClientRect(), bg: el.style.background }))
                .filter((f) => f.rect.bottom > 0 && f.rect.top < window.innerHeight);
              setMeasuring({ total, value, anchor: e.currentTarget.getBoundingClientRect(), flights });
            }}
          >
            <span aria-hidden>✦</span>
            {t.checkout}
          </button>
        </div>
      </div>
      {warn > 0 && unset > 0 && <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 12.5, color: '#A5392B' }}>{t.selectAllFirst}</p>}

      {pickPresence.shown && pick && (
        <MetrePicker
          key={`${pick.g.x.id}:${pick.cut?.colour.order ?? 'all'}`}
          studio={studio}
          pick={pick}
          leaving={pickPresence.leaving}
          onApply={(v, all) => {
            if (all || !pick.cut) setAll(pick.g, v);
            else studio.setCartMetres(pick.g.x.id, pick.cut.colour.order, v);
            close();
          }}
          onRemove={() => {
            if (pick.cut) studio.removeFromCart(pick.g.x.id, pick.cut.colour.order);
            close();
          }}
          onClose={close}
        />
      )}
    </Room>
    </>
  );
}

/**
 * Setting metres, with a slider alone: the shade (or the fabric) above, the figure large in the
 * display face, and a gold rule slid to it — every 25 m to 1,000 m, then in larger steps to
 * 5,000 m. Nothing is chosen until the buyer slides it. Where the fabric has more than one shade,
 * this shade or every shade of it takes the figure. The value follows; "Done" sets it.
 */
function MetrePicker({
  studio, pick, leaving, onApply, onRemove, onClose,
}: {
  studio: Studio; pick: Picking; leaving: boolean; onApply: (metres: number, all: boolean) => void; onRemove: () => void; onClose: () => void;
}) {
  const { t } = studio;
  const { g, cut } = pick;
  const n = g.items.length;
  const start = cut ? (cut.metres ?? 0) : g.items.every((c) => c.metres === g.items[0].metres) ? (g.items[0].metres ?? 0) : 0;
  const [at, setAt] = useState(stopOf(start));
  const [all, setAll] = useState(!cut);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = STOPS[at];
  const shades = all ? n : 1;
  const value = v * shades * g.x.price;
  const fabric: FabricRow = g.x;
  const chips = (cut && !all ? [cut] : g.items).slice(0, 4);

  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.setMetres}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={onClose} />
      <div className={`pc-sheet pc-add pc-metres${leaving ? ' is-leaving' : ''}`}>
        <div aria-hidden className="pc-sheet-grip" />
        <div className="pc-add-head">
          <span aria-hidden className="pc-add-chips">
            {chips.map((c, k) => (
              <span key={c.colour.order} className="pc-pinked" style={{ background: fabricTex(fabric, c.colour, 3), marginLeft: k ? -8 : 0, zIndex: chips.length - k }} />
            ))}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="pc-add-eyebrow">
              {t.chapterWord} {roman(pick.gi + 1)} · {fabric.name}
            </span>
            <span className="pc-add-fabric">{cut && !all ? cut.colour.name : n === 1 ? g.items[0].colour.name : t.allShadesN.replace('{n}', String(n))}</span>
          </span>
          <button aria-label={t.closeWord} className="pc-sheet-close" onClick={onClose}>
            <span aria-hidden>×</span>
          </button>
        </div>

        {/* The figure, large; until the slider is moved, the ask to move it. */}
        <div className="pc-metres-figure" aria-live="polite">
          {v ? (
            <span key="v">
              <b key={v}>{inr(v)}</b> <em>m</em>
            </span>
          ) : (
            <span key="ask" className="pc-metres-ask">{t.slideToChoose}</span>
          )}
        </div>

        {/* The gold rule. */}
        <input
          type="range"
          className="pc-metres-range"
          aria-label={t.metresWord}
          aria-valuetext={`${inr(v)} m`}
          min={0}
          max={LAST}
          step={1}
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
          style={{ '--p': `${(at / LAST) * 100}%` } as CSSProperties}
        />
        <div aria-hidden className="pc-metres-scale">
          {[0, 250, 500, 1000, 2000, 5000].map((x) => (
            <span key={x} style={{ left: `${(stopOf(x) / LAST) * 100}%` }}>
              {x >= 1000 ? `${x / 1000}k` : x}
            </span>
          ))}
        </div>

        {/* This shade, or every shade of the fabric. */}
        {cut && n > 1 && (
          <div role="radiogroup" aria-label={t.setMetres} className="pc-add-switch" style={{ marginTop: 18 }}>
            <span aria-hidden className="pc-add-thumb" style={{ transform: `translateX(${all ? 100 : 0}%)` }} />
            {[false, true].map((a) => (
              <button key={String(a)} role="radio" aria-checked={all === a} className={all === a ? 'is-on' : undefined} onClick={() => setAll(a)}>
                {a ? t.allShadesN.replace('{n}', String(n)) : t.thisShade}
              </button>
            ))}
          </div>
        )}

        <div className="pc-add-row" style={{ marginTop: 6 }}>
          <span className="pc-add-label">
            ₹ {inr(fabric.price)} / {t.metre}
            {shades > 1 && v ? ` · ${shades} × ${inr(v)} m` : ''}
          </span>
          <span key={value} className="pc-add-value">₹ {inr(value)}</span>
        </div>

        <button className="pc-auth-btn" style={{ marginTop: 16 }} disabled={!v} onClick={() => v && onApply(v, all)}>
          <span aria-hidden className="pc-auth-star">✦</span>
          {v ? `${t.done} · ${inr(v)} m` : t.setMetres}
        </button>
        {cut && !all && (
          <button className="pc-metres-remove" onClick={onRemove}>
            {t.removeFromCart}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Checking out, measured, on the Checkout button itself: the button turns into a brass tape case
 * (drawn over it, the same size), the cuttings on the sheet in view fly into it, and the gold tape
 * runs out of it along the foot of the screen, ticked and numbered, while the button counts the
 * metres and the value up. Scissors snip the tape's end, the length drops away, the case shows a
 * tick, and the review opens beneath.
 */
function MeasureMoment({
  studio, total, value, anchor, flights, onCut, onGone,
}: {
  studio: Studio; total: number; value: number; anchor: DOMRect; flights: { rect: DOMRect; bg: string }[]; onCut: () => void; onGone: () => void;
}) {
  const { t } = studio;
  const caseRef = useRef<HTMLSpanElement | null>(null);
  const metresRef = useRef<HTMLSpanElement | null>(null);
  const valueRef = useRef<HTMLSpanElement | null>(null);
  const [stage, setStage] = useState<'in' | 'cut' | 'out'>('in');
  const hooks = useRef({ onCut, onGone });
  useEffect(() => {
    hooks.current = { onCut, onGone };
  });

  useEffect(() => {
    // The cuttings fly into the case on the button.
    const to = caseRef.current?.getBoundingClientRect();
    const made: HTMLElement[] = [];
    if (to) {
      flights.forEach((f, i) => {
        const el = document.createElement('span');
        el.className = 'pc-pinked';
        Object.assign(el.style, {
          position: 'fixed', left: `${f.rect.left}px`, top: `${f.rect.top}px`, width: `${f.rect.width}px`, height: `${f.rect.height}px`,
          background: f.bg, zIndex: '160', pointerEvents: 'none', boxShadow: '0 8px 16px rgba(40,26,12,.3)', willChange: 'transform, opacity',
        });
        document.body.appendChild(el);
        made.push(el);
        const dx = to.left + to.width / 2 - (f.rect.left + f.rect.width / 2);
        const dy = to.top + to.height / 2 - (f.rect.top + f.rect.height / 2);
        el.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) rotate(${(i % 2 ? 1 : -1) * 40}deg) scale(.7)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${(i % 2 ? 1 : -1) * 220}deg) scale(.08)`, opacity: 0.3 },
          ],
          { duration: 700, delay: 60 + i * 55, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' },
        ).onfinish = () => el.remove();
      });
    }
    // The metres and the value count up as the tape runs out.
    const started = performance.now() + 650;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - started) / 1100));
      const e = 1 - Math.pow(1 - k, 3);
      if (metresRef.current) metresRef.current.textContent = Math.round(total * e).toLocaleString('en-IN');
      if (valueRef.current) valueRef.current.textContent = Math.round(value * e).toLocaleString('en-IN');
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timers = [
      window.setTimeout(() => setStage('cut'), 1900),
      window.setTimeout(() => hooks.current.onCut(), 2350),
      window.setTimeout(() => setStage('out'), 2400),
      window.setTimeout(() => hooks.current.onGone(), 2800),
    ];
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((x) => window.clearTimeout(x));
      made.forEach((el) => el.remove());
    };
  }, [flights, total, value]);

  // The tape runs out of the case and leftwards along the top of the dock.
  const tapeRight = typeof window === 'undefined' ? 0 : window.innerWidth - anchor.left - 30;
  const marks = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
  return createPortal(
    <div className={`pc-measure is-${stage}`} role="status" aria-live="polite" aria-label={t.measuring}>
      <div className="pc-measure-tape" aria-hidden style={{ top: anchor.top - 44, right: tapeRight }}>
        <div className="pc-measure-cutoff">
          {marks.map((n) => (
            <i key={n} style={{ right: `${n * 5}px` }}>
              {n}
            </i>
          ))}
        </div>
        <span className="pc-measure-label">{t.measuring}</span>
      </div>
      <span className="pc-measure-scissors" aria-hidden style={{ top: anchor.top - 46 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
        </svg>
      </span>
      {/* The button, turned into the tape case. */}
      <div className="pc-measure-button" style={{ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }}>
        <span ref={caseRef} aria-hidden className="pc-measure-case">
          {stage === 'in' ? <span /> : <b>✓</b>}
        </span>
        <span className="pc-measure-count">
          <span className="pc-measure-metres">
            <span ref={metresRef}>0</span> m
          </span>
          <span className="pc-measure-value">
            ₹ <span ref={valueRef}>0</span>
          </span>
        </span>
      </div>
    </div>,
    document.body,
  );
}
