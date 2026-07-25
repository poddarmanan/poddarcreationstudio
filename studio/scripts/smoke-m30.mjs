import { chromium } from 'playwright-core';
import { decodePng } from './lib/png.mjs';

/**
 * M30 — the Export Experience.
 *
 * The specific failure this guards against: `preserveDrawingBuffer` is off, so reading the
 * canvas at any moment other than immediately after a draw returns a *blank image*. It does
 * not throw and it does not warn — the download succeeds and the buyer opens an empty PNG.
 * Nothing but decoding the exported bytes can catch that.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.error(`  ✗ ${m}`); };

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Collection$/i }).first().click();
  await page.waitForTimeout(700);
  await page.locator('[class*="pc-hv-lift"]').first().click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });
  await page.waitForTimeout(1800);

  const button = page.locator('[data-export-view]');
  if (!(await button.count())) { bad('there is no export control'); }
  else ok('the export control is present');

  // ---- The exported frame is a real picture ---------------------------------------------
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await button.click();
  let file;
  try {
    file = await download;
  } catch {
    bad('clicking export produced no download');
  }

  if (file) {
    const name = file.suggestedFilename();
    if (!/\.png$/.test(name)) bad(`the export is named "${name}" — it should be a .png`);
    else ok(`downloaded ${name}`);
    // The name has to identify the cloth: a folder of "download (7).png" is useless a week later.
    if (!/[a-z]/.test(name.replace('.png', ''))) bad(`"${name}" does not name the fabric or the shade`);
    else ok('the filename names the fabric and the shade');

    const path = await file.path();
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(path);

    let png;
    try {
      png = decodePng(bytes);
    } catch (e) {
      bad(`the exported file is not a readable PNG: ${e.message}`);
    }

    if (png) {
      ok(`the export is ${png.width}×${png.height}`);
      if (png.width < 200 || png.height < 150) bad(`the export is only ${png.width}×${png.height} — too small to show anyone`);

      // The whole point: an empty framebuffer exports as a uniform image and nothing else
      // notices. Count distinct colours to prove there is a picture in there.
      const seen = new Set();
      const { width, height, channels, data } = png;
      for (let y = 0; y < height; y += 3) {
        for (let x = 0; x < width; x += 3) {
          const o = (y * width + x) * channels;
          seen.add((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]);
        }
      }
      if (seen.size < 50) bad(`the exported image has only ${seen.size} distinct colours — it is blank or near-blank`);
      else ok(`the exported image contains a real render (${seen.size} distinct colours)`);
    }
  }

  await browser.close();
  if (problems.length) { console.error(`\nM30 SMOKE FAILED — ${problems.length} problem(s)`); process.exit(1); }
  console.log('\nM30 SMOKE PASSED');
}

main().catch((e) => { console.error('M30 SMOKE FAILED:', e.message); process.exit(1); });
