'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { RazorpayProof, Studio } from './state';
import type { ColourRow, FabricRow } from '@/lib/types';
import { FONT_DISPLAY, fabricTex, spectrum, jumpTo } from './helpers';
import { FillLine } from './brand';
import { Room, roman } from './SwatchBook';
import { PaidMoment } from './PaidMoment';
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
/** A reference for an order placed on the preview: PC- and six letters or digits, as a real one. */
const previewRef = () => `PC-${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')}`;
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
        .sort(spectrum)
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
  const [phase, setPhase] = useState<'edit' | 'auth' | 'ship' | 'paid' | 'dispatch'>('edit');
  const [buyer, setBuyer] = useState<{ whatsapp: string | null; demo: boolean }>({ whatsapp: null, demo: false });
  const [order, setOrder] = useState<{ state: OrderState; ref?: string; whatsapp: string | null; paid?: { amount: number; ref: string } }>({ state: 'pending', whatsapp: null });
  // A payment already made is kept, so a failed order is retried without paying twice.
  const [proof, setProof] = useState<{ razorpay: RazorpayProof; amount: number; shipTo: string } | null>(null);
  // Where the parcel is addressed, for its shipping label.
  const [dest, setDest] = useState<{ name: string; city: string } | null>(null);
  const shipCity = useRef('');
  const [warn, setWarn] = useState(0);

  // The order slip prints as a bill machine does: the paper is fed out of the slot a line at a time,
  // printed as it passes the head, in stretches; the printer stops (the paper sways a little on
  // the slot and settles), then it carries on, until the slip is out. The roll turns in its window
  // and the head glows while it runs. The whole run is planned when printing starts: the
  // bursts and pauses, and one smooth path for the page to glide along, which sets off before the
  // first line prints and moves at an even pace, easing in and out, so the paper always prints
  // into room already made for it. A reader who scrolls, touches or presses a key takes over;
  // printing carries on. All is set on the elements directly each frame, so printing renders
  // nothing, and nothing is measured once it has started.
  const feedRef = useRef<HTMLDivElement | null>(null);
  const printerRef = useRef<HTMLDivElement | null>(null);
  const printDone = useRef(false);
  // Whether the page still follows the printing (the dock's hint takes the page elsewhere).
  const printFollow = useRef(true);
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    if (phase !== 'edit') return;
    const feed = feedRef.current;
    if (!feed) return;
    printDone.current = false;
    printFollow.current = true;
    const printer = printerRef.current;
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The paper is hidden above the slot by its holder, whose edge stays put, and the paper itself
    // is only moved: nothing is repainted as it feeds, however long the slip.
    const holder = feed.parentElement;
    if (holder && !quick) holder.style.clipPath = 'inset(-6px -60px -3000px -60px)';
    feed.style.clipPath = 'none';
    const full = feed.scrollHeight;
    const LINE = 6; // the paper advances a line at a time, while it is slow enough to see it
    const LEAD = 450; // the page sets off this long before the first line prints
    const BUDGET = 4700; // no slip takes longer than this, from its page arriving to its last line (with room to spare under five seconds)

    // How long it prints, as the order's length asks: a longer slip takes longer, but ever less so
    // per line, and never past the budget. So a long order prints faster, not longer.
    const T = Math.min(BUDGET - LEAD, 1300 + full * 1.4);
    // In a few stretches with short stops between, the stops about a quarter of the time.
    const n = Math.max(2, Math.min(9, Math.round(full / 160)));
    const pause = Math.max(120, Math.min(380, (T * 0.26) / (n - 1)));
    const runTotal = T - pause * (n - 1);
    const weights = Array.from({ length: n }, () => 0.75 + Math.random() * 0.5);
    const sum = weights.reduce((a, w) => a + w, 0);

    // The bursts, planned: [start, end, from, to] in ms from now and px of paper.
    const bursts: [number, number, number, number][] = [];
    let at = LEAD;
    let made = 0;
    weights.forEach((w, i) => {
      const size = i === n - 1 ? full - made : Math.round((full * w) / sum / LINE) * LINE;
      const ms = (runTotal * size) / full;
      bursts.push([at, at + ms, made, made + size]);
      made += size;
      at += ms + pause;
    });
    const printEnd = bursts[bursts.length - 1][1];
    // Each stretch gathers speed and slows at its ends rather than starting and stopping dead;
    // at a pace slow enough to see, the paper steps a line at a time. Faster than a line a frame,
    // stepping would only jolt, so the paper runs on smoothly.
    const glide = (u: number) => {
      const a = 0.18;
      if (u < a) return (u * u) / (2 * a * (1 - a));
      if (u > 1 - a) return 1 - ((1 - u) * (1 - u)) / (2 * a * (1 - a));
      return (u - a / 2) / (1 - a);
    };
    const printedAt = (t: number) => {
      for (const [t0, t1, p0, p1] of bursts) {
        if (t < t0) return p0;
        if (t < t1) {
          const x = (p1 - p0) * glide((t - t0) / (t1 - t0));
          const perFrame = ((p1 - p0) / (t1 - t0)) * 16.7;
          return p0 + (perFrame < LINE * 1.2 ? Math.floor(x / LINE) * LINE : x);
        }
      }
      return full;
    };
    const runningAt = (t: number) => bursts.some(([t0, t1]) => t >= t0 && t < t1);

    // The page's path: from where it is to the printer, with a gentle start and finish.
    // The slip is only hidden while it prints, not left out of the layout, so the page already has room for it.
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const s0 = window.scrollY;
    // The page settles on the printer and stays: the buyer watches each line come out of the slot
    // (the estimate first, then every fabric and shade, then the head), the paper printed so far
    // moving down beneath it, rather than following the slip's foot, where only the total showed.
    const slot = (printer?.getBoundingClientRect().top ?? feed.getBoundingClientRect().top) + window.scrollY;
    const s1 = Math.max(0, Math.min(maxScroll, slot - 118));
    const D = Math.min(printEnd + 350, 1500);
    const RAMP_IN = Math.min(700, D / 3);
    const RAMP_OUT = Math.min(900, D / 3);
    const cruise = (s1 - s0) / (D - RAMP_IN / 2 - RAMP_OUT / 2);
    const pathAt = (t: number) => {
      if (t <= 0) return s0;
      if (t >= D) return s1;
      if (t < RAMP_IN) return s0 + (cruise * t * t) / (2 * RAMP_IN);
      const inDone = (cruise * RAMP_IN) / 2;
      if (t < D - RAMP_OUT) return s0 + inDone + cruise * (t - RAMP_IN);
      const left = D - t;
      return s1 - (cruise * left * left) / (2 * RAMP_OUT);
    };

    const started = performance.now();
    let raf = 0;
    let follow = !quick && Math.abs(s1 - s0) > 4;
    // The page's smooth scrolling is set aside once for the whole glide, not on every frame (each
    // change to it restyles the whole page, which is what a frame cannot afford).
    const release = holdInstantScroll();
    let running = false;
    let shown = -1;
    const letGo = () => {
      follow = false;
    };
    // When the last stretch stopped, for the paper's sway on the slot.
    const stoppedAt = (t: number) => {
      let last = -1;
      for (const [, t1] of bursts) if (t1 <= t) last = t1;
      return last;
    };
    const frame = (now: number) => {
      raf = 0;
      const t = now - started;
      const p = quick || printDone.current ? full : printedAt(t);
      const run = !quick && !printDone.current && runningAt(t);
      if (p >= full) {
        if (shown !== full) {
          shown = full;
          feed.style.transform = 'none';
          if (holder) holder.style.clipPath = '';
        }
      } else {
        shown = p;
        // The paper is fed out: what has printed hangs below the slot, the rest is still inside.
        // It trembles with the motor as it runs, and sways on the slot when it stops.
        const last = stoppedAt(t);
        const since = last < 0 ? Infinity : t - last;
        const sway = run || since > 1400 ? 0 : 0.32 * Math.exp(-since / 320) * Math.sin((since / 400) * Math.PI * 2);
        const shake = run ? (Math.random() - 0.5) * 0.3 : 0;
        // It pivots on the slot, which is only worth setting while it sways.
        if (sway) feed.style.transformOrigin = `50% ${(full - p).toFixed(1)}px`;
        feed.style.transform = sway
          ? `translate3d(${shake.toFixed(2)}px,${(p - full).toFixed(2)}px,0) rotate(${sway.toFixed(3)}deg)`
          : `translate3d(${shake.toFixed(2)}px,${(p - full).toFixed(2)}px,0)`;
      }
      if (run !== running) {
        running = run;
        printer?.classList.toggle('is-running', run);
      }
      if (!printFollow.current && follow) letGo();
      // Each frame's step is set outright: the page's own smooth scrolling would restart on every
      // call and lag behind, which is what made this stutter before.
      if (follow) window.scrollTo(0, pathAt(t));
      if (p >= full && !printDone.current) {
        printDone.current = true;
        setPrinted(true);
      }
      if (p >= full && (!follow || t >= D)) return stop();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      release();
      window.removeEventListener('wheel', letGo);
      window.removeEventListener('touchstart', letGo);
      window.removeEventListener('keydown', letGo);
      window.removeEventListener('mousedown', letGo);
    };
    window.addEventListener('wheel', letGo, { passive: true });
    window.addEventListener('touchstart', letGo, { passive: true });
    window.addEventListener('keydown', letGo);
    window.addEventListener('mousedown', letGo);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      stop();
      printer?.classList.remove('is-running');
      if (holder) holder.style.clipPath = '';
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
  const [sent, setSent] = useState<{ lines: Line[]; total: number; value: number; metres: Record<string, number> } | null>(null);
  const go = (p: typeof phase) => {
    window.scrollTo(0, 0);
    setPhase(p);
  };
  const orderLines = () => chosen.map((l) => ({ fabricId: l.x.id, colourId: l.c.id, metres: m(l.key) }));
  const send = (shipTo: string, paid?: { razorpay?: RazorpayProof; amount: number; ref: string }) => {
    const { whatsapp, demo } = buyer;
    window.scrollTo(0, 0);
    setSent({ lines: chosen, total, value, metres: Object.fromEntries(chosen.map((l) => [l.key, m(l.key)])) });
    // Paid online: the stamp comes down on the slip first, then the parcel is wrapped.
    setPhase(paid ? 'paid' : 'dispatch');
    setOrder({ state: demo || PREVIEW ? 'demo' : 'pending', whatsapp, paid: paid ? { amount: paid.amount, ref: paid.ref } : undefined });
    // Remembered on this device, so it can be tracked: the reference, what, where, and payment.
    const remember = (ref: string, isDemo: boolean) =>
      studio.rememberOrder({
        ref,
        placedAt: new Date().toISOString(),
        lines: chosen.map((l) => ({ fabricId: l.x.id, colourOrder: l.c.order, metres: m(l.key) })),
        total,
        value,
        city: shipCity.current || undefined,
        timeline: whenLabel,
        paid: paid ? paid.amount : undefined,
        demo: isDemo,
      });
    const placed = () => {
      if (fromCart) for (const l of chosen) studio.removeFromCart(l.x.id, l.c.order);
    };
    if (demo || PREVIEW) {
      // A preview order gets a reference of its own, shown on the label and kept for tracking.
      const ref = previewRef();
      setOrder((o) => ({ ...o, ref }));
      remember(ref, true);
      return placed();
    }
    studio
      .orderFabric({ lines: orderLines(), timeline: whenLabel, note, whatsapp: whatsapp ?? undefined, shipTo, payment: PAYMENT_LABEL[payment], razorpay: paid?.razorpay })
      .then((r) => {
        if (r.ok) {
          placed();
          if (r.ref) remember(r.ref, false);
        }
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
  // Tearing the slip off: the rest prints at once and the slip comes free of the slot with a tug,
  // a few fibres shed from the tear, and it drops and settles. Then it is rolled up from its foot,
  // note and all, into a bundle, which is tied with a gold band and a dot of wax; the page glides
  // up to the steps, and the bundle flies, turning and shrinking, into "Dispatch", which catches
  // it with a pop and a gold ring, and the dispatch opens.
  const printRef = useRef<HTMLDivElement | null>(null);
  const [tearStage, setTearStage] = useState<null | 'torn' | 'rolling' | 'tied' | 'flying'>(null);
  const tearing = tearStage !== null;
  const tear = (scroll = true): boolean => {
    if (!chosen.length) {
      setWarn((n) => n + 1);
      return false;
    }
    // Whatever has not printed prints at once.
    printDone.current = true;
    const feed = feedRef.current;
    if (feed) {
      feed.style.clipPath = 'none';
      feed.style.transform = 'none';
    }
    setPrinted(true);
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quick) {
      window.setTimeout(() => next(), 60);
      return true;
    }
    if (scroll) {
      const top = printRef.current ? printRef.current.getBoundingClientRect().top + window.scrollY - 140 : 0;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    const lead = scroll ? 480 : 0;
    const at = (ms: number, fn: () => void) => window.setTimeout(fn, lead + ms);
    at(0, () => {
      // How far the roll has to travel: from the foot of the note, below the slip, to its head.
      const paper = printRef.current?.querySelector<HTMLElement>('.pc-print-paper');
      if (paper && printRef.current) {
        const note = paper.querySelector<HTMLElement>('.pc-sticky');
        const foot = Math.max(paper.offsetHeight, note ? note.offsetTop + note.offsetHeight : 0);
        printRef.current.style.setProperty('--H', `${foot}px`);
        printRef.current.style.setProperty('--pt', `${paper.offsetTop}px`);
        printRef.current.style.setProperty('--PH', `${paper.offsetHeight}px`);
      }
      setTearStage('torn');
    });
    at(420, () => {
      printFollow.current = false;
      setTearStage('rolling');
      glideTo(0);
    });
    at(1400, () => setTearStage('tied'));
    at(1800, () => {
      // Where the bundle flies: from its middle to the "Dispatch" numeral, the page at rest now.
      const roll = printRef.current?.querySelector<HTMLElement>('.pc-roll');
      const dot = document.querySelector<HTMLElement>('.pc-steps li:last-child .pc-steps-num');
      if (roll && dot && printRef.current) {
        const a = roll.getBoundingClientRect();
        const b = dot.getBoundingClientRect();
        printRef.current.style.setProperty('--fx', `${(b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(1)}px`);
        printRef.current.style.setProperty('--fy', `${(b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(1)}px`);
      }
      setTearStage('flying');
    });
    at(2450, () => document.querySelector('.pc-steps li:last-child')?.classList.add('is-catch'));
    at(3000, () => {
      setTearStage(null);
      next();
    });
    return true;
  };
  // The perforation along the slot: torn by hand from its loose corner (or a tap on the corner,
  // Enter or Space, which tears it along by itself), it tears the slip off.
  const tearRun = useRef<(() => void) | null>(null);
  // Placing the order: paying online first when chosen (verified on the server with the order).
  const placeOrder = async (a: Address, demoPaid?: boolean): Promise<string | null> => {
    const shipTo = addressText(a);
    setDest({ name: a.contactName || a.label, city: a.city });
    shipCity.current = a.city;
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
  if (phase === 'paid' && order.paid)
    return (
      <PaidMoment
        studio={studio}
        lines={(sent?.lines ?? chosen).map((l) => ({ x: l.x, c: l.c, metres: sent?.metres[l.key] ?? m(l.key) }))}
        total={sent?.total ?? total}
        amount={order.paid.amount}
        reference={order.paid.ref === 'PREVIEW' ? t.previewWord : order.paid.ref}
        onDone={() => go('dispatch')}
      />
    );
  if (phase === 'dispatch' || phase === 'paid')
    return (
      <Dispatch
        studio={studio}
        lines={sent?.lines ?? chosen}
        total={sent?.total ?? total}
        value={sent?.value ?? value}
        order={order}
        dest={dest}
        onDone={onBack}
        // Already paid: send the same order again with the same payment, not a new one.
        onRetry={() => (proof ? send(proof.shipTo, { razorpay: proof.razorpay, amount: proof.amount, ref: proof.razorpay.paymentId }) : go('ship'))}
      />
    );

  if (fromCart && !lines.length) return <EmptyCart studio={studio} />;

  return (
    <Room center>
      <div className="pc-split is-top">
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
      <div aria-hidden className="pc-order-eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
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
      <div aria-hidden className="pc-order-orn" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <span style={{ width: 30, height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .8s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ width: 6, height: 6, background: 'rgba(168,134,79,.95)', animation: 'pcDiamondIn .8s .7s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ width: 30, height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .8s cubic-bezier(.2,.8,.2,1) both' }} />
      </div>

      {/* The order slip: the house and the date at its head under a double gold rule; each fabric
          with its numeral in a gold ring, its price by the metre, its shades and its subtotal on a
          dotted leader; then the totals, ruled off as in a ledger; and a pinked foot. */}
      <div className="pc-main">
      <div ref={printRef} className={`pc-print${tearing ? ` is-tearing is-${tearStage}` : ''}${printed ? ' is-printed' : ''}`}>
        {/* The printer: a smoked window on its roll of paper, which turns while it prints; its
            light; and its mouth, a slot with a serrated tear bar and the head glowing behind it. */}
        <div ref={printerRef} aria-hidden className={`pc-printer${printed ? ' is-done' : ''}`}>
          <span className="pc-printer-window">
            <span className="pc-printer-roll" />
          </span>
          <span className="pc-printer-brand">Poddar Creation</span>
          <span className="pc-printer-light" />
          <span className="pc-printer-slot" />
          <span className="pc-printer-heat" />
          <span className="pc-printer-teeth" />
          {/* What stays in the slot once the slip is torn off. */}
          <span className="pc-printer-stub" />
          {/* Fibres shed from the tear. */}
          <span className="pc-tear-dust">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ left: `${8 + i * 10.5}%`, ['--dx' as string]: `${((i * 37) % 23) - 11}px`, animationDelay: `${(i % 4) * 0.03}s` } as CSSProperties} />
            ))}
          </span>
        </div>
        <div className="pc-print-paper">
          <div ref={feedRef} className="pc-print-feed" style={{ clipPath: 'inset(100% 0 0 0)' }}>
            {/* Two rows of perforation in zig-zag under the slot, a corner torn already: pull it along. */}
            <TearLine label={t.tearLabel} callA={t.tearCallA ?? 'Tear here'} callB={t.tearCallB ?? 'to send your order'} aria={t.tearAria} runRef={tearRun} onDone={() => tear(false)} ready={printed} />
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
        {/* The slip rolled into a bundle: a roll of the paper, its ends showing the turns, that
            winds up from the note's foot to the slip's head, then a gold band and a dot of wax. */}
        <div aria-hidden className="pc-roll-fly">
          <div className="pc-roll">
            <i className="pc-roll-band" />
          </div>
        </div>
      </div>
      </div>

      {/* The dock: the running total and the estimate. The way on is the slip itself, torn off by
          hand along the dots; there is no button that tears it. Once it has printed, the dock says
          so boldly, and a tap brings the torn corner into view and tugs at it. */}
      <div className="pc-order-dock" style={{ flexWrap: 'wrap', animation: 'pcDockIn .9s 1.1s cubic-bezier(.2,.9,.25,1) both' }}>
        {printed && !tearing && (
          <button
            className="pc-dock-tear"
            onClick={() => {
              const line = document.querySelector<HTMLElement>('.pc-tearline');
              if (!line) return;
              line.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
              line.classList.remove('is-nudge');
              void line.offsetWidth;
              line.classList.add('is-nudge');
            }}
          >
            <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
            </svg>
            <span>{t.tearDock ?? 'Tear the slip to send'}</span>
            <i aria-hidden>↑</i>
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div key={total} className="pc-dock-total">
            {inr(total)} <span>m</span>
          </div>
          <div className="pc-dock-meta" style={{ textAlign: 'right' }}>
            {chosen.length} {chosen.length === 1 ? t.shade : t.shadesChosen}
            <br />
            <b>₹ {inr(value)}</b>
          </div>
        </div>
      </div>
      {warn > 0 && !chosen.length && <div style={{ marginTop: 10, fontSize: 12.5, color: '#A5392B' }}>{t.nothingChosen}</div>}
      </div>
    </Room>
  );
}

