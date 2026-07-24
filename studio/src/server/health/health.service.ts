import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import type { StorageProvider } from '../storage';
import type { EmailService } from '../email/email.service';
import type { SearchService } from '../search/search.service';
import { validateEnvironment, type EnvReport } from './env';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** How long the check itself took, in ms — a slow check is a finding in its own right. */
  ms?: number;
  meta?: Record<string, unknown>;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Check[];
  environment: EnvReport;
  version: string;
  uptimeSeconds: number;
  checkedAt: string;
}

const started = Date.now();

/**
 * Production diagnostics (Phase 3 M20).
 *
 * Each check does a **real** round trip rather than reading configuration: storage writes and
 * reads back an object, the database runs a query and counts its migrations, search asks the
 * engine. Configuration says what we intended; a round trip says what actually works.
 *
 * Every check is individually timed and individually fault-tolerant, so one broken dependency
 * produces one failing row rather than an exception page.
 */
export class HealthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: StorageProvider,
    private readonly email: EmailService,
    private readonly search: SearchService
  ) {}

  /** Liveness: is the process up? Deliberately touches nothing external. */
  liveness() {
    return { status: 'ok' as const, uptimeSeconds: Math.round((Date.now() - started) / 1000), checkedAt: new Date().toISOString() };
  }

  /** Readiness: can we actually serve traffic? Runs every dependency check. */
  async readiness(opts: { deep?: boolean } = {}): Promise<HealthReport> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkMigrations(),
      this.checkStorage(),
      this.checkEmail(),
      this.checkSearch(),
      this.checkMonitoring(),
      this.checkSecurity(),
      ...(opts.deep ? [this.checkPerformance(), this.checkBackupReadiness()] : []),
    ]);

    const environment = validateEnvironment();
    if (!environment.ok) {
      checks.push({ name: 'environment', status: 'fail', detail: `${environment.failures} configuration problem${environment.failures === 1 ? '' : 's'}`, meta: { findings: environment.findings.filter((f) => f.severity !== 'ok') } });
    } else if (environment.warnings > 0) {
      checks.push({ name: 'environment', status: 'warn', detail: `${environment.warnings} configuration warning${environment.warnings === 1 ? '' : 's'}`, meta: { findings: environment.findings.filter((f) => f.severity === 'warn') } });
    } else {
      checks.push({ name: 'environment', status: 'pass', detail: 'All configuration checks pass' });
    }

    const failed = checks.some((c) => c.status === 'fail');
    const warned = checks.some((c) => c.status === 'warn');

    return {
      status: failed ? 'unhealthy' : warned ? 'degraded' : 'healthy',
      checks,
      environment,
      version: process.env.APP_VERSION ?? 'dev',
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      checkedAt: new Date().toISOString(),
    };
  }

  // ---- Individual checks --------------------------------------------------------
  private async timed(name: string, fn: () => Promise<Omit<Check, 'name' | 'ms'>>): Promise<Check> {
    const at = Date.now();
    try {
      const result = await fn();
      return { name, ...result, ms: Date.now() - at };
    } catch (err) {
      return { name, status: 'fail', detail: err instanceof Error ? err.message.slice(0, 300) : 'Check threw', ms: Date.now() - at };
    }
  }

  checkDatabase(): Promise<Check> {
    return this.timed('database', async () => {
      await this.db.$queryRaw`SELECT 1`;
      const [fabrics, colours, users] = await Promise.all([this.db.fabric.count(), this.db.colour.count(), this.db.user.count()]);
      // An empty catalogue means the seed never ran — the app "works" but has nothing to sell.
      if (fabrics === 0) return { status: 'warn' as const, detail: 'Connected, but the catalogue is empty — has the seed run?', meta: { fabrics, colours, users } };
      return { status: 'pass' as const, detail: `Connected · ${fabrics} fabrics, ${colours} shades, ${users} accounts`, meta: { fabrics, colours, users } };
    });
  }

  checkMigrations(): Promise<Check> {
    return this.timed('migrations', async () => {
      const rows = await this.db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC
      `;
      const pending = rows.filter((r) => !r.finished_at && !r.rolled_back_at);
      const rolledBack = rows.filter((r) => r.rolled_back_at);
      if (rolledBack.length) return { status: 'fail' as const, detail: `${rolledBack.length} migration(s) rolled back: ${rolledBack.map((r) => r.migration_name).join(', ')}` };
      if (pending.length) return { status: 'fail' as const, detail: `${pending.length} migration(s) did not finish` };
      return { status: 'pass' as const, detail: `${rows.length} applied · latest ${rows[rows.length - 1]?.migration_name ?? 'none'}`, meta: { count: rows.length } };
    });
  }

  /** A real write → read → delete round trip. Configuration can look right and still not work. */
  checkStorage(): Promise<Check> {
    return this.timed('storage', async () => {
      const key = `health/${randomUUID()}.txt`;
      const body = Buffer.from(`health ${Date.now()}`);
      await this.storage.put({ key, body, contentType: 'text/plain' });
      const read = await this.storage.get(key);
      await this.storage.delete(key);

      if (!read) return { status: 'fail' as const, detail: `Wrote to ${this.storage.name} but could not read it back` };
      if (!read.body.equals(body)) return { status: 'fail' as const, detail: 'Read back different bytes than were written' };
      const stillThere = await this.storage.get(key);
      if (stillThere) return { status: 'warn' as const, detail: `${this.storage.name}: write and read work, but delete did not remove the object` };
      return { status: 'pass' as const, detail: `${this.storage.name}: write, read and delete all work`, meta: { driver: this.storage.name } };
    });
  }

  checkEmail(): Promise<Check> {
    return this.timed('email', async () => {
      const driver = this.email.transportName;
      const recentFailures = await this.db.emailLog.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
      const recentSends = await this.db.emailLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });

      if (recentFailures > 0) {
        return { status: 'warn' as const, detail: `${driver}: ${recentFailures} of ${recentSends} sends failed in the last 24h`, meta: { driver, recentFailures, recentSends } };
      }
      if (driver.startsWith('dev') && process.env.NODE_ENV === 'production') {
        return { status: 'fail' as const, detail: 'Production is using the dev transport — mail is being written to disk, not sent' };
      }
      return { status: 'pass' as const, detail: `${driver} · ${recentSends} sent in the last 24h, none failed`, meta: { driver, recentSends } };
    });
  }

  checkSearch(): Promise<Check> {
    return this.timed('search', async () => {
      const hits = await this.search.search('silk', { limit: 1 });
      return { status: 'pass' as const, detail: `${this.search.engineName} responded with ${hits.hits.length} hit(s) for a probe query`, meta: { engine: this.search.engineName } };
    });
  }

  checkMonitoring(): Promise<Check> {
    return this.timed('monitoring', async () => {
      const sentry = !!process.env.SENTRY_DSN;
      const posthog = !!process.env.POSTHOG_KEY;
      const production = process.env.NODE_ENV === 'production';
      if (production && !sentry) return { status: 'warn' as const, detail: 'No Sentry DSN — errors are not reaching an error tracker', meta: { sentry, posthog } };
      if (!sentry && !posthog) return { status: 'pass' as const, detail: 'Console telemetry (no external backend configured)', meta: { sentry, posthog } };
      return { status: 'pass' as const, detail: `Wired: ${[sentry && 'Sentry', posthog && 'PostHog'].filter(Boolean).join(' + ')}`, meta: { sentry, posthog } };
    });
  }

  /**
   * Security posture that can be checked from inside the process. Header enforcement lives in
   * `proxy.ts` and is verified over HTTP by the preflight script — a check that asserted its own
   * configuration would prove nothing.
   */
  checkSecurity(): Promise<Check> {
    return this.timed('security', async () => {
      const problems: string[] = [];
      const production = process.env.NODE_ENV === 'production';
      const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';

      if (!secret) problems.push('AUTH_SECRET is not set');
      else if (secret.length < 32) problems.push('AUTH_SECRET is shorter than 32 characters');
      if (production && !(process.env.APP_URL || process.env.NEXTAUTH_URL || '').startsWith('https://')) problems.push('APP_URL is not https in production');

      // An account that can sign in but never verified its address is a phishing foothold.
      const unverifiedStaff = await this.db.user.count({ where: { role: { in: ['ADMIN', 'MANAGER'] }, emailVerifiedAt: null } });
      if (production && unverifiedStaff > 0) problems.push(`${unverifiedStaff} admin/manager account(s) have never verified their email`);

      if (problems.length) return { status: production ? ('fail' as const) : ('warn' as const), detail: problems.join('; ') };
      return { status: 'pass' as const, detail: 'Secrets, URLs and privileged accounts all check out' };
    });
  }

  /** Are the hot query paths still fast? Measures rather than assumes. */
  checkPerformance(): Promise<Check> {
    return this.timed('performance', async () => {
      const samples: Record<string, number> = {};
      const measure = async (name: string, fn: () => Promise<unknown>) => {
        const at = Date.now();
        await fn();
        samples[name] = Date.now() - at;
      };

      await measure('catalogue', () => this.db.fabric.findMany({ include: { colours: { orderBy: { order: 'asc' } } } }));
      await measure('quoteBoard', () => this.db.quote.findMany({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT'] } }, take: 100, include: { items: true } }));
      await measure('activity', () => this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }));

      const slowest = Object.entries(samples).sort((a, b) => b[1] - a[1])[0];
      const detail = Object.entries(samples).map(([k, v]) => `${k} ${v}ms`).join(' · ');
      // 1s for a single indexed query means something has regressed — an index dropped, a
      // pathological row count, or a database under real pressure.
      if (slowest && slowest[1] > 1000) return { status: 'warn' as const, detail: `${detail} — ${slowest[0]} is slow`, meta: samples };
      return { status: 'pass' as const, detail, meta: samples };
    });
  }

  /** Can a backup actually be taken? The verification itself lives in `scripts/verify-backup.ts`. */
  checkBackupReadiness(): Promise<Check> {
    return this.timed('backup', async () => {
      const url = process.env.DATABASE_URL;
      if (!url) return { status: 'fail' as const, detail: 'No DATABASE_URL — nothing to back up' };
      const rows = await this.db.$queryRaw<{ size: string; tables: bigint }[]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
               (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public')::bigint AS tables
      `;
      const { size, tables } = rows[0];
      return {
        status: 'pass' as const,
        detail: `Database is ${size} across ${Number(tables)} tables · run scripts/verify-backup.ts to prove a dump restores`,
        meta: { size, tables: Number(tables) },
      };
    });
  }
}
