'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Address, AddressInput, Studio } from './state';
import { FONT_DISPLAY } from './helpers';
import { Room, roman } from './SwatchBook';
import { usePresence } from './motion';

const INK = '#1C1917';
const UMBER = '#8A6D45';
const inr = (n: number) => n.toLocaleString('en-IN');

export type When = 'soon' | '2w' | 'month';
export type Payment = 'razorpay' | 'upi' | 'bank' | 'credit';
/** How each payment method is written on the order for the team (in English, whatever the buyer's language). */
export const PAYMENT_LABEL: Record<Payment, string> = { razorpay: 'Paid online (Razorpay)', upi: 'UPI', bank: 'Bank transfer (NEFT / RTGS / IMPS)', credit: 'Credit terms' };
/** Days until each "when" falls due, for the timeline. */
const WHEN_DAYS: Record<When, number> = { soon: 3, '2w': 14, month: 30 };
const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;

/** An address written out, one part to a line, as it goes on the order. */
export function addressText(a: Address) {
  const place = [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ` ${a.pincode}` : '');
  return [a.label, a.contactName, a.phone, a.line1, a.line2, place, a.country].filter(Boolean).join('\n');
}

/**
 * The three steps of ordering by numeral — the cart (or the book), the review, and the dispatch —
 * the one here in gold; those behind are ways back.
 */