/**
 * Sets the page's scroll outright. The site scrolls smoothly by default (`scroll-behavior: smooth`
 * on the html), which is right for a single jump but wrong for a path set frame by frame: every
 * call would start a fresh smooth scroll that lags behind the one before.
 */
function stepTo(y: number) {
  jumpTo(y);
}

/**
 * Sets the page's smooth scrolling aside while a path is set frame by frame, and returns the way
 * to put it back (once only). Held by more than one path at a time, it is put back by the last.
 */
let instantHolds = 0;
let instantWas = '';
function holdInstantScroll() {
  const h = document.documentElement;
  if (instantHolds++ === 0) {
    instantWas = h.style.scrollBehavior;
    h.style.scrollBehavior = 'auto';
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--instantHolds === 0) h.style.scrollBehavior = instantWas;
  };
}

/** Glides the page to `to` along an eased path (not the browser's own smooth scroll, which varies), then calls `then`. */
function glideTo(to: number, then?: () => void) {
  const from = window.scrollY;
  const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dist = to - from;
  if (quick || Math.abs(dist) < 2) {
    stepTo(to);
    then?.();
    return;
  }
  const ms = Math.min(900, 380 + Math.abs(dist) * 0.45);
  const start = performance.now();
  const release = holdInstantScroll();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    window.scrollTo(0, from + dist * e);
    if (k < 1) requestAnimationFrame(step);
    else {
      release();
      then?.();
    }
  };
  requestAnimationFrame(step);
}

