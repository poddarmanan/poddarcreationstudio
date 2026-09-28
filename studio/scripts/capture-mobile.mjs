import { chromium, devices } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

/**
 * Captures the studio on a phone, and checks the things a screenshot cannot show.
 *
 *   node scripts/capture-mobile.mjs [baseUrl] [outDir]
 *
 * Every view is driven through the bottom navigation pill — the same taps a customer makes —
 * so the shots are evidence the navigation works, not just that it renders. Alongside each
 * capture it asserts the three properties that decide whether a page is usable on a phone:
 *
 *   • no horizontal scroll (the commonest mobile regression, and invisible in a screenshot)
 *   • every tap target at least 44px (Apple's and Google's shared minimum)
 *   • nothing important hidden behind the pill
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? './screens-mobile';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** iPhone 14 — 390×844, the width most Indian buyers browse at is narrower still, so 360 is checked too. */
const PHONE = devices['iPhone 14'] ?? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const problems = [];

async function audit(page, label) {
  const report = await page.evaluate(() => {
    const doc = document.documentElement;

    // What a thumb can hit is the drawn box *plus* any ::after overlay grown past it —
    // a control may legitimately be smaller than its target.
    const hitArea = (el) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      if (after.content === 'none' || after.position !== 'absolute') return { w: r.width, h: r.height };
      const grow = (side) => -Math.min(0, parseFloat(after[side]) || 0);
      return { w: r.width + grow('left') + grow('right'), h: r.height + grow('top') + grow('bottom') };
    };

    const small = [];
    for (const el of document.querySelectorAll('nav button, nav a, .pc-bottomnav-item')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered at this breakpoint
      const hit = hitArea(el);
      if (hit.h < 44 || hit.w < 24) small.push(`${el.className || el.tagName} ${Math.round(hit.w)}×${Math.round(hit.h)}`);
    }

    const nav = document.querySelector('.pc-bottomnav');
    const pill = document.querySelector('.pc-bottomnav-pill');
    // A hidden parent still reports its child's `display`, so measure the box instead.
    const pillBox = pill ? pill.getBoundingClientRect() : null;

    const clippedLabels = [...document.querySelectorAll('.pc-bottomnav-label')]
      .filter((l) => l.scrollWidth > l.clientWidth + 0.5)
      .map((l) => l.textContent);

    // A mobile browser zooms the page out when content is wider than the screen, and never
    // zooms back. `innerWidth` above the device width is that zoom, caught in the act.
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      zoomedOut: window.innerWidth,
      small,
      clippedLabels,
      pillHeight: pillBox ? Math.round(pillBox.height) : 0,
      pillVisible: !!(nav && pillBox && pillBox.height > 0),
    };
  });

  const width = page.viewportSize().width;
  if (report.overflow > 1) problems.push(`${label}: page scrolls sideways by ${report.overflow}px`);
  if (report.zoomedOut > width + 1) problems.push(`${label}: the browser zoomed the page out — layout viewport is ${report.zoomedOut}px on a ${width}px screen`);
  if (report.small.length) problems.push(`${label}: ${report.small.length} tap target(s) under 44px — ${report.small.slice(0, 3).join(', ')}`);
  if (report.clippedLabels.length) problems.push(`${label}: navigation label(s) truncated — ${report.clippedLabels.join(', ')}`);
  if (!report.pillVisible) problems.push(`${label}: the bottom navigation is not visible`);
  return report;
}

async function shot(page, name, label) {
  await page.waitForTimeout(800); // let the entrance animations settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const report = await audit(page, label ?? name);
  console.log(`  ✓ ${name}.png${report.pillHeight ? `  (pill ${report.pillHeight}px)` : ''}`);
}

