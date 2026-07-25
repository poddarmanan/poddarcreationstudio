import 'dotenv/config';
import { validateEnvironment } from '../src/server/health/env';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/**
 * Startup diagnostics (Phase 5 M31).
 *
 *   npx tsx scripts/startup-check.ts
 *
 * Run this *before* a release starts taking traffic. It answers the two questions that decide
 * whether a deploy should proceed — is the configuration coherent, and can the process reach
 * the things it needs — and it answers them in about a second.
 *
 * The distinction that matters: this is not a health check. A health check tells a load
 * balancer whether a running instance is well. This tells a deploy pipeline whether to
 * continue, and it is allowed to be slow, verbose and fatal in ways a health probe must not be.
 *
 * Exit codes are the contract:
 *   0  ready to serve
 *   1  misconfigured — do not start; the release will fail in a way users will see
 *   2  dependencies unreachable — retry, the database or storage may still be coming up
 */
const RETRYABLE = 2;
const FATAL = 1;

async function main() {
  const started = Date.now();
  console.log(`startup check · NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);

  // ---- 1. Configuration ------------------------------------------------------------------
  // Severity scales with NODE_ENV, so a placeholder secret is a warning locally and a refusal
  // in production. Getting this wrong is not a subtle failure: an app that boots with a
  // development AUTH_SECRET issues sessions anyone who has read the repository can forge.
  const env = validateEnvironment();
  for (const finding of env.findings) {
    const icon = finding.severity === 'ok' ? '✓' : finding.severity === 'warn' ? '!' : '✗';
    console.log(`  ${icon} ${finding.key.padEnd(16)} ${finding.message}`);
  }
  if (env.findings.some((f) => f.severity === 'fail')) {
    console.error('\nSTARTUP REFUSED — configuration is not fit to serve');
    process.exit(FATAL);
  }

  // ---- 2. Dependencies -------------------------------------------------------------------
  // Retryable, deliberately: on a cold `docker compose up` the database is often a couple of
  // seconds behind, and that is a reason to wait rather than to fail the deploy.
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('  ✓ database         reachable');
  } catch (err) {
    console.error(`  ✗ database         ${err instanceof Error ? err.message : err}`);
    console.error('\nSTARTUP DEFERRED — the database is not reachable yet');
    process.exit(RETRYABLE);
  }

  // Pending migrations are a refusal, not a warning. Serving against a schema the code does
  // not expect produces errors that look like application bugs for as long as it takes anyone
  // to check.
  const applied = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `.catch(() => null);
  if (!applied) {
    console.error('  ✗ migrations       no migration table — run `prisma migrate deploy`');
    process.exit(FATAL);
  }
  console.log(`  ✓ migrations       ${applied[0].count} applied`);

  const { storage, telemetry } = getContainer();
  try {
    const probe = `startup/${Date.now()}.txt`;
    await storage.put({ key: probe, body: Buffer.from('ok'), contentType: 'text/plain' });
    await storage.delete(probe);
    console.log('  ✓ storage          write and delete round-trip');
  } catch (err) {
    console.error(`  ✗ storage          ${err instanceof Error ? err.message : err}`);
    process.exit(RETRYABLE);
  }

  const ms = Date.now() - started;
  telemetry.timing('startup.check', ms, { result: 'ready' });
  console.log(`\nSTARTUP OK — ready to serve (${ms}ms)`);
}

main().catch((err) => {
  console.error('STARTUP CHECK FAILED:', err);
  process.exit(FATAL);
});