/** A zig-zag across `w`px: its points at `y`, swinging `amp` either side, every `half`px. */
function zigzag(w: number, y: number, amp: number, half: number, phase = 0) {
  const pts: string[] = [];
  for (let x = 0, i = phase; x <= w + half; x += half, i++) pts.push(`${x.toFixed(1)},${(y + (i % 2 ? amp : -amp)).toFixed(1)}`);
  return pts;
}

/**
 * Tearing the slip off the printer: two rows of perforation in zig-zag run along under the slot,
 * the first chunk of the strip between them already torn away, its loose corner lifted. Draw that
 * corner along and the paper parts between the rows behind it; tearing, like paper, does not
 * mend, so let go and it stays torn as far as it went. Carried to the end, the slip comes away
 * (`onDone`, which answers false when there is nothing to order, and the strip is whole again).
 * A tap on the corner, Enter or Space tears it along by itself, as does the dock's hint.
 */
function TearLine({ label, callA, callB, aria, runRef, onDone, ready }: { label: string; callA: string; callB: string; aria: string; runRef: { current: (() => void) | null }; onDone: () => boolean; ready: boolean }) {
  // Once a hand has taken the corner, the finger that shows how stops showing.
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const gapRef = useRef<SVGRectElement | null>(null);
  const flapRef = useRef<HTMLButtonElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [w, setW] = useState(0);
  const START = 52; // the chunk torn already
  const at = useRef(START);
  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const paint = (x: number, lift = 0) => {
    at.current = x;
    gapRef.current?.setAttribute('width', String(x));
    if (flapRef.current) flapRef.current.style.transform = `translateX(${x - 30}px)`;
    flapRef.current?.style.setProperty('--lift', `${lift}deg`);
    if (labelRef.current) labelRef.current.style.opacity = String(x > w * 0.55 ? 0 : 1);
  };
  useEffect(() => {
    if (w) paint(at.current);
  });
  const finish = () => {
    if (busy.current || !w) return;
    busy.current = true;
    const from = at.current;
    const ms = Math.max(260, (w - from) * 1.5);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = k * k * (3 - 2 * k);
      paint(from + (w - from) * e, -14 * Math.sin(k * Math.PI));
      if (k < 1) return requestAnimationFrame(step);
      if (!onDone()) {
        paint(START);
        busy.current = false;
      }
    };
    requestAnimationFrame(step);
  };
  useEffect(() => {
    runRef.current = finish;
    return () => {
      runRef.current = null;
    };
  });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      // Paper tears one way only: forward, never back.
      paint(Math.max(at.current, Math.min(w, d.from + dx)), dx > 0 ? -16 : 0);
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (!d.moved || at.current >= w - 12) finish();
      else paint(at.current, 0);
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

  // The rows of dots, and the ragged gap the tear leaves between them.
  const upper = zigzag(w, 8, 3, 6).join(' ');
  const lower = zigzag(w, 22, 3, 6, 1).join(' ');
  const gapTop = zigzag(w, 12, 2.2, 4.5).map((pt, i) => {
    const [x, y] = pt.split(',').map(Number);
    return `${x},${(y + ((i * 7) % 5) * 0.35).toFixed(1)}`;
  });
  const gapBottom = zigzag(w, 18, 2.2, 4.5, 1)
    .map((pt, i) => {
      const [x, y] = pt.split(',').map(Number);
      return `${x},${(y - ((i * 5) % 4) * 0.4).toFixed(1)}`;
    })
    .reverse();
  return (
    <div ref={box} className={`pc-tearline${ready ? ' is-ready' : ''}${touched ? ' is-touched' : ''}`} style={{ ['--run' as string]: `${Math.max(80, Math.round(w * 0.5))}px` } as CSSProperties}>
      {w > 0 && (
        <svg aria-hidden width={w} height={30} className="pc-tearline-art">
          <defs>
            <clipPath id="pc-tear-gap">
              <rect ref={gapRef} x="0" y="0" width={START} height="30" />
            </clipPath>
          </defs>
          <polygon points={[...gapTop, ...gapBottom].join(' ')} className="pc-tearline-gap" clipPath="url(#pc-tear-gap)" />
          <polyline points={gapTop.join(' ')} className="pc-tearline-edge" clipPath="url(#pc-tear-gap)" />
          <polyline points={upper} className="pc-tearline-dots" />
          <polyline points={lower} className="pc-tearline-dots" />
        </svg>
      )}
      <span ref={labelRef} aria-hidden className="pc-tearline-label">
        {label}
      </span>
      {/* The way on, said boldly: an ink tag under the torn corner, pointing up at it. */}
      <span aria-hidden className="pc-tear-callout">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
        </svg>
        <b>{callA}</b>
        <span>{callB}</span>
        <i>→</i>
      </span>
      <button
        ref={flapRef}
        className="pc-tearline-flap"
        aria-label={aria}
        onPointerDown={(e) => {
          if (busy.current || e.button > 0) return;
          e.preventDefault();
          setTouched(true);
          drag.current = { x: e.clientX, from: at.current, moved: false };
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            finish();
          }
        }}
      >
        <span aria-hidden className="pc-tearline-halo" />
        {/* A finger showing how: it presses the corner and pulls it along the dots, over and
            over, until a hand takes hold; a gold trail marks the way it tears. */}
        <span aria-hidden className="pc-tear-trail" />
        <span aria-hidden className="pc-tear-finger">
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path d="M9 11.5V4.4a1.6 1.6 0 0 1 3.2 0V10h.3V8.6a1.6 1.6 0 0 1 3.2 0V10h.3V9.2a1.6 1.6 0 0 1 3.2 0v6.2A5.6 5.6 0 0 1 13.6 21h-1.3a5.6 5.6 0 0 1-4.4-2.1l-3.4-4.3a1.45 1.45 0 0 1 2.2-1.9L9 15z" fill="#FFFDF7" stroke="#1C1917" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </span>
        <span aria-hidden className="pc-tearline-corner" />
        <span aria-hidden className="pc-tearline-pull">›››</span>
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

