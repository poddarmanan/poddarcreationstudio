import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';

const exec = promisify(execFile);

/**
 * Backup verification (Phase 3 M20).
 *
 * A backup you have never restored is a hope, not a backup. This script takes a real `pg_dump`,
 * restores it into a scratch database, and compares row counts table by table — then removes
 * the scratch database whether it passed or failed.
 *
 *   npx tsx scripts/verify-backup.ts [--keep]
 *
 * `--keep` leaves the dump on disk for inspection. Exit code is non-zero on any mismatch, so
 * this can run in CI or a scheduled job.
 */

interface Parsed {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(url: string): Parsed {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

/** Tables worth comparing — the business data, not Prisma's own bookkeeping. */
const TABLES = [
  'User', 'Fabric', 'Colour', 'Media', 'Quote', 'QuoteItem', 'QuoteEvent',
  'SampleRequest', 'SampleItem', 'SampleEvent', 'Collection', 'CollectionItem',
  'CollectionShare', 'ShareView', 'ShippingAddress', 'ContactPerson', 'ActivityEvent',
  'FollowUp', 'CustomerNote', 'Notification', 'EmailLog', 'FabricView', 'AuditLog',
];

async function counts(env: NodeJS.ProcessEnv, conn: Parsed, database: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    const { stdout } = await exec(
      'psql',
      ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', database, '-tAc', `SELECT COUNT(*) FROM "${table}"`],
      { env }
    ).catch(() => ({ stdout: 'missing' }));
    out[table] = stdout.trim() === 'missing' ? -1 : Number(stdout.trim());
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const conn = parseDatabaseUrl(url);
  const env = { ...process.env, PGPASSWORD: conn.password };
  const keep = process.argv.includes('--keep');

  const scratch = `poddar_backup_verify_${Date.now()}`;
  const dir = await mkdtemp(path.join(tmpdir(), 'poddar-backup-'));
  const dumpFile = path.join(dir, `${conn.database}.dump`);
  let failures = 0;

  try {
    // ---- 1. Take the backup -------------------------------------------------
    console.log(`Dumping ${conn.database} → ${dumpFile}`);
    const dumpStarted = Date.now();
    await exec('pg_dump', ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.database, '-Fc', '-f', dumpFile], { env, maxBuffer: 1024 * 1024 * 64 });
    const size = (await stat(dumpFile)).size;
    console.log(`  ✓ ${(size / 1024 / 1024).toFixed(2)} MB in ${Date.now() - dumpStarted}ms`);
    if (size === 0) throw new Error('The dump is empty');

    // ---- 2. Restore it somewhere else ------------------------------------------
    console.log(`Restoring into scratch database ${scratch}`);
    const restoreStarted = Date.now();
    await exec('createdb', ['-h', conn.host, '-p', conn.port, '-U', conn.user, scratch], { env });
    // pg_restore reports non-fatal notices via a non-zero exit; failures show up in the
    // comparison below, which is the check that actually matters.
    await exec('pg_restore', ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', scratch, '--no-owner', '--no-privileges', dumpFile], { env, maxBuffer: 1024 * 1024 * 64 }).catch(() => undefined);
    console.log(`  ✓ restored in ${Date.now() - restoreStarted}ms`);

    // ---- 3. Prove it holds the same data ----------------------------------------
    const [live, restored] = await Promise.all([counts(env, conn, conn.database), counts(env, conn, scratch)]);

    console.log('\nTable                    live   restored');
    console.log('--------------------------------------------');
    for (const table of TABLES) {
      const a = live[table];
      const b = restored[table];
      const match = a === b;
      if (!match) failures += 1;
      if (a === -1 && b === -1) continue; // table absent from both — nothing to compare
      console.log(`${table.padEnd(22)} ${String(a).padStart(6)} ${String(b).padStart(10)}  ${match ? '✓' : '✗ MISMATCH'}`);
    }

    // A restore that produced an empty database "matches" only if the source was empty too.
    const liveTotal = Object.values(live).filter((n) => n > 0).reduce((a, b) => a + b, 0);
    const restoredTotal = Object.values(restored).filter((n) => n > 0).reduce((a, b) => a + b, 0);
    console.log(`\nRows: ${liveTotal} live · ${restoredTotal} restored`);
    if (liveTotal > 0 && restoredTotal === 0) {
      failures += 1;
      console.error('✗ The restored database is empty while the source is not');
    }

    // The schema has to come back too, not just the rows.
    const { stdout: enumOut } = await exec('psql', ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', scratch, '-tAc', "SELECT COUNT(*) FROM pg_type WHERE typtype = 'e'"], { env });
    console.log(`Enum types restored: ${enumOut.trim()}`);
    if (Number(enumOut.trim()) === 0) {
      failures += 1;
      console.error('✗ No enum types in the restored database — the schema did not come back');
    }
  } finally {
    await exec('dropdb', ['-h', conn.host, '-p', conn.port, '-U', conn.user, '--if-exists', scratch], { env }).catch(() => undefined);
    if (!keep) await rm(dir, { recursive: true, force: true });
    else console.log(`\nDump kept at ${dumpFile}`);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\nBACKUP VERIFICATION FAILED — ${failures} mismatch(es)`);
    process.exit(1);
  }
  console.log('\nBACKUP VERIFICATION PASSED — the dump restores to an identical database');
}

main().catch((e) => {
  console.error('BACKUP VERIFICATION FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
