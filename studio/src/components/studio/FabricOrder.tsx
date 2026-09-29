'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RazorpayProof, Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { FONT_DISPLAY, fabricTex } from './helpers';
import { Room, roman } from './SwatchBook';
import { AuthScreen } from './AuthScreen';
import { CartGlyph } from './CartGlyph';
import { ShipPay, Steps, addressText, PAYMENT_LABEL, type Payment, type When } from './ShipPay';
import type { Address } from './state';
import { confettiBurst } from './confetti';
import { oklchToRgb, rgbToHex } from '@/lib/colour-science';
import type { OrderState } from './BookCeremony';

const INK = '#1C1917';
const UMBER = '#8A6D45';
const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;
const STEP = 25;
const PRESETS = [50, 100, 250, 500];
const inr = (n: number) => n.toLocaleString('en-IN');

type Line = { x: FabricRow; c: ColourRow; key: string };

/**
 * Ordering the fabric itself, skipping the swatch book: a page of the studio in the Swatch Book's
 * reading room. Each fabric in the book is a sheet with its price by the metre and a row for each
 * of its shades — a pinked cutting, a stepper for the metres, and the line's value — with "All"
 * presets to set a fabric at once. When it is needed and a note for the mill follow, and a dock
 * holds the running total and "Place order". Ordering signs the buyer in first if need be, then
 * plays the dispatch: the fabrics are folded onto kraft paper, wrapped, tied with twine, sealed with
 * the house's wax seal and tagged with the order's reference, and confetti bursts from the seal.
 */
