'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Studio, PlacedOrder } from './state';
import { colourCss } from './helpers';
import { Room } from './SwatchBook';
import { FillLine, PRICE_PHONE } from './brand';

const PREVIEW = !!process.env.NEXT_PUBLIC_BASE_PATH;
const inr = (n: number) => Math.round(n).toLocaleString('en-IN');

/** An order as the page shows it, whether it came from the account or from this device. */
type Tracked = {
  ref: string;
  placedAt: Date;
  lines: { name: string; fabric: string; metres: number | null; css: string }[];
  metres: number;
  value: number | null;
  valueQuoted: boolean;
  paid: number | null;
  city: string | null;
  timeline: string | null;
  /** How far along it is: 0 received, 1 price confirmed, 2 in the dye house, 3 dispatched, 4 delivered. */
  stage: number;
  reviewing: boolean;
  cancelled: boolean;
  kind: 'fabric' | 'book';
  demo: boolean;
};

type QuoteRow = {
  id: string;
  status: string;
  createdAt: string;
  paymentStatus?: string | null;
  paidAmount?: number | null;
  totalValue?: number | null;
  shipTo?: string | null;
  timeline?: string | null;
  items: { quantity: number | null; fabric: { name: string }; colour: { name: string; hex: string | null } }[];
};

/** Where an order stands, from the house's status for it. */
function stageOf(status: string, paid: boolean) {
  const at = { DRAFT: 0, SUBMITTED: 0, UNDER_REVIEW: 0, PRICED: 0, SENT: 1, ACCEPTED: 2 }[status] ?? 0;
  return Math.max(at, paid ? 1 : 0);
}

/**
 * Track your order: every order the buyer has placed, newest first, each a card with its
 * reference, when it was placed, where it stands on a gold line of five stops (received, price
 * confirmed, in the dye house, dispatched, delivered), what is in it, its metres and value, where
 * it is going, and a call to the house. A reference typed at the top finds one order. A signed-in
 * buyer sees the orders on their account (and any placed from this device); otherwise, and on the
 * preview, the orders placed from this device.
 */
