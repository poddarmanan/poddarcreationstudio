import { chromium } from 'playwright-core';
import { decodePng } from './lib/png.mjs';

/**
 * M27 — the Digital Microscope.
 *
 * The claim is that magnification buys *detail*, not bigger pixels. That is the entire argument
 * for generating the weave rather than shipping photographs, so it is worth measuring rather
 * than asserting: a bitmap magnified past its resolution gets smoother, and a regenerated weave
 * does not.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.error(`  ✗ ${m}`); };

/**
 * Mean absolute difference between neighbouring pixels — how much structure a picture has.
 * A weave full of resolved threads scores high; the same weave blurred by magnification
 * scores low. This is the measurement that separates "more detail" from "bigger pixels".
 */
function detail(png) {
  const { width, height, channels, data } = png;
  let total = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 2) {
      const o = (y * width + x) * channels;
      const right = o + channels;
      const down = o + width * channels;
      total += Math.abs(data[o] - data[right]) + Math.abs(data[o] - data[down]);
      n += 2;
    }
  }
  return total / n;
}

/** Mean absolute difference per channel between two captures of the same size, 0–255. */
function pixelDelta(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let total = 0;
  let n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const oa = (y * a.width + x) * a.channels;
      const ob = (y * b.width + x) * b.channels;
      total += Math.abs(a.data[oa] - b.data[ob]) + Math.abs(a.data[oa + 1] - b.data[ob + 1]) + Math.abs(a.data[oa + 2] - b.data[ob + 2]);
      n += 3;
    }
  }
  return total / n;
}

async function openScope(page, label) {
  // The microscope lives in the Scenes sheet, opened from the stage's camera button; its
  // magnifying-glass button pops the three magnifications out. Everything opens a tick after the
  // tap and animates, so this waits for states rather than for fixed times.
  const sheet = page.locator('[role="dialog"][aria-label="Scenes"]');
  const magnifier = page.getByRole('button', { name: /^Microscope$/i });
  const level = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
  if (!(await sheet.count())) {
    await page.getByRole('button', { name: /^Scenes$/i }).first().evaluate((el) => el.click());
    await magnifier.first().waitFor({ state: 'visible', timeout: 20_000 });
  }
  if (!(await level.filter({ visible: true }).count())) await magnifier.first().evaluate((el) => el.click());
  await level.first().waitFor({ state: 'visible', timeout: 20_000 });
  await level.first().evaluate((el) => el.click());
  await page.waitForSelector('[data-stage] canvas', { timeout: 20_000 });
  await page.waitForTimeout(1600);
  // The microscope's window fades and rises in; on a software renderer at a frame a second, a
  // capture taken mid-fade is washed out. Wait for every finite animation to finish first.
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    null,
    { timeout: 20_000 },
  ).catch(() => {});
  const png = decodePng(await page.locator('[data-stage] canvas').last().screenshot());
  // Escape closes the window and the sheet; the sheet animates out before it goes. Wait until it
  // has gone, so the next call opens a fresh one rather than finding one on its way out.
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(12, 12).catch(() => {});
  await sheet.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
  return png;
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Fabrics open from the Showroom: its walk hangs all eleven rolls in catalogue order (cotton,
  // then rayon, then silk), and clicking one unrolls it into the lab.
  await page.getByRole('button', { name: /^Showroom$/i }).first().click();
  await page.waitForTimeout(900);
  // A slub is the right fabric to inspect: irregular yarn is exactly what a microscope is for.
  // Rayon Slub is the eighth roll in the catalogue's order (cotton, then rayon, then silk).
  await page.locator('[class*="pc-hv-lift-14"]').nth(7).click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });
  ok('the lab opened');

  const at100 = await openScope(page, '100×');
  const at500 = await openScope(page, '500×');

  const d100 = detail(at100);
  const d500 = detail(at500);
  ok(`100× structure ${d100.toFixed(2)}, 500× structure ${d500.toFixed(2)}`);

  // The failure this guards against is magnifying a fixed-resolution image: the picture gets
  // smoother as you go in, because there is nothing more to show.
  if (d500 < d100 * 0.6) {
    bad(`500× is markedly smoother than 100× (${d500.toFixed(2)} vs ${d100.toFixed(2)}) — magnification is enlarging pixels, not resolving threads`);
  } else ok('500× resolves structure rather than enlarging pixels');

  // And the two magnifications must genuinely differ, or the control does nothing. Measured as
  // the pictures themselves differing, pixel by pixel. It used to compare the two structure
  // scores, but a fine weave at 100× and the yarns at 500× are plainly different pictures that
  // can score alike, and that check failed on a working microscope about one run in four.
  const apart = pixelDelta(at100, at500);
  if (apart < 6) bad(`100× and 500× render near-identically (mean pixel difference ${apart.toFixed(1)}) — the scope control may be inert`);
  else ok(`the magnification control changes the view (mean pixel difference ${apart.toFixed(1)} of 255)`);

  // Neither view may be blank — a microscope showing a flat field is worse than none.
  for (const [name, png] of [['100×', at100], ['500×', at500]]) {
    if (detail(png) < 0.4) bad(`${name} is a flat field — nothing resolved`);
  }
  if (!problems.length) ok('both magnifications show resolved weave');

  await browser.close();
  if (problems.length) { console.error(`\nM27 SMOKE FAILED — ${problems.length} problem(s)`); process.exit(1); }
  console.log('\nM27 SMOKE PASSED');
}

main().catch((e) => { console.error('M27 SMOKE FAILED:', e.message); process.exit(1); });
