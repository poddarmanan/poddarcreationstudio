import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { auth } from '@/auth';
import { isAdmin } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import type { CheckStatus } from '@/server/health/health.service';
import { ThreeReadiness } from '@/components/three/ThreeReadiness';

/**
 * Production diagnostics (Phase 3 M20). Admin-only, because the detail names configuration
 * problems — exactly the reconnaissance an attacker would want.
 *
 * Server-rendered with no client JavaScript: a diagnostics page has to work when the things
 * around it don't.
 */
export default async function DiagnosticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?next=/admin/diagnostics');
  if (!isAdmin(session.user.role)) redirect('/');

  const report = await getContainer().healthService.readiness({ deep: true });

  const INK = '#1C1917';
  const GOLD = '#8A6D45';
  const TONE: Record<CheckStatus, { fg: string; bg: string; label: string }> = {
    pass: { fg: '#3D6B45', bg: 'rgba(61,107,69,.1)', label: 'PASS' },
    warn: { fg: GOLD, bg: 'rgba(138,109,69,.12)', label: 'WARN' },
    fail: { fg: '#A33', bg: 'rgba(170,51,51,.1)', label: 'FAIL' },
  };
  const card: CSSProperties = { background: '#fff', border: '1px solid rgba(28,25,23,.08)', borderRadius: 8, padding: 20 };
  const meta: CSSProperties = { fontSize: 11.5, color: 'rgba(28,25,23,.5)' };

  const overall = report.status === 'healthy' ? TONE.pass : report.status === 'degraded' ? TONE.warn : TONE.fail;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(16px,4vw,44px)', height: 64, background: 'rgba(250,248,245,.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(28,25,23,.08)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display),serif', fontSize: 19, fontWeight: 600, letterSpacing: '.14em', color: INK }}>PODDAR</div>
          <div style={{ fontSize: 8.5, letterSpacing: '.42em', color: GOLD }}>DIAGNOSTICS</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link href="/admin" style={{ textDecoration: 'none', color: INK, border: '1px solid rgba(28,25,23,.2)', borderRadius: 999, padding: '6px 13px', fontSize: 11.5, letterSpacing: '.06em' }}>← Staff hub</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,44px) 80px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.5em', color: GOLD, marginBottom: 8 }}>OPERATIONS</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display),serif', fontWeight: 500, fontSize: 'clamp(30px,4vw,46px)', color: INK }}>Diagnostics</h1>
        <span style={{ display: 'block', width: 72, height: 7, marginTop: 12, backgroundImage: 'repeating-linear-gradient(90deg,#8A6D45 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.65) 0 9px,transparent 9px 16px)', backgroundSize: '16px 2px,16px 2px', backgroundPosition: '0 0,8px 4px', backgroundRepeat: 'repeat-x' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: overall.fg, background: overall.bg, borderRadius: 999, padding: '6px 16px' }}>{report.status}</span>
          <span style={meta}>version {report.version} · up {Math.floor(report.uptimeSeconds / 60)}m · {report.environment.environment}</span>
          <span style={meta}>checked {new Date(report.checkedAt).toLocaleTimeString()}</span>
        </div>

        {/* Checks */}
        <section style={{ marginTop: 28, display: 'grid', gap: 10 }}>
          {report.checks.map((check) => {
            const tone = TONE[check.status];
            return (
              <div key={check.name} style={{ ...card, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, letterSpacing: '.14em', color: tone.fg, background: tone.bg, borderRadius: 999, padding: '4px 10px', minWidth: 52, textAlign: 'center' }}>{tone.label}</span>
                <span style={{ fontFamily: 'var(--font-display),serif', fontSize: 16, fontWeight: 600, color: INK, minWidth: 110 }}>{check.name}</span>
                <span style={{ fontSize: 13, color: 'rgba(28,25,23,.7)', flex: '1 1 260px' }}>{check.detail}</span>
                {check.ms !== undefined && <span style={meta}>{check.ms}ms</span>}
              </div>
            );
          })}
        </section>

        {/* Environment findings */}
        <section style={{ marginTop: 28 }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Environment</h2>
          <div style={{ ...card, display: 'grid', gap: 6 }}>
            {report.environment.findings.map((finding) => {
              const tone = TONE[finding.severity === 'ok' ? 'pass' : finding.severity === 'warn' ? 'warn' : 'fail'];
              return (
                <div key={finding.key + finding.message} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9.5, letterSpacing: '.12em', color: tone.fg, minWidth: 40 }}>{tone.label}</span>
                  <code style={{ fontSize: 12, color: INK, minWidth: 160 }}>{finding.key}</code>
                  <span style={{ fontSize: 12.5, color: 'rgba(28,25,23,.65)' }}>{finding.message}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* The only client-rendered section on the page. A GPU's capability is knowable
            nowhere else, and support needs a customer to be able to read it back. */}
        <section style={{ marginTop: 28 }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>3D readiness</h2>
          <div style={card}>
            <ThreeReadiness />
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display),serif', fontWeight: 600, fontSize: 20, color: INK }}>Operational commands</h2>
          <div style={{ ...card, fontSize: 12.5, lineHeight: 2, color: 'rgba(28,25,23,.7)' }}>
            <div><code>npx tsx scripts/preflight.ts</code> — every check from the command line, non-zero exit on failure</div>
            <div><code>npx tsx scripts/verify-backup.ts</code> — dump, restore into a scratch database, compare row counts</div>
            <div><code>curl -fsS $APP_URL/api/health</code> — liveness probe</div>
            <div><code>curl -fsS $APP_URL/api/health/ready</code> — readiness probe (503 when unhealthy)</div>
            <div><code>POST /api/admin/maintenance {'{'}&quot;task&quot;:&quot;expireQuotes&quot;{'}'}</code> — expire quotations past their validity</div>
          </div>
        </section>
      </div>
    </div>
  );
}
