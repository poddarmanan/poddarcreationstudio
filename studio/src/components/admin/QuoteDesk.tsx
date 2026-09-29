'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';

type QuoteItem = { id: string; fabric: { name: string }; colour: { name: string; hex: string | null } };
type QuoteEvent = { id: string; type: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string };
type Quote = {
  id: string; name: string; company: string; email: string | null; quantity: string; subject: string;
  whatsapp?: string | null; moq: string | null; expectedQty: string | null; country: string | null; shippingMethod: string | null; shipTo?: string | null; paymentMethod?: string | null; paymentStatus?: string | null; paymentRef?: string | null; paidAmount?: number | null; timeline: string | null; message: string | null;
  status: string; createdAt: string; assignee: { id: string; name: string } | null; items: QuoteItem[]; events?: QuoteEvent[];
  currency: string; totalValue: number | null; priceNote: string | null; validUntil: string | null;
};
type Staff = { id: string; name: string; role: string };

const INK = '#1C1917';
const GOLD = '#8A6D45';
// The M15 lifecycle. Colours stay inside the existing palette — gold for waiting, the
// established blue/violet for work in progress, green for won, muted ink for closed.
const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
const CLOSED: string[] = ['ACCEPTED', 'REJECTED', 'EXPIRED'];
const STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  DRAFT: { fg: 'rgba(28,25,23,.5)', bg: 'rgba(28,25,23,.07)' },
  SUBMITTED: { fg: GOLD, bg: 'rgba(138,109,69,.12)' },
  UNDER_REVIEW: { fg: '#4A5B8A', bg: 'rgba(74,91,138,.12)' },
  PRICED: { fg: '#6B5B7A', bg: 'rgba(107,91,122,.12)' },
  SENT: { fg: '#4A5B8A', bg: 'rgba(74,91,138,.12)' },
  ACCEPTED: { fg: '#3D6B45', bg: 'rgba(61,107,69,.12)' },
  REJECTED: { fg: 'rgba(28,25,23,.5)', bg: 'rgba(28,25,23,.07)' },
  EXPIRED: { fg: '#A33', bg: 'rgba(170,51,51,.08)' },
};

/** Only the moves the service will accept, so the desk never offers a dead button. */
const NEXT_STATUSES: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'EXPIRED'],
  UNDER_REVIEW: ['PRICED', 'REJECTED', 'EXPIRED'],
  PRICED: ['SENT', 'UNDER_REVIEW', 'REJECTED', 'EXPIRED'],
  SENT: ['ACCEPTED', 'REJECTED', 'UNDER_REVIEW', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: ['UNDER_REVIEW'],
};

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8 };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body),sans-serif', fontSize: 11.5, letterSpacing: '.06em' };
const select: CSSProperties = { border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '7px 10px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12.5, background: '#FAF8F5', outlineColor: GOLD };

function Badge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.SUBMITTED;
  return <span style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: s.fg, background: s.bg, borderRadius: 999, padding: '4px 11px', whiteSpace: 'nowrap' }}>{status.replace(/_/g, ' ')}</span>;
}

