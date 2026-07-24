'use client';

import { useState, type CSSProperties } from 'react';

/**
 * The public face of a shared collection (Phase 3 M17) — the link a customer sends their own
 * buyer. Same studio identity as the signed-in surfaces, and nothing else: no navigation into
 * the app, no owner identity, no pricing.
 *
 * The print stylesheet is scoped to this component and prints the same layout on A4, so
 * "Print catalogue" and "Download PDF" produce the same document by two routes.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';

const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '8px 16px', fontFamily: 'var(--font-body),sans-serif', fontSize: 12, letterSpacing: '.06em', textDecoration: 'none', color: INK, display: 'inline-block' };
const inkBtn: CSSProperties = { ...chipBtn, background: INK, color: '#FAF8F5', border: '1px solid ' + INK };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

export interface PublicItem {
  id: string;
  colourName: string;
  hex: string | null;
  fabricName: string;
  fabricSpec: string;
  composition: string;
  note: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface PublicShare {
  title: string;
  message: string | null;
  description: string | null;
  collectionName: string;
  allowDownload: boolean;
  expiresAt: string | null;
  items: PublicItem[];
}

const PRINT_CSS = `
@media print {
  .pc-share-actions, .pc-share-qr { display: none !important; }
  body { background: #fff !important; }
  .pc-share-page { background: #fff !important; padding: 0 !important; }
  .pc-share-grid { grid-template-columns: repeat(3, 1fr) !important; }
  .pc-share-card { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
}
`;

export function PublicCatalogue({ share, token, qr }: { share: PublicShare; token: string; qr: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — the address bar still has the link */
    }
  }

  return (
    <div className="pc-share-page" style={{ minHeight: '100vh', background: '#F5F2ED', padding: 'clamp(24px,5vw,60px) clamp(16px,4vw,44px) 90px' }}>
      <style>{PRINT_CSS}</style>

      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Masthead */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px' }}>
            <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
            <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD, marginTop: 3 }}>CREATION · STUDIO</div>

            <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, margin: '30px 0 8px' }}>COLLECTION</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4.5vw,50px)', color: INK }}>{share.title}</h1>
            <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

            {(share.message || share.description) && (
              <p style={{ margin: '18px 0 0', maxWidth: 620, fontSize: 14.5, fontWeight: 300, lineHeight: 1.8, color: 'rgba(28,25,23,.7)' }}>{share.message ?? share.description}</p>
            )}
            <div style={{ ...meta, marginTop: 14 }}>
              {share.items.length} shade{share.items.length === 1 ? '' : 's'}
              {share.expiresAt && ` · available until ${new Date(share.expiresAt).toLocaleDateString()}`}
            </div>
          </div>

          {qr && (
            <div className="pc-share-qr" style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated data-URL QR, not a catalogue asset */}
              <img src={qr} alt={`QR code linking to the ${share.title} catalogue`} width={124} height={124} style={{ display: 'block', borderRadius: 6, border: '1px solid rgba(28,25,23,.08)' }} />
              <div style={{ ...meta, marginTop: 6 }}>Scan to open</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pc-share-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 26 }}>
          {share.allowDownload && (
            <a href={`/api/share/${encodeURIComponent(token)}/pdf`} style={inkBtn}>Download PDF</a>
          )}
          <button onClick={() => window.print()} style={chipBtn}>Print catalogue</button>
          <button onClick={copyLink} style={chipBtn}>{copied ? 'Link copied ✓' : 'Copy link'}</button>
        </div>

        {/* Shades */}
        <div className="pc-share-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 20, marginTop: 40 }}>
          {share.items.map((item) => (
            <div key={item.id} className="pc-share-card">
              <div className="pc-pink" style={{ height: 132, borderRadius: '4px 4px 0 0', background: item.hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.08)' }} />
              <div style={{ padding: '10px 2px 0' }}>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 17, fontWeight: 600, color: INK }}>{item.colourName}</div>
                <div style={meta}>{item.fabricName} · {item.fabricSpec}</div>
                <div style={{ ...meta, fontSize: 10.5 }}>{item.composition}{item.hex ? ` · ${item.hex.toUpperCase()}` : ''}</div>
                {(item.quantity || item.note) && (
                  <div style={{ fontSize: 11.5, color: GOLD, marginTop: 4 }}>
                    {item.quantity ? `${item.quantity}${item.unit ?? 'm'}` : ''}
                    {item.quantity && item.note ? ' · ' : ''}
                    {item.note ?? ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {share.items.length === 0 && <div style={{ ...meta, marginTop: 30 }}>This collection has no shades yet.</div>}

        <div style={{ marginTop: 60, paddingTop: 18, borderTop: '1px solid rgba(28,25,23,.1)', ...meta }}>
          Poddar Creation · Wholesale Dyed Fabrics · Surat
        </div>
      </div>
    </div>
  );
}

/** Passphrase gate for a protected catalogue. */
export function CatalogueLock({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/share/${encodeURIComponent(token)}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) window.location.reload();
    else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'That passphrase does not open this catalogue');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#EFEAE2' }}>
      <div style={{ width: 'min(430px,94vw)', background: '#FAF8F5', border: '1px solid rgba(28,25,23,.08)', borderRadius: 6, padding: 'clamp(28px,5vw,44px)', boxShadow: '0 30px 80px rgba(28,25,23,.12)' }}>
        <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 20, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
        <div style={{ fontSize: 9, letterSpacing: '.42em', color: GOLD, marginTop: 3 }}>CREATION · STUDIO</div>
        <div style={{ fontSize: 11, letterSpacing: '.32em', color: GOLD, textTransform: 'uppercase', marginTop: 26 }}>Protected</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(24px,4vw,30px)', color: INK }}>Enter the passphrase</h1>
        <form onSubmit={submit} style={{ marginTop: 22 }}>
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passphrase"
            aria-label="Catalogue passphrase"
            style={{ width: '100%', border: '1px solid rgba(28,25,23,.15)', borderRadius: 6, padding: '12px 14px', fontFamily: 'var(--font-body),sans-serif', fontSize: 14, background: '#fff', outlineColor: GOLD }}
          />
          {error && <div style={{ color: '#A33', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ ...inkBtn, width: '100%', textAlign: 'center', marginTop: 14, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Opening…' : 'Open catalogue'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Shown for a link that is wrong, revoked or past its date. */
export function CatalogueUnavailable({ reason }: { reason: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' }) {
  const copy = {
    NOT_FOUND: 'This catalogue link is not valid.',
    REVOKED: 'This catalogue link has been withdrawn.',
    EXPIRED: 'This catalogue link has passed its date.',
  }[reason];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#EFEAE2', textAlign: 'center' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 20, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
        <div style={{ fontSize: 9, letterSpacing: '.42em', color: GOLD, marginTop: 3 }}>CREATION · STUDIO</div>
        <p style={{ marginTop: 26, fontSize: 15, fontWeight: 300, color: 'rgba(28,25,23,.7)' }}>{copy}</p>
        <p style={{ ...meta, marginTop: 6 }}>Ask whoever shared it for a fresh link.</p>
      </div>
    </div>
  );
}