export function Steps({ studio, fromCart, at, onStep }: { studio: Studio; fromCart: boolean; at: 1 | 2; onStep: (i: 0 | 1) => void }) {
  const { t } = studio;
  return (
    <ol className="pc-steps" aria-label={t.stepReview}>
      {[fromCart ? t.cartWord : t.book, t.stepReview, t.stepDispatch].map((label, i) => (
        <li key={i} className={i === at ? 'is-on' : i < at ? 'is-done' : undefined} aria-current={i === at ? 'step' : undefined}>
          {i < at ? (
            <button onClick={() => onStep(i as 0 | 1)}>
              <span className="pc-steps-num">{i < at ? '✓' : roman(i + 1)}</span>
              {label}
            </button>
          ) : (
            <>
              <span className="pc-steps-num">{roman(i + 1)}</span>
              {label}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Dispatch: where the fabric goes, when it is needed, and how it will be paid for. The buyer's
 * saved addresses are cards to choose between, the default chosen already, with a card to add a
 * new one (a sheet with the address form); the timing and the payment method are tiles, as the
 * "Add to…" choice is. Nothing is charged here: payment details follow once the price is
 * confirmed. The dock carries the total and "Place order".
 */
export function ShipPay({
  studio, fromCart, shades, total, value, when, setWhen, payment, setPayment, addressId, setAddressId, payDemo, onStep, onPlace,
}: {
  studio: Studio; fromCart: boolean; shades: number; total: number; value: number;
  when: When; setWhen: (w: When) => void; payment: Payment; setPayment: (p: Payment) => void;
  addressId: string | null; setAddressId: (id: string) => void;
  /** Online payment is shown without taking any (the static preview, or a preview sign-in). */
  payDemo: boolean;
  onStep: (i: 0 | 1) => void;
  /** Places the order (paying online first if chosen); resolves with a message if it could not. */
  onPlace: (address: Address, demoPaid?: boolean) => Promise<string | null>;
}) {
  const { t } = studio;
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [adding, setAdding] = useState(false);
  const addPresence = usePresence(adding, 380);
  const [warn, setWarn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoPaying, setDemoPaying] = useState(false);
  const demoPresence = usePresence(demoPaying, 380);
  // Online payment: live when Razorpay is set up here, shown as a preview on the static site.
  const [online, setOnline] = useState<'live' | 'demo' | 'off' | null>(payDemo || PREVIEW ? 'demo' : null);

  const { listAddresses, razorpayReady } = studio;
  useEffect(() => {
    if (payDemo || PREVIEW) return;
    let live = true;
    razorpayReady().then((key) => live && setOnline(key ? 'live' : 'off'));
    return () => {
      live = false;
    };
  }, [payDemo, razorpayReady]);
  // Where online payment is not set up, the choice falls to UPI.
  useEffect(() => {
    if (online === 'off' && payment === 'razorpay') setPayment('upi');
  }, [online, payment, setPayment]);
  useEffect(() => {
    let live = true;
    listAddresses().then((list) => {
      if (!live) return;
      setAddresses(list);
      // The default address is chosen already; with none saved, the form opens.
      if (!list.length) setAdding(true);
    });
    return () => {
      live = false;
    };
  }, [listAddresses]);
  const chosen = addresses?.find((a) => a.id === addressId) ?? addresses?.find((a) => a.isDefault) ?? addresses?.[0] ?? null;

  const place = async () => {
    if (!chosen) {
      setWarn((n) => n + 1);
      return setAdding(true);
    }
    if (busy) return;
    setError('');
    if (payment === 'razorpay' && online === 'demo') return setDemoPaying(true);
    setBusy(true);
    const problem = await onPlace(chosen);
    setBusy(false);
    if (problem) setError(problem);
  };
  const payNow = payment === 'razorpay';

  return (
    <Room center>
      <Steps studio={studio} fromCart={fromCart} at={2} onStep={onStep} />

      <div aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 18 }}>
        <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(90deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'right', animation: 'pcRuleDraw 1s .2s cubic-bezier(.2,.8,.2,1) both' }} />
        <span style={{ fontSize: 9.5, letterSpacing: '.46em', paddingLeft: '.46em', textTransform: 'uppercase', color: UMBER, animation: 'pcRiseIn .9s .15s cubic-bezier(.2,.8,.2,1) both' }}>{t.directEyebrow}</span>
        <span style={{ width: 'clamp(26px,8vw,56px)', height: 1, background: 'linear-gradient(270deg, transparent, rgba(138,109,69,.7))', transformOrigin: 'left', animation: 'pcRuleDraw 1s .2s cubic-bezier(.2,.8,.2,1) both' }} />
      </div>
      <h1 style={{ margin: '14px 0 0', fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(40px,10.5vw,70px)', lineHeight: 1, letterSpacing: '-.012em', color: INK, perspective: 500 }}>
        {[t.shipTitleA, t.shipTitleB].map((w, i, all) => (
          <span
            key={i}
            className={i === all.length - 1 ? 'pc-foil-deep' : undefined}
            style={{ display: 'inline-block', marginRight: i < all.length - 1 ? '.2em' : 0, paddingRight: i === all.length - 1 ? '.06em' : 0, fontStyle: i === all.length - 1 ? 'italic' : undefined, transformOrigin: '50% 100%', animation: `pcWordIn 1.1s ${0.3 + i * 0.12}s cubic-bezier(.2,.8,.2,1) both${i === all.length - 1 ? ', pcFoil 2.8s .8s cubic-bezier(.45,.05,.3,1) both' : ''}` }}
          >
            {w}
          </span>
        ))}
      </h1>
      <p style={{ margin: '12px 0 0', fontFamily: FONT_DISPLAY, fontSize: 16.5, color: UMBER, fontVariantNumeric: 'lining-nums', animation: 'pcRiseIn .9s .6s cubic-bezier(.2,.8,.2,1) both' }}>
        {shades} {shades === 1 ? t.shade : t.shades} · {inr(total)} m · ₹ {inr(value)}
      </p>

      {/* I — Where it goes. */}
      <section className="pc-order-sheet pc-when" style={{ animation: 'pcFieldIn .9s .75s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="pc-ship-head">
          <span aria-hidden className="pc-slip-num">I</span>
          <div className="pc-when-title">{t.shipTo}</div>
        </div>
        {/* From the mill to the address chosen: the route draws itself and a parcel travels it. */}
        <RouteArt key={chosen?.id ?? 'none'} to={chosen?.city ?? '—'} from={t.millSurat} />
        <div key={warn} role="radiogroup" aria-label={t.shipTo} className="pc-addr-list" style={{ animation: warn ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
          {addresses === null && <div className="pc-addr-loading" />}
          {addresses?.map((a) => {
            const on = chosen?.id === a.id;
            return (
              <button key={a.id} role="radio" aria-checked={on} className={`pc-addr${on ? ' is-on' : ''}`} onClick={() => setAddressId(a.id)} style={{ animationDelay: `${0.85 + (addresses?.indexOf(a) ?? 0) * 0.08}s` }}>
                <span aria-hidden className="pc-addr-radio" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="pc-addr-label">
                    {a.label}
                    {a.isDefault && <span className="pc-addr-default">{t.addressDefault}</span>}
                  </span>
                  {a.contactName && <span className="pc-addr-name">{a.contactName}</span>}
                  <span className="pc-addr-lines">
                    {[a.line1, a.line2].filter(Boolean).join(', ')}
                    <br />
                    {[a.city, a.state].filter(Boolean).join(', ')}
                    {a.pincode ? ` ${a.pincode}` : ''}
                  </span>
                  {a.phone && <span className="pc-addr-phone">{a.phone}</span>}
                </span>
              </button>
            );
          })}
          {addresses !== null && (
            <button className="pc-addr-add" onClick={() => setAdding(true)}>
              <span aria-hidden>+</span>
              {t.addAddress}
            </button>
          )}
        </div>
        {warn > 0 && !chosen && <div style={{ marginTop: 10, fontSize: 12.5, color: '#A5392B' }}>{t.addressNeeded}</div>}
      </section>

      {/* II — When it is needed. */}
      <section className="pc-order-sheet pc-when" style={{ animation: 'pcFieldIn .9s .85s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="pc-ship-head">
          <span aria-hidden className="pc-slip-num">II</span>
          <div className="pc-when-title">{t.whenNeeded}</div>
        </div>
        <div role="radiogroup" aria-label={t.whenNeeded} className="pc-when-tiles">
          {(['soon', '2w', 'month'] as const).map((w) => (
            <button key={w} role="radio" aria-checked={when === w} className={`pc-add-tile pc-when-tile${when === w ? ' is-on' : ''}`} onClick={() => setWhen(w)}>
              <span aria-hidden className="pc-add-tick">✓</span>
              <span className="pc-when-fig">{w === 'soon' ? t.whenSoonShort : w === '2w' ? t.when2wShort : t.whenMonthShort}</span>
              <span className="pc-add-tile-sub">{w === 'soon' ? t.whenSoon : w === '2w' ? t.when2w : t.whenMonth}</span>
            </button>
          ))}
        </div>
        {/* The weeks ahead: the span chosen fills in gold, up to the date it is due by. */}
        <TimelineArt studio={studio} when={when} />
      </section>

      {/* III — How it is paid for. */}
      <section className="pc-order-sheet pc-when" style={{ animation: 'pcFieldIn .9s .95s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="pc-ship-head">
          <span aria-hidden className="pc-slip-num">III</span>
          <div className="pc-when-title">{t.paymentTitle}</div>
        </div>
        <div role="radiogroup" aria-label={t.paymentTitle} className="pc-pay-list">
          <div className="pc-pay-group">{t.payNowGroup}</div>
          <PayRow studio={studio} kind="razorpay" on={payNow} disabled={online === 'off'} onPick={() => setPayment('razorpay')} />
          <div className="pc-pay-group">{t.payLaterGroup}</div>
          {(['upi', 'bank', 'credit'] as const).map((p) => (
            <PayRow key={p} studio={studio} kind={p} on={payment === p} onPick={() => setPayment(p)} />
          ))}
        </div>
        <p key={payNow ? 'now' : 'later'} className="pc-pay-note">
          <span aria-hidden>✦</span>
          {payNow ? (online === 'demo' ? t.payDemoNote : t.payNowNote) : t.payNote}
        </p>
      </section>

      {/* The dock: the total, the estimate, and the order. */}
      <div className="pc-order-dock" style={{ animation: 'pcDockIn .9s 1.1s cubic-bezier(.2,.9,.25,1) both' }}>
        <div style={{ minWidth: 0 }}>
          <div key={total} className="pc-dock-total">
            {inr(total)} <span>m</span>
          </div>
          <div className="pc-dock-meta">
            {chosen ? `${t.shipTo} · ${chosen.city}` : t.addressNeeded.split('.')[0]}
            <br />
            <b>₹ {inr(value)}</b>
          </div>
        </div>
        <button key={warn} className={`pc-order-place${chosen && !busy ? '' : ' is-waiting'}${payNow ? ' is-pay' : ''}`} onClick={place} disabled={busy} style={{ animation: warn ? 'pcShake .5s cubic-bezier(.36,.07,.19,.97) both' : undefined }}>
          <span aria-hidden>{payNow ? <LockGlyph /> : '✦'}</span>
          {busy ? t.payOpening : payNow ? `${t.payWord} ₹ ${inr(value)}` : t.placeOrder}
        </button>
      </div>
      {error && <p className="pc-pay-error">{error}</p>}

      {demoPresence.shown && (
        <PayDemo
          studio={studio}
          amount={value}
          leaving={demoPresence.leaving}
          onClose={() => setDemoPaying(false)}
          onPaid={() => {
            setDemoPaying(false);
            if (chosen) onPlace(chosen, true);
          }}
        />
      )}

      {addPresence.shown && (
        <AddressSheet
          studio={studio}
          leaving={addPresence.leaving}
          onClose={() => setAdding(false)}
          onSaved={(a) => {
            setAddresses((was) => [...(was ?? []), a]);
            setAddressId(a.id);
            setAdding(false);
          }}
        />
      )}
    </Room>
  );
}

/** A new delivery address, in a sheet: the fields the mill's dispatch needs, and "Save address". */
function AddressSheet({ studio, leaving, onClose, onSaved }: { studio: Studio; leaving: boolean; onClose: () => void; onSaved: (a: Address) => void }) {
  const { t } = studio;
  const [f, setF] = useState<AddressInput>({ label: '', contactName: studio.userName ?? '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (k: keyof AddressInput) => (e: ChangeEvent<HTMLInputElement>) => setF((was) => ({ ...was, [k]: e.target.value }));
  const field = (k: keyof AddressInput, label: string, extra?: { inputMode?: 'numeric' | 'tel'; autoComplete?: string; half?: boolean }) => (
    <label className="pc-auth-field" style={extra?.half ? { flex: '1 1 0', minWidth: 0 } : undefined}>
      <input className="pc-auth-input" value={(f[k] as string) ?? ''} placeholder=" " onChange={set(k)} inputMode={extra?.inputMode} autoComplete={extra?.autoComplete} />
      <span className="pc-auth-label">{label}</span>
      <span aria-hidden className="pc-auth-line" />
    </label>
  );
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.line1.trim() || !f.city.trim()) return setErr(t.addressIncomplete);
    setBusy(true);
    setErr('');
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v])) as AddressInput;
    const saved = await studio.addAddress({ ...clean, label: clean.label || t.deliveryAddress, line1: f.line1.trim(), city: f.city.trim() });
    setBusy(false);
    if (!saved) return setErr(t.addressSaveFailed);
    onSaved(saved);
  };

  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.addAddress}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={onClose} />
      <form className={`pc-sheet${leaving ? ' is-leaving' : ''}`} onSubmit={save}>
        <div aria-hidden className="pc-sheet-grip" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="pc-add-eyebrow">{t.shipTo}</div>
            <div style={{ marginTop: 4, fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1.1, color: INK }}>{t.addAddress}</div>
          </div>
          <button type="button" aria-label={t.closeWord} className="pc-sheet-close" onClick={onClose}>
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="pc-addr-form">
          {field('label', t.fLabel)}
          <div style={{ display: 'flex', gap: 14 }}>
            {field('contactName', t.fContact, { autoComplete: 'name', half: true })}
            {field('phone', t.fPhone, { inputMode: 'tel', autoComplete: 'tel', half: true })}
          </div>
          {field('line1', t.fLine1, { autoComplete: 'address-line1' })}
          {field('line2', t.fLine2, { autoComplete: 'address-line2' })}
          <div style={{ display: 'flex', gap: 14 }}>
            {field('city', t.fCity, { autoComplete: 'address-level2', half: true })}
            {field('pincode', t.fPincode, { inputMode: 'numeric', autoComplete: 'postal-code', half: true })}
          </div>
          {field('state', t.fState, { autoComplete: 'address-level1' })}
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: '#A5392B' }}>{err}</div>}
        <button className="pc-auth-btn" type="submit" disabled={busy} style={{ marginTop: 18 }}>
          <span aria-hidden className="pc-auth-star">✦</span>
          {t.saveAddress}
        </button>
      </form>
    </div>,
    document.body,
  );
}

function PayGlyph({ kind }: { kind: Payment }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'razorpay')
    return (
      <svg {...common}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19M6 15h4" />
      </svg>
    );
  if (kind === 'upi')
    return (
      <svg {...common}>
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M10 18h4M9.5 8.5l2 3.5 1-2 2 3.5" />
      </svg>
    );
  if (kind === 'bank')
    return (
      <svg {...common}>
        <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M15 3.5v4h4M9 12h7M9 15.5h7M9 19h4" />
    </svg>
  );
}

/** A payment method's row: its icon in a disc (which plays its own small motion when chosen), its name, and a radio ring. */
function PayRow({ studio, kind, on, disabled, onPick }: { studio: Studio; kind: Payment; on: boolean; disabled?: boolean; onPick: () => void }) {
  const { t } = studio;
  const name = { razorpay: t.payRazorpay, upi: t.payUpi, bank: t.payBank, credit: t.payCredit }[kind];
  const sub = disabled ? t.payComingSoon : { razorpay: t.payRazorpaySub, upi: t.payUpiSub, bank: t.payBankSub, credit: t.payCreditSub }[kind];
  return (
    <button role="radio" aria-checked={on} disabled={disabled} className={`pc-pay pc-pay-${kind}${on ? ' is-on' : ''}`} onClick={onPick}>
      <span aria-hidden className="pc-pay-icon">
        <PayGlyph kind={kind} />
        {kind === 'bank' && <span className="pc-pay-coin" />}
        {kind === 'upi' && <span className="pc-pay-scan" />}
      </span>
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span className="pc-pay-name">
          {name}
          {kind === 'razorpay' && !disabled && <span className="pc-pay-secure">{t.paySecure}</span>}
        </span>
        <span className="pc-pay-sub">{sub}</span>
      </span>
      <span aria-hidden className="pc-addr-radio" />
    </button>
  );
}

/**
 * The way from the mill to the chosen address: two pins joined by an arc that draws itself, and
 * a parcel that travels along it once. Remounted for each address, so choosing one plays it again.
 */
function RouteArt({ from, to }: { from: string; to: string }) {
  const path = 'M 30 46 C 110 -6, 250 -6, 330 46';
  return (
    <div className="pc-route" aria-hidden>
      <svg viewBox="0 0 360 64" preserveAspectRatio="xMidYMid meet">
        <path d={path} className="pc-route-base" />
        <path d={path} className="pc-route-line" pathLength={1} />
        <g className="pc-route-parcel">
          <animateMotion dur="1.8s" begin="0.25s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 .05 .3 1" path={path} rotate="auto" />
          <rect x="-7" y="-6" width="14" height="11" rx="1.5" fill="#C9A45A" stroke="#8A6D45" strokeWidth=".8" />
          <path d="M-7 -1.5h14M0 -6v11" stroke="#8A6D45" strokeWidth=".7" />
        </g>
        <circle cx="30" cy="46" r="5" className="pc-route-pin" />
        <circle cx="330" cy="46" r="5" className="pc-route-pin is-to" />
      </svg>
      <div className="pc-route-labels">
        <span>{from}</span>
        <span className="is-to">{to}</span>
      </div>
    </div>
  );
}

/** The weeks ahead as a ruled bar: the span chosen fills in gold, to the date it is needed by. */
function TimelineArt({ studio, when }: { studio: Studio; when: When }) {
  const { t } = studio;
  const days = WHEN_DAYS[when];
  const [today] = useState(() => new Date());
  const by = new Date(today.getTime() + days * 86_400_000).toLocaleDateString(studio.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="pc-timeline" aria-live="polite">
      <div className="pc-timeline-bar">
        <span className="pc-timeline-fill" style={{ transform: `scaleX(${days / 30})` }} />
        {[0, 7, 14, 21, 28].map((d) => (
          <i key={d} style={{ left: `${(d / 30) * 100}%` }} />
        ))}
        <span className="pc-timeline-mark" style={{ left: `${(days / 30) * 100}%` }} />
      </div>
      <div className="pc-timeline-legend">
        <span>{t.todayWord}</span>
        <span key={when} className="pc-timeline-by">
          {t.neededBy} <b>{by}</b>
        </span>
      </div>
    </div>
  );
}

/**
 * Online payment on the static preview: a sheet in the studio's own dress with the amount, a ring
 * that closes as the payment is "made", a tick, and a plain statement that nothing is charged.
 * On the live site Razorpay Checkout opens instead.
 */
function PayDemo({ studio, amount, leaving, onClose, onPaid }: { studio: Studio; amount: number; leaving: boolean; onClose: () => void; onPaid: () => void }) {
  const { t } = studio;
  const [stage, setStage] = useState<'ready' | 'paying' | 'paid'>('ready');
  useEffect(() => {
    if (stage === 'paying') {
      const tm = window.setTimeout(() => setStage('paid'), 1900);
      return () => window.clearTimeout(tm);
    }
    if (stage === 'paid') {
      const tm = window.setTimeout(onPaid, 1100);
      return () => window.clearTimeout(tm);
    }
  }, [stage, onPaid]);
  return createPortal(
    <div className="pc-sheet-root" role="dialog" aria-modal="true" aria-label={t.payRazorpay}>
      <div className={`pc-sheet-backdrop${leaving ? ' is-leaving' : ''}`} onClick={stage === 'ready' ? onClose : undefined} />
      <div className={`pc-sheet pc-paydemo${leaving ? ' is-leaving' : ''}`}>
        <div aria-hidden className="pc-sheet-grip" />
        <div className="pc-add-eyebrow" style={{ textAlign: 'center' }}>
          {t.payRazorpay} · {t.previewWord}
        </div>
        <div className={`pc-paydemo-ring is-${stage}`} aria-hidden>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="pc-paydemo-track" />
            <circle cx="60" cy="60" r="52" className="pc-paydemo-arc" pathLength={1} />
            <path d="M40 61l14 14 27-30" className="pc-paydemo-tick" pathLength={1} />
          </svg>
          <span className="pc-paydemo-lock">
            <LockGlyph size={22} />
          </span>
        </div>
        <div className="pc-paydemo-amount">₹ {inr(amount)}</div>
        <p className="pc-paydemo-copy">{stage === 'paid' ? t.payDemoDone : stage === 'paying' ? t.payDemoPaying : t.payDemoNote}</p>
        {stage === 'ready' && (
          <button className="pc-auth-btn" style={{ marginTop: 16 }} onClick={() => setStage('paying')}>
            <span aria-hidden className="pc-auth-star">✦</span>
            {t.payWord} ₹ {inr(amount)}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LockGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px' }}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}
