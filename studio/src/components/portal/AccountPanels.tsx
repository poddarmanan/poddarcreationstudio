'use client';

import { useState, type CSSProperties } from 'react';

/**
 * Account panels for the customer portal (Phase 3 M12): shipping address book, contact
 * people, and account security. Presentation reuses the portal's existing tokens exactly —
 * same card, label, input and chip styles — so these read as more of the same page, not a
 * new design.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const GREEN = '#3D6B45';

export const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 'clamp(18px,2.4vw,26px)' };
export const label: CSSProperties = { fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' };
export const input: CSSProperties = { width: '100%', border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '10px 12px', fontFamily: 'var(--font-body),sans-serif', fontSize: 13.5, background: '#FAF8F5', marginTop: 6, outlineColor: GOLD };
export const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12, letterSpacing: '.06em' };
export const inkBtn: CSSProperties = { ...chipBtn, background: INK, color: '#FAF8F5', border: '1px solid ' + INK };
const emptyNote: CSSProperties = { fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '10px 0' };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 };

export interface Address {
  id: string; label: string; contactName: string | null; phone: string | null;
  line1: string; line2: string | null; city: string; state: string | null;
  pincode: string | null; country: string; isDefault: boolean;
}

export interface Contact {
  id: string; name: string; designation: string | null; email: string | null;
  phone: string | null; whatsapp: string | null; isPrimary: boolean;
}

const jsonHeaders = { 'content-type': 'application/json' };

function Field({ name, value, onChange, span }: { name: string; value: string; onChange: (v: string) => void; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: '1/-1' } : undefined}>
      <div style={label}>{name}</div>
      <input style={input} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---- Shipping address book ---------------------------------------------------
const BLANK_ADDRESS = { label: '', contactName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' };

export function AddressBook({ initial }: { initial: Address[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [draft, setDraft] = useState(BLANK_ADDRESS);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof BLANK_ADDRESS, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function refresh() {
    const data = (await fetch('/api/portal/addresses').then((r) => r.json()).catch(() => null)) as { addresses?: Address[] } | null;
    if (data?.addresses) setAddresses(data.addresses);
  }

  async function add() {
    setError('');
    if (!draft.line1.trim() || !draft.city.trim()) {
      setError('Street address and city are required.');
      return;
    }
    const res = await fetch('/api/portal/addresses', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(draft) });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not save this address.');
      return;
    }
    setDraft(BLANK_ADDRESS);
    setOpen(false);
    await refresh();
  }

  async function makeDefault(id: string) {
    setAddresses((list) => list.map((a) => ({ ...a, isDefault: a.id === id })));
    await fetch(`/api/portal/addresses/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ isDefault: true }) }).catch(() => {});
    await refresh();
  }

  async function remove(id: string) {
    setAddresses((list) => list.filter((a) => a.id !== id));
    await fetch(`/api/portal/addresses/${id}`, { method: 'DELETE' }).catch(() => {});
    await refresh();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setOpen((o) => !o)} style={chipBtn}>{open ? 'Cancel' : 'Add address'}</button>
      </div>

      {open && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={grid}>
            <Field name="Label" value={draft.label} onChange={(v) => set('label', v)} />
            <Field name="Contact name" value={draft.contactName} onChange={(v) => set('contactName', v)} />
            <Field name="Phone" value={draft.phone} onChange={(v) => set('phone', v)} />
            <Field name="Street address" value={draft.line1} onChange={(v) => set('line1', v)} span />
            <Field name="Area / landmark" value={draft.line2} onChange={(v) => set('line2', v)} span />
            <Field name="City" value={draft.city} onChange={(v) => set('city', v)} />
            <Field name="State" value={draft.state} onChange={(v) => set('state', v)} />
            <Field name="Pincode" value={draft.pincode} onChange={(v) => set('pincode', v)} />
            <Field name="Country" value={draft.country} onChange={(v) => set('country', v)} />
          </div>
          {error && <div style={{ color: '#A33', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
          <button onClick={add} style={{ ...inkBtn, marginTop: 16 }}>Save address</button>
        </div>
      )}

      {addresses.length === 0 ? (
        <div style={emptyNote}>No addresses yet — add one so sample dispatch and quotations pre-fill correctly.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          {addresses.map((a) => (
            <div key={a.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 17, fontWeight: 600, color: INK }}>{a.label}</div>
                {a.isDefault && <span style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: GREEN, border: '1px solid rgba(61,107,69,.35)', borderRadius: 999, padding: '2px 9px' }}>Default</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, color: 'rgba(28,25,23,.65)', marginTop: 8 }}>
                {a.contactName && <div>{a.contactName}{a.phone ? ` · ${a.phone}` : ''}</div>}
                <div>{a.line1}</div>
                {a.line2 && <div>{a.line2}</div>}
                <div>{[a.city, a.state, a.pincode].filter(Boolean).join(', ')}</div>
                <div>{a.country}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {!a.isDefault && <button onClick={() => makeDefault(a.id)} style={{ ...chipBtn, padding: '5px 12px' }}>Make default</button>}
                <button onClick={() => remove(a.id)} style={{ ...chipBtn, padding: '5px 12px' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Contact people ----------------------------------------------------------
const BLANK_CONTACT = { name: '', designation: '', email: '', phone: '', whatsapp: '' };

export function ContactPeople({ initial }: { initial: Contact[] }) {
  const [contacts, setContacts] = useState(initial);
  const [draft, setDraft] = useState(BLANK_CONTACT);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof BLANK_CONTACT, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function refresh() {
    const data = (await fetch('/api/portal/contacts').then((r) => r.json()).catch(() => null)) as { contacts?: Contact[] } | null;
    if (data?.contacts) setContacts(data.contacts);
  }

  async function add() {
    setError('');
    if (!draft.name.trim()) {
      setError('A name is required.');
      return;
    }
    const res = await fetch('/api/portal/contacts', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(draft) });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not save this contact.');
      return;
    }
    setDraft(BLANK_CONTACT);
    setOpen(false);
    await refresh();
  }

  async function makePrimary(id: string) {
    setContacts((list) => list.map((c) => ({ ...c, isPrimary: c.id === id })));
    await fetch(`/api/portal/contacts/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ isPrimary: true }) }).catch(() => {});
    await refresh();
  }

  async function remove(id: string) {
    setContacts((list) => list.filter((c) => c.id !== id));
    await fetch(`/api/portal/contacts/${id}`, { method: 'DELETE' }).catch(() => {});
    await refresh();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setOpen((o) => !o)} style={chipBtn}>{open ? 'Cancel' : 'Add contact'}</button>
      </div>

      {open && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={grid}>
            <Field name="Name" value={draft.name} onChange={(v) => set('name', v)} />
            <Field name="Designation" value={draft.designation} onChange={(v) => set('designation', v)} />
            <Field name="Email" value={draft.email} onChange={(v) => set('email', v)} />
            <Field name="Phone" value={draft.phone} onChange={(v) => set('phone', v)} />
            <Field name="WhatsApp" value={draft.whatsapp} onChange={(v) => set('whatsapp', v)} />
          </div>
          {error && <div style={{ color: '#A33', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
          <button onClick={add} style={{ ...inkBtn, marginTop: 16 }}>Save contact</button>
        </div>
      )}

      {contacts.length === 0 ? (
        <div style={emptyNote}>No contacts yet — tell us who handles merchandising, accounts and logistics.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 160, flex: 1 }}>
                <div style={{ fontSize: 14, color: INK }}>
                  {c.name}
                  {c.isPrimary && <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: GOLD }}>Primary</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>
                  {[c.designation, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
                </div>
              </div>
              {!c.isPrimary && <button onClick={() => makePrimary(c.id)} style={{ ...chipBtn, padding: '5px 12px' }}>Make primary</button>}
              <button onClick={() => remove(c.id)} style={{ ...chipBtn, padding: '5px 12px' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Account security --------------------------------------------------------
export function AccountSecurity({ email, verified }: { email: string; verified: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'ok' | 'error'>('ok');

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/portal/account', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    setTone(res.ok ? 'ok' : 'error');
    setMessage((res.ok ? data?.message : data?.error) ?? (res.ok ? 'Done' : 'Something went wrong.'));
    return res.ok;
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      setTone('error');
      setMessage('Choose a password of at least 8 characters.');
      return;
    }
    if (await post({ action: 'changePassword', currentPassword: current, newPassword: next })) {
      setCurrent('');
      setNext('');
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, color: INK }}>{email}</div>
        <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 12px', color: verified ? GREEN : GOLD, background: verified ? 'rgba(61,107,69,.08)' : 'rgba(138,109,69,.1)' }}>
          {verified ? 'Email verified' : 'Email unverified'}
        </span>
        {!verified && <button onClick={() => post({ action: 'resendVerification' })} style={{ ...chipBtn, padding: '5px 12px' }}>Resend verification</button>}
      </div>

      <form onSubmit={changePassword} style={{ marginTop: 18 }}>
        <div style={grid}>
          <div>
            <div style={label}>Current password</div>
            <input type="password" autoComplete="current-password" style={input} value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <div style={label}>New password</div>
            <input type="password" autoComplete="new-password" style={input} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>
        <button type="submit" style={{ ...inkBtn, marginTop: 16 }}>Change password</button>
      </form>

      {message && <div style={{ marginTop: 12, fontSize: 12.5, color: tone === 'ok' ? GREEN : '#A33' }}>{message}</div>}
    </div>
  );
}
