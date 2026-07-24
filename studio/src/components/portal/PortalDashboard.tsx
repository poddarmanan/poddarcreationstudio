'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { AddressBook, ContactPeople, AccountSecurity, type Address, type Contact } from './AccountPanels';
import { ActivityFeed, FollowUps, Recommendations, type ActivityRow, type FollowUpRow, type RecommendationRow } from './DashboardPanels';
import { NotificationCentre, type NotificationRow, type NotificationPreferences } from './NotificationCentre';

// ---- Loose prop types (data is serialized from the dealer service) -----------
type Colour = { id: string; name: string; hex: string | null; order: number; fabric: { id: string; name: string } };
type Favourite = { id: string; fabricId: string; colourId: string | null; fabric: { id: string; name: string; weight: string; width: string }; colour: Colour | null };
type CollectionItem = { id: string; fabricId: string; colourId: string; note: string | null; quantity: number | null; unit: string | null; colour: Colour };
type Collection = { id: string; name: string; description: string | null; updatedAt: string; items: CollectionItem[] };
type Recent = { id: string; fabricId: string; colourId: string | null; fabric: { id: string; name: string }; colour: Colour | null };
type Download = { id: string; kind: string; createdAt: string; fabric: { id: string; name: string } | null };
type QuoteItem = { fabric: { name: string }; colour: { name: string; hex: string | null } };
type Quote = { id: string; subject: string; company: string; quantity: string; status: string; createdAt: string; currency: string; totalValue: number | null; items: QuoteItem[] };
type SampleItemT = { id: string; fabric: { name: string }; colour: { name: string; hex: string | null } };
type Sample = { id: string; status: string; courier: string | null; trackingNumber: string | null; createdAt: string; items: SampleItemT[] };
type Profile = {
  company?: string | null; contactPhone?: string | null; whatsapp?: string | null; gstNumber?: string | null;
  vatNumber?: string | null; website?: string | null;
  shippingLine1?: string | null; shippingCity?: string | null; shippingState?: string | null; shippingPincode?: string | null; shippingCountry?: string | null;
  prefEmail?: boolean; prefWhatsapp?: boolean; prefPhone?: boolean;
} | null;

interface Props {
  user: { name: string; email: string; role: string; approved: boolean; emailVerified: boolean };
  addresses: Address[];
  contacts: Contact[];
  activity: ActivityRow[];
  followUps: FollowUpRow[];
  recommendations: RecommendationRow[];
  notifications: NotificationRow[];
  unread: number;
  notificationPreferences: NotificationPreferences;
  profile: Profile;
  stats: { favourites: number; collections: number; quotes: number; downloads: number; recent: number };
  favourites: Favourite[];
  collections: Collection[];
  recent: Recent[];
  downloads: Download[];
  quotes: Quote[];
  samples: Sample[];
}

const INK = '#1C1917';
const GOLD = '#8A6D45';

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 'clamp(18px,2.4vw,26px)' };
const label: CSSProperties = { fontSize: 10.5, letterSpacing: '.22em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' };
const input: CSSProperties = { width: '100%', border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '10px 12px', fontFamily: 'var(--font-body),sans-serif', fontSize: 13.5, background: '#FAF8F5', marginTop: 6, outlineColor: GOLD };

function Section({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 24, color: INK }}>{title}</h2>
        {meta && <span style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>{meta}</span>}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ hex, name, sub, onRemove }: { hex: string | null; name: string; sub?: string; onRemove?: () => void }) {
  return (
    <div style={{ position: 'relative', width: 128 }}>
      <div className="pc-pink" style={{ height: 92, borderRadius: '4px 4px 0 0', background: hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08)' }} />
      {onRemove && (
        <button onClick={onRemove} aria-label="Remove" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(250,248,245,.9)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
      )}
      <div style={{ padding: '7px 2px 0' }}>
        <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 15, fontWeight: 600, color: INK }}>{name}</div>
        {sub && <div style={{ fontSize: 10.5, color: 'rgba(28,25,23,.5)' }}>{sub}</div>}
      </div>
    </div>
  );
}

const emptyNote: CSSProperties = { fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)', padding: '10px 0' };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '7px 14px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12, letterSpacing: '.06em' };
const inkBtn: CSSProperties = { ...chipBtn, background: INK, color: '#FAF8F5', border: '1px solid ' + INK };