export function OrderTrack({ studio }: { studio: Studio }) {
  const { t, fabrics, placedOrders, signedIn } = studio;
  const [remote, setRemote] = useState<QuoteRow[] | null>(null);
  const [loading, setLoading] = useState(signedIn && !PREVIEW);
  const [q, setQ] = useState('');
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || PREVIEW) return;
    let live = true;
    fetch('/api/portal/quotes')
      .then((r) => (r.ok ? r.json() : { quotes: [] }))
      .then((d: { quotes?: QuoteRow[] }) => live && setRemote(d.quotes ?? []))
      .catch(() => live && setRemote([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [signedIn]);

  const orders = useMemo(() => {
    const fromAccount: Tracked[] = (remote ?? []).map((qr) => {
      const paid = qr.paymentStatus === 'PAID';
      const metres = qr.items.reduce((s, i) => s + (i.quantity ?? 0), 0);
      return {
        ref: `PC-${qr.id.slice(-6).toUpperCase()}`,
        placedAt: new Date(qr.createdAt),
        lines: qr.items.map((i) => ({ name: i.colour.name, fabric: i.fabric.name, metres: i.quantity, css: i.colour.hex ?? '#ccc' })),
        metres,
        value: qr.totalValue != null ? qr.totalValue / 100 : paid && qr.paidAmount ? qr.paidAmount / 100 : null,
        valueQuoted: qr.totalValue != null,
        paid: paid && qr.paidAmount ? qr.paidAmount / 100 : null,
        city: qr.shipTo ? (qr.shipTo.split(',').slice(-2, -1)[0] ?? '').trim() || null : null,
        timeline: qr.timeline ?? null,
        stage: stageOf(qr.status, paid),
        reviewing: qr.status === 'UNDER_REVIEW' || qr.status === 'PRICED',
        cancelled: qr.status === 'REJECTED' || qr.status === 'EXPIRED',
        kind: metres > 0 ? 'fabric' : 'book',
        demo: false,
      };
    });
    const known = new Set(fromAccount.map((o) => o.ref));
    const fromDevice: Tracked[] = placedOrders
      .filter((o: PlacedOrder) => !known.has(o.ref))
      .map((o) => ({
        ref: o.ref,
        placedAt: new Date(o.placedAt),
        lines: o.lines.map((l) => {
          const x = fabrics.find((f) => f.id === l.fabricId);
          const c = x?.colours.find((cc) => cc.order === l.colourOrder);
          return { name: c?.name ?? '—', fabric: x?.name ?? '', metres: l.metres, css: c ? colourCss(c) : '#ccc' };
        }),
        metres: o.total,
        value: o.paid ?? o.value,
        valueQuoted: false,
        paid: o.paid ?? null,
        city: o.city ?? null,
        timeline: o.timeline ?? null,
        stage: o.paid ? 1 : 0,
        reviewing: !o.paid,
        cancelled: false,
        kind: 'fabric',
        demo: !!o.demo,
      }));
    return [...fromAccount, ...fromDevice].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  }, [remote, placedOrders, fabrics]);

  const want = q.trim().toUpperCase().replace(/^PC-?/, '');
  const shown = want ? orders.filter((o) => o.ref.replace(/^PC-/, '').includes(want)) : orders;
  const first = shown[0]?.ref ?? null;
  const isOpen = (ref: string) => (openRef === null ? ref === first : openRef === ref);

  const words = (t.trackTitle ?? 'Track your Order').split(' ');
  const stops = [t.trackReceived ?? 'Received', t.trackPriced ?? 'Price confirmed', t.trackDyeing ?? 'In the dye house', t.trackDispatched ?? 'Dispatched', t.trackDelivered ?? 'Delivered'];
  const date = (d: Date) => d.toLocaleDateString(studio.lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Room>
      <div className="pc-split is-top">
      <header className="pc-closet-head" style={{ width: '100%' }}>
        <FillLine>
          {words.slice(0, -1).join(' ')}{' '}
          <em className="pc-foil-deep" style={{ paddingRight: '.06em', animation: 'pcFoil 2.8s .7s cubic-bezier(.45,.05,.3,1) both' }}>
            {words.slice(-1)[0]}
          </em>
        </FillLine>
        <div aria-hidden className="pc-closet-orn">
          <i />
          <b />
          <i />
        </div>
        <p className="pc-closet-sub">
          <span>{t.trackSub1 ?? 'Every order, and where it stands.'}</span>
          <span>{t.trackSub2 ?? 'We confirm each step on WhatsApp too.'}</span>
        </p>
      </header>

      {/* Find one by its reference. */}
      {orders.length > 0 && (
        <label className="pc-track-find">
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.trackFind ?? 'Your reference, as PC-4F2K9A'} aria-label={t.trackFind ?? 'Order reference'} autoCapitalize="characters" spellCheck={false} />
        </label>
      )}

      <div className="pc-main">
      <div className="pc-track-list">
        {loading && <div className="pc-track-loading" />}
        {!loading && !orders.length && (
          <div className="pc-track-empty">
            <div className="pc-track-empty-art" aria-hidden>
              <span />
            </div>
            <div className="pc-track-empty-title">{t.trackNone ?? 'No orders yet'}</div>
            <p>{t.trackNoneSub ?? 'Once you place an order it appears here, and you can follow it from the mill to your door.'}</p>
            <div className="pc-book-actions" style={{ marginTop: 22 }}>
              <button className="pc-primary" onClick={() => studio.go('showroom')}>
                <span aria-hidden className="pc-primary-star">✦</span>
                <span>{t.enter}</span>
              </button>
              {!signedIn && !PREVIEW && (
                <button className="pc-quiet-link" onClick={() => studio.openSignIn()}>
                  {t.trackSignIn ?? 'Sign in to see your orders'}
                </button>
              )}
            </div>
          </div>
        )}
        {!loading && orders.length > 0 && !shown.length && <p className="pc-track-miss">{t.trackMiss ?? 'No order with that reference.'}</p>}

        {shown.map((o, i) => {
          const open = isOpen(o.ref);
          return (
            <article key={o.ref} className={`pc-track-card${open ? ' is-open' : ''}${o.cancelled ? ' is-cancelled' : ''}`} style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}>
              <button className="pc-track-head" aria-expanded={open} onClick={() => setOpenRef(open ? '' : o.ref)}>
                <span className="pc-track-ref">
                  <b>{o.ref}</b>
                  <i>
                    {date(o.placedAt)} · {o.kind === 'book' ? (t.book ?? 'Swatch Book') : `${inr(o.metres)} m`}
                    {o.demo ? ` · ${t.trackPreview ?? 'preview'}` : ''}
                  </i>
                </span>
                <span className={`pc-track-pill${o.cancelled ? ' is-off' : ''}`}>{o.cancelled ? (t.trackClosed ?? 'Closed') : o.reviewing && o.stage === 0 ? (t.trackReviewing ?? 'Being reviewed') : stops[o.stage]}</span>
                <span className="pc-track-chips" aria-hidden>
                  {o.lines.slice(0, 5).map((l, k) => (
                    <i key={k} style={{ background: l.css }} />
                  ))}
                </span>
                <svg className="pc-track-caret" aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {open && (
                <div className="pc-track-body">
                  {/* Where it stands: five stops on a gold line, the line drawn to the stop reached. */}
                  {!o.cancelled && (
                    <ol className="pc-track-line" style={{ ['--p' as string]: `${(o.stage / (stops.length - 1)) * 100}%` }}>
                      {stops.map((s, k) => (
                        <li key={k} className={k < o.stage ? 'is-done' : k === o.stage ? 'is-here' : undefined}>
                          <span className="pc-track-dot">{k < o.stage ? '✓' : ''}</span>
                          <span className="pc-track-stop">{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="pc-track-now">
                    {o.cancelled
                      ? (t.trackClosedLine ?? 'This order was closed. Call us if you would like to go ahead with it.')
                      : o.stage === 0
                        ? (t.trackNow0 ?? 'We have your order. We confirm the price and the dispatch date with you on WhatsApp.')
                        : o.stage === 1
                          ? (t.trackNow1 ?? 'The price is confirmed. Your fabric is next in line at the dye house.')
                          : (t.trackNow2 ?? 'Your fabric is being dyed and finished. We will tell you the day it leaves the mill.')}
                  </p>

                  {/* What is in it. */}
                  <ul className="pc-track-lines">
                    {o.lines.map((l, k) => (
                      <li key={k}>
                        <i style={{ background: l.css }} aria-hidden />
                        <span>
                          <b>{l.name}</b>
                          <em>{l.fabric}</em>
                        </span>
                        {l.metres != null && l.metres > 0 && <strong>{inr(l.metres)} m</strong>}
                      </li>
                    ))}
                  </ul>

                  <dl className="pc-track-facts">
                    {o.metres > 0 && (
                      <div>
                        <dt>{t.metresWord ?? 'Metres'}</dt>
                        <dd>{inr(o.metres)} m</dd>
                      </div>
                    )}
                    {o.value != null && o.value > 0 && (
                      <div>
                        <dt>{o.paid ? (t.trackPaid ?? 'Paid online') : o.valueQuoted ? (t.trackQuoted ?? 'Quoted') : (t.estimate ?? 'Estimate')}</dt>
                        <dd>₹ {inr(o.value)}</dd>
                      </div>
                    )}
                    {o.city && (
                      <div>
                        <dt>{t.trackTo ?? 'To'}</dt>
                        <dd>{o.city}</dd>
                      </div>
                    )}
                    {o.timeline && (
                      <div>
                        <dt>{t.trackWhen ?? 'Needed'}</dt>
                        <dd>{o.timeline}</dd>
                      </div>
                    )}
                  </dl>

                  <a className="pc-track-call" href={`tel:${PRICE_PHONE}`}>
                    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                    </svg>
                    {t.trackCall ?? 'Ask about this order'} <span>{o.ref}</span>
                  </a>
                </div>
              )}
            </article>
          );
        })}
      </div>
      </div>

      {!signedIn && !PREVIEW && orders.length > 0 && (
        <p className="pc-track-note">
          {t.trackDeviceNote ?? 'These are the orders placed from this device.'}{' '}
          <button className="pc-quiet-link" style={{ padding: 0 }} onClick={() => studio.openSignIn()}>
            {t.trackSignIn ?? 'Sign in to see your orders'}
          </button>
        </p>
      )}
      </div>
    </Room>
  );
}