/** The carton's size: width, height and depth (px). */
const BW = 210;
const BH = 118;
const BD = 132;
/** A bundle's top: light falling across soft cloth, darker at its rounded edges, with a few loose wrinkles. */
const BUNDLE_LIGHT = [
  'radial-gradient(120% 90% at 35% 25%, rgba(255,255,255,.28), rgba(255,255,255,0) 55%)',
  'linear-gradient(90deg, rgba(0,0,0,.2), rgba(0,0,0,0) 9%, rgba(0,0,0,0) 91%, rgba(0,0,0,.22))',
  'linear-gradient(180deg, rgba(0,0,0,.16), rgba(0,0,0,0) 12%, rgba(0,0,0,0) 86%, rgba(0,0,0,.2))',
  'linear-gradient(104deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.07) 43%, rgba(255,255,255,.1) 45%, rgba(0,0,0,0) 48%)',
  'linear-gradient(76deg, rgba(0,0,0,0) 64%, rgba(0,0,0,.06) 67%, rgba(255,255,255,.09) 69%, rgba(0,0,0,0) 72%)',
].join(', ');
/** The folded edge, one rounded roll of cloth per fold: dark where it turns under, lit on its crown. */
const BUNDLE_ROLL = 'linear-gradient(180deg, rgba(0,0,0,.42) 0%, rgba(0,0,0,.08) 22%, rgba(255,255,255,.2) 42%, rgba(255,255,255,.06) 62%, rgba(0,0,0,.3) 88%, rgba(0,0,0,.5) 100%)';
/** The cut side: the edges of the layers, each a soft band. */
const BUNDLE_LAYERS = 'linear-gradient(180deg, rgba(0,0,0,.3) 0%, rgba(255,255,255,.08) 45%, rgba(0,0,0,.22) 100%)';