export function PortalDashboard(props: Props) {
  const [favourites, setFavourites] = useState(props.favourites);
  const [collections, setCollections] = useState(props.collections);
  const [profile, setProfile] = useState<Profile>(props.profile);
  const [savedFlash, setSavedFlash] = useState(false);
  const [newName, setNewName] = useState('');
  const [samples, setSamples] = useState(props.samples);
  const [sampleMsg, setSampleMsg] = useState('');

  async function requestSamples() {
    // Prefer the address book's default (M12); fall back to the profile's legacy single
    // address so accounts that predate the address book still work.
    const shipTo = props.addresses.find((a) => a.isDefault) ?? props.addresses[0];
    const p = shipTo
      ? { company: profile?.company, contactPhone: shipTo.phone ?? profile?.contactPhone, shippingLine1: shipTo.line1, shippingCity: shipTo.city, shippingState: shipTo.state, shippingPincode: shipTo.pincode, shippingCountry: shipTo.country }
      : profile;
    if (!p?.shippingLine1 || !p?.shippingCity) {
      setSampleMsg('Add a shipping address below first.');
      return;
    }
    const book = (await fetch('/api/swatchbook').then((r) => r.json()).catch(() => null)) as { items?: { fabricId: string; colourId: string }[] } | null;
    const items = (book?.items ?? []).map((i) => ({ fabricId: i.fabricId, colourId: i.colourId })).slice(0, 20);
    if (items.length === 0) {
      setSampleMsg('Your swatch book is empty — pin shades in the studio first.');
      return;
    }
    const res = await fetch('/api/samples', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: props.user.name, company: p.company ?? props.user.name, phone: p.contactPhone,
        shippingLine1: p.shippingLine1, shippingCity: p.shippingCity, shippingState: p.shippingState,
        shippingPincode: p.shippingPincode, shippingCountry: p.shippingCountry ?? 'India', items,
      }),
    });
    if (res.ok) {
      const list = (await fetch('/api/samples').then((r) => r.json()).catch(() => null)) as { samples?: Sample[] } | null;
      if (list?.samples) setSamples(list.samples);
      setSampleMsg('Sample request sent — our team will approve and dispatch it.');
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setSampleMsg(err?.error ?? 'Could not send the request.');
    }
  }

  async function removeFavourite(id: string) {
    setFavourites((f) => f.filter((x) => x.id !== id));
    await fetch(`/api/portal/favourites/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function createCollection(fromSwatchBook: boolean) {
    const name = (newName.trim() || (fromSwatchBook ? 'From swatch book' : 'New collection')).slice(0, 120);
    const res = await fetch('/api/portal/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, fromSwatchBook }) });
    if (res.ok) {
      const list = await fetch('/api/portal/collections').then((r) => r.json());
      setCollections(list.collections ?? []);
      setNewName('');
    }
  }

  async function deleteCollection(id: string) {
    setCollections((c) => c.filter((x) => x.id !== id));
    await fetch(`/api/portal/collections/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function removeItem(collectionId: string, itemId: string) {
    setCollections((c) => c.map((col) => (col.id === collectionId ? { ...col, items: col.items.filter((i) => i.id !== itemId) } : col)));
    await fetch(`/api/portal/collections/${collectionId}?itemId=${itemId}`, { method: 'DELETE' }).catch(() => {});
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/portal/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile ?? {}) });
    if (res.ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    }
  }

  const set = (k: keyof NonNullable<Profile>, v: string | boolean) => setProfile((p) => ({ ...(p ?? {}), [k]: v }));

  const stats = [
    { k: 'Favourites', v: favourites.length },
    { k: 'Collections', v: collections.length },
    { k: 'Quotes', v: props.stats.quotes },
    { k: 'Downloads', v: props.stats.downloads },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      {/* Header */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>DEALER PORTAL</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>The Studio ↗</Link>
          <button onClick={() => signOut({ callbackUrl: '/' })} style={chipBtn}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>WELCOME BACK</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4.5vw,50px)', color: INK }}>{props.user.name}</h1>
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <span style={{ border: '1px solid ' + (props.user.approved ? 'rgba(61,107,69,.4)' : 'rgba(138,109,69,.4)'), color: props.user.approved ? '#3D6B45' : GOLD, borderRadius: 999, padding: '4px 12px', letterSpacing: '.06em' }}>
            {props.user.approved ? 'Approved buyer · pricing unlocked' : 'Pending approval · pricing hidden'}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 26 }}>
          {stats.map((s) => (
            <div key={s.k} style={{ ...card, textAlign: 'center', padding: '18px 14px' }}>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 30, fontWeight: 600, color: INK }}>{s.v}</div>
              <div style={label}>{s.k}</div>
            </div>
          ))}
        </div>

        {/* Notifications (M19) */}
        <Section title="Notifications" meta={props.unread > 0 ? `${props.unread} unread` : undefined}>
          <NotificationCentre initial={props.notifications} initialUnread={props.unread} preferences={props.notificationPreferences} />
        </Section>

        {/* Upcoming follow-ups (M14) — only shown when the team has scheduled one */}
        {props.followUps.length > 0 && (
          <Section title="Upcoming follow-ups" meta={`${props.followUps.length}`}>
            <FollowUps rows={props.followUps} />
          </Section>
        )}

        {/* Recent activity (M14) */}
        <Section title="Recent activity">
          <ActivityFeed rows={props.activity} />
        </Section>

        {/* Recommended for you (M14) */}
        <Section title="Recommended for you">
          <Recommendations groups={props.recommendations} />
        </Section>

        {/* Profile */}
        <Section title="Company profile" action={savedFlash ? <span style={{ fontSize: 12, color: '#3D6B45' }}>Saved ✓</span> : undefined}>
          <form onSubmit={saveProfile} style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
              <div><div style={label}>Company</div><input style={input} value={profile?.company ?? ''} onChange={(e) => set('company', e.target.value)} /></div>
              <div><div style={label}>GST number</div><input style={input} value={profile?.gstNumber ?? ''} onChange={(e) => set('gstNumber', e.target.value)} /></div>
              <div><div style={label}>VAT / tax number</div><input style={input} value={profile?.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} /></div>
              <div><div style={label}>Website</div><input style={input} value={profile?.website ?? ''} onChange={(e) => set('website', e.target.value)} /></div>
              <div><div style={label}>Phone</div><input style={input} value={profile?.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} /></div>
              <div><div style={label}>WhatsApp</div><input style={input} value={profile?.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 18 }}>
              <div style={label}>Contact preferences</div>
              {([['prefEmail', 'Email'], ['prefWhatsapp', 'WhatsApp'], ['prefPhone', 'Phone']] as const).map(([k, lbl]) => (
                <label key={k} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!profile?.[k]} onChange={(e) => set(k, e.target.checked)} /> {lbl}
                </label>
              ))}
            </div>
            <button type="submit" style={{ ...inkBtn, marginTop: 18 }}>Save profile</button>
          </form>
        </Section>

        {/* Shipping addresses (M12) */}
        <Section title="Shipping addresses" meta={`${props.addresses.length}`}>
          <AddressBook initial={props.addresses} />
        </Section>

        {/* Contact people (M12) */}
        <Section title="Contact people" meta={`${props.contacts.length}`}>
          <ContactPeople initial={props.contacts} />
        </Section>

        {/* Account security (M12) */}
        <Section title="Account">
          <AccountSecurity email={props.user.email} verified={props.user.emailVerified} />
        </Section>

        {/* Favourites */}
        <Section title="Favourites" meta={`${favourites.length} saved`}>
          {favourites.length === 0 ? (
            <div style={emptyNote}>No favourites yet — save shades and fabrics you return to.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {favourites.map((f) => (
                <Swatch key={f.id} hex={f.colour?.hex ?? null} name={f.colour?.name ?? f.fabric.name} sub={f.colour ? f.fabric.name : `${f.fabric.weight} · ${f.fabric.width}`} onRemove={() => removeFavourite(f.id)} />
              ))}
            </div>
          )}
        </Section>

        {/* Collections */}
        <Section
          title="Collections"
          meta={`${collections.length}`}
          action={
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Collection name" style={{ ...input, marginTop: 0, width: 170 }} />
              <button onClick={() => createCollection(false)} style={chipBtn}>Create</button>
              <button onClick={() => createCollection(true)} style={inkBtn}>From swatch book</button>
            </span>
          }
        >
          {collections.length === 0 ? (
            <div style={emptyNote}>No collections yet — group shades into a lookbook for a buyer.</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {collections.map((col) => (
                <div key={col.id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <Link href={`/portal/collections/${col.id}`} style={{ fontFamily: 'var(--font-display),serif', fontSize: 20, fontWeight: 600, color: INK, textDecoration: 'none' }}>{col.name} →</Link>
                    <span style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>
                      {col.items.length} shades
                      {col.items.some((i) => i.quantity) && ` · ${col.items.reduce((n, i) => n + (i.quantity ?? 0), 0)}${col.items[0]?.unit ?? 'm'}`}
                    </span>
                    <Link href={`/portal/collections/${col.id}`} style={{ ...chipBtn, marginLeft: 'auto', padding: '5px 12px', textDecoration: 'none', color: INK }}>Open board</Link>
                    <button onClick={() => deleteCollection(col.id)} style={{ ...chipBtn, padding: '5px 12px' }}>Delete</button>
                  </div>
                  {col.description && <div style={{ fontSize: 12.5, fontWeight: 300, color: 'rgba(28,25,23,.6)', marginTop: 6 }}>{col.description}</div>}
                  {col.items.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
                      {col.items.map((it) => (
                        <Swatch key={it.id} hex={it.colour.hex} name={it.colour.name} sub={it.note ?? it.colour.fabric.name} onRemove={() => removeItem(col.id, it.id)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recently viewed */}
        <Section title="Recently viewed" meta={`${props.recent.length}`}>
          {props.recent.length === 0 ? (
            <div style={emptyNote}>Fabrics you open in the showroom will appear here.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {props.recent.map((r) => (
                <Swatch key={r.id} hex={r.colour?.hex ?? null} name={r.colour?.name ?? r.fabric.name} sub={r.colour ? r.fabric.name : ''} />
              ))}
            </div>
          )}
        </Section>

        {/* Saved quotes */}
        <Section title="Quotations" meta={`${props.quotes.length}`}>
          {props.quotes.length === 0 ? (
            <div style={emptyNote}>No quotations yet — send a collection to sales, or request one from any fabric.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {props.quotes.map((q) => (
                <Link key={q.id} href={`/portal/quotes/${q.id}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textDecoration: 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: INK }}>{q.subject}</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>
                      {q.quantity} · {new Date(q.createdAt).toLocaleDateString()}
                      {q.totalValue !== null && q.totalValue !== undefined && ` · ${q.currency} ${(q.totalValue / 100).toLocaleString('en-IN')}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>{q.status.replace(/_/g, ' ')}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Sample requests */}
        <Section
          title="Sample requests"
          meta={`${samples.length}`}
          action={<button onClick={requestSamples} style={inkBtn}>Request samples from swatch book</button>}
        >
          {sampleMsg && <div style={{ fontSize: 12.5, color: GOLD, marginBottom: 10 }}>{sampleMsg}</div>}
          {samples.length === 0 ? (
            <div style={emptyNote}>Request physical swatches of your pinned shades — approval, courier and tracking show up here.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {samples.map((sm) => (
                <div key={sm.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {sm.items.slice(0, 6).map((it) => (
                      <span key={it.id} title={`${it.colour.name} (${it.fabric.name})`} style={{ width: 18, height: 18, borderRadius: '50%', background: it.colour.hex ?? '#E8DFD2', border: '1px solid rgba(28,25,23,.12)' }} />
                    ))}
                    {sm.items.length > 6 && <span style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>+{sm.items.length - 6}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 13.5, color: INK }}>{sm.items.length} shade{sm.items.length === 1 ? '' : 's'} · {new Date(sm.createdAt).toLocaleDateString()}</div>
                    {sm.courier && <div style={{ fontSize: 11.5, color: 'rgba(28,25,23,.55)' }}>{sm.courier}{sm.trackingNumber ? ` · ${sm.trackingNumber}` : ''}</div>}
                  </div>
                  <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '4px 12px' }}>{sm.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Downloads */}
        <Section title="Downloads" meta={`${props.downloads.length}`}>
          {props.downloads.length === 0 ? (
            <div style={emptyNote}>Spec sheets and catalogues you download will be listed here.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {props.downloads.map((d) => (
                <div key={d.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                  <span style={{ fontSize: 13, color: INK }}>{d.kind === 'SPEC' ? 'Spec sheet' : 'Colour catalogue'}{d.fabric ? ` · ${d.fabric.name}` : ''}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
