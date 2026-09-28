import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

/**
 * Captures the platform's screens as PNGs (Phase 4 tooling).
 *
 *   node scripts/capture-screens.mjs [baseUrl] [outDir]
 *
 * Drives the real app through a real browser — signs in, walks the studio's in-app views and
 * the server-rendered portal/workspace routes. Used for demos and as a visual-regression
 * reference while Phase 4 replaces the placeholder visualisations.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? './screens';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const shot = async (page, name) => {
  await page.waitForTimeout(900); // let the entrance animations settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
};

async function signIn(page, email, password) {
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  // The auth pages render their form inside a Suspense boundary, so the input only exists
  // after hydration — wait for it rather than assuming it is in the initial HTML.
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  console.log('Public studio');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, '01-entrance');

  // The studio is a single-page experience — its views are nav buttons, not routes.
  for (const [label, name] of [
    ['Showroom', '02-showroom'],
    ['Colours', '04-colour-wall'],
    ['Swatch Book', '06-swatch-book'],
  ]) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (await button.count()) {
      await button.click();
      await shot(page, name);
    } else {
      console.log(`  – ${name} (no "${label}" nav button found)`);
    }
  }

  // Open a fabric to reach the Lab — the surface Phase 4 replaces with real 3D.
  const roll = page.locator('[class*="pc-"], canvas, img').first();
  if (await roll.count()) {
    await roll.click({ force: true }).catch(() => {});
    await shot(page, '07-fabric-lab');
  }

  console.log('Customer portal');
  await signIn(page, 'buyer@example.com', 'poddar123');
  await page.goto(`${BASE}/portal`, { waitUntil: 'networkidle' });
  await shot(page, '08-portal-dashboard');
  await page.evaluate(() => window.scrollTo(0, 1400));
  await shot(page, '09-portal-lower');

  const board = page.locator('a[href^="/portal/collections/"]').first();
  if (await board.count()) {
    await board.click();
    await page.waitForLoadState('networkidle');
    await shot(page, '10-collection-board');
  }
  const quote = await page.evaluate(async () => {
    const r = await fetch('/api/portal/quotes');
    const d = await r.json();
    return d.quotes?.[0]?.id ?? null;
  });
  if (quote) {
    await page.goto(`${BASE}/portal/quotes/${quote}`, { waitUntil: 'networkidle' });
    await shot(page, '11-quote-tracker');
  }

  console.log('Staff workspace');
  await signIn(page, 'admin@poddarcreation.studio', 'poddar123');
  for (const [path, name] of [
    ['/admin', '12-staff-hub'],
    ['/admin/sales', '13-sales-workspace'],
    ['/admin/quotes', '14-quote-desk'],
    ['/admin/analytics', '15-analytics'],
    ['/admin/diagnostics', '16-diagnostics'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await shot(page, name);
  }

  // Mobile view of the entrance, to show the responsive layout holds.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: `${OUT}/17-mobile-entrance.png` });
  console.log('  ✓ 17-mobile-entrance.png');

  await browser.close();
  console.log(`\nScreens written to ${OUT}`);
}

main().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  process.exit(1);
});
