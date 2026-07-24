import 'dotenv/config';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { validateEnvironment } from '../src/server/health/env';
import type { Check } from '../src/server/health/health.service';

/**
 * Pre-deployment preflight (Phase 3 M20).
 *
 *   npx tsx scripts/preflight.ts [baseUrl]
 *
 * Runs every in-process check, and — when a base URL is given or the server is reachable —
 * the checks that can only be made over HTTP: security headers, probe endpoints, and the
 * public/private boundary. Exits non-zero if anything fails, so CI can gate on it.
 */

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';

const ICON: Record<string, string> = { pass: '✓', warn: '!', fail: '✗' };
let failures = 0;
let warnings = 0;

function report(check: Check) {
  if (check.status === 'fail') failures += 1;
  if (check.status === 'warn') warnings += 1;
  const ms = check.ms !== undefined ? ` (${check.ms}ms)` : '';
  console.log(`  ${ICON[check.status]} ${check.name.padEnd(14)} ${check.detail}${ms}`);
}

/** Headers the proxy must set. Verified over the wire, because that is where they either are or aren't. */
const REQUIRED_HEADERS: { header: string; expect: (value: string | null) => boolean; describe: string }[] = [
  { header: 'content-security-policy', expect: (v) => !!v && v.includes("default-src 'self'") && v.includes("frame-ancestors 'none'"), describe: "CSP with default-src 'self' and frame-ancestors 'none'" },
  { header: 'x-content-type-options', expect: (v) => v === 'nosniff', describe: 'nosniff' },
  { header: 'x-frame-options', expect: (v) => v === 'DENY' || v === 'SAMEORIGIN', describe: 'DENY or SAMEORIGIN' },
];

async function httpChecks(): Promise<void> {
  console.log(`\nHTTP (${BASE})`);

  let home: Response;
  try {
    home = await fetch(BASE, { redirect: 'manual' });
  } catch {
    report({ name: 'http', status: 'warn', detail: `No server reachable at ${BASE} — HTTP checks skipped` });
    return;
  }

  report({ name: 'home', status: home.status === 200 ? 'pass' : 'fail', detail: `GET / → ${home.status}` });

  for (const rule of REQUIRED_HEADERS) {
    const value = home.headers.get(rule.header);
    report({
      name: rule.header.replace(/^x-/, '').slice(0, 14),
      status: rule.expect(value) ? 'pass' : 'fail',
      detail: rule.expect(value) ? rule.describe : `expected ${rule.describe}, got ${value ?? 'nothing'}`,
    });
  }

  const live = await fetch(`${BASE}/api/health`);
  report({ name: 'liveness', status: live.ok ? 'pass' : 'fail', detail: `GET /api/health → ${live.status}` });

  const ready = await fetch(`${BASE}/api/health/ready`);
  const readyBody = (await ready.json().catch(() => ({}))) as { status?: string; failing?: string[] };
  report({
    name: 'readiness',
    status: readyBody.status === 'healthy' ? 'pass' : readyBody.status === 'degraded' ? 'warn' : 'fail',
    detail: `GET /api/health/ready → ${ready.status} (${readyBody.status ?? 'unknown'})${readyBody.failing?.length ? ` failing: ${readyBody.failing.join(', ')}` : ''}`,
  });

  // The readiness summary is public; its detail must not be.
  const leaks = JSON.stringify(readyBody).match(/AUTH_SECRET|DATABASE_URL|password/i);
  report({
    name: 'probe-privacy',
    status: leaks ? 'fail' : 'pass',
    detail: leaks ? 'The public readiness body leaks configuration detail' : 'The public readiness body carries names only, no detail',
  });

  // Staff surfaces must refuse an anonymous caller.
  for (const path of ['/api/admin/analytics', '/api/admin/sales/pipeline', '/api/portal/collections']) {
    const res = await fetch(`${BASE}${path}`);
    report({ name: 'guard', status: res.status === 401 ? 'pass' : 'fail', detail: `${path} → ${res.status} for an anonymous caller (expected 401)` });
  }

  // ...and the public catalogue must stay public.
  const fabrics = await fetch(`${BASE}/api/fabrics`);
  report({ name: 'public-api', status: fabrics.ok ? 'pass' : 'fail', detail: `/api/fabrics → ${fabrics.status} (the showroom must stay open)` });
}

async function main() {
  console.log('Poddar Creation Studio — preflight\n');

  const env = validateEnvironment();
  console.log(`Environment (${env.environment})`);
  for (const finding of env.findings) {
    report({ name: finding.key.slice(0, 14), status: finding.severity === 'ok' ? 'pass' : finding.severity, detail: finding.message });
  }

  console.log('\nDependencies');
  const report_ = await getContainer().healthService.readiness({ deep: true });
  // The environment block was already printed above; don't double-count it.
  for (const check of report_.checks.filter((c) => c.name !== 'environment')) report(check);

  await httpChecks();

  console.log('\nBackup');
  console.log('  · run `npx tsx scripts/verify-backup.ts` to prove a dump restores (not run here — it creates a scratch database)');

  console.log(`\n${failures === 0 ? 'PREFLIGHT PASSED' : 'PREFLIGHT FAILED'} — ${failures} failure(s), ${warnings} warning(s)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('PREFLIGHT ERRORED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
