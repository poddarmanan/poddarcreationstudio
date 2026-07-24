'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';

/**
 * The sales workspace (Phase 3 M16): pipeline board, the team's overdue reminders, samples
 * waiting on us, and a searchable customer list. Same visual language as the quote and
 * sample desks — chip filters, white cards on cream, the selvage rule under the title.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8 };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body),sans-serif', fontSize: 11.5, letterSpacing: '.06em' };
const field: CSSProperties = { border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '7px 10px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12.5, background: '#FAF8F5', outlineColor: GOLD };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

export interface PipelineQuote {
  id: string; subject: string; company: string; status: string; totalValue: number | null; currency: string; createdAt: string;
  assignee: { id: string; name: string } | null;
  user: { id: string; name: string; company: string | null } | null;
  items: { id: string; colour: { hex: string | null; name: string } }[];
}
export interface PipelineStage { stage: string; label: string; count: number; value: number; quotes: PipelineQuote[] }
export interface OverdueRow { id: string; subject: string; dueAt: string; dueLabel: string; user: { id: string; name: string; company: string | null }; assignee: { name: string } | null }
export interface SampleRow { id: string; name: string; company: string; status: string; createdAt: string; assignee: { id: string; name: string } | null; items: { id: string }[] }
export interface CustomerRow {
  id: string; name: string; email: string; company: string | null; phone: string | null; approved: boolean;
  lastLoginAt: string | null; createdAt: string;
  counts: { quotes: number; collections: number; sampleRequests: number; favourites: number; openQuotes: number };
}

const money = (minor: number, currency = 'INR') => `${currency} ${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function SalesWorkspace({
  pipeline,
  customers: initialCustomers,
}: {
  pipeline: { stages: PipelineStage[]; closed: Record<string, { count: number; value: number }>; samples: SampleRow[]; overdue: OverdueRow[] };
  customers: CustomerRow[];
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    const res = await fetch(`/api/admin/sales/customers?q=${encodeURIComponent(query)}`);
    setSearching(false);
    if (res.ok) setCustomers(((await res.json()) as { customers: CustomerRow[] }).customers);
  }

  const openValue = pipeline.stages.reduce((sum, s) => sum + s.value, 0);
  const openCount = pipeline.stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>SALES WORKSPACE</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/admin" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>← Staff hub</Link>
          <Link href="/admin/quotes" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>Quote desk</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>SALES</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4vw,46px)', color: INK }}>Workspace</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

        {/* Headline numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 28 }}>
          {[
            { k: 'Open quotes', v: String(openCount) },
            { k: 'Open value', v: money(openValue) },
            { k: 'Won value', v: money(pipeline.closed.ACCEPTED?.value ?? 0) },
            { k: 'Samples waiting', v: String(pipeline.samples.length) },
            { k: 'Overdue follow-ups', v: String(pipeline.overdue.length) },
          ].map((t) => (
            <div key={t.k} style={{ ...card, textAlign: 'center', padding: '18px 12px' }}>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 24, fontWeight: 600, color: INK }}>{t.v}</div>
              <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' }}>{t.k}</div>
            </div>
          ))}
        </div>

        {/* Overdue follow-ups first — this is what the day starts with. */}
        {pipeline.overdue.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Overdue follow-ups</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {pipeline.overdue.map((f) => (
                <Link key={f.id} href={`/admin/sales/${f.user.id}`} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', textDecoration: 'none', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, color: INK }}>{f.subject}</span>
                  <span style={meta}>{f.user.company ?? f.user.name}{f.assignee && ` · ${f.assignee.name}`}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A33', background: 'rgba(170,51,51,.08)', borderRadius: 999, padding: '4px 12px' }}>{f.dueLabel}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Pipeline board */}
        <section style={{ marginTop: 32 }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Pipeline</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12, alignItems: 'start' }}>
            {pipeline.stages.map((stage) => (
              <div key={stage.stage} style={{ ...card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid rgba(28,25,23,.08)', paddingBottom: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: GOLD }}>{stage.label}</span>
                  <span style={meta}>{stage.count}</span>
                  {stage.value > 0 && <span style={{ ...meta, marginLeft: 'auto' }}>{money(stage.value)}</span>}
                </div>
                {stage.quotes.length === 0 ? (
                  <div style={{ ...meta, padding: '6px 0' }}>Nothing here.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {stage.quotes.slice(0, 12).map((q) => (
                      <Link key={q.id} href={q.user ? `/admin/sales/${q.user.id}` : '/admin/quotes'} style={{ display: 'block', textDecoration: 'none', border: '1px solid rgba(28,25,23,.07)', borderRadius: 6, padding: '9px 11px' }}>
                        <div style={{ fontSize: 13, color: INK }}>{q.user?.company ?? q.company}</div>
                        <div style={meta}>{q.subject}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                          {q.items.slice(0, 4).map((it) => (
                            <span key={it.id} title={it.colour.name} style={{ width: 12, height: 12, borderRadius: '50%', background: it.colour.hex ?? '#E8DFD2', border: '1px solid rgba(28,25,23,.12)' }} />
                          ))}
                          <span style={{ ...meta, marginLeft: 'auto' }}>{q.totalValue !== null ? money(q.totalValue, q.currency) : 'unpriced'}</span>
                        </div>
                        {q.assignee && <div style={{ ...meta, marginTop: 4 }}>→ {q.assignee.name}</div>}
                      </Link>
                    ))}
                    {stage.quotes.length > 12 && <div style={meta}>+{stage.quotes.length - 12} more</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Samples waiting */}
        {pipeline.samples.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Samples waiting</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {pipeline.samples.map((s) => (
                <div key={s.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, color: INK }}>{s.company}</span>
                  <span style={meta}>{s.items.length} shade{s.items.length === 1 ? '' : 's'} · {new Date(s.createdAt).toLocaleDateString()}</span>
                  <span style={{ ...meta, marginLeft: 'auto' }}>{s.assignee ? `→ ${s.assignee.name}` : 'Unassigned'}</span>
                  <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>{s.status}</span>
                  <Link href="/admin/samples" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>Open desk</Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Customers */}
        <section style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Customers</h2>
            <span style={meta}>{customers.length}</span>
            <form onSubmit={search} style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or company…" aria-label="Search customers" style={{ ...field, width: 220 }} />
              <button type="submit" style={chipBtn}>{searching ? 'Searching…' : 'Search'}</button>
            </form>
          </div>

          {customers.length === 0 ? (
            <div style={{ ...meta, padding: '12px 0' }}>No customers match that search.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {customers.map((c) => (
                <Link key={c.id} href={`/admin/sales/${c.id}`} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', padding: '13px 18px', textDecoration: 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, color: INK }}>{c.company ?? c.name}</div>
                    <div style={meta}>{c.name} · {c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                  </div>
                  <span style={meta}>
                    {c.counts.openQuotes} open · {c.counts.quotes} quotes · {c.counts.collections} collections · {c.counts.sampleRequests} samples
                  </span>
                  <span style={meta}>{c.lastLoginAt ? `seen ${new Date(c.lastLoginAt).toLocaleDateString()}` : 'never signed in'}</span>
                  {!c.approved && <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>Pending</span>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
