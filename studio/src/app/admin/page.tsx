import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { isStaff } from '@/server/core/rbac';
import { getContainer } from '@/server/container';

/** Staff hub: analytics overview + doors to the quote desk, sample desk, and catalogue ops. */
export default async function AdminHubPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin');
  if (!isStaff(session.user.role)) redirect('/');

  const a = await getContainer().adminService.analytics();
  const INK = '#1C1917';
  const GOLD = '#8A6D45';
  const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 22 };
  const tiles = [
    { k: 'Fabrics', v: a.fabrics },
    { k: 'Shades', v: a.colours },
    { k: 'Media', v: a.media.total },
    { k: 'Users', v: a.users },
    { k: 'Searches', v: a.searches },
    { k: 'Downloads', v: a.downloads },
    { k: 'Quotes (new)', v: a.quotes.NEW ?? 0 },
    { k: 'Samples (req.)', v: a.samples.REQUESTED ?? 0 },
  ];
  const doors = [
    { href: '/admin/sales', title: 'Sales Workspace', desc: 'Pipeline, customers, notes and follow-ups' },
    { href: '/admin/quotes', title: 'Quotations', desc: 'Triage, assign and track inquiries' },
    { href: '/admin/samples', title: 'Samples', desc: 'Approve and dispatch swatch requests' },
    { href: '/admin/catalogue', title: 'Catalogue Ops', desc: 'Bulk media ops, CSV, activity, queue' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(28px,5vw,56px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>PODDAR WORKSPACE</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(32px,4.5vw,52px)', color: INK }}>Staff hub</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 30 }}>
          {tiles.map((t) => (
            <div key={t.k} style={{ ...card, textAlign: 'center', padding: '18px 12px' }}>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 28, fontWeight: 600, color: INK }}>{t.v}</div>
              <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'rgba(28,25,23,.45)', textTransform: 'uppercase' }}>{t.k}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 26 }}>
          {doors.map((d) => (
            <Link key={d.href} href={d.href} style={{ ...card, textDecoration: 'none', display: 'block' }}>
              <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 22, fontWeight: 600, color: INK }}>{d.title} →</div>
              <div style={{ fontSize: 13, fontWeight: 300, color: 'rgba(28,25,23,.55)', marginTop: 6 }}>{d.desc}</div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 26, fontSize: 12.5 }}>
          <Link href="/" style={{ color: GOLD }}>← Back to the studio</Link>
          {a.failedUploads > 0 && <span style={{ marginLeft: 18, color: '#A33' }}>{a.failedUploads} failed upload{a.failedUploads === 1 ? '' : 's'} awaiting retry in Catalogue Ops</span>}
        </div>
      </div>
    </div>
  );
}
