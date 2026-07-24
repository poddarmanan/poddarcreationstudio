'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { card, label as labelStyle, input, chipBtn, inkBtn } from './AccountPanels';

/**
 * A customer's view of one quotation (Phase 3 M15): where it is, what it costs, what
 * happened when, and — once it has been sent — accept or decline. Internal sales notes are
 * filtered out server-side, so they can never reach this component.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const GREEN = '#3D6B45';
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

export interface TrackedQuote {
  id: string;
  subject: string;
  company: string;
  quantity: string;
  status: string;
  currency: string;
  totalValue: number | null;
  priceNote: string | null;
  validUntil: string | null;
  createdAt: string;
  message: string | null;
  assignee: { name: string } | null;
  items: { id: string; quantity: number | null; unit: string | null; unitPrice: number | null; note: string | null; fabric: { id: string; name: string; weight: string; width: string }; colour: { id: string; name: string; hex: string | null } }[];
  events: { id: string; type: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string }[];
  progress: { step: string; label: string; done: boolean; current: boolean }[];
  closed: boolean;
  canDecide: boolean;
}

const money = (minor: number | null, currency: string) =>
  minor === null ? null : `${currency} ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function eventText(e: TrackedQuote['events'][number]): string {
  if (e.type === 'CREATED') return 'Request received';
  if (e.type === 'ASSIGN') return e.note ?? 'Assigned to a specialist';
  if (e.type === 'PRICE') return e.note ?? 'Pricing updated';
  if (e.type === 'STATUS') {
    const to = (e.toStatus ?? '').toLowerCase().replace(/_/g, ' ');
    return `Moved to ${to}${e.note ? ` — ${e.note}` : ''}`;
  }
  return e.note ?? e.type;
}

export function QuoteTracker({ initial }: { initial: TrackedQuote }) {
  const [quote, setQuote] = useState(initial);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(action: 'accept' | 'reject') {
    setBusy(true);
    const res = await fetch(`/api/portal/quotes/${quote.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { quote: TrackedQuote };
      setQuote(data.quote);
      setNote('');
      setMessage(action === 'accept' ? 'Accepted — our team will be in touch to confirm the order.' : 'Declined. Tell us what would work and we can requote.');
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(err?.error ?? 'Could not record your response.');
    }
  }

  const total = money(quote.totalValue, quote.currency);

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>QUOTATION</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/portal" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>← Portal</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>QUOTATION</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(28px,4vw,44px)', color: INK }}>{quote.subject}</h1>
        <div style={{ ...meta, marginTop: 10 }}>
          Requested {new Date(quote.createdAt).toLocaleDateString()}
          {quote.assignee && ` · with ${quote.assignee.name}`}
          {` · ${quote.quantity}`}
        </div>

        {/* Progress */}
        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, alignItems: 'stretch' }}>
            {quote.progress.map((step, index) => (
              <div key={step.step} style={{ flex: '1 1 120px', minWidth: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                      background: step.done ? GOLD : 'transparent',
                      boxShadow: `inset 0 0 0 ${step.done ? 5 : 1}px ${step.done ? GOLD : 'rgba(28,25,23,.25)'}`,
                    }}
                  />
                  {index < quote.progress.length - 1 && (
                    <span aria-hidden style={{ flex: 1, height: 1, background: step.done ? GOLD : 'rgba(28,25,23,.15)' }} />
                  )}
                </div>
                <div style={{ paddingTop: 9, paddingRight: 10 }}>
                  <div style={{ fontSize: 11.5, textTransform: 'capitalize', color: step.current ? INK : 'rgba(28,25,23,.5)', fontWeight: step.current ? 500 : 400 }}>{step.label}</div>
                </div>
              </div>
            ))}
          </div>
          {quote.closed && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: '#A33' }}>
              This quotation is {quote.status.toLowerCase()}. Ask us to requote and we&rsquo;ll open a fresh one.
            </div>
          )}
        </section>

        {/* Pricing */}
        <section style={{ marginTop: 30 }}>
          <div style={{ ...card, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <div style={labelStyle}>Quoted total</div>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 30, fontWeight: 600, color: INK, marginTop: 4 }}>
                {total ?? 'Being prepared'}
              </div>
            </div>
            {quote.validUntil && (
              <div>
                <div style={labelStyle}>Valid until</div>
                <div style={{ fontSize: 14, color: INK, marginTop: 8 }}>{new Date(quote.validUntil).toLocaleDateString()}</div>
              </div>
            )}
            {quote.priceNote && <div style={{ flex: '1 1 260px', fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.65)' }}>{quote.priceNote}</div>}
          </div>
        </section>

        {/* Decision */}
        {quote.canDecide && (
          <section style={{ marginTop: 18 }}>
            <div style={card}>
              <div style={labelStyle}>Your response</div>
              <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything you'd like to add (optional)" />
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={() => decide('accept')} disabled={busy} style={{ ...inkBtn, opacity: busy ? 0.6 : 1 }}>Accept this quotation</button>
                <button onClick={() => decide('reject')} disabled={busy} style={{ ...chipBtn, opacity: busy ? 0.6 : 1 }}>Decline</button>
              </div>
            </div>
          </section>
        )}
        {message && <div style={{ marginTop: 12, fontSize: 12.5, color: quote.status === 'ACCEPTED' ? GREEN : GOLD }}>{message}</div>}

        {/* Lines */}
        <section style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 22, color: INK }}>Shades</h2>
            <span style={meta}>{quote.items.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {quote.items.map((item) => (
              <div key={item.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', flexWrap: 'wrap' }}>
                <span className="pc-pink" style={{ width: 44, height: 44, borderRadius: 4, background: item.colour.hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08)', flexShrink: 0 }} />
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: INK }}>{item.colour.name}</div>
                  <div style={meta}>{item.fabric.name} · {item.fabric.weight} · {item.fabric.width}{item.note ? ` · ${item.note}` : ''}</div>
                </div>
                {item.quantity !== null && <span style={meta}>{item.quantity}{item.unit ?? 'm'}</span>}
                {item.unitPrice !== null && (
                  <span style={{ fontSize: 13.5, color: INK, whiteSpace: 'nowrap' }}>{money(item.unitPrice, quote.currency)}/{item.unit ?? 'm'}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 22, color: INK }}>History</h2>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {quote.events.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                <span style={{ ...meta, minWidth: 96, whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleDateString()}</span>
                <span style={{ fontSize: 13.5, color: INK }}>{eventText(e)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