/** Where the twine runs, across the carton's width. */
const TX = -62;

/** A face of the carton, `w` × `h`, centred on the carton's middle and put in place by `tf`. */
/** When the seal meets the wax, after the wax is dropped; the stylesheet's seal timings match it. */
const SEAL_HIT_MS = 1560;

const face = (w: number, h: number, tf: string, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute', left: '50%', top: '50%', width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: tf, ...extra,
});

/**
 * The parcel, packed in front of the buyer, in real 3D and seen from a little above: an open kraft
 * carton on the table, its four flaps standing open.
 *   1. The fabrics, each folded into a flat bolt in its own cloth, drop in one after another and
 *      settle into a stack.
 *   2. A sheet of tissue floats down over them; the side flaps fold in, then the long flaps close
 *      over them, and the carton gives a small thud.
 *   3. Printed tape runs across the seam and down the side, and twine is drawn over the top and
 *      down the front.
 *   4. A drop of red wax swells on the lid, where the twine crosses the tape. The house's desk seal, a brass die on a turned
 *      wooden handle, swings in, hovers, draws back and strikes: the wax spreads, the carton takes
 *      the knock and a puff rings out; it rocks as it is pressed home, peels away, and leaves "PC"
 *      standing in the wax.
 *   5. A shipping label, addressed to the buyer's city, is slapped onto the front; the order's tag
 *      swings on the twine.
 * Once the order has settled (stage 6) the carton lifts a little and turns towards the buyer.
 */
