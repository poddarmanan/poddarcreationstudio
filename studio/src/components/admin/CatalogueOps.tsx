'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';

type Media = {
  id: string; originalName: string; version: number; contentStatus: string; deletedAt: string | null;
  createdAt: string; thumbUrl: string | null; aiColourName: string | null;
  fabric: { name: string }; colour: { name: string; hex: string | null } | null;
};
type Job = { id: string; fileName: string; status: string; attempts: number; error: string | null; createdAt: string };
type Activity = { id: string; action: string; entity: string | null; entityId: string | null; actorName: string; createdAt: string };

const INK = '#1C1917';
const GOLD = '#8A6D45';
const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8 };
const chipBtn: CSSProperties = { cursor: 'pointer', background: 'transparent', border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body),sans-serif', fontSize: 11.5, letterSpacing: '.06em' };
const inkBtn: CSSProperties = { ...chipBtn, background: INK, color: '#FAF8F5', borderColor: INK };
const sectionH: CSSProperties = { margin: '34px 0 14px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 22, color: INK, borderBottom: '1px solid rgba(28,25,23,.1)', paddingBottom: 8 };

const STATUS_BADGE: Record<string, { fg: string; bg: string }> = {
  DRAFT: { fg: GOLD, bg: 'rgba(138,109,69,.12)' },
  PUBLISHED: { fg: '#3D6B45', bg: 'rgba(61,107,69,.12)' },
  ARCHIVED: { fg: 'rgba(28,25,23,.5)', bg: 'rgba(28,25,23,.07)' },
};

export function CatalogueOps(props: { media: Media[]; nextCursor: string | null; jobs: Job[]; activity: Activity[]; fabrics: { id: string; name: string }[] }) {
  const [media, setMedia] = useState(props.media);
  const [jobs, setJobs] = useState(props.jobs);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csvMsg, setCsvMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function refresh() {
    const res = await fetch('/api/admin/media?deleted=1&take=40');
    if (res.ok) setMedia(((await res.json()) as { media: Media[] }).media);
  }

  async function bulk(action: 'edit' | 'delete' | 'restore' | 'purge', contentStatus?: string) {
    if (selected.size === 0) return;
    setBusy(true);
    await fetch('/api/admin/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ids: [...selected], contentStatus }),
    }).catch(() => {});
    setSelected(new Set());
    await refresh();
    setBusy(false);
  }

  async function retryJob(id: string) {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: 'PROCESSING' } : j)));
    const res = await fetch(`/api/admin/uploads/${id}/retry`, { method: 'POST' });
    const ok = res.ok;
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: ok ? 'DONE' : 'FAILED', attempts: j.attempts + 1 } : j)));
    if (ok) refresh();
  }

  async function importCsv(file: File) {
    setBusy(true);
    setCsvMsg('Importing…');
    const res = await fetch('/api/admin/csv', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text() });
    const data = (await res.json().catch(() => null)) as { updated?: number; created?: number; errors?: { line: number; error: string }[]; error?: string } | null;
    setBusy(false);
    if (!res.ok || !data) setCsvMsg(data?.error ?? 'Import failed.');
    else setCsvMsg(`Imported: ${data.updated} updated, ${data.created} created${data.errors?.length ? `, ${data.errors.length} row error(s): line ${data.errors[0].line} — ${data.errors[0].error}` : ''}.`);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>CATALOGUE OPS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/admin" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>Hub</Link>
          <Link href="/" style={{ ...chipBtn, textDecoration: 'none', color: INK }}>The Studio ↗</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        {/* CSV */}
        <h2 style={{ ...sectionH, marginTop: 0 }}>Catalogue CSV</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/api/admin/csv" style={{ ...inkBtn, textDecoration: 'none' }}>Export colours CSV</a>
          <label style={{ ...chipBtn, display: 'inline-block' }}>
            Import CSV…
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
          </label>
          {csvMsg && <span style={{ fontSize: 12.5, color: GOLD }}>{csvMsg}</span>}
        </div>

        {/* Upload queue */}
        <h2 style={sectionH}>Upload queue</h2>
        {jobs.length === 0 ? (
          <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)' }}>No upload jobs yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {jobs.map((j) => (
              <div key={j.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: INK, flex: '1 1 200px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.fileName}</span>
                <span style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>{new Date(j.createdAt).toLocaleString()} · attempt {j.attempts}</span>
                {j.error && <span style={{ fontSize: 11, color: '#A33', flexBasis: '100%' }}>{j.error}</span>}
                <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: j.status === 'DONE' ? '#3D6B45' : j.status === 'FAILED' ? '#A33' : GOLD, background: 'rgba(28,25,23,.06)', borderRadius: 999, padding: '4px 10px' }}>{j.status}</span>
                {j.status === 'FAILED' && <button onClick={() => retryJob(j.id)} style={inkBtn}>Retry</button>}
              </div>
            ))}
          </div>
        )}

        {/* Media library w/ bulk ops */}
        <h2 style={sectionH}>Media library</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(28,25,23,.55)' }}>{selected.size} selected</span>
          <button disabled={busy || !selected.size} onClick={() => bulk('edit', 'PUBLISHED')} style={{ ...chipBtn, opacity: selected.size ? 1 : 0.45 }}>Publish</button>
          <button disabled={busy || !selected.size} onClick={() => bulk('edit', 'DRAFT')} style={{ ...chipBtn, opacity: selected.size ? 1 : 0.45 }}>Draft</button>
          <button disabled={busy || !selected.size} onClick={() => bulk('edit', 'ARCHIVED')} style={{ ...chipBtn, opacity: selected.size ? 1 : 0.45 }}>Archive</button>
          <button disabled={busy || !selected.size} onClick={() => bulk('delete')} style={{ ...chipBtn, opacity: selected.size ? 1 : 0.45 }}>Delete</button>
          <button disabled={busy || !selected.size} onClick={() => bulk('restore')} style={{ ...chipBtn, opacity: selected.size ? 1 : 0.45 }}>Restore</button>
        </div>
        {media.length === 0 ? (
          <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)' }}>No media uploaded yet — drag files into the Admin studio to populate the library.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {media.map((m) => {
              const badge = STATUS_BADGE[m.contentStatus] ?? STATUS_BADGE.DRAFT;
              return (
                <label key={m.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', opacity: m.deletedAt ? 0.55 : 1 }}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  {m.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbUrl} alt="" width={38} height={38} style={{ borderRadius: 5, objectFit: 'cover' }} />
                  ) : (
                    <span style={{ width: 38, height: 38, borderRadius: 5, background: m.colour?.hex ?? '#E8DFD2', display: 'inline-block' }} />
                  )}
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.originalName}</span>
                    <span style={{ fontSize: 11, color: 'rgba(28,25,23,.5)' }}>
                      {m.fabric.name}{m.colour ? ` · ${m.colour.name}` : ''}{m.aiColourName ? ` · AI: ${m.aiColourName}` : ''} · v{m.version}
                      {m.deletedAt ? ' · deleted' : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: badge.fg, background: badge.bg, borderRadius: 999, padding: '4px 10px' }}>{m.contentStatus}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Activity feed */}
        <h2 style={sectionH}>Activity</h2>
        <div style={{ ...card, padding: '12px 18px' }}>
          {props.activity.length === 0 && <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.5)' }}>No recorded activity yet.</div>}
          {props.activity.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid rgba(28,25,23,.05)' }}>
              <span style={{ color: 'rgba(28,25,23,.4)', minWidth: 140 }}>{new Date(a.createdAt).toLocaleString()}</span>
              <span style={{ color: INK }}><b style={{ fontWeight: 500 }}>{a.actorName}</b> · {a.action}{a.entity ? ` (${a.entity})` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
