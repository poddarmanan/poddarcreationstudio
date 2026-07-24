import 'dotenv/config';
import assert from 'node:assert';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { validateEnvironment } from '../src/server/health/env';

/** M20 — deployment readiness: env validation, health checks, diagnostics, maintenance. */
async function main() {
  const { healthService: svc } = getContainer();

  // ---- Environment validation ------------------------------------------------
  const current = validateEnvironment();
  assert(current.findings.length > 0, 'the validator reports on the current environment');
  assert(typeof current.ok === 'boolean' && current.failures >= 0, 'the report is well formed');

  // A complete production configuration passes.
  const good = validateEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db.example.com:5432/poddar?sslmode=require',
    AUTH_SECRET: 'x'.repeat(48),
    APP_URL: 'https://poddarcreation.studio',
    STORAGE_DRIVER: 'r2',
    R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'media',
    RESEND_API_KEY: 're_live', EMAIL_FROM: 'Studio <studio@poddarcreation.studio>',
    SENTRY_DSN: 'https://x@o0.ingest.sentry.io/0', POSTHOG_KEY: 'phc_x',
  } as NodeJS.ProcessEnv);
  assert(good.ok && good.failures === 0 && good.warnings === 0, `a complete production config is clean (${JSON.stringify(good.findings.filter((f) => f.severity !== 'ok'))})`);
  console.log('environment: a complete production configuration passes ✓');

  // Each misconfiguration is caught, and caught for the right reason.
  const cases: { env: Record<string, string>; key: string; why: string }[] = [
    { env: {}, key: 'DATABASE_URL', why: 'a missing database url' },
    { env: { DATABASE_URL: 'mysql://x/y' }, key: 'DATABASE_URL', why: 'the wrong database dialect' },
    { env: { AUTH_SECRET: 'dev-insecure-secret' }, key: 'AUTH_SECRET', why: 'a development secret in production' },
    { env: { AUTH_SECRET: 'short' }, key: 'AUTH_SECRET', why: 'a secret that is too short' },
    { env: { APP_URL: 'http://poddarcreation.studio' }, key: 'APP_URL', why: 'a plaintext app url in production' },
    { env: { STORAGE_DRIVER: 'r2' }, key: 'R2_BUCKET', why: 'the R2 driver without a bucket' },
    { env: { RESEND_API_KEY: 're_live' }, key: 'EMAIL_FROM', why: 'Resend without a from address' },
    { env: { SEARCH_DRIVER: 'meili' }, key: 'MEILI_HOST', why: 'Meilisearch without a host' },
  ];
  for (const testCase of cases) {
    const report = validateEnvironment({ NODE_ENV: 'production', ...testCase.env } as NodeJS.ProcessEnv);
    const finding = report.findings.find((f) => f.key === testCase.key && f.severity === 'fail');
    assert(finding, `${testCase.why} is caught as a failure on ${testCase.key}`);
  }
  console.log(`environment: ${cases.length} misconfigurations each caught on the right key ✓`);

  // Severity depends on the environment: a weak secret is a warning in dev, a failure in prod.
  const devSecret = validateEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://x/y', AUTH_SECRET: 'dev-insecure-secret' } as NodeJS.ProcessEnv);
  assert(devSecret.findings.find((f) => f.key === 'AUTH_SECRET')?.severity === 'warn', 'a dev secret only warns in development');
  const prodSecret = validateEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x/y', AUTH_SECRET: 'dev-insecure-secret' } as NodeJS.ProcessEnv);
  assert(prodSecret.findings.find((f) => f.key === 'AUTH_SECRET')?.severity === 'fail', 'the same secret fails in production');
  console.log('environment: severity scales with the environment ✓');

  // ---- Liveness -----------------------------------------------------------------
  const live = svc.liveness();
  assert(live.status === 'ok' && typeof live.uptimeSeconds === 'number', 'liveness answers without touching a dependency');
  console.log('liveness ✓');

  // ---- Readiness ------------------------------------------------------------------
  const report = await svc.readiness({ deep: true });
  const names = report.checks.map((c) => c.name);
  for (const expected of ['database', 'migrations', 'storage', 'email', 'search', 'monitoring', 'security', 'performance', 'backup', 'environment']) {
    assert(names.includes(expected), `readiness runs the ${expected} check`);
  }
  assert(report.checks.every((c) => ['pass', 'warn', 'fail'].includes(c.status)), 'every check reports a known status');
  assert(report.checks.filter((c) => c.name !== 'environment').every((c) => typeof c.ms === 'number'), 'every dependency check is timed');
  assert(['healthy', 'degraded', 'unhealthy'].includes(report.status), 'an overall verdict is produced');
  console.log(`readiness: ${names.length} checks, overall ${report.status} ✓`);

  // The shallow variant skips the expensive ones.
  const shallow = await svc.readiness();
  assert(!shallow.checks.some((c) => c.name === 'performance' || c.name === 'backup'), 'the shallow probe skips the expensive checks');
  console.log('readiness: shallow probe skips the expensive checks ✓');

  // ---- The checks do real work, not configuration reads -----------------------------
  const storage = report.checks.find((c) => c.name === 'storage')!;
  assert(storage.status === 'pass' && /write, read and delete/.test(storage.detail), 'storage did a real round trip');
  const objectsLeft = await getContainer().storage.list('health');
  assert(objectsLeft.length === 0, 'the storage check cleaned up after itself');

  const migrations = report.checks.find((c) => c.name === 'migrations')!;
  assert(migrations.status === 'pass' && (migrations.meta?.count as number) >= 20, 'the migration check counted applied migrations');

  const database = report.checks.find((c) => c.name === 'database')!;
  assert(database.status === 'pass' && (database.meta?.fabrics as number) === 11, 'the database check queried real data');

  const performance = report.checks.find((c) => c.name === 'performance')!;
  assert(typeof (performance.meta as Record<string, number>)?.catalogue === 'number', 'the performance check timed the hot paths');
  console.log('checks do real round trips, and clean up ✓');

  // ---- One broken dependency yields one failing row, not an exception ------------------
  const broken = new (svc.constructor as new (...args: never[]) => typeof svc)(
    { $queryRaw: () => Promise.reject(new Error('connection refused')) } as never,
    getContainer().storage as never,
    getContainer().emailService as never,
    getContainer().searchService as never
  );
  const brokenCheck = await broken.checkDatabase();
  assert(brokenCheck.status === 'fail' && brokenCheck.detail.includes('connection refused'), 'a thrown check becomes a failing row carrying the reason');
  assert(typeof brokenCheck.ms === 'number', 'even a failed check is timed');
  console.log('a broken dependency degrades to one failing row ✓');

  // ---- Maintenance: expiry is idempotent -------------------------------------------------
  const expired = await getContainer().quoteService.expireStale();
  assert(typeof expired === 'number', 'expireStale reports how many it moved');
  assert((await getContainer().quoteService.expireStale()) === 0, 'running it again is a no-op');
  console.log(`maintenance: expireStale is idempotent (${expired} expired on the first run) ✓`);

  // ---- Backup readiness -------------------------------------------------------------------
  const backup = report.checks.find((c) => c.name === 'backup')!;
  assert(backup.status === 'pass' && (backup.meta?.tables as number) > 20, 'the backup check sized the database');
  console.log('backup readiness ✓');

  console.log('\nM20 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M20 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