export function FabricOrder({ studio, onBack, source = 'book' }: { studio: Studio; onBack: () => void; source?: 'book' | 'cart' }) {
  const { t } = studio;
  const fromCart = source === 'cart';
  // What is ordered: the swatch book's shades, or the cart's lines with their metres.
  const picked = fromCart ? studio.cart : studio.pins;
  const groups = studio.fabrics
    .map((x) => ({
      x,
      lines: picked
        .filter((p) => p.fabricId === x.id)
        .map((p) => x.colours.find((c) => c.order === p.colourOrder))
        .filter((c): c is ColourRow => !!c)
        .map((c) => ({ x, c, key: `${x.id}:${c.id}` })),
    }))
    .filter((g) => g.lines.length);
  const lines: Line[] = groups.flatMap((g) => g.lines);

  // Nothing is assumed: every shade starts without metres, and the buyer sets them.
  const [bookMetres, setBookMetres] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.key, 0])));
  // The cart's metres live in the cart itself, so they are kept between visits.
  const cartMetres = Object.fromEntries(lines.map((l) => [l.key, studio.cart.find((c) => c.fabricId === l.x.id && c.colourOrder === l.c.order)?.metres ?? 0]));
  const metres = fromCart ? cartMetres : bookMetres;
  const setMetres = (fn: (was: Record<string, number>) => Record<string, number>) => {
    if (!fromCart) return setBookMetres(fn);
    const next = fn(cartMetres);
    for (const l of lines) if (next[l.key] !== cartMetres[l.key]) studio.setCartMetres(l.x.id, l.c.order, next[l.key]);
  };
  const [when, setWhen] = useState<When>('soon');
  const [payment, setPayment] = useState<Payment>('razorpay');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // The review, then signing in if need be, then the dispatch details, then the parcel.
  const [phase, setPhase] = useState<'edit' | 'auth' | 'ship' | 'dispatch'>('edit');
  const [buyer, setBuyer] = useState<{ whatsapp: string | null; demo: boolean }>({ whatsapp: null, demo: false });
  const [order, setOrder] = useState<{ state: OrderState; ref?: string; whatsapp: string | null; paid?: { amount: number; ref: string } }>({ state: 'pending', whatsapp: null });
  // A payment already made is kept, so a failed order is retried without paying twice.
  const [proof, setProof] = useState<{ razorpay: RazorpayProof; amount: number; shipTo: string } | null>(null);
  const [warn, setWarn] = useState(0);

  // The order slip prints out of a slot as the page arrives and then as it is scrolled: the paper
  // is revealed from the top down to a print line that runs ahead of the reader, just above the
  // dock, and never backs up. Set on the element directly each frame, so scrolling renders nothing.
  const feedRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    if (phase !== 'edit') return;
    const feed = feedRef.current;
    if (!feed) return;
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let shown = 0;
    let raf = 0;
    let done = false;
    const frame = (now: number) => {
      raf = 0;
      const full = feed.scrollHeight;
      const ahead = Math.min(full, Math.max(170, window.innerHeight - 230 - feed.getBoundingClientRect().top));
      // On arrival the first stretch prints over a second or so, before any scrolling.
      const ramp = Math.min(1, (now - started) / 1300);
      shown = quick ? full : Math.max(shown, ahead * (1 - Math.pow(1 - ramp, 3)));
      feed.style.clipPath = shown >= full ? 'none' : `inset(0 0 ${full - shown}px 0)`;
      if (headRef.current) headRef.current.style.transform = `translateY(${shown}px)`;
      if (shown >= full && !done) {
        done = true;
        setPrinted(true);
        return stop();
      }
      if (ramp < 1) raf = requestAnimationFrame(frame);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
  }, [phase]);

  const m = (k: string) => metres[k] ?? 0;
  const setM = (k: string, v: number) => setMetres((was) => ({ ...was, [k]: Math.max(0, Math.min(100_000, Math.round(v))) }));
  const chosen = lines.filter((l) => m(l.key) > 0);
  const total = chosen.reduce((s, l) => s + m(l.key), 0);
  const value = chosen.reduce((s, l) => s + m(l.key) * l.x.price, 0);
  const [today] = useState(() => new Date().toLocaleDateString(studio.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  const whenLabel = when === 'soon' ? t.whenSoon : when === '2w' ? t.when2w : t.whenMonth;

  // What was ordered stays on the dispatch page even as the cart empties behind it.
  const [sent, setSent] = useState<{ lines: Line[]; total: number; value: number } | null>(null);
  const go = (p: typeof phase) => {
    window.scrollTo(0, 0);
    setPhase(p);
  };
  const orderLines = () => chosen.map((l) => ({ fabricId: l.x.id, colourId: l.c.id, metres: m(l.key) }));
  const send = (shipTo: string, paid?: { razorpay?: RazorpayProof; amount: number; ref: string }) => {
    const { whatsapp, demo } = buyer;
    window.scrollTo(0, 0);
    setSent({ lines: chosen, total, value });
    setPhase('dispatch');
    setOrder({ state: demo || PREVIEW ? 'demo' : 'pending', whatsapp, paid: paid ? { amount: paid.amount, ref: paid.ref } : undefined });
    const placed = () => {
      if (fromCart) for (const l of chosen) studio.removeFromCart(l.x.id, l.c.order);
    };
    if (demo || PREVIEW) return placed();
    studio
      .orderFabric({ lines: orderLines(), timeline: whenLabel, note, whatsapp: whatsapp ?? undefined, shipTo, payment: PAYMENT_LABEL[payment], razorpay: paid?.razorpay })
      .then((r) => {
        if (r.ok) placed();
        setOrder((o) => ({ ...o, state: r.ok ? 'sent' : 'failed', ref: r.ref }));
      });
  };
  // On to the dispatch details, signing in first if need be: the address book is the account's.
  const next = async () => {
    if (!chosen.length) return setWarn((n) => n + 1);
    if (PREVIEW || !studio.signedIn) return go('auth');
    setBuyer({ whatsapp: await studio.accountWhatsapp(), demo: false });
    go('ship');
  };
  const onStep = (i: 0 | 1) => (i === 0 ? onBack() : go('edit'));
  // Tearing the slip off: the rest prints at once, the printer comes into view, the slip is tugged
  // and torn along the slot, drops away with its note, and the dispatch opens.
  const printRef = useRef<HTMLDivElement | null>(null);
  const [tearing, setTearing] = useState(false);
  const tear = (): boolean => {
    if (!chosen.length) {
      setWarn((n) => n + 1);
      return false;
    }
    const feed = feedRef.current;
    if (feed) feed.style.clipPath = 'none';
    setPrinted(true);
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = printRef.current ? printRef.current.getBoundingClientRect().top + window.scrollY - 140 : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: quick ? 'auto' : 'smooth' });
    window.setTimeout(() => setTearing(true), quick ? 0 : 480);
    window.setTimeout(() => {
      setTearing(false);
      next();
    }, quick ? 60 : 1650);
    return true;
  };
  // Placing the order: paying online first when chosen (verified on the server with the order).
  const placeOrder = async (a: Address, demoPaid?: boolean): Promise<string | null> => {
    const shipTo = addressText(a);
    if (payment !== 'razorpay') {
      send(shipTo);
      return null;
    }
    if (demoPaid) {
      send(shipTo, { amount: value * 100, ref: 'PREVIEW' });
      return null;
    }
    const r = await studio.payRazorpay(orderLines(), { name: studio.userName ?? undefined, contact: buyer.whatsapp ?? undefined });
    if (!r.ok) return r.reason === 'dismissed' ? t.payDismissed : r.reason === 'failed' ? r.message || t.payFailed : r.message || t.payUnavailable;
    const razorpay = { orderId: r.orderId, paymentId: r.paymentId, signature: r.signature };
    setProof({ razorpay, amount: r.amount, shipTo });
    send(shipTo, { razorpay, amount: r.amount, ref: r.paymentId });
    return null;
  };

  if (phase === 'auth')
    return (
      <AuthScreen
        studio={studio}
        intent="order"
        metres={total}
        onClose={() => go('edit')}
        onDone={async (r) => {
          setBuyer({ whatsapp: r.whatsapp || (r.demo ? null : await studio.accountWhatsapp()), demo: r.demo });
          go('ship');
        }}
      />
    );
  if (phase === 'ship')
    return (
      <ShipPay
        studio={studio}
        fromCart={fromCart}
        shades={chosen.length}
        total={total}
        value={value}
        when={when}
        setWhen={setWhen}
        payment={payment}
        setPayment={setPayment}
        addressId={addressId}
        setAddressId={setAddressId}
        payDemo={buyer.demo || PREVIEW}
        onStep={onStep}
        onPlace={placeOrder}
      />
    );
  if (phase === 'dispatch')
    return (
      <Dispatch
        studio={studio}
        lines={sent?.lines ?? chosen}
        total={sent?.total ?? total}
        value={sent?.value ?? value}
        order={order}
        onDone={onBack}
        // Already paid: send the same order again with the same payment, not a new one.
        onRetry={() => (proof ? send(proof.shipTo, { razorpay: proof.razorpay, amount: proof.amount, ref: proof.razorpay.paymentId }) : go('ship'))}
      />
    );

  if (fromCart && !lines.length) return <EmptyCart studio={studio} />;

  return (
    <Room center>
      {/* The way back, as every page of the studio has it. */}
      <div style={{ alignSelf: 'stretch', display: 'flex', marginTop: -6, animation: 'pcRiseIn .8s .15s ease both' }}>
        <button onClick={onBack} className="pc-auth-back">
          <span aria-hidden className="pc-auth-back-arrow">←</span>
          {fromCart ? t.cartWord : t.book}
        </button>
      </div>

      {/* Where the buyer is: the cart (or book), this review, then the dispatch. */}
      <Steps studio={studio} fromCart={fromCart} at={1} onStep={onStep} />

      {/* The title plate. */}
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
        <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .2s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ fontSize: 9.5, letterSpacing: '.46em', paddingLeft: '.46em', textTransform: 'uppercase', color: UMBER, animation: 'pcRiseIn .9s .15s cubic-bezier(.2,.8,.2,1) both' }}>{t.directEyebrow}</span>
        <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .2s cubic-bezier(.2,.8,.2,1) both' }} />
      </div>
      <h1 style={{ margin: '14px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(46px,12vw,78px)', lineHeight: 1, letterSpacing: '-.012em', color: INK, perspective: 500 }}>
        {(fromCart ? [t.orderTitleA, t.orderTitleB] : [...t.orderThe.split(' '), t.fabricWordTitle]).map((w, i, all) => (
          <span
            key={i}
            className={i === all.length - 1 ? 'pc-foil-deep' : undefined}
            style={{ display: 'inline-block', marginRight: i < all.length - 1 ? '.2em' : 0, paddingRight: i === all.length - 1 ? '.06em' : 0, fontStyle: i === all.length - 1 ? 'italic' : undefined, transformOrigin: '50% 100%', animation: `pcWordIn 1.1s ${0.3 + i * 0.12}s cubic-bezier(.2,.8,.2,1) both${i === all.length - 1 ? ', pcFoil 2.8s .8s cubic-bezier(.45,.05,.3,1) both' : ''}` }}
          >
            {w}
          </span>
        ))}
      </h1>
      <p style={{ margin: '12px 0 0', maxWidth: 360, fontFamily: FONT_DISPLAY, fontSize: 16.5, lineHeight: 1.45, color: UMBER, animation: 'pcRiseIn .9s .6s cubic-bezier(.2,.8,.2,1) both' }}>{fromCart ? t.checkoutSub : t.directSub}</p>
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <span style={{ width: 30, height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .8s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ width: 6, height: 6, background: 'rgba(168,134,79,.95)', animation: 'pcDiamondIn .8s .7s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ width: 30, height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .8s cubic-bezier(.2,.8,.2,1) both' }} />
      </div>

      {/* The order slip: the house and the date at its head under a double gold rule; each fabric
          with its numeral in a gold ring, its price by the metre, its shades and its subtotal on a
          dotted leader; then the totals, ruled off as in a ledger; and a pinked foot. */}
      <div ref={printRef} className={`pc-print${tearing ? ' is-tearing' : ''}`}>
        {/* The printer's mouth: a slot edged in gold, its light blinking while it prints. */}
        <div aria-hidden className={`pc-printer${printed ? ' is-done' : ''}`}>
          <span className="pc-printer-light" />
          <span className="pc-printer-slot" />
          {/* What stays in the slot once the slip is torn off. */}
          <span className="pc-printer-stub" />
        </div>
        <div className="pc-print-paper">
          <div ref={feedRef} className="pc-print-feed" style={{ clipPath: 'inset(0 0 100% 0)' }}>
            <div ref={headRef} aria-hidden className={`pc-print-head${printed ? ' is-done' : ''}`} />
            <div className="pc-slip-wrap">
              <div className="pc-slip">
                <div className="pc-slip-head">
                  <div>
                    <span className="pc-slip-small">Poddar Creation · Surat</span>
                    <b>{t.orderSlip}</b>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="pc-slip-small">{today}</span>
                    <span className="pc-slip-small" style={{ marginTop: 4 }}>
                      {groups.length} {groups.length === 1 ? t.fabricWordOne : t.fabricWordMany} · {lines.length} {lines.length === 1 ? t.shade : t.shadesChosen}
                    </span>
                  </div>
                </div>
                <div aria-hidden className="pc-slip-rule" />
                {groups.map((g, gi) => {
                  const sum = g.lines.reduce((s, l) => s + m(l.key), 0);
                  return (
                    <section key={g.x.id} className="pc-slip-fabric">
                      <div className="pc-slip-fhead">
                        <span aria-hidden className="pc-slip-num">{roman(gi + 1)}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="pc-slip-fname">{g.x.name}</div>
                          <div className="pc-slip-small">
                            {g.x.weight} · {g.x.width}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flex: 'none' }}>
                          <div className="pc-slip-price">₹ {inr(g.x.price)}</div>
                          <div className="pc-slip-small">{t.perMetre}</div>
                        </div>
                      </div>
                      {/* Set every shade of the fabric at once (the cart's are set in the cart, by slider). */}
                      {!fromCart && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                          <span className="pc-slip-small" style={{ marginRight: 4 }}>{t.setAll}</span>
                          {PRESETS.map((v) => {
                            const on = g.lines.every((l) => m(l.key) === v);
                            return (
                              <button key={v} className={`pc-order-chip${on ? ' is-on' : ''}`} onClick={() => setMetres((was) => ({ ...was, ...Object.fromEntries(g.lines.map((l) => [l.key, v])) }))}>
                                {v} m
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {g.lines.map((l, i) => (
                          <Row key={l.key} line={l} metres={m(l.key)} t={t} delay={1 + gi * 0.12 + i * 0.05} onChange={(v) => setM(l.key, v)} readOnly={fromCart} onRemove={fromCart ? () => studio.removeFromCart(l.x.id, l.c.order) : undefined} />
                        ))}
                      </div>
                      <div className="pc-slip-leader">
                        <span>{g.x.name}</span>
                        <i aria-hidden />
                        <span>
                          {inr(sum)} m · ₹ {inr(sum * g.x.price)}
                        </span>
                      </div>
                    </section>
                  );
                })}
                {/* The totals, ruled off. */}
                <div className="pc-slip-totals">
                  <div className="pc-slip-leader">
                    <span>{t.metresWord}</span>
                    <i aria-hidden />
                    <span>{inr(total)} m</span>
                  </div>
                  <div className="pc-slip-leader">
                    <span>{t.shades}</span>
                    <i aria-hidden />
                    <span>{chosen.length}</span>
                  </div>
                  <div className="pc-slip-leader is-grand">
                    <span>{t.estimate}</span>
                    <i aria-hidden />
                    <b key={value}>₹ {inr(value)}</b>
                  </div>
                </div>
                <p className="pc-slip-fine">{t.estimateNote}</p>
              </div>
              <div aria-hidden className="pc-slip-edge" />
            </div>
          </div>
          {/* A note for the mill, on a sticky note pressed onto the slip once it has printed. */}
          <label className={`pc-sticky${printed ? ' is-on' : ''}`}>
            <span className="pc-sticky-title">{t.noteSticky}</span>
            <textarea value={note} rows={2} placeholder={t.notePlaceholder} onChange={(e) => setNote(e.target.value.slice(0, 500))} />
          </label>
        </div>
      </div>

      {/* The dock: the running total, the estimate, and the order. */}
      <div className="pc-order-dock" style={{ animation: 'pcDockIn .9s 1.1s cubic-bezier(.2,.9,.25,1) both' }}>
        <div style={{ minWidth: 0 }}>
          <div key={total} className="pc-dock-total">
            {inr(total)} <span>m</span>
          </div>
          <div className="pc-dock-meta">
            {chosen.length} {chosen.length === 1 ? t.shade : t.shadesChosen}
            <br />
            <b>₹ {inr(value)}</b>
          </div>
        </div>
        <TearButton key={warn} label={t.tearToContinue} aria={t.tearAria} onTear={tear} shake={warn > 0} />
      </div>
      {warn > 0 && !chosen.length && <div style={{ marginTop: 10, fontSize: 12.5, color: '#A5392B' }}>{t.nothingChosen}</div>}
    </Room>
  );
}

/**
 * The way on from the review: a strip perforated in gold with a pair of scissors at its start.
 * Drawing the scissors along tears the perforation open behind them; let go short of the end and
 * they spring back, carry them past it and the slip is torn off (`onTear`). A tap, Enter or Space
 * runs the scissors along by themselves. `onTear` answering false (nothing to order) sends them back.
 */
function TearButton({ label, aria, onTear, shake }: { label: string; aria: string; onTear: () => boolean; shake: boolean }) {
  const track = useRef<HTMLDivElement | null>(null);
  const handle = useRef<HTMLButtonElement | null>(null);
  const torn = useRef<HTMLSpanElement | null>(null);
  const text = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<{ x: number; at: number; moved: boolean } | null>(null);
  const [done, setDone] = useState(false);
  const HANDLE = 44;
  const span = () => (track.current ? track.current.clientWidth - HANDLE - 8 : 140);
  const paint = (x: number, animate: boolean) => {
    const w = span();
    const p = Math.max(0, Math.min(1, x / w));
    const ease = animate ? 'transform .45s cubic-bezier(.22,.8,.2,1)' : 'none';
    if (handle.current) {
      handle.current.style.transition = ease;
      handle.current.style.transform = `translateX(${p * w}px) rotate(${p * 360}deg)`;
    }
    if (torn.current) {
      torn.current.style.transition = animate ? 'clip-path .45s cubic-bezier(.22,.8,.2,1)' : 'none';
      torn.current.style.clipPath = `inset(0 ${100 - p * 100}% 0 0)`;
    }
    if (text.current) {
      text.current.style.transition = animate ? 'opacity .3s ease' : 'none';
      text.current.style.opacity = String(1 - p * 1.4);
    }
  };
  const finish = () => {
    paint(span(), true);
    if (onTear()) setDone(true);
    else window.setTimeout(() => paint(0, true), 380);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const x = d.at + e.clientX - d.x;
      if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
      paint(x, false);
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const x = d.at + e.clientX - d.x;
      // A tap runs the scissors along; a draw past most of the way tears; short of it, back.
      if (!d.moved || x > span() * 0.72) finish();
      else paint(0, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });
  return (
    <div ref={track} className={`pc-tear${done ? ' is-done' : ''}`} style={{ animation: shake ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
      <span aria-hidden className="pc-tear-perf" />
      <span ref={torn} aria-hidden className="pc-tear-torn" style={{ clipPath: 'inset(0 100% 0 0)' }} />
      <span ref={text} aria-hidden className="pc-tear-label">
        <span className="pc-tear-text">{label}</span>
      </span>
      <button
        ref={handle}
        aria-label={aria}
        className="pc-tear-handle"
        disabled={done}
        onPointerDown={(e) => {
          if (done) return;
          e.preventDefault();
          drag.current = { x: e.clientX, at: 0, moved: false };
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            finish();
          }
        }}
      >
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
        </svg>
      </button>
    </div>
  );
}

/** A shade's row: its cutting, its name, a stepper for the metres, and the line's value. */
function Row({ line, metres, t, delay, onChange, onRemove, readOnly }: { line: Line; metres: number; t: Record<string, string>; delay: number; onChange: (v: number) => void; onRemove?: () => void; readOnly?: boolean }) {
  const off = metres === 0;
  return (
    <div className="pc-order-row" style={{ animation: `pcFieldIn .7s ${delay}s cubic-bezier(.2,.8,.2,1) both` }}>
      <span aria-hidden className="pc-pinked" style={{ width: 38, height: 46, flex: 'none', background: fabricTex(line.x, line.c, 3), transform: `rotate(${((line.c.order * 37) % 9) - 4}deg)`, boxShadow: '0 3px 6px rgba(40,26,12,.22)' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, lineHeight: 1.1, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.c.name}</div>
        <div style={{ marginTop: 2, fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: off ? '#A5392B' : 'rgba(28,25,23,.45)', fontVariantNumeric: 'lining-nums' }}>
          {off ? t.notSet : onRemove ? `₹ ${inr(metres * line.x.price)}` : `${t.shadeNo} ${String(line.c.order).padStart(2, '0')} · ₹ ${inr(metres * line.x.price)}`}
        </div>
      </div>
      {readOnly ? (
        <div className="pc-order-metres">
          {inr(metres)} <span>m</span>
        </div>
      ) : (
        <div className="pc-stepper">
          <button aria-label={`Fewer metres of ${line.c.name}`} onClick={() => onChange(metres - STEP)} disabled={off}>
            −
          </button>
          <input
            aria-label={`Metres of ${line.c.name}`}
            inputMode="numeric"
            value={metres}
            onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
            style={{ fontVariantNumeric: 'lining-nums' }}
          />
          <span aria-hidden className="pc-stepper-unit">m</span>
          <button aria-label={`More metres of ${line.c.name}`} onClick={() => onChange(metres + STEP)}>
            +
          </button>
        </div>
      )}
      {onRemove && (
        <button aria-label={`${t.removeWord} ${line.c.name}`} className="pc-order-remove" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

/** The dispatch's stages: the paper laid out (0), the fabrics folded onto it (1), wrapped (2), tied (3), sealed (4), tagged (5), and handed over (6). */
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const PARCEL = 216;

/**
 * The order dispatched, in the reading room: the buyer's fabrics fall folded onto kraft paper, its
 * four flaps fold over them one by one, twine is drawn across both ways and knotted, the house's wax
 * seal stamps down with a ripple, and a shipping tag swings in on its string with the order's
 * reference. Once the order has settled, the parcel lifts, confetti bursts from the seal, and the
 * order is summed up.
 */
function Dispatch({
  studio, lines, total, value, order, onDone, onRetry,
}: {
  studio: Studio; lines: Line[]; total: number; value: number; order: { state: OrderState; ref?: string; whatsapp: string | null; paid?: { amount: number; ref: string } }; onDone: () => void; onRetry: () => void;
}) {
  const { t } = studio;
  const shown = lines.slice(0, 8);
  const [stage, setStage] = useState<Stage>(0);
  const [sealed, setSealed] = useState(false);
  const sealRef = useRef<HTMLDivElement | null>(null);
  const [quick] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (quick) {
      const tm = window.setTimeout(() => {
        setStage(5);
        setSealed(true);
      }, 60);
      return () => window.clearTimeout(tm);
    }
    const folded = 500 + shown.length * 110 + 800;
    const at: [number, () => void][] = [
      [120, () => setStage(1)],
      [folded, () => setStage(2)],
      [folded + 1500, () => setStage(3)],
      [folded + 2500, () => setStage(4)],
      [folded + 3300, () => setStage(5)],
      [folded + 4300, () => setSealed(true)],
    ];
    const timers = at.map(([ms, f]) => window.setTimeout(f, ms));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [shown.length, quick]);

  // Handed over once the parcel is sealed and the order has settled; the confetti bursts from the seal.
  const settled = order.state !== 'pending';
  useEffect(() => {
    if (!sealed || !settled) return;
    const tm = window.setTimeout(() => {
      setStage(6);
      if (order.state !== 'failed' && sealRef.current) confettiBurst(sealRef.current.getBoundingClientRect(), lines.map((l) => rgbToHex(oklchToRgb(l.c.l, l.c.c, l.c.h))));
    }, 150);
    return () => window.clearTimeout(tm);
  }, [sealed, settled, order.state, lines]);

  const captions = [t.pkFolding, t.pkWrapping, t.pkTying, t.pkSealing, order.state === 'failed' ? t.orderBook : t.pkPlaced];
  const captionAt = stage <= 1 ? 0 : stage === 2 ? 1 : stage === 3 ? 2 : stage <= 5 ? 3 : 4;
  const ref = order.ref ?? (order.state === 'demo' ? 'PC-PREVIEW' : '');
  const done = stage === 6;

  return (
    <Room center>
      <div style={{ position: 'relative', width: '100%', minHeight: 'max(620px, calc(100svh - 150px))', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div aria-hidden className="pc-auth-beam" />
        {/* The caption: what is happening now. */}
        <div style={{ position: 'relative', textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 9.5, letterSpacing: '.42em', textTransform: 'uppercase', color: UMBER }}>{t.directEyebrow}</div>
          <div style={{ position: 'relative', height: 'clamp(38px,9vw,54px)', width: 'min(92vw, 520px)', marginTop: 10 }}>
            {captions.map((c, i) => (
              <div
                key={i}
                aria-hidden={i !== captionAt || undefined}
                className="pc-foil-deep"
                style={{
                  position: 'absolute', left: 0, right: 0, top: 0, fontFamily: FONT_DISPLAY, fontSize: 'clamp(28px,7vw,44px)', lineHeight: 1.15,
                  opacity: i === captionAt ? 1 : 0, transform: i === captionAt ? 'none' : i < captionAt ? 'translateY(-8px)' : 'translateY(8px)',
                  transition: i === captionAt ? 'opacity .6s ease .3s, transform .7s cubic-bezier(.22,.8,.2,1) .3s' : 'opacity .3s ease, transform .4s ease',
                }}
              >
                {c}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(28,25,23,.5)', fontVariantNumeric: 'lining-nums' }}>
            {inr(total)} m · {lines.length} {lines.length === 1 ? t.shade : t.shadesChosen}
          </div>
        </div>

        {/* The parcel, on the table, seen from a little above. */}
        <div style={{ position: 'relative', marginTop: 'clamp(30px,7vh,56px)', width: PARCEL * 1.9, maxWidth: '100%', height: PARCEL * 1.6, perspective: 1100, transform: done ? 'translateY(-10px) scale(.86)' : 'none', transition: 'transform 1s cubic-bezier(.22,.8,.2,1)' }}>
          <div aria-hidden className="pc-parcel-shadow" style={{ transform: `translate(-50%, 0) scale(${stage >= 2 ? 0.8 : 1.15}, ${stage >= 2 ? 0.8 : 1})` }} />
          <div
            style={{ position: 'absolute', left: '50%', top: '50%', width: PARCEL, height: PARCEL, marginLeft: -PARCEL / 2, marginTop: -PARCEL / 2, transformStyle: 'preserve-3d', transform: `rotateX(${done ? 30 : 42}deg) rotateZ(${done ? -4 : -8}deg)`, transition: 'transform 1.2s cubic-bezier(.22,.8,.2,1)', animation: 'pcFadeIn .6s ease both' }}
          >
            {/* The paper under the parcel, and its four flaps, laid out and then folded over. */}
            <div className="pc-kraft" style={{ position: 'absolute', inset: 0 }} />
            {([
              ['left', 'right center', 'rotateY(180deg)', { right: '100%', top: 0, width: PARCEL * 0.62, height: PARCEL }, 0],
              ['right', 'left center', 'rotateY(-180deg)', { left: '100%', top: 0, width: PARCEL * 0.62, height: PARCEL }, 260],
              ['top', 'center bottom', 'rotateX(-180deg)', { bottom: '100%', left: 0, width: PARCEL, height: PARCEL * 0.6 }, 560],
              ['bottom', 'center top', 'rotateX(180deg)', { top: '100%', left: 0, width: PARCEL, height: PARCEL * 0.6 }, 860],
            ] as const).map(([side, origin, fold, box, delay], k) => {
              const folded = stage >= 2;
              return (
                <div
                  key={side}
                  aria-hidden
                  className="pc-kraft pc-kraft-flap"
                  style={{ position: 'absolute', ...box, transformOrigin: origin, transform: `translateZ(${(k + 2) * 0.6}px) ${folded ? fold : ''}`, transition: `transform .8s cubic-bezier(.55,.05,.3,1) ${delay}ms`, zIndex: 3 + k } as CSSProperties}
                />
              );
            })}
            {/* The fabrics, folded, falling onto the paper one after another. */}
            {shown.map((l, i) => (
              <div
                key={l.key}
                aria-hidden
                className="pc-bundle"
                style={{
                  left: 24 + (i % 2) * 8, top: shown.length === 1 ? (PARCEL - 64) / 2 : 26 + i * ((PARCEL - 116) / (shown.length - 1)), background: fabricTex(l.x, l.c, 3),
                  transform: `translateZ(${1 + i * 0.1}px) rotate(${((i * 7) % 9) - 4}deg)`,
                  animation: stage >= 1 ? `pcBundleDrop .75s ${300 + i * 110}ms cubic-bezier(.3,1.35,.5,1) both` : 'none', opacity: stage >= 1 ? undefined : 0,
                }}
              />
            ))}
          </div>
          {/* The twine, the seal and the tag lie on the wrapped parcel: drawn on a layer of their
              own with the parcel's tilt, above its folded flaps. */}
          <div
            style={{ position: 'absolute', left: '50%', top: '50%', width: PARCEL, height: PARCEL, marginLeft: -PARCEL / 2, marginTop: -PARCEL / 2, pointerEvents: 'none', transform: `rotateX(${done ? 30 : 42}deg) rotateZ(${done ? -4 : -8}deg) translateZ(2px)`, transition: 'transform 1.2s cubic-bezier(.22,.8,.2,1)' }}
          >
            {/* The twine, drawn across both ways and knotted. */}
            <div aria-hidden className="pc-twine" style={{ left: -2, right: -2, top: '50%', height: 4, marginTop: -2, transform: `scaleX(${stage >= 3 ? 1 : 0})`, transition: 'transform .55s cubic-bezier(.6,0,.2,1)' }} />
            <div aria-hidden className="pc-twine" style={{ top: -2, bottom: -2, left: '50%', width: 4, marginLeft: -2, transform: `scaleY(${stage >= 3 ? 1 : 0})`, transition: 'transform .55s cubic-bezier(.6,0,.2,1) .35s' }} />
            {/* The house's wax seal, stamped down over the knot. */}
            <div ref={sealRef} aria-hidden className="pc-seal" style={{ transform: stage >= 4 ? undefined : 'scale(0)', animation: stage >= 4 ? 'pcSealStamp .6s cubic-bezier(.3,1.5,.5,1) both' : 'none' }}>
              <span>PC</span>
            </div>
            {stage >= 4 && <div aria-hidden className="pc-seal-ripple" />}
            {/* The shipping tag, swinging in on its string with the order's reference. */}
            <div aria-hidden className="pc-tag-wrap" style={{ opacity: stage >= 5 ? 1 : 0, animation: stage >= 5 ? 'pcTagSwing 1.8s cubic-bezier(.3,.6,.3,1) both' : 'none' }}>
              <span className="pc-tag-string" />
              <div className="pc-tag">
                <span className="pc-tag-hole" />
                <div style={{ fontSize: 7, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6B4C1E' }}>{t.orderRef}</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: INK, fontVariantNumeric: 'lining-nums', marginTop: 1 }}>{ref || '···'}</div>
                {/* Paid online: a stamp comes down on the tag. */}
                {order.paid && stage >= 5 && <span className="pc-paid-stamp">{t.paidWord}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* The order, summed up. */}
        {done && (
          <div style={{ width: 'min(100%, 420px)', marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'pcRiseIn .9s .2s cubic-bezier(.2,.8,.2,1) both' }}>
            {order.state === 'failed' ? (
              <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 1.45, color: '#A5392B' }}>{t.pkFailed}</p>
            ) : (
              <>
                <div className="pc-order-summary">
                  <div>
                    <span>{t.orderRef}</span>
                    <b>{ref}</b>
                  </div>
                  <div>
                    <span>{t.metresWord}</span>
                    <b>{inr(total)}</b>
                  </div>
                  <div>
                    <span>{t.estimate}</span>
                    <b>₹ {inr(value)}</b>
                  </div>
                </div>
                {order.paid && (
                  <div className="pc-paid-line">
                    <span aria-hidden>✓</span>
                    {t.paidWord} ₹ {inr(order.paid.amount / 100)} · {order.paid.ref === 'PREVIEW' ? t.previewWord : order.paid.ref}
                  </div>
                )}
                <p style={{ margin: '14px 0 0', maxWidth: 340, fontFamily: FONT_DISPLAY, fontSize: 15.5, lineHeight: 1.45, color: UMBER }}>
                  {order.state === 'demo' ? t.pkPreview : order.whatsapp ? t.pkConfirmTo.replace('{n}', order.whatsapp) : t.pkConfirm}
                </p>
              </>
            )}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {order.state === 'failed' ? (
                <button className="pc-auth-btn" onClick={onRetry}>
                  {t.tryAgain}
                </button>
              ) : (
                <button
                  className="pc-auth-btn"
                  onClick={() => {
                    studio.go('showroom');
                  }}
                >
                  <span aria-hidden className="pc-auth-star">✦</span>
                  {t.backToShowroom}
                </button>
              )}
              <button className="pc-auth-ghost" onClick={onDone}>
                {t.done}
              </button>
            </div>
          </div>
        )}
      </div>
    </Room>
  );
}

/** An empty cart: a folded bolt of kraft, waiting, and the way to the Showroom. */
export function EmptyCart({ studio }: { studio: Studio }) {
  const { t } = studio;
  return (
    <Room center>
      <div aria-hidden className="pc-cart-empty-art">
        <span className="pc-cart-empty-bag">
          <CartGlyph size={46} />
        </span>
      </div>
      <h1 style={{ margin: '26px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(38px,10vw,58px)', lineHeight: 1.04, color: INK, animation: 'pcRiseIn .9s .3s cubic-bezier(.2,.8,.2,1) both' }}>{t.cartEmpty}</h1>
      <p style={{ margin: '12px 0 0', maxWidth: 330, fontFamily: FONT_DISPLAY, fontSize: 17, lineHeight: 1.45, color: UMBER, animation: 'pcRiseIn .9s .5s cubic-bezier(.2,.8,.2,1) both' }}>{t.cartEmptySub}</p>
      <button className="pc-auth-btn" style={{ marginTop: 26, width: 'min(100%, 380px)', animation: 'pcFieldIn .8s .7s cubic-bezier(.2,.8,.2,1) both' }} onClick={() => studio.go('showroom')}>
        <span aria-hidden className="pc-auth-star">✦</span>
        {t.showroom}
      </button>
    </Room>
  );
}
