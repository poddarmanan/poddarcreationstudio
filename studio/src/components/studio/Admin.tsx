'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Studio } from './state';
import { Selvage } from './brand';
import { FONT_DISPLAY, FONT_BODY, fabricTex, heroColour, colourCss } from './helpers';

interface MediaRow {
  id: string;
  originalName: string;
  originalSizeBytes: number;
  stage: string;
  aiColourName: string | null;
  aiConfidence: number | null;
  aiSource: string | null;
  thumbUrl: string | null;
  qrDataUrl: string | null;
  width: number | null;
  height: number | null;
  fabric: { id: string; name: string };
  colour: { name: string; l: number; c: number; h: number } | null;
  createdAt: string;
}

interface QueueItem {
  name: string;
  progress: number; // 0..1 across pipeline stages
  stageLabel: string;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  COMPRESSING: 'Compress · WebP/AVIF',
  NAMING: 'AI colour naming',
  THUMBNAIL: 'Thumbnails',
  QR: 'QR generation',
  PUBLISHED: 'Published',
};

function fmtBytes(n: number) {
  if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / 1024).toFixed(0) + ' KB';
}

export function Admin({ studio }: { studio: Studio }) {
  const { t, fabrics, canManage } = studio;
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [stats, setStats] = useState<{ colours: number; media: number; quotes: number; fabrics: number } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [targetFabric, setTargetFabric] = useState(fabrics[4]?.id ?? fabrics[0].id);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    fetch('/api/uploads')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { media: MediaRow[]; stats: { colours: number; media: number; quotes: number; fabrics: number } } | null) => {
        if (!data) return;
        setMedia(data.media);
        setStats(data.stats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        setQueue((prev) => [...prev, { name: file.name, progress: 0.1, stageLabel: 'Uploading…' }]);
        const form = new FormData();
        form.append('file', file);
        form.append('fabricId', targetFabric);
        try {
          // The pipeline runs server-side within this request; animate the visible stages while it works.
          const stageTimer = setInterval(() => {
            setQueue((prev) =>
              prev.map((qi) =>
                qi.name === file.name && qi.progress < 0.85
                  ? {
                      ...qi,
                      progress: qi.progress + 0.12,
                      stageLabel: qi.progress < 0.3 ? 'Compress · WebP/AVIF' : qi.progress < 0.55 ? 'AI colour naming' : qi.progress < 0.72 ? 'Thumbnails · QR' : 'Publishing…',
                    }
                  : qi
              )
            );
          }, 450);
          const res = await fetch('/api/uploads', { method: 'POST', body: form });
          clearInterval(stageTimer);
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            setQueue((prev) => prev.map((qi) => (qi.name === file.name ? { ...qi, progress: 1, stageLabel: 'Failed', error: err?.error ?? 'Upload failed' } : qi)));
          } else {
            setQueue((prev) => prev.map((qi) => (qi.name === file.name ? { ...qi, progress: 1, stageLabel: 'Published' } : qi)));
            refresh();
          }
        } catch {
          setQueue((prev) => prev.map((qi) => (qi.name === file.name ? { ...qi, progress: 1, stageLabel: 'Failed', error: 'Network error' } : qi)));
        }
      }
      setTimeout(() => setQueue((prev) => prev.filter((qi) => qi.error)), 4000);
    },
    [targetFabric, refresh]
  );

  if (!canManage) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 500 }}>Catalogue Studio</div>
        <Selvage style={{ margin: '14px auto 0' }} />
        <p style={{ fontWeight: 300, color: 'rgba(28,25,23,.6)', maxWidth: 420, margin: '18px auto 0', lineHeight: 1.7 }}>
          The admin workspace needs an Admin or Manager account.
          <br />
          Demo: <b style={{ fontWeight: 500 }}>admin@poddarcreation.studio</b> · <b style={{ fontWeight: 500 }}>poddar123</b>
        </p>
        <button
          onClick={studio.openSignIn}
          className="pc-hv-gold-fill"
          style={{
            cursor: 'pointer', marginTop: 24, background: '#1C1917', color: '#FAF8F5', border: '1px solid #1C1917',
            borderRadius: 999, padding: '12px 30px', fontFamily: FONT_BODY, fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase',
          }}
        >
          {t.signin}
        </button>
      </div>
    );
  }

  const statCards = [
    { k: 'SKUs', v: stats ? String(stats.colours) : '—' },
    { k: 'Media', v: stats ? String(stats.media) : '—' },
    { k: 'Qualities', v: stats ? String(stats.fabrics) : '—' },
    { k: 'Quotes', v: stats ? String(stats.quotes) : '—' },
  ];

  const published = media.filter((m) => m.stage === 'PUBLISHED').length;
  const pipeStages = [
    { label: 'Compress · WebP/AVIF', n: `${published}/${media.length || 0}`, w: media.length ? `${Math.round((published / media.length) * 100)}%` : '0%', c: '#8A6D45' },
    { label: 'AI colour naming', n: `${media.filter((m) => m.aiColourName).length}/${media.length || 0}`, w: media.length ? `${Math.round((media.filter((m) => m.aiColourName).length / media.length) * 100)}%` : '0%', c: '#8A6D45' },
    { label: 'Thumbnails', n: `${media.filter((m) => m.thumbUrl).length}/${media.length || 0}`, w: media.length ? `${Math.round((media.filter((m) => m.thumbUrl).length / media.length) * 100)}%` : '0%', c: '#3D6B45' },
    { label: 'QR generation', n: `${media.filter((m) => m.qrDataUrl).length}/${media.length || 0}`, w: media.length ? `${Math.round((media.filter((m) => m.qrDataUrl).length / media.length) * 100)}%` : '0%', c: '#3D6B45' },
    { label: 'Published', n: `${published}/${media.length || 0}`, w: media.length ? `${Math.round((published / media.length) * 100)}%` : '0%', c: '#8A6D45' },
  ];

  const adminNav = [
    { label: 'Inbox', n: stats ? String(stats.quotes) : '' },
    { label: 'Library', n: stats ? String(stats.colours) : '' },
    { label: 'Uploads', n: String(media.length), active: true },
    { label: 'Colours', n: stats ? String(stats.colours) : '' },
    { label: 'Analytics', n: '' },
    { label: 'Team', n: '3' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 'calc(100vh - 64px)', background: '#F5F2ED', animation: 'layCloth .55s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ flex: '1 1 216px', maxWidth: 280, minWidth: 200, borderRight: '1px solid rgba(28,25,23,.08)', padding: '20px 12px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.34em', color: '#8A6D45', padding: '0 10px' }}>STUDIO</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, padding: '4px 10px 14px' }}>Poddar Workspace</div>
        {adminNav.map((a) => (
          <div
            key={a.label}
            className="pc-hv-panel"
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7,
              background: a.active ? 'rgba(28,25,23,.07)' : 'transparent',
              color: a.active ? '#1C1917' : 'rgba(28,25,23,.6)', fontSize: 13, cursor: 'pointer',
            }}
          >
            {a.label}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8A6D45' }}>{a.n}</span>
          </div>
        ))}
        <div style={{ marginTop: 22, padding: '0 10px', fontSize: 10, letterSpacing: '.24em', color: 'rgba(28,25,23,.4)' }}>ROLES</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '8px 10px 0' }}>
          {['Admin', 'Manager', 'Sales', 'Viewer'].map((r) => (
            <span key={r} style={{ fontSize: 10.5, border: '1px solid rgba(28,25,23,.14)', borderRadius: 999, padding: '3px 9px', color: 'rgba(28,25,23,.6)' }}>
              {r}
            </span>
          ))}
        </div>
      </div>
      <div style={{ flex: '999 1 340px', padding: 'clamp(20px,3vw,36px)', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 'clamp(26px,3vw,38px)' }}>{t.adminTitle}</h1>
            <Selvage style={{ width: 56, marginTop: 8 }} />
          </div>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            {statCards.map((sc) => (
              <span key={sc.k} style={{ background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                <span style={{ display: 'block', fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 600 }}>{sc.v}</span>
                <span style={{ fontSize: 9.5, letterSpacing: '.14em', color: 'rgba(28,25,23,.5)', textTransform: 'uppercase' }}>{sc.k}</span>
              </span>
            ))}
          </span>
        </div>
        <div style={{ marginTop: 20, background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 22 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, letterSpacing: '.14em', color: 'rgba(28,25,23,.5)', textTransform: 'uppercase' }}>Upload to</span>
            <select
              value={targetFabric}
              onChange={(e) => setTargetFabric(e.target.value)}
              style={{ fontFamily: FONT_BODY, fontSize: 13, padding: '6px 10px', border: '1px solid rgba(28,25,23,.15)', borderRadius: 8, background: '#FAF8F5', color: '#1C1917' }}
            >
              {fabrics.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            style={{
              border: `1.5px dashed ${dragOver ? '#8A6D45' : 'rgba(28,25,23,.22)'}`,
              borderRadius: 8, padding: '26px 20px', textAlign: 'center',
              color: dragOver ? '#8A6D45' : 'rgba(28,25,23,.5)', fontWeight: 300, cursor: 'pointer', transition: 'border-color .2s,color .2s',
            }}
          >
            {t.dropHint} — or click to browse
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {queue.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map((qi, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.08em', color: qi.error ? '#A33' : 'rgba(28,25,23,.6)' }}>
                    <span>{qi.name}</span>
                    <span>{qi.error ?? qi.stageLabel}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(28,25,23,.08)', borderRadius: 2, marginTop: 4 }}>
                    <div style={{ height: 4, width: `${Math.round(qi.progress * 100)}%`, background: qi.error ? '#A33' : '#8A6D45', borderRadius: 2, transition: 'width .45s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 18 }}>
            {pipeStages.map((p) => (
              <div key={p.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.08em', color: 'rgba(28,25,23,.6)' }}>
                  <span>{p.label}</span>
                  <span>{p.n}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(28,25,23,.08)', borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: 4, width: p.w, background: p.c, borderRadius: 2, transition: 'width .6s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 6 }}>{t.recent} · AI</div>
          {media.length === 0 && (
            <div style={{ padding: '18px 0', fontWeight: 300, fontSize: 13, color: 'rgba(28,25,23,.5)' }}>
              Nothing here yet — drop fabric photos above and the pipeline (compress → name → thumbnail → QR → publish) runs for real.
            </div>
          )}
          {media.map((u) => {
            const fRow = fabrics.find((x) => x.id === u.fabric.id);
            const fallbackTex = fRow ? fabricTex(fRow, heroColour(fRow), 2) : '#EEE';
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                {u.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.thumbUrl} alt="" style={{ width: 34, height: 34, borderRadius: 5, objectFit: 'cover', flex: 'none' }} />
                ) : (
                  <span style={{ width: 34, height: 34, borderRadius: 5, background: fallbackTex, flex: 'none' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.originalName}</div>
                  <div style={{ fontSize: 11, color: 'rgba(28,25,23,.45)' }}>
                    {fmtBytes(u.originalSizeBytes)}
                    {u.width ? ` · ${u.width}×${u.height}` : ''} · {u.fabric.name}
                  </div>
                </div>
                {u.aiColourName && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(28,25,23,.7)' }}>
                    {u.colour && <span style={{ width: 13, height: 13, borderRadius: '50%', background: colourCss({ ...u.colour, id: '', order: 0 }) }} />}
                    {u.aiColourName}
                    <span style={{ color: '#8A6D45', fontSize: 10 }}>{u.aiConfidence}%</span>
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10.5, letterSpacing: '.1em',
                    color: u.stage === 'PUBLISHED' ? '#3D6B45' : '#8A6D45',
                    background: u.stage === 'PUBLISHED' ? 'rgba(61,107,69,.1)' : 'rgba(138,109,69,.12)',
                    borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
                  }}
                >
                  {STAGE_LABELS[u.stage] ?? u.stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
