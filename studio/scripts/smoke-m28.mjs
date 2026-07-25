import { chromium } from 'playwright-core';
import { decodePng } from './lib/png.mjs';

/**
 * M28 — the Comparison Studio.
 *
 * Two claims, both of which a screenshot would let you believe wrongly: that the fabrics are
 * rendered *together* rather than as separate viewers, and that they are distinguishable from
 * each other once they are.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.error(`  ✗ ${m}`); };

/** Mean colour of a vertical slice of the canvas, ignoring backdrop. */
function sliceColour(png, from, to) {
  const { width, height, channels, data } = png;
  const bg = [data[0], data[1], data[2]];
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = Math.floor(width * from); x < Math.floor(width * to); x++) {
      const o = (y * width + x) * channels;
      if (Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]) < 26) continue;
      r += data[o]; g += data[o + 1]; b += data[o + 2]; n += 1;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n, coverage: n } : null;
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Collection$/i }).first().click();
  await page.waitForTimeout(800);

  // Put three visibly different qualities into the comparison.
  const buttons = page.getByRole('button', { name: /^Compare$/i });
  const count = Math.min(3, await buttons.count());
  for (let i = 0; i < count; i++) await buttons.nth(i).click();
  ok(`selected ${count} qualities`);

  await page.locator('.pc-bottomnav-item[aria-label="Compare"], nav button').filter({ hasText: /Compare/i }).first().click();
  await page.waitForSelector('[data-stage]', { timeout: 20_000 });
  await page.waitForTimeout(2200);

  // ---- One canvas, not one per fabric ----------------------------------------------------
  // Browsers cap simultaneous WebGL contexts and silently kill the oldest past the limit, so a
  // grid of independent viewers fails exactly when enough fabrics are being compared to matter.
  const canvases = await page.locator('[data-stage] canvas').count();
  if (canvases !== 1) bad(`${canvases} canvases on the comparison view — it should be one scene holding every fabric`);
  else ok('one canvas holds every fabric');

  const mode = await page.locator('[data-stage]').first().getAttribute('data-stage');
  if (mode !== 'canvas') bad(`the comparison stage fell back (${mode})`);
  else ok('the comparison stage is live');

  // ---- The fabrics are distinguishable ----------------------------------------------------
  const png = decodePng(await page.locator('[data-stage] canvas').first().screenshot());
  const slices = [sliceColour(png, 0.08, 0.3), sliceColour(png, 0.38, 0.62), sliceColour(png, 0.7, 0.92)].slice(0, count);
  if (slices.some((s) => !s)) {
    bad('at least one slot rendered nothing — fewer panels than fabrics selected');
  } else {
    ok(`${slices.length} panels rendered, coverage ${slices.map((s) => s.coverage).join(' / ')}`);
    let minDelta = Infinity;
    for (let i = 0; i < slices.length; i++) {
      for (let j = i + 1; j < slices.length; j++) {
        const d = Math.abs(slices[i].r - slices[j].r) + Math.abs(slices[i].g - slices[j].g) + Math.abs(slices[i].b - slices[j].b);
        minDelta = Math.min(minDelta, d);
      }
    }
    // Comparing fabrics that render identically is worse than not comparing them: it is a
    // confident, wrong answer.
    if (minDelta < 6) bad(`two panels are near-identical (Δ${minDelta.toFixed(1)}) — the comparison would mislead`);
    else ok(`every panel is distinguishable (min Δ${minDelta.toFixed(1)})`);
  }

  // ---- Removing a fabric removes a panel ---------------------------------------------------
  const remove = page.getByRole('button', { name: '×' }).first();
  if (await remove.count()) {
    await remove.click();
    await page.waitForTimeout(1600);
    const after = decodePng(await page.locator('[data-stage] canvas').first().screenshot());
    const right = sliceColour(after, 0.7, 0.92);
    const before = slices[slices.length - 1];
    if (before && right && Math.abs(right.coverage - before.coverage) < before.coverage * 0.1) {
      bad('removing a fabric did not change the stage');
    } else ok('removing a fabric removes its panel');
  }

  await browser.close();
  if (problems.length) { console.error(`\nM28 SMOKE FAILED — ${problems.length} problem(s)`); process.exit(1); }
  console.log('\nM28 SMOKE PASSED');
}

main().catch((e) => { console.error('M28 SMOKE FAILED:', e.message); process.exit(1); });