export function QuoteDesk({ quotes: initial, staff, me }: { quotes: Quote[]; staff: Staff[]; me: { id: string; name: string } }) {
  const [quotes, setQuotes] = useState(initial);
  const [filter, setFilter] = useState<string>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Quote | null>(null);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState({ total: '', validUntil: '', priceNote: '' });
  const [priceError, setPriceError] = useState('');

  const visible = quotes.filter((q) => filter === 'ALL' || q.status === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, quotes.filter((q) => q.status === s).length]));

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/quotes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return;
    const data = (await res.json()) as { quote: Quote };
    setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, ...data.quote } : q)));
    if (openId === id) setDetail(data.quote);
  }

  /** Money is entered in rupees and stored in paise, so nothing is lost to float rounding. */
  async function savePricing(id: string) {
    setPriceError('');
    const rupees = Number(price.total);
    if (price.total !== '' && (!Number.isFinite(rupees) || rupees < 0)) {
      setPriceError('Enter the total as a number.');
      return;
    }
    const res = await fetch(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'price',
        totalValue: price.total === '' ? null : Math.round(rupees * 100),
        priceNote: price.priceNote || null,
        validUntil: price.validUntil ? new Date(price.validUntil).toISOString() : null,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setPriceError(err?.error ?? 'Could not save pricing.');
      return;
    }
    const data = (await res.json()) as { quote: Quote };
    setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, ...data.quote } : q)));
    setDetail(data.quote);
    setPrice({ total: '', validUntil: '', priceNote: '' });
  }

  async function open(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    const res = await fetch(`/api/quotes/${id}`);
    if (res.ok) setDetail(((await res.json()) as { quote: Quote }).quote);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>INQUIRY DESK</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>The Studio ↗</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>SALES</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4vw,46px)', color: INK }}>Quotations</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 18px' }}>
          {(['ALL', ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{ ...chipBtn, background: filter === s ? INK : 'transparent', color: filter === s ? '#FAF8F5' : INK, borderColor: filter === s ? INK : 'rgba(28,25,23,.2)' }}>
              {s}{s !== 'ALL' ? ` · ${counts[s]}` : ` · ${quotes.length}`}
            </button>
          ))}
        </div>

        {visible.length === 0 && <div style={{ fontSize: 13.5, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '24px 0' }}>No quotations in this view.</div>}

        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map((q) => (
            <div key={q.id} style={card}>
              <div onClick={() => open(q.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 18, fontWeight: 600, color: INK }}>{q.company}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(28,25,23,.55)' }}>{q.name} · {q.subject}</div>
                  <div style={{ fontSize: 11, color: 'rgba(28,25,23,.45)', marginTop: 2 }}>
                    {q.quantity}{q.moq ? ` · MOQ ${q.moq}` : ''}{q.country ? ` · ${q.country}` : ''} · {new Date(q.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {q.items.slice(0, 5).map((it) => (
                    <span key={it.id} title={`${it.colour.name} (${it.fabric.name})`} style={{ width: 18, height: 18, borderRadius: '50%', background: it.colour.hex ?? '#E8DFD2', border: '1px solid rgba(28,25,23,.12)' }} />
                  ))}
                  {q.items.length > 5 && <span style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>+{q.items.length - 5}</span>}
                </div>
                <span style={{ fontSize: 11.5, color: 'rgba(28,25,23,.55)', minWidth: 90 }}>{q.assignee ? `→ ${q.assignee.name}` : 'Unassigned'}</span>
                <Badge status={q.status} />
              </div>

              {openId === q.id && (
                <div style={{ borderTop: '1px solid rgba(28,25,23,.08)', padding: '16px 20px 20px' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={q.assignee?.id ?? ''} onChange={(e) => patch(q.id, { action: 'assign', assigneeId: e.target.value })} style={select}>
                      <option value="" disabled>Assign to…</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role.toLowerCase()})</option>)}
                    </select>
                    <button onClick={() => patch(q.id, { action: 'assign', assigneeId: me.id })} style={chipBtn}>Take it</button>
                    <span style={{ width: 1, height: 22, background: 'rgba(28,25,23,.12)' }} />
                    {(NEXT_STATUSES[q.status] ?? []).map((s) => (
                      <button key={s} onClick={() => patch(q.id, { action: 'status', status: s })} style={chipBtn}>→ {s.replace(/_/g, ' ').toLowerCase()}</button>
                    ))}
                    {CLOSED.includes(q.status) && <span style={{ fontSize: 12, color: 'rgba(28,25,23,.5)' }}>Closed — start a new quotation to requote.</span>}
                  </div>

                  {/* Pricing (M15) — the quote cannot be sent to the customer without it. */}
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(28,25,23,.08)' }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 8 }}>
                      Pricing{q.totalValue !== null ? ` · ${q.currency} ${(q.totalValue / 100).toLocaleString('en-IN')}` : ''}
                      {q.validUntil ? ` · valid to ${new Date(q.validUntil).toLocaleDateString()}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={price.total} onChange={(e) => setPrice((p) => ({ ...p, total: e.target.value }))} placeholder={`Total (${q.currency})`} style={{ ...select, width: 150 }} />
                      <input type="date" value={price.validUntil} onChange={(e) => setPrice((p) => ({ ...p, validUntil: e.target.value }))} aria-label="Valid until" style={{ ...select, width: 150 }} />
                      <input value={price.priceNote} onChange={(e) => setPrice((p) => ({ ...p, priceNote: e.target.value }))} placeholder="Terms, incoterms, notes…" style={{ ...select, flex: '1 1 200px' }} />
                      <button onClick={() => savePricing(q.id)} style={chipBtn}>Save pricing</button>
                    </div>
                    {q.priceNote && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 300, color: 'rgba(28,25,23,.6)' }}>{q.priceNote}</div>}
                    {priceError && <div style={{ marginTop: 8, fontSize: 12.5, color: '#A33' }}>{priceError}</div>}
                  </div>

                  {(q.message || q.expectedQty || q.shippingMethod || q.shipTo || q.paymentMethod || q.timeline || q.whatsapp) && (
                    <div style={{ marginTop: 14, fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.65)' }}>
                      {q.whatsapp && (
                        <div>
                          <b style={{ fontWeight: 500 }}>Send the book on WhatsApp:</b>{' '}
                          <a href={`https://wa.me/${q.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" style={{ color: '#8A6D45' }}>
                            {q.whatsapp}
                          </a>
                        </div>
                      )}
                      {q.expectedQty && <div><b style={{ fontWeight: 500 }}>Expected:</b> {q.expectedQty}</div>}
                      {q.shippingMethod && <div><b style={{ fontWeight: 500 }}>Shipping:</b> {q.shippingMethod}</div>}
                      {q.shipTo && <div style={{ whiteSpace: 'pre-line' }}><b style={{ fontWeight: 500 }}>Ship to:</b> {q.shipTo}</div>}
                      {q.paymentMethod && (
                        <div>
                          <b style={{ fontWeight: 500 }}>Payment:</b> {q.paymentMethod}
                          {q.paymentStatus === 'PAID' && q.paidAmount != null && (
                            <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: 11, color: '#1F5E3A', background: 'rgba(46,125,80,.12)' }}>
                              Paid ₹ {(q.paidAmount / 100).toLocaleString('en-IN')} · {q.paymentRef}
                            </span>
                          )}
                        </div>
                      )}
                      {q.timeline && <div><b style={{ fontWeight: 500 }}>Timeline:</b> {q.timeline}</div>}
                      {q.message && <div style={{ marginTop: 6, fontStyle: 'italic' }}>“{q.message}”</div>}
                    </div>
                  )}

                  {/* Timeline */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 8 }}>Timeline</div>
                    {(detail?.events ?? []).map((e) => (
                      <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontSize: 12.5 }}>
                        <span style={{ color: 'rgba(28,25,23,.4)', minWidth: 130 }}>{new Date(e.createdAt).toLocaleString()}</span>
                        <span style={{ color: INK }}>
                          {e.type === 'CREATED' && 'Inquiry received'}
                          {e.type === 'ASSIGN' && (e.note ?? 'Assigned')}
                          {e.type === 'STATUS' && `${e.fromStatus} → ${e.toStatus}${e.note ? ` — ${e.note}` : ''}`}
                          {e.type === 'PRICE' && (e.note ?? 'Pricing updated')}
                          {e.type === 'NOTE' && `Note: ${e.note}`}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" style={{ ...select, flex: 1 }} />
                      <button onClick={() => { if (note.trim()) { patch(q.id, { action: 'note', note: note.trim() }); setNote(''); } }} style={chipBtn}>Add note</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