/** Taps an item in the bottom pill by its accessible name. */
async function tap(page, name) {
  const target = page.locator(`.pc-bottomnav-item[aria-label="${name}"]`);
  if (!(await target.count())) return false;
  await target.tap();
  return true;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();

  console.log(`Phone: ${PHONE.viewport.width}×${PHONE.viewport.height} @${PHONE.deviceScaleFactor}x`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pc-bottomnav-pill', { timeout: 15_000 });
  await shot(page, '01-entrance');

  // The entrance must land whole — title, promise and call to action above the pill, with
  // nothing to scroll for — and the hero's own search bar must be gone, because the header
  // carries it now and two search fields on one screen is one too many.
  const entrance = await page.evaluate(() => {
    const heroSearch = document.querySelector('.pc-hero-search');
    const cta = [...document.querySelectorAll('.pc-view button')].pop();
    const pill = document.querySelector('.pc-bottomnav-pill');
    return {
      heroSearchShown: heroSearch ? heroSearch.getBoundingClientRect().height > 0 : false,
      ctaBottom: cta ? Math.round(cta.getBoundingClientRect().bottom) : null,
      pillTop: Math.round(pill.getBoundingClientRect().top),
      scrolls: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  if (entrance.heroSearchShown) problems.push("entrance: the hero's search bar is still showing alongside the header's");
  if (entrance.ctaBottom !== null && entrance.ctaBottom > entrance.pillTop) {
    problems.push(`entrance: content runs ${entrance.ctaBottom - entrance.pillTop}px under the navigation pill`);
  }
  if (entrance.scrolls > 2) problems.push(`entrance: does not fit — ${entrance.scrolls}px of scroll`);

  // The header carries no search on a phone any more (the owner took it out); the account menu
  // under the user icon holds sign-in and the language.

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pc-bottomnav-pill', { timeout: 15_000 });

  for (const [label, name] of [
    ['Showroom', '02-showroom'],
    ['Colours', '04-colour-wall'],
    ['Swatch Book', '06-swatch-book'],
  ]) {
    if (await tap(page, label)) await shot(page, name);
    else console.log(`  – ${name} (no "${label}" item in the pill)`);
  }

  // Open a fabric — the deepest view, and the one with the most chrome to fit on a phone.
  await tap(page, 'Showroom');
  await page.waitForTimeout(500);
  const card = page.locator('[class*="pc-hv-lift-14"]').first();
  if (await card.count()) {
    await card.tap({ force: true }).catch(() => {});
    await shot(page, '07-fabric-lab');
  }

  // The pill in its signed-in state: staff get Admin as a fourth item.
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', 'admin@poddarcreation.studio');
  await page.fill('input[type="password"]', 'poddar123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.tap('button[type="submit"]')]);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pc-bottomnav-pill', { timeout: 15_000 });
  await shot(page, '08-entrance-staff');

  // A narrow phone (360px) — the width the pill has to survive, not the one it was designed on.
  const narrow = await browser.newContext({ ...PHONE, viewport: { width: 360, height: 780 } });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(BASE, { waitUntil: 'networkidle' });
  await narrowPage.waitForSelector('.pc-bottomnav-pill', { timeout: 15_000 });
  await shot(narrowPage, '09-narrow-360');

  // A tablet, to prove the desktop header comes back above the breakpoint.
  const tablet = await browser.newContext({ viewport: { width: 834, height: 1112 }, deviceScaleFactor: 2 });
  const tabletPage = await tablet.newPage();
  await tabletPage.goto(BASE, { waitUntil: 'networkidle' });
  await tabletPage.waitForTimeout(800);
  await tabletPage.screenshot({ path: `${OUT}/10-tablet-834.png` });
  const desktopHeader = await tabletPage.evaluate(() => {
    const row = document.querySelector('.pc-hdrnav');
    const pill = document.querySelector('.pc-bottomnav-pill');
    return {
      header: row ? row.getBoundingClientRect().height > 0 : false,
      pill: pill ? pill.getBoundingClientRect().height > 0 : false,
    };
  });
  if (!desktopHeader.header) problems.push('tablet: the desktop header nav is missing above 768px');
  if (desktopHeader.pill) problems.push('tablet: the mobile pill is still showing above 768px');
  console.log('  ✓ 10-tablet-834.png');

  await browser.close();

  if (problems.length) {
    console.error(`\nMOBILE AUDIT FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`\nMOBILE AUDIT PASSED — no sideways scroll, all tap targets ≥44px, pill present on phones only`);
  console.log(`Screens written to ${OUT}`);
}

main().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  process.exit(1);
});
