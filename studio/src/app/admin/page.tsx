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

  const { adminService, notificationService } = getContainer();
  const [a, notifications, unread] = await Promise.all([
    adminService.analytics(),
    notificationService.list(session.user.id, { take: 8 }),
    notificationService.unreadCount(session.user.id),
  ]);
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
    { href: '/admin/analytics', title: 'Analytics', desc: 'Interest, conversion, customers, storage' },
    { href: '/admin/diagnostics', title: 'Diagnostics', desc: 'Health, environment, backups, performance' },
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

        {/* Notifications (M19) — staff read theirs here, customers in the portal. */}
        {notifications.length > 0 && (
          <div style={{ ...card, marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 17, color: INK }}>Notifications</h2>
              {unread > 0 && <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: GOLD, background: 'rgba(138,109,69,.1)', borderRadius: 999, padding: '3px 10px' }}>{unread} unread</span>}
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.map((n) => (
                <li key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid rgba(28,25,23,.06)' }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: n.readAt ? 'rgba(28,25,23,.2)' : GOLD, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: INK }}>{n.title}</span>
                  {n.body && <span style={{ fontSize: 11.5, color: 'rgba(28,25,23,.5)' }}>{n.body}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(28,25,23,.45)', whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div style={{ marginTop: 26, fontSize: 12.5 }}>
          <Link href="/" style={{ color: GOLD }}>← Back to the studio</Link>
          {a.failedUploads > 0 && <span style={{ marginLeft: 18, color: '#A33' }}>{a.failedUploads} failed upload{a.failedUploads === 1 ? '' : 's'} awaiting retry in Catalogue Ops</span>}
        </div>
      </div>
    </div>
  );
}
