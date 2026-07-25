import { chromium } from 'playwright-core';
import { decodePng, meanColour, colourDistance } from './lib/png.mjs';

/**
 * M25 — the Garment Visualiser.
 *
 * The claim being tested is that changing the garment changes the *shape* of the cloth, using
 * the studio's own silhouettes. A visualiser that quietly falls back to a rectangle whatever
 * you pick would pass every other check in this repository.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.error(`  ✗ ${m}`); };

/**
 * Fraction of the canvas the cloth covers, and how wide it is at each height.
 *
 * Measured against the background colour rather than alpha: Playwright composites a canvas
 * screenshot onto an opaque backing, so the transparent parts of a WebGL canvas come back as
 * solid RGB and an alpha test silently matches nothing at all.
 */
async function silhouette(page) {
  await page.waitForTimeout(900);
  const png = decodePng(await page.locator('[data-stage] canvas').first().screenshot());
  const { width, height, channels, data } = png;
  const at = (x, y) => {
    const o = (y * width + x) * channels;
    return [data[o], data[o + 1], data[o + 2]];
  };
  // The top-left corner is always backdrop — the cloth is centred and never reaches it.
  const bg = at(1, 1);
  const isCloth = (x, y) => {
    const [r, g, b] = at(x, y);
    return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 26;
  };

  let covered = 0;
  const rowWidths = [];
  for (let y = 0; y < height; y += 2) {
    let rowMin = width;
    let rowMax = -1;
    for (let x = 0; x < width; x++) {
      if (!isCloth(x, y)) continue;
      covered += 1;
      if (x < rowMin) rowMin = x;
      if (x > rowMax) rowMax = x;
    }
    // Ignore rows with only a few stray pixels — antialiasing at a silhouette edge.
    if (rowMax - rowMin > 4) rowWidths.push({ y, w: rowMax - rowMin });
  }
  return { coverage: covered / (width * (height / 2)), rowWidths, width, height, mean: meanColour(png) };
}

/** How much a silhouette's width varies down its length — a rectangle is flat, a dress flares. */
function taper(s) {
  if (s.rowWidths.length < 8) return 0;
  const widths = s.rowWidths.map((r) => r.w);
  const max = Math.max(...widths);
  const min = Math.min(...widths);
  return max > 0 ? (max - min) / max : 0;
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Collection$/i }).first().click();
  await page.waitForTimeout(700);
  await page.locator('[class*="pc-hv-lift"]').first().click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });

  const shapes = {};
  for (const name of ['Kurti', 'Shirt', 'Dress', 'T-Shirt', 'Roll']) {
    const button = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
    if (!(await button.count())) { console.log(`  – ${name} (no control)`); continue; }
    await button.click();
    shapes[name] = await silhouette(page);
    ok(`${name}: ${(shapes[name].coverage * 100).toFixed(1)}% coverage, taper ${(taper(shapes[name]) * 100).toFixed(0)}%`);
  }

  // A garment silhouette is not a rectangle. If every cut renders with a flat profile, the
  // visualiser is drawing the fallback panel and nobody would notice from a screenshot.
  for (const [name, s] of Object.entries(shapes)) {
    if (name === 'Roll') continue;
    if (taper(s) < 0.15) bad(`${name} renders with a near-constant width (taper ${(taper(s) * 100).toFixed(0)}%) — it is not using the silhouette`);
  }
  if (!problems.length) ok('every garment renders as a shaped silhouette, not a rectangle');

  // And the cuts must differ from each other.
  const pairs = [['Kurti', 'Dress'], ['Shirt', 'T-Shirt']];
  for (const [a, b] of pairs) {
    if (!shapes[a] || !shapes[b]) continue;
    const delta = Math.abs(shapes[a].coverage - shapes[b].coverage) + Math.abs(taper(shapes[a]) - taper(shapes[b]));
    if (delta < 0.02) bad(`${a} and ${b} render as the same shape (Δ${delta.toFixed(3)})`);
    else ok(`${a} and ${b} are different cuts (Δ${delta.toFixed(3)})`);
  }

  // The roll is the un-cut cloth, and should cover more of the frame than a t-shirt.
  if (shapes.Roll && shapes['T-Shirt'] && shapes.Roll.coverage <= shapes['T-Shirt'].coverage * 0.6) {
    bad('the fabric roll covers less than a t-shirt — the panel is probably not rendering');
  } else if (shapes.Roll) ok('the fabric roll renders as un-cut cloth');

  // Changing fabric under one cut must still change the render: same shape, different cloth.
  const kurtiBefore = shapes.Kurti;
  await page.getByRole('button', { name: /^Kurti$/i }).first().click();
  const chip = page.getByRole('button', { name: /^Firozi$/i }).first();
  if (await chip.count()) {
    await chip.click();
    const after = await silhouette(page);
    const delta = colourDistance(kurtiBefore.mean, after.mean);
    if (delta < 10) bad(`the same cut in a different shade barely changed (Δ${delta.toFixed(1)})`);
    else ok(`one cut, different cloth (Δ${delta.toFixed(1)})`);
  }

  await browser.close();
  if (problems.length) { console.error(`\nM25 SMOKE FAILED — ${problems.length} problem(s)`); process.exit(1); }
  console.log('\nM25 SMOKE PASSED');
}

main().catch((e) => { console.error('M25 SMOKE FAILED:', e.message); process.exit(1); });
