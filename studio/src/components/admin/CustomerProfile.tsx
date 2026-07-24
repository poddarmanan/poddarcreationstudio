'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';

/**
 * One customer, everything we know (Phase 3 M16): profile, communication history, collections,
 * quotes, samples, downloads, sales notes and follow-ups. Built from the staff desks' existing
 * tokens so it belongs to the same workspace.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const GREEN = '#3D6B45';

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8 };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body),sans-serif', fontSize: 11.5, letterSpacing: '.06em' };
const inkBtn: CSSProperties = { ...chipBtn, background: INK, color: '#FAF8F5', border: '1px solid ' + INK };
const field: CSSProperties = { border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '8px 11px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12.5, background: '#FAF8F5', outlineColor: GOLD };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

interface Note { id: string; body: string; pinned: boolean; createdAt: string; author: { name: string } | null }
interface FollowUp { id: string; subject: string; note: string | null; dueAt: string; dueLabel: string; overdue: boolean; status: string; visibleToCustomer: boolean; assignee: { id: string; name: string } | null }
interface Comm { id: string; at: string; channel: string; summary: string; ref?: string }

export interface CustomerDetail {
  user: {
    id: string; name: string; email: string; company: string | null; approved: boolean; role: string;
    createdAt: string; lastLoginAt: string | null; emailVerifiedAt: string | null;
    dealerProfile: { company: string | null; contactPhone: string | null; whatsapp: string | null; gstNumber: string | null; vatNumber: string | null; website: string | null } | null;
    addresses: { id: string; label: string; line1: string; city: string; state: string | null; pincode: string | null; country: string; isDefault: boolean }[];
    contacts: { id: string; name: string; designation: string | null; email: string | null; phone: string | null; isPrimary: boolean }[];
  };
  collections: { id: string; name: string; updatedAt: string; _count: { items: number }; items: { id: string; colour: { name: string; hex: string | null } }[] }[];
  quotes: { id: string; subject: string; status: string; currency: string; totalValue: number | null; createdAt: string; assignee: { id: string; name: string } | null; items: { id: string }[] }[];
  samples: { id: string; status: string; courier: string | null; trackingNumber: string | null; createdAt: string; items: { id: string }[] }[];
  activity: { id: string; title: string; detail: string | null; createdAt: string }[];
  notes: Note[];
  followUps: FollowUp[];
  downloads: { id: string; kind: string; createdAt: string; fabric: { name: string } | null }[];
  communication: Comm[];
  summary: { openQuotes: number; wonValue: number; quotedValue: number; lastActivityAt: string | null };
}

const money = (minor: number, currency = 'INR') => `${currency} ${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const jsonHeaders = { 'content-type': 'application/json' };

function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>{title}</h2>
        {count !== undefined && <span style={meta}>{count}</span>}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </section>
  );
}

export function CustomerProfile({ initial, staff }: { initial: CustomerDetail; staff: { id: string; name: string }[] }) {
  const [detail, setDetail] = useState(initial);
  const [noteBody, setNoteBody] = useState('');
  const [followUp, setFollowUp] = useState({ subject: '', dueAt: '', assigneeId: '', visibleToCustomer: false });
  const [message, setMessage] = useState('');

  const customerId = detail.user.id;

  async function refresh() {
    const res = await fetch(`/api/admin/sales/customers/${customerId}`);
    if (res.ok) setDetail(((await res.json()) as { customer: CustomerDetail }).customer);
  }

  async function post(body: Record<string, unknown>, ok: string) {
    const res = await fetch(`/api/admin/sales/customers/${customerId}`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(err?.error ?? 'Could not save that.');
      return false;
    }
    setMessage(ok);
    await refresh();
    return true;
  }

  async function addNote(pinned: boolean) {
    if (!noteBody.trim()) return;
    if (await post({ action: 'note', body: noteBody.trim(), pinned }, 'Note added')) setNoteBody('');
  }

  async function scheduleFollowUp() {
    if (!followUp.subject.trim() || !followUp.dueAt) {
      setMessage('A follow-up needs a subject and a date.');
      return;
    }
    const ok = await post(
      {
        action: 'followUp',
        subject: followUp.subject.trim(),
        dueAt: new Date(followUp.dueAt).toISOString(),
        assigneeId: followUp.assigneeId || null,
        visibleToCustomer: followUp.visibleToCustomer,
      },
      'Follow-up scheduled'
    );
    if (ok) setFollowUp({ subject: '', dueAt: '', assigneeId: '', visibleToCustomer: false });
  }

  async function closeFollowUp(id: string, status: 'DONE' | 'CANCELLED') {
    const res = await fetch(`/api/admin/sales/followups/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ status }) });
    if (res.ok) await refresh();
  }

  const p = detail.user.dealerProfile;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>CUSTOMER</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/admin/sales" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>← Workspace</Link>
          <Link href="/admin/quotes" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>Quote desk</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>CUSTOMER</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(28px,4vw,44px)', color: INK }}>{p?.company ?? detail.user.company ?? detail.user.name}</h1>
        <div style={{ ...meta, marginTop: 10 }}>
          {detail.user.name} · {detail.user.email}
          {p?.contactPhone && ` · ${p.contactPhone}`}
          {p?.gstNumber && ` · GST ${p.gstNumber}`}
          {p?.vatNumber && ` · VAT ${p.vatNumber}`}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 12px', color: detail.user.approved ? GREEN : GOLD, background: detail.user.approved ? 'rgba(61,107,69,.08)' : 'rgba(138,109,69,.1)' }}>
            {detail.user.approved ? 'Approved' : 'Pending approval'}
          </span>
          <span style={meta}>Customer since {new Date(detail.user.createdAt).toLocaleDateString()}</span>
          <span style={meta}>{detail.user.lastLoginAt ? `Last seen ${new Date(detail.user.lastLoginAt).toLocaleDateString()}` : 'Never signed in'}</span>
        </div>

        {/* Quick numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 24 }}>
          {[
            { k: 'Open quotes', v: String(detail.summary.openQuotes) },
            { k: 'Quoted value', v: money(detail.summary.quotedValue) },
            { k: 'Won value', v: money(detail.summary.wonValue) },
            { k: 'Collections', v: String(detail.collections.length) },
            { k: 'Samples', v: String(detail.samples.length) },
          ].map((t) => (
            <div key={t.k} style={{ ...card, textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 22, fontWeight: 600, color: INK }}>{t.v}</div>
              <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' }}>{t.k}</div>
            </div>
          ))}
        </div>

        {message && <div style={{ marginTop: 14, fontSize: 12.5, color: GOLD }}>{message}</div>}

        {/* Sales notes */}
        <Section title="Sales notes" count={detail.notes.length}>
          <div style={{ ...card, padding: 14, marginBottom: 12 }}>
            <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="What should the team know? (internal — never shown to the customer)" style={{ ...field, width: '100%', minHeight: 66, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => addNote(false)} style={inkBtn}>Add note</button>
              <button onClick={() => addNote(true)} style={chipBtn}>Add &amp; pin</button>
            </div>
          </div>
          {detail.notes.length === 0 ? (
            <div style={{ ...meta, padding: '6px 0' }}>No notes yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {detail.notes.map((n) => (
                <div key={n.id} style={{ ...card, padding: '12px 16px' }}>
                  <div style={{ fontSize: 13.5, color: INK }}>{n.pinned && <span style={{ color: GOLD, marginRight: 6 }}>★</span>}{n.body}</div>
                  <div style={meta}>{n.author?.name ?? 'Unknown'} · {new Date(n.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Follow-ups */}
        <Section title="Follow-ups" count={detail.followUps.filter((f) => f.status === 'OPEN').length}>
          <div style={{ ...card, padding: 14, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={followUp.subject} onChange={(e) => setFollowUp((f) => ({ ...f, subject: e.target.value }))} placeholder="Call about the wedding book…" style={{ ...field, flex: '1 1 240px' }} />
            <input type="date" value={followUp.dueAt} onChange={(e) => setFollowUp((f) => ({ ...f, dueAt: e.target.value }))} aria-label="Due date" style={field} />
            <select value={followUp.assigneeId} onChange={(e) => setFollowUp((f) => ({ ...f, assigneeId: e.target.value }))} aria-label="Assign to" style={field}>
              <option value="">Assign to me</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={followUp.visibleToCustomer} onChange={(e) => setFollowUp((f) => ({ ...f, visibleToCustomer: e.target.checked }))} />
              Show to customer
            </label>
            <button onClick={scheduleFollowUp} style={inkBtn}>Schedule</button>
          </div>
          {detail.followUps.length === 0 ? (
            <div style={{ ...meta, padding: '6px 0' }}>Nothing scheduled.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {detail.followUps.map((f) => (
                <div key={f.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap', opacity: f.status === 'OPEN' ? 1 : 0.6 }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 13.5, color: INK }}>{f.subject}</div>
                    <div style={meta}>
                      {new Date(f.dueAt).toLocaleDateString()}
                      {f.assignee && ` · ${f.assignee.name}`}
                      {f.visibleToCustomer ? ' · visible to customer' : ' · internal'}
                    </div>
                  </div>
                  {f.status === 'OPEN' ? (
                    <>
                      <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 12px', color: f.overdue ? '#A33' : GOLD, background: f.overdue ? 'rgba(170,51,51,.08)' : 'rgba(138,109,69,.1)' }}>{f.dueLabel}</span>
                      <button onClick={() => closeFollowUp(f.id, 'DONE')} style={chipBtn}>Done</button>
                      <button onClick={() => closeFollowUp(f.id, 'CANCELLED')} style={chipBtn}>Cancel</button>
                    </>
                  ) : (
                    <span style={meta}>{f.status.toLowerCase()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Communication history */}
        <Section title="Communication history" count={detail.communication.length}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {detail.communication.map((c) => (
              <li key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                <span style={{ ...meta, minWidth: 92, whiteSpace: 'nowrap' }}>{new Date(c.at).toLocaleDateString()}</span>
                <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD, minWidth: 78 }}>{c.channel.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 13, color: INK }}>{c.summary}</span>
              </li>
            ))}
            {detail.communication.length === 0 && <li style={{ ...meta, padding: '6px 0' }}>Nothing yet.</li>}
          </ol>
        </Section>

        {/* Quotes */}
        <Section title="Quotations" count={detail.quotes.length}>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.quotes.map((q) => (
              <div key={q.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 13.5, color: INK }}>{q.subject}</div>
                  <div style={meta}>{q.items.length} shades · {new Date(q.createdAt).toLocaleDateString()}{q.assignee && ` · ${q.assignee.name}`}</div>
                </div>
                <span style={meta}>{q.totalValue !== null ? money(q.totalValue, q.currency) : 'unpriced'}</span>
                <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>{q.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
            {detail.quotes.length === 0 && <div style={{ ...meta, padding: '6px 0' }}>No quotations yet.</div>}
          </div>
        </Section>

        {/* Collections */}
        <Section title="Collections" count={detail.collections.length}>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.collections.map((c) => (
              <div key={c.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: 13.5, color: INK }}>{c.name}</div>
                  <div style={meta}>{c._count.items} shades · updated {new Date(c.updatedAt).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {c.items.map((i) => (
                    <span key={i.id} title={i.colour.name} style={{ width: 16, height: 16, borderRadius: '50%', background: i.colour.hex ?? '#E8DFD2', border: '1px solid rgba(28,25,23,.12)' }} />
                  ))}
                </div>
              </div>
            ))}
            {detail.collections.length === 0 && <div style={{ ...meta, padding: '6px 0' }}>No collections yet.</div>}
          </div>
        </Section>

        {/* Samples + downloads + recent activity */}
        <Section title="Sample requests" count={detail.samples.length}>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.samples.map((s) => (
              <div key={s.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: INK }}>{s.items.length} shades</span>
                <span style={meta}>{new Date(s.createdAt).toLocaleDateString()}{s.courier ? ` · ${s.courier}${s.trackingNumber ? ` ${s.trackingNumber}` : ''}` : ''}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>{s.status}</span>
              </div>
            ))}
            {detail.samples.length === 0 && <div style={{ ...meta, padding: '6px 0' }}>No sample requests.</div>}
          </div>
        </Section>

        <Section title="Recent activity" count={detail.activity.length}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {detail.activity.map((a) => (
              <li key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                <span style={{ ...meta, minWidth: 92, whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                <span style={{ fontSize: 13, color: INK }}>{a.title}</span>
                {a.detail && <span style={meta}>{a.detail}</span>}
              </li>
            ))}
            {detail.activity.length === 0 && <li style={{ ...meta, padding: '6px 0' }}>Nothing yet.</li>}
          </ol>
        </Section>

        {/* Addresses + contacts */}
        <Section title="Addresses &amp; contacts">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
            {detail.user.addresses.map((a) => (
              <div key={a.id} style={{ ...card, padding: '13px 16px' }}>
                <div style={{ fontSize: 13.5, color: INK }}>{a.label}{a.isDefault && <span style={{ color: GREEN, marginLeft: 6, fontSize: 10.5 }}>DEFAULT</span>}</div>
                <div style={{ ...meta, lineHeight: 1.7 }}>{a.line1}<br />{[a.city, a.state, a.pincode].filter(Boolean).join(', ')}<br />{a.country}</div>
              </div>
            ))}
            {detail.user.contacts.map((c) => (
              <div key={c.id} style={{ ...card, padding: '13px 16px' }}>
                <div style={{ fontSize: 13.5, color: INK }}>{c.name}{c.isPrimary && <span style={{ color: GOLD, marginLeft: 6, fontSize: 10.5 }}>PRIMARY</span>}</div>
                <div style={meta}>{[c.designation, c.email, c.phone].filter(Boolean).join(' · ') || 'No details'}</div>
              </div>
            ))}
            {detail.user.addresses.length === 0 && detail.user.contacts.length === 0 && <div style={{ ...meta, padding: '6px 0' }}>Nothing on file.</div>}
          </div>
        </Section>
      </div>
    </div>
  );
}
