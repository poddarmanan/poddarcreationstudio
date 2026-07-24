import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

/**
 * Business analytics (Phase 3 M18). A server component — every number is already computed by
 * `AnalyticsService`, so there is nothing to hydrate.
 *
 * Chart design, deliberately restrained:
 *  • Every panel is a **single series**, so there is no legend to read and no categorical
 *    palette to get wrong — one hue (the brand gold) carries magnitude by bar length.
 *  • Bars are thin with rounded data-ends, separated by surface gaps rather than borders, on a
 *    hairline recessive baseline. No dual axes anywhere: two measures never share a plot.
 *  • Every row is directly labelled with its value, so the panels read as tables that happen to
 *    have bars — legible in greyscale, in print, and to a screen reader.
 *  • Rates are stat tiles, not charts. A single number is not a bar chart.
 */

const INK = '#1C1917';
const GOLD = '#8A6D45';
const GREEN = '#3D6B45';
const SURFACE = '#fff';
const HAIRLINE = 'rgba(28,25,23,.1)';

const card: CSSProperties = { background: SURFACE, border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 20 };
const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };
const eyebrow: CSSProperties = { fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' };

export interface RankedRow { id: string; label: string; sublabel?: string | null; value: number; hex?: string | null }
export interface TrendPoint { date: string; value: number }

export interface AnalyticsData {
  days: number;
  topViewed: RankedRow[];
  topDownloaded: RankedRow[];
  searchedColours: RankedRow[];
  topSearches: RankedRow[];
  searchTrend: TrendPoint[];
  quotes: { counts: Record<string, number>; total: number; wonValue: number; openValue: number; winRate: number | null; reachRate: number | null };
  samples: { counts: Record<string, number>; total: number; fulfilmentRate: number | null; approvalRate: number | null };
  customers: { total: number; approved: number; pending: number; newInPeriod: number; activeInPeriod: number; returning: number; returningRate: number | null; mostActive: RankedRow[] };
  popularCollections: RankedRow[];
  storage: { driver: string; objects: number; originalBytes: number; estimatedTotalBytes: number; videos: number; reclaimable: { objects: number; bytes: number }; byStatus: Record<string, { count: number; bytes: number }> };
  totals: { views: number; uniqueVisitors: number; searches: number; downloads: number; activeShares: number; shareViews: number; collections: number };
}

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const money = (minor: number) => `INR ${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 17, color: INK }}>{title}</h2>
        {note && <span style={meta}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * A ranked list of bars. One series, one hue; length carries magnitude and the value is
 * printed on every row, so the panel is readable without colour at all.
 */
function BarList({ rows, unit, swatches = false }: { rows: RankedRow[]; unit?: string; swatches?: boolean }) {
  if (rows.length === 0) return <div style={{ ...meta, padding: '4px 0' }}>Nothing recorded yet.</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {rows.map((row) => (
        <li key={row.id}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            {swatches && (
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: row.hex ?? '#E8DFD2', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.12)', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, color: INK }}>{row.label}</span>
            {row.sublabel && <span style={meta}>{row.sublabel}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: INK, whiteSpace: 'nowrap' }}>
              {row.value.toLocaleString('en-IN')}{unit ? ` ${unit}` : ''}
            </span>
          </div>
          {/* Baseline is a hairline; the bar is a thin fill with a rounded data-end. */}
          <div style={{ height: 6, background: 'rgba(28,25,23,.05)', borderRadius: 3 }}>
            <div style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Daily volume. One series, so no legend; only the peak and the last day are labelled. */
function Trend({ points, label }: { points: TrendPoint[]; label: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);
  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display),serif', fontSize: 26, fontWeight: 600, color: INK }}>{total.toLocaleString('en-IN')}</span>
        <span style={meta}>{label}</span>
        {peak && peak.value > 0 && <span style={{ ...meta, marginLeft: 'auto' }}>peak {peak.value} on {peak.date.slice(5)}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 1 }}>
        {points.map((point) => (
          <div
            key={point.date}
            title={`${point.date}: ${point.value}`}
            style={{
              flex: 1,
              // A zero day still shows a sliver, so a gap reads as "no activity", not "no data".
              height: `${Math.max(2, (point.value / max) * 100)}%`,
              background: point.value === 0 ? 'rgba(28,25,23,.08)' : GOLD,
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...meta, marginTop: 6 }}>
        <span>{points[0]?.date.slice(5)}</span>
        <span>{points[points.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

/** A single number is a stat tile, not a one-bar chart. */
function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' }) {
  return (
    <div style={{ ...card, padding: '18px 16px' }}>
      <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 26, fontWeight: 600, color: tone === 'good' ? GREEN : INK }}>{value}</div>
      <div style={eyebrow}>{label}</div>
      {note && <div style={{ ...meta, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const q = data.quotes;
  const s = data.samples;
  const c = data.customers;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>ANALYTICS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link href="/admin" style={{ textDecoration: 'none', color: INK, border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontSize: 11.5, letterSpacing: '.06em' }}>← Staff hub</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>THE BUSINESS</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4vw,46px)', color: INK }}>Analytics</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />
        <div style={{ ...meta, marginTop: 12 }}>Last {data.days} days</div>

        {/* Headline tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 26 }}>
          <Tile label="Fabric views" value={data.totals.views.toLocaleString('en-IN')} note={`${data.totals.uniqueVisitors} visitors`} />
          <Tile label="Searches" value={data.totals.searches.toLocaleString('en-IN')} />
          <Tile label="Downloads" value={data.totals.downloads.toLocaleString('en-IN')} />
          <Tile label="Catalogue opens" value={data.totals.shareViews.toLocaleString('en-IN')} note={`${data.totals.activeShares} live links`} />
          <Tile label="Quote win rate" value={pct(q.winRate)} note={`${q.counts.ACCEPTED ?? 0} of ${q.total} quotations`} tone="good" />
          <Tile label="Won value" value={money(q.wonValue)} note={`${money(q.openValue)} still open`} tone="good" />
        </div>

        {/* Conversion + people */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 16 }}>
          <Panel title="Quote conversion" note={`${q.total} quotations`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 24, fontWeight: 600, color: INK }}>{pct(q.winRate)}</div>
                <div style={eyebrow}>Win rate</div>
                <div style={meta}>of those decided</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 24, fontWeight: 600, color: INK }}>{pct(q.reachRate)}</div>
                <div style={eyebrow}>Reached pricing</div>
                <div style={meta}>of all submitted</div>
              </div>
            </div>
            <BarList rows={Object.entries(q.counts).map(([status, count]) => ({ id: status, label: status.toLowerCase().replace(/_/g, ' '), value: count }))} />
          </Panel>

          <Panel title="Sample conversion" note={`${s.total} requests`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 24, fontWeight: 600, color: INK }}>{pct(s.fulfilmentRate)}</div>
                <div style={eyebrow}>Delivered</div>
                <div style={meta}>of those settled</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 24, fontWeight: 600, color: INK }}>{pct(s.approvalRate)}</div>
                <div style={eyebrow}>Approved</div>
                <div style={meta}>of all requests</div>
              </div>
            </div>
            <BarList rows={Object.entries(s.counts).map(([status, count]) => ({ id: status, label: status.toLowerCase(), value: count }))} />
          </Panel>
        </div>

        {/* Catalogue interest */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 16 }}>
          <Panel title="Top viewed fabrics" note={`last ${data.days} days`}>
            <BarList rows={data.topViewed} unit="views" swatches />
          </Panel>
          <Panel title="Top downloaded fabrics" note={`last ${data.days} days`}>
            <BarList rows={data.topDownloaded} unit="downloads" swatches />
          </Panel>
          <Panel title="Most searched shades">
            <BarList rows={data.searchedColours} unit="searches" swatches />
          </Panel>
          <Panel title="Top searches" note="a popular query with no results is a gap in the catalogue">
            <BarList rows={data.topSearches} unit="times" />
          </Panel>
        </div>

        {/* Trend */}
        <div style={{ marginTop: 16 }}>
          <Panel title="Search volume" note={`daily, last ${data.days} days`}>
            <Trend points={data.searchTrend} label="searches in the period" />
          </Panel>
        </div>

        {/* People + collections + storage */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 16 }}>
          <Panel title="Customers">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(88px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { k: 'Total', v: c.total },
                { k: 'Approved', v: c.approved },
                { k: 'Pending', v: c.pending },
                { k: 'New', v: c.newInPeriod },
                { k: 'Active', v: c.activeInPeriod },
                { k: 'Returning', v: c.returning },
              ].map((t) => (
                <div key={t.k}>
                  <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 20, fontWeight: 600, color: INK }}>{t.v}</div>
                  <div style={eyebrow}>{t.k}</div>
                </div>
              ))}
            </div>
            <div style={{ ...meta, marginBottom: 10 }}>Returning = active on more than one day ({pct(c.returningRate)} of all customers)</div>
            <div style={{ ...eyebrow, marginBottom: 8 }}>Most active</div>
            <BarList rows={c.mostActive} unit="actions" />
          </Panel>

          <Panel title="Popular collections" note="opens of shared catalogues">
            <BarList rows={data.popularCollections} unit="opens" />
          </Panel>

          <Panel title="Storage" note={data.storage.driver}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 22, fontWeight: 600, color: INK }}>{bytes(data.storage.estimatedTotalBytes)}</div>
                <div style={eyebrow}>Estimated total</div>
                <div style={meta}>{bytes(data.storage.originalBytes)} originals</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 22, fontWeight: 600, color: INK }}>{data.storage.objects}</div>
                <div style={eyebrow}>Media items</div>
                <div style={meta}>{data.storage.videos} video</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 22, fontWeight: 600, color: INK }}>{bytes(data.storage.reclaimable.bytes)}</div>
                <div style={eyebrow}>Reclaimable</div>
                <div style={meta}>{data.storage.reclaimable.objects} deleted</div>
              </div>
            </div>
            <div style={{ ...meta, marginTop: 14 }}>
              Estimated total adds ~35% for WebP, AVIF and thumbnail derivatives. Catalogue Ops can purge the reclaimable items.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
