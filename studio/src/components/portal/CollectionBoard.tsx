'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { card, label, input, chipBtn, inkBtn } from './AccountPanels';

/**
 * A single saved collection (Phase 3 M13) — the board view. Shades are ordered, annotated
 * and quantified here, and the whole board can be sent to sales as one quotation request.
 * Built entirely from the portal's existing tokens; no new visual language.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const GREEN = '#3D6B45';

export interface BoardItem {
  id: string;
  fabricId: string;
  colourId: string;
  note: string | null;
  quantity: number | null;
  unit: string | null;
  position: number;
  colour: { id: string; name: string; hex: string | null; temperature: string | null; fabric: { id: string; name: string; family: string; weight: string; width: string; comp: string } };
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
  coverItemId: string | null;
  updatedAt: string;
  items: BoardItem[];
}

const jsonHeaders = { 'content-type': 'application/json' };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

export function CollectionBoard({ initial, canQuote }: { initial: Board; canQuote: boolean }) {
  const [board, setBoard] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'ok' | 'error'>('ok');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteNote, setQuoteNote] = useState('');
  const [timeline, setTimeline] = useState('');
  const [busy, setBusy] = useState(false);

  const say = (text: string, kind: 'ok' | 'error' = 'ok') => {
    setTone(kind);
    setMessage(text);
  };

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/portal/collections/${board.id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      say(err?.error ?? 'Could not save that change.', 'error');
      return false;
    }
    const data = (await res.json()) as { collection: Board };
    setBoard(data.collection);
    return true;
  }

  async function saveDetails() {
    if (!name.trim()) {
      say('A collection needs a name.', 'error');
      return;
    }
    if (await patch({ name: name.trim(), description: description.trim() || null })) {
      setEditing(false);
      say('Saved ✓');
    }
  }

  async function saveItem(itemId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/portal/collections/${board.id}/items/${itemId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) });
    if (!res.ok) say('Could not save that change.', 'error');
  }

  function setItem(itemId: string, changes: Partial<BoardItem>) {
    setBoard((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)) }));
  }

  async function removeItem(itemId: string) {
    setBoard((b) => ({ ...b, items: b.items.filter((i) => i.id !== itemId) }));
    await fetch(`/api/portal/collections/${board.id}/items/${itemId}`, { method: 'DELETE' }).catch(() => {});
  }

  /** Move a shade one place earlier or later, then persist the whole order. */
  async function move(index: number, delta: number) {
    const next = [...board.items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBoard((b) => ({ ...b, items: next }));
    await patch({ order: next.map((i) => i.id) });
  }

  async function requestQuote() {
    setBusy(true);
    const res = await fetch(`/api/portal/collections/${board.id}/quote`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ message: quoteNote || null, timeline: timeline || null }),
    });
    setBusy(false);
    if (res.ok) {
      setQuoteOpen(false);
      setQuoteNote('');
      setTimeline('');
      say('Sent to our sales team — you can track it under Quotations.');
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      say(err?.error ?? 'Could not send this collection.', 'error');
    }
  }

  async function duplicate() {
    const res = await fetch('/api/portal/collections', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: `${board.name} (copy)`, duplicateOf: board.id }),
    });
    if (res.ok) {
      const { collection } = (await res.json()) as { collection: { id: string } };
      window.location.href = `/portal/collections/${collection.id}`;
    } else {
      say('Could not duplicate this collection.', 'error');
    }
  }

  async function removeBoard() {
    const res = await fetch(`/api/portal/collections/${board.id}`, { method: 'DELETE' });
    if (res.ok) window.location.href = '/portal';
    else say('Could not delete this collection.', 'error');
  }

  const totalQuantity = board.items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>COLLECTION</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/portal" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>← Portal</Link>
          <Link href="/" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>The Studio ↗</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        {/* Header */}
        {editing ? (
          <div style={card}>
            <div style={label}>Collection name</div>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ ...label, marginTop: 14 }}>Description</div>
            <textarea style={{ ...input, minHeight: 84, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={saveDetails} style={inkBtn}>Save</button>
              <button onClick={() => { setEditing(false); setName(board.name); setDescription(board.description ?? ''); }} style={chipBtn}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>COLLECTION</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4.5vw,50px)', color: INK }}>{board.name}</h1>
            {board.description && <p style={{ margin: '10px 0 0', maxWidth: 620, fontSize: 14, fontWeight: 300, lineHeight: 1.75, color: 'rgba(28,25,23,.65)' }}>{board.description}</p>}
            <div style={{ ...meta, marginTop: 10 }}>
              {board.items.length} shade{board.items.length === 1 ? '' : 's'}
              {totalQuantity > 0 && ` · ${totalQuantity}${board.items[0]?.unit ?? 'm'} indicative`}
              {' · updated '}{new Date(board.updatedAt).toLocaleDateString()}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
              {canQuote && <button onClick={() => setQuoteOpen((o) => !o)} style={inkBtn}>Request quotation</button>}
              <button onClick={() => setEditing(true)} style={chipBtn}>Edit details</button>
              <button onClick={duplicate} style={chipBtn}>Duplicate</button>
              <button onClick={removeBoard} style={chipBtn}>Delete</button>
            </div>
          </>
        )}

        {message && <div style={{ marginTop: 14, fontSize: 12.5, color: tone === 'ok' ? GREEN : '#A33' }}>{message}</div>}

        {/* Send to sales */}
        {quoteOpen && (
          <div style={{ ...card, marginTop: 18 }}>
            <div style={label}>Anything we should know?</div>
            <textarea style={{ ...input, minHeight: 76, resize: 'vertical' }} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="Shipping preference, finish, delivery window…" />
            <div style={{ ...label, marginTop: 14 }}>Timeline</div>
            <input style={input} value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="e.g. dispatch by October" />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
              <button onClick={requestQuote} disabled={busy} style={{ ...inkBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send to sales'}</button>
              <span style={meta}>Quantities and notes below travel with the request.</span>
            </div>
          </div>
        )}

        {/* Shades */}
        <section style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 24, color: INK }}>Shades</h2>
            <span style={meta}>{board.items.length}</span>
          </div>

          {board.items.length === 0 ? (
            <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '10px 0' }}>
              This collection is empty. Pin shades in the studio, then add them from your swatch book.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
              {board.items.map((item, index) => (
                <div key={item.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div className="pc-pink" style={{ height: 118, background: item.colour.hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08)' }} />
                  <div style={{ padding: '12px 14px 16px' }}>
                    <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 18, fontWeight: 600, color: INK }}>{item.colour.name}</div>
                    <div style={meta}>{item.colour.fabric.name} · {item.colour.fabric.weight} · {item.colour.fabric.width}</div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={label}>Quantity</div>
                        <input
                          type="number"
                          min={0}
                          style={{ ...input, marginTop: 4 }}
                          value={item.quantity ?? ''}
                          onChange={(e) => setItem(item.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                          onBlur={(e) => saveItem(item.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </div>
                      <div style={{ width: 70 }}>
                        <div style={label}>Unit</div>
                        <input
                          style={{ ...input, marginTop: 4 }}
                          value={item.unit ?? 'm'}
                          onChange={(e) => setItem(item.id, { unit: e.target.value })}
                          onBlur={(e) => saveItem(item.id, { unit: e.target.value || 'm' })}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={label}>Note</div>
                      <input
                        style={{ ...input, marginTop: 4 }}
                        placeholder="Finish, end use, reference…"
                        value={item.note ?? ''}
                        onChange={(e) => setItem(item.id, { note: e.target.value })}
                        onBlur={(e) => saveItem(item.id, { note: e.target.value || null })}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${item.colour.name} earlier`} style={{ ...chipBtn, padding: '4px 10px', opacity: index === 0 ? 0.4 : 1 }}>←</button>
                      <button onClick={() => move(index, 1)} disabled={index === board.items.length - 1} aria-label={`Move ${item.colour.name} later`} style={{ ...chipBtn, padding: '4px 10px', opacity: index === board.items.length - 1 ? 0.4 : 1 }}>→</button>
                      <button onClick={() => removeItem(item.id)} style={{ ...chipBtn, padding: '4px 12px', marginLeft: 'auto' }}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
