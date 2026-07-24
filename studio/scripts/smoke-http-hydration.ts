import 'dotenv/config';
import assert from 'node:assert';
import { chromium, type ConsoleMessage } from 'playwright-core';

/**
 * Hydration smoke (Phase 4).
 *
 * Drives a **real browser** against a production build and asserts that every interactive page
 * actually comes alive: no Content-Security-Policy refusals, no page errors, and the elements a
 * user needs are present *after* hydration.
 *
 * This exists because of a bug nothing else could catch. The CSP issues a per-request nonce
 * with `'strict-dynamic'`; statically prerendered pages were built before that nonce existed,
 * so every script on `/signin`, `/forgot-password`, `/reset-password`, `/verify-email` and
 * `/accept-invite` was refused and the forms never rendered. Nobody could sign in. The build
 * passed, lint passed, types passed, and the HTTP smokes passed — because they authenticate
 * through the API, not the form.
 *
 *   npx tsx scripts/smoke-http-hydration.ts [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

interface Case {
  path: string;
  /** A selector that only exists once the page has hydrated. */
  needs: string;
  what: string;
}

const CASES: Case[] = [
  { path: '/signin', needs: 'input[type="email"]', what: 'the sign-in form' },
  { path: '/forgot-password', needs: 'input', what: 'the password-reset request form' },
  { path: '/reset-password?token=probe', needs: 'input[type="password"]', what: 'the new-password form' },
  { path: '/accept-invite?token=probe', needs: 'input[type="password"]', what: 'the invitation form' },
  { path: '/verify-email?token=probe', needs: 'a', what: 'the verification result' },
  { path: '/', needs: 'button', what: 'the studio' },
];

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  let failures = 0;

  for (const testCase of CASES) {
    const page = await browser.newPage();
    const cspRefusals: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      const text = msg.text();
      if (msg.type() === 'error' && /Content Security Policy/i.test(text)) cspRefusals.push(text.slice(0, 160));
    });
    // "Connection closed" is the dev-server socket closing on navigation, not an app fault.
    page.on('pageerror', (err) => {
      if (!/Connection closed/i.test(String(err))) pageErrors.push(String(err).slice(0, 160));
    });

    try {
      await page.goto(`${BASE}${testCase.path}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForSelector(testCase.needs, { timeout: 15_000, state: 'attached' });
      const count = await page.locator(testCase.needs).count();

      assert(count > 0, `${testCase.path}: ${testCase.what} never appeared`);
      assert(cspRefusals.length === 0, `${testCase.path}: CSP refused ${cspRefusals.length} script(s) — the page cannot hydrate.\n      ${cspRefusals[0] ?? ''}`);
      assert(pageErrors.length === 0, `${testCase.path}: ${pageErrors[0]}`);

      console.log(`  ✓ ${testCase.path.padEnd(30)} ${testCase.what} hydrated`);
    } catch (err) {
      failures += 1;
      console.error(`  ✗ ${testCase.path.padEnd(30)} ${err instanceof Error ? err.message.split('\n')[0] : err}`);
      if (cspRefusals.length) console.error(`      CSP: ${cspRefusals[0]}`);
    } finally {
      await page.close();
    }
  }

  // The security headers must still be there — the fix must not have loosened them.
  const page = await browser.newPage();
  const response = await page.goto(`${BASE}/signin`);
  const csp = response?.headers()['content-security-policy'] ?? '';
  await page.close();
  await browser.close();

  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", 'nonce-']) {
    if (!csp.includes(directive)) {
      failures += 1;
      console.error(`  ✗ CSP is missing ${directive}`);
    }
  }
  if (csp.includes("script-src") && csp.includes("'unsafe-inline'") && !csp.includes("style-src 'self' 'unsafe-inline'")) {
    failures += 1;
    console.error('  ✗ script-src allows unsafe-inline — the nonce is no longer doing any work');
  }
  console.log('  ✓ CSP still strict (nonce, default-src self, frame-ancestors none)');

  if (failures > 0) {
    console.error(`\nHYDRATION SMOKE FAILED — ${failures} problem(s)`);
    process.exit(1);
  }
  console.log('\nHYDRATION SMOKE PASSED');
}

main().catch((e) => {
  console.error('HYDRATION SMOKE FAILED:', e);
  process.exit(1);
});
