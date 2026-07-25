import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);

/**
 * Runs every milestone smoke in order (Phase 3 M20).
 *
 *   npm run smoke                 # service-level smokes only
 *   npm run smoke -- --http       # also the live HTTP smokes (needs a running server)
 *
 * Exits non-zero if any script fails, so this is the one command CI needs.
 */
// Browser-driven smokes run last: they are the slowest, and a service-level failure is a
// cheaper thing to be told about first. `.mjs` ones are launched with node, not tsx.
const HTTP_SCRIPTS = [
  'smoke-http-rbac.ts',
  'smoke-http-journey.ts',
  'smoke-http-share.ts',
  'smoke-http-hydration.ts',
  'smoke-three.mjs',
];

async function main() {
  const dir = path.join(process.cwd(), 'scripts');
  const files = await readdir(dir);

  const milestone = files
    .filter((f) => /^smoke-m\d+\.ts$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const includeHttp = process.argv.includes('--http');
  const scripts = [...milestone, ...(includeHttp ? HTTP_SCRIPTS.filter((f) => files.includes(f)) : [])];

  const failed: string[] = [];
  const started = Date.now();

  for (const script of scripts) {
    const at = Date.now();
    process.stdout.write(`${script.padEnd(26)} `);
    try {
      const argv = script.endsWith('.mjs') ? ['node', [path.join('scripts', script)]] : ['npx', ['tsx', path.join('scripts', script)]];
      await exec(argv[0] as string, argv[1] as string[], { env: process.env, maxBuffer: 1024 * 1024 * 32 });
      console.log(`PASS  (${Date.now() - at}ms)`);
    } catch (err) {
      failed.push(script);
      const output = err instanceof Error && 'stdout' in err ? String((err as { stdout: string }).stdout) : '';
      const reason = output.split('\n').find((line) => line.includes('FAILED')) ?? 'see output';
      console.log(`FAIL  ${reason.trim().slice(0, 120)}`);
    }
  }

  console.log(`\n${scripts.length - failed.length}/${scripts.length} passed in ${Math.round((Date.now() - started) / 1000)}s`);
  if (!includeHttp) console.log('(pass --http to also run the live HTTP smokes against a running server)');
  if (failed.length) {
    console.error(`FAILED: ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('SMOKE RUNNER ERRORED:', e);
  process.exit(1);
});