function Parcel({
  studio, stage, lines, quick, sealRef, ref_, dest, paid,
}: {
  studio: Studio; stage: Stage; lines: Line[]; quick: boolean; sealRef: { current: HTMLDivElement | null }; ref_: string; dest: { name: string; city: string } | null; paid: boolean;
}) {
  const { t } = studio;
  const n = Math.max(1, lines.length);
  // The desk seal is drawn flat, over the scene, as the PAID stamp is: seated where the wax is.
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const stampRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const stamp = stampRef.current;
    const wax = sealRef.current;
    if (!scene || !stamp || !wax) return;
    const box = scene.getBoundingClientRect();
    const k = box.width / (scene.offsetWidth || 1);
    const w = wax.getBoundingClientRect();
    stamp.style.left = `${(w.left + w.width / 2 - box.left) / k}px`;
    stamp.style.top = `${(w.top + w.height / 2 - box.top) / k}px`;
  }, [stage, sealRef]);
  // The strike, felt: a short buzz on phones that have it, as the seal meets the wax.
  useEffect(() => {
    if (stage !== 4 || quick) return;
    const tm = window.setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate?.([35, 25, 15]);
    }, SEAL_HIT_MS);
    return () => window.clearTimeout(tm);
  }, [stage, quick]);
  // The bundles are laid side by side, as a packer lays them: one layer of cells, up to four across
  // and two deep, so every colour shows from above. They sit on an insert just under the rim.
  const cols = Math.min(n, 4);
  const rows = Math.ceil(n / cols);
  const cellW = (BW - 20) / cols;
  const cellD = (BD - 18) / rows;
  const th = 24; // each folded bundle's thickness
  const stackTop = -BH / 2 + 16;
  const base = stackTop + th;
  const done = stage === 6;
  const closed = stage >= 2;
  const flaps = [0, 1, 2, 3].map((k) => {
    const long = k % 2 === 0; // front and back
    const w = long ? BW : BD;
    const depth = long ? BD : BW;
    const len = long ? BD / 2 : 64;
    const open = long ? -34 : -44;
    // The side flaps fold in first; the long ones close over them.
    const delay = [880, 480, 1040, 600][k];
    return (
      <div key={k} className="pc-bx-wrap" style={{ transform: `rotateY(${k * 90}deg)` }}>
        <div
          className="pc-bx-flap"
          style={{
            ...face(w, len, `translate3d(0, ${-BH / 2 + (long ? 0 : 0.8)}px, ${depth / 2}px) rotateX(${closed ? 90 : open}deg)`),
            marginTop: -len, transformOrigin: '50% 100%',
            transition: quick ? 'none' : `transform .62s cubic-bezier(.55,.05,.35,1.06) ${delay}ms`,
          }}
        />
      </div>
    );
  });
  const bolts = lines.map((l, i) => {
    // Its cell, filled a little loosely, as bundles are by hand: a shade smaller, nudged and turned.
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = cellW - 5 - ((i * 3) % 4);
    const d = cellD - 5 - ((i * 5) % 4);
    const cx = -BW / 2 + 10 + cellW * (col + 0.5) + (((i * 7) % 5) - 2) * 0.6;
    const cz = -BD / 2 + 9 + cellD * (row + 0.5);
    const y = base - th;
    // The paper band runs across the bundle's short way.
    const across = w < d;
    const tex = fabricTex(l.x, l.c, 3);
    const folds = Math.max(2, Math.round(th / 7)); // the rolls showing on the folded edge
    return (
      <div
        key={l.key}
        className="pc-bolt"
        style={{
          ['--y' as string]: `${y}px`, ['--dx' as string]: `${cx}px`, ['--dz' as string]: `${cz}px`, ['--ry' as string]: `${((i * 5) % 5) - 2}deg`,
          ['--ry0' as string]: `${i % 2 ? 24 : -20}deg`, ['--rz0' as string]: `${i % 2 ? -8 : 7}deg`,
          animation: quick ? 'none' : `pcBoltDrop .78s ${i * 210}ms both`,
          transform: quick ? `translate3d(var(--dx), var(--y), var(--dz)) rotateY(var(--ry))` : undefined,
        } as CSSProperties}
      >
        {/* The top of the bundle: soft cloth, lit from above, with a few loose wrinkles, and its paper band. */}
        <div className="pc-bundle-top" style={face(w, d, 'rotateX(90deg)', { background: `${BUNDLE_LIGHT}, ${tex}` })}>
          <span className={`pc-bundle-band${across ? ' is-across' : ''}`} style={across ? { top: `${30 + (i % 3) * 8}%` } : { left: `${24 + (i % 3) * 8}%` }}>
            <b>PC</b>
          </span>
        </div>
        {/* The folded edge: the cloth doubled back on itself, a rounded roll for each fold. */}
        <div
          className="pc-bundle-fold"
          style={face(w, th, `translateY(${th / 2}px) translateZ(${d / 2 - 1}px)`, {
            backgroundImage: `${BUNDLE_ROLL}, linear-gradient(90deg, rgba(0,0,0,.18), transparent 8%, transparent 92%, rgba(0,0,0,.2)), ${tex}`,
            backgroundSize: `100% ${th / folds}px, 100% 100%, auto`,
          })}
        >
          {!across && <span className="pc-bundle-band is-edge" style={{ left: `${24 + (i % 3) * 8}%` }} />}
        </div>
        {/* The side: the cut edges of the layers, softer and darker. */}
        <div
          className="pc-bundle-fold"
          style={face(d, th, `translateY(${th / 2}px) rotateY(90deg) translateZ(${w / 2 - 1}px)`, {
            backgroundImage: `${BUNDLE_LAYERS}, linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.34)), ${tex}`,
            backgroundSize: `100% ${th / (folds * 2)}px, 100% 100%, auto`,
          })}
        >
          {across && <span className="pc-bundle-band is-edge" style={{ left: `${30 + (i % 3) * 8}%` }} />}
        </div>
      </div>
    );
  });
  return (
    <div ref={sceneRef} className={`pc-bx-scene${quick ? ' is-quick' : ''}${done ? ' is-done' : ''}`} aria-hidden>
      <div className="pc-bx-shadow" />
      <div className="pc-bx-lift">
        <div className={`pc-bx-bump${closed ? ' is-closed' : ''}${stage === 4 && !quick ? ' is-sealing' : ''}`}>
          <div className="pc-bx">
            {/* The carton: its floor and inner walls in shade, its outer walls in kraft. */}
            <div className="pc-bx-inner" style={face(BW, BD, `translateY(${base}px) rotateX(90deg)`)} />
            <div className="pc-bx-inner" style={face(BW, BH, `translateZ(${-BD / 2 + 0.6}px)`)} />
            <div className="pc-bx-inner" style={face(BD, BH, `rotateY(90deg) translateZ(${-BW / 2 + 0.6}px)`)} />
            <div className="pc-bx-wall" style={face(BW, BH, `rotateY(180deg) translateZ(${BD / 2}px)`)} />
            <div className="pc-bx-wall" style={face(BD, BH, `rotateY(-90deg) translateZ(${BW / 2}px)`)} />
            {stage >= 1 && bolts}
            {/* Tissue, floated down over the fabrics. */}
            {stage >= 2 && <div className="pc-bx-tissue" style={{ ...face(BW - 14, BD - 12, `translate3d(0, ${stackTop - 2}px, 0) rotateX(90deg)`), ['--ty' as string]: `${stackTop - 2}px` } as CSSProperties} />}
            <div className="pc-bx-wall is-side" style={face(BD, BH, `rotateY(90deg) translateZ(${BW / 2}px)`)} />
            <div className="pc-bx-wall is-front" style={face(BW, BH, `translateZ(${BD / 2}px)`)}>
              <span className="pc-bx-print">Poddar Creation · Surat</span>
              <span className="pc-bx-arrows">↑↑</span>
            </div>
            {flaps}

            {/* Printed tape along the seam, and down the side. */}
            <div className={`pc-bx-tape${stage >= 3 ? ' is-on' : ''}`} style={face(BW + 2, 24, `translate3d(0, ${-BH / 2 - 2.6}px, 0) rotateX(90deg)`)}>
              <span>Poddar Creation ✦ Poddar Creation ✦ Poddar Creation</span>
            </div>
            <div className={`pc-bx-tape is-tail${stage >= 3 ? ' is-on' : ''}`} style={{ ...face(24, 34, `rotateY(90deg) translateZ(${BW / 2 + 0.8}px)`), marginTop: -BH / 2 }} />
            {/* Twine over the top and down the front. */}
            <div className={`pc-bx-twine${stage >= 3 ? ' is-on' : ''}`} style={face(4, BD + 2, `translate3d(${TX}px, ${-BH / 2 - 3.8}px, 0) rotateX(90deg)`)} />
            <div className={`pc-bx-twine is-front${stage >= 3 ? ' is-on' : ''}`} style={{ ...face(4, BH + 2, `translate3d(${TX}px, 0, ${BD / 2 + 1.2}px)`) }} />

            {/* The wax, on the lid where the twine crosses the tape, and a puff of air that rings out
                where the seal strikes. On the lid, the seal comes straight down onto it. */}
            {/* Each is set on a seat that stays put, and grows inside it: scaling the placed element
                itself would scale its offset from the carton's centre too, and walk it off the knot. */}
            {stage >= 4 && !quick && (
              <div style={face(76, 76, `translate3d(${TX}px, ${-BH / 2 - 4.2}px, 0) rotateX(90deg)`)}>
                <div className="pc-bx-sealring" />
              </div>
            )}
            <div ref={sealRef} style={face(46, 46, `translate3d(${TX}px, ${-BH / 2 - 4.8}px, 0) rotateX(90deg)`)}>
              <div className={`pc-bx-wax${stage >= 4 ? ' is-on' : ''}`}>
                <b>PC</b>
              </div>
            </div>

            {/* The shipping label, slapped on. */}
            <div className={`pc-bx-label${stage >= 5 ? ' is-on' : ''}`} style={{ ...face(118, 82, ''), ['--tz' as string]: `${BD / 2 + 1.6}px` } as CSSProperties}>
              <div className="pc-bx-label-row">
                <span>{t.fromWord}</span> {t.millSurat}
              </div>
              <div className="pc-bx-label-to">
                <span>{t.toWord}</span>
                <b>{dest?.name ?? '—'}</b>
                <i>{dest?.city ?? ''}</i>
              </div>
              <div className="pc-bx-barcode" />
              <div className="pc-bx-label-ref">{ref_ || '···'}</div>
              {paid && stage >= 5 && <span className="pc-paid-stamp">{t.paidWord}</span>}
            </div>
            {/* The order's tag, swinging on the twine. */}
            <div className={`pc-bx-tag${stage >= 5 ? ' is-on' : ''}`} style={{ ...face(34, 70, ''), ['--tx' as string]: `${TX}px`, ['--ty' as string]: `${-BH / 2 + 38 + 35}px`, ['--tz' as string]: `${BD / 2 + 3}px` } as CSSProperties}>
              <span className="pc-bx-tag-hole" />
              <span className="pc-bx-tag-k">{t.orderRef}</span>
              <span className="pc-bx-tag-v">{ref_ || '···'}</span>
            </div>
          </div>
        </div>
      </div>
      {/* The desk seal: a turned wooden handle, a brass collar and the die. It swings in, hovers
          over the wax, draws back and strikes; rocks as it is pressed home; peels away. Its shadow
          on the carton sharpens as it comes down. */}
      {stage >= 4 && stage <= 5 && !quick && (
        <div ref={stampRef} className="pc-stamp2d">
          <span className="pc-stamp2d-shadow" />
          <span className="pc-stamp2d-tool">
            <i className="pc-stamp2d-knob" />
            <i className="pc-stamp2d-neck" />
            <i className="pc-stamp2d-collar" />
            <i className="pc-stamp2d-die" />
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The order dispatched, in the reading room: the buyer's fabrics fall folded onto kraft paper, its
 * four flaps fold over them one by one, twine is drawn across both ways and knotted, the house's wax
 * seal stamps down with a ripple, and a shipping tag swings in on its string with the order's
 * reference. Once the order has settled, the parcel lifts, confetti bursts from the seal, and the
 * order is summed up.
 */
function Dispatch({
  studio, lines, total, value, order, dest, onDone, onRetry,
}: {
  studio: Studio; lines: Line[]; total: number; value: number; order: { state: OrderState; ref?: string; whatsapp: string | null; paid?: { amount: number; ref: string } }; dest: { name: string; city: string } | null; onDone: () => void; onRetry: () => void;
}) {
  const { t } = studio;
  const shown = lines.slice(0, 7);
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
    // Into the box (1), tissue and flaps (2), tape and twine (3), wax and seal (4), label and tag (5).
    const packed = 300 + shown.length * 210 + 650;
    const at: [number, () => void][] = [
      [300, () => setStage(1)],
      [packed, () => setStage(2)],
      [packed + 1550, () => setStage(3)],
      [packed + 3250, () => setStage(4)],
      [packed + 5700, () => setStage(5)],
      [packed + 6700, () => setSealed(true)],
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

  const captions = [t.pkFolding, t.pkWrapping, t.pkTying, t.pkSealing, dest?.city ? t.pkLabelling.replace('{city}', dest.city) : t.pkLabellingAny, order.state === 'failed' ? t.orderBook : t.pkPlaced];
  const captionAt = Math.max(0, Math.min(5, stage - 1));
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

        {/* The parcel, packed on the table. */}
        <Parcel studio={studio} stage={stage} lines={shown} quick={quick} sealRef={sealRef} ref_={ref} dest={dest} paid={!!order.paid} />

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

/** An empty cart, headed as the full one is: the name across the page, the bag waiting, and the ways to fill it. */
export function EmptyCart({ studio }: { studio: Studio }) {
  const { t } = studio;
  return (
    <Room center>
      <header className="pc-closet-head" style={{ width: '100%' }}>
        <FillLine>
          {t.cartTitleA}{' '}
          <em className="pc-foil-deep" style={{ paddingRight: '.06em', animation: 'pcFoil 2.8s .7s cubic-bezier(.45,.05,.3,1) both' }}>
            {t.cartTitleB}
          </em>
        </FillLine>
        <div aria-hidden className="pc-closet-orn">
          <i />
          <b />
          <i />
        </div>
        <p className="pc-closet-sub">
          <span>{t.cartEmpty}</span>
          <span>{t.cartEmptySub}</span>
        </p>
      </header>
      <div aria-hidden className="pc-cart-empty-art" style={{ marginTop: 34 }}>
        <span className="pc-cart-empty-bag">
          <CartGlyph size={46} />
        </span>
      </div>
      <div className="pc-book-actions" style={{ marginTop: 40 }}>
        <button onClick={() => studio.go('showroom')} className="pc-primary">
          <span aria-hidden className="pc-primary-star">✦</span>
          <span>{t.enter}</span>
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button onClick={() => studio.go('colours')} className="pc-quiet-link">
          {t.explore}
        </button>
      </div>
    </Room>
  );
}
