'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';

type SampleItem = { id: string; fabric: { name: string }; colour: { name: string; hex: string | null } };
type SampleEvent = { id: string; type: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string };
type Sample = {
  id: string; name: string; company: string; email: string | null; phone: string | null;
  shippingLine1: string; shippingCity: string; shippingState: string | null; shippingPincode: string | null; shippingCountry: string;
  message: string | null; status: string; courier: string | null; trackingNumber: string | null;
  createdAt: string; assignee: { id: string; name: string } | null; items: SampleItem[]; events?: SampleEvent[];
};

const INK = '#1C1917';
const GOLD = '#8A6D45';
const STATUSES = ['REQUESTED', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'REJECTED'] as const;
const STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  REQUESTED: { fg: GOLD, bg: 'rgba(138,109,69,.12)' },
  APPROVED: { fg: '#4A5B8A', bg: 'rgba(74,91,138,.12)' },
  DISPATCHED: { fg: '#6B5B7A', bg: 'rgba(107,91,122,.12)' },
  DELIVERED: { fg: '#3D6B45', bg: 'rgba(61,107,69,.12)' },
  REJECTED: { fg: 'rgba(28,25,23,.5)', bg: 'rgba(28,25,23,.07)' },
};

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8 };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body),sans-serif', fontSize: 11.5, letterSpacing: '.06em' };
const input: CSSProperties = { border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '7px 10px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12.5, background: '#FAF8F5', outlineColor: GOLD };

export function SampleDesk({ samples: initial }: { samples: Sample[] }) {
  const [samples, setSamples] = useState(initial);
  const [filter, setFilter] = useState<string>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Sample | null>(null);
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');

  const visible = samples.filter((s) => filter === 'ALL' || s.status === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, samples.filter((x) => x.status === s).length]));

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/samples/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return;
    const data = (await res.json()) as { sample: Sample };
    setSamples((ss) => ss.map((s) => (s.id === id ? { ...s, ...data.sample } : s)));
    if (openId === id) setDetail(data.sample);
  }

  async function open(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    const res = await fetch(`/api/samples/${id}`);
    if (res.ok) setDetail(((await res.json()) as { sample: Sample }).sample);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>SAMPLE DESK</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/admin/quotes" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>Quotations</Link>
          <Link href="/" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>The Studio ↗</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>DISPATCH</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4vw,46px)', color: INK }}>Sample requests</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 18px' }}>
          {(['ALL', ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{ ...chipBtn, background: filter === s ? INK : 'transparent', color: filter === s ? '#FAF8F5' : INK, borderColor: filter === s ? INK : 'rgba(28,25,23,.2)' }}>
              {s}{s !== 'ALL' ? ` · ${counts[s]}` : ` · ${samples.length}`}
            </button>
          ))}
        </div>

        {visible.length === 0 && <div style={{ fontSize: 13.5, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '24px 0' }}>No sample requests in this view.</div>}

        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map((s) => {
            const badge = STATUS_STYLE[s.status] ?? STATUS_STYLE.REQUESTED;
            return (
              <div key={s.id} style={card}>
                <div onClick={() => open(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 18, fontWeight: 600, color: INK }}>{s.company}</div>
                    <div style={{ fontSize: 12.5, color: 'rgba(28,25,23,.55)' }}>{s.name} · {s.shippingCity}{s.shippingState ? `, ${s.shippingState}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'rgba(28,25,23,.45)', marginTop: 2 }}>
                      {s.items.length} shade{s.items.length === 1 ? '' : 's'} · {new Date(s.createdAt).toLocaleDateString()}
                      {s.courier ? ` · ${s.courier}${s.trackingNumber ? ` (${s.trackingNumber})` : ''}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {s.items.slice(0, 6).map((it) => (
                      <span key={it.id} title={`${it.colour.name} (${it.fabric.name})`} style={{ width: 18, height: 18, borderRadius: '50%', background: it.colour.hex ?? '#E8DFD2', border: '1px solid rgba(28,25,23,.12)' }} />
                    ))}
                    {s.items.length > 6 && <span style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>+{s.items.length - 6}</span>}
                  </div>
                  <span style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: badge.fg, background: badge.bg, borderRadius: 999, padding: '4px 11px', whiteSpace: 'nowrap' }}>{s.status}</span>
                </div>

                {openId === s.id && (
                  <div style={{ borderTop: '1px solid rgba(28,25,23,.08)', padding: '16px 20px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.65)' }}>
                      <b style={{ fontWeight: 500 }}>Ship to:</b> {s.shippingLine1}, {s.shippingCity}{s.shippingPincode ? ` ${s.shippingPincode}` : ''}, {s.shippingCountry}
                      {s.phone && <> · {s.phone}</>}
                      {s.message && <div style={{ fontStyle: 'italic', marginTop: 4 }}>“{s.message}”</div>}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                      {s.status === 'REQUESTED' && (
                        <>
                          <button onClick={() => patch(s.id, { action: 'status', status: 'APPROVED' })} style={{ ...chipBtn, background: INK, color: '#FAF8F5', borderColor: INK }}>Approve</button>
                          <button onClick={() => patch(s.id, { action: 'status', status: 'REJECTED' })} style={chipBtn}>Reject</button>
                        </>
                      )}
                      {s.status === 'APPROVED' && (
                        <>
                          <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier (e.g. Delhivery)" style={input} />
                          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" style={input} />
                          <button
                            onClick={() => { if (courier.trim()) { patch(s.id, { action: 'status', status: 'DISPATCHED', courier: courier.trim(), trackingNumber: tracking.trim() || undefined }); setCourier(''); setTracking(''); } }}
                            style={{ ...chipBtn, background: INK, color: '#FAF8F5', borderColor: INK }}
                          >
                            Dispatch
                          </button>
                        </>
                      )}
                      {s.status === 'DISPATCHED' && (
                        <button onClick={() => patch(s.id, { action: 'status', status: 'DELIVERED' })} style={{ ...chipBtn, background: INK, color: '#FAF8F5', borderColor: INK }}>Mark delivered</button>
                      )}
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase', marginBottom: 8 }}>History</div>
                      {(detail?.events ?? []).map((e) => (
                        <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontSize: 12.5 }}>
                          <span style={{ color: 'rgba(28,25,23,.4)', minWidth: 130 }}>{new Date(e.createdAt).toLocaleString()}</span>
                          <span style={{ color: INK }}>
                            {e.type === 'CREATED' && 'Request received'}
                            {e.type === 'STATUS' && `${e.fromStatus} → ${e.toStatus}${e.note ? ` — ${e.note}` : ''}`}
                            {e.type === 'COURIER' && `Dispatched · ${e.note}`}
                            {e.type === 'NOTE' && `Note: ${e.note}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
