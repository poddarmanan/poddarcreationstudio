import { chromium } from 'playwright-core';
import { decodePng } from './lib/png.mjs';

/**
 * M43 — colour fidelity: the cloth on the stage is the colour of the swatch beside it.
 *
 * The complaint this guards against was exact: "the colours look not what it's shown on the
 * colour shade". The causes were a film tone curve, a near-white sheen laid over every dye and a
 * room lit about half a stop too bright, and each of them moved the render away from the sRGB
 * value the chip is painted in. Under the white cyc — the rig with no lighting opinion — and
 * with the wind off, the middle of the hanging panel is compared with the chip for four shades
 * across the gamut: a teal, a red, a yellow and an off-white.
 *
 * A folded cloth is never a flat swatch (highlights and shadows pull both ways), so the bound is
 * generous; what it forbids is the systematic drift that was there.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = '/opt/pw-browsers/chromium';
const SHADES = ['Peacock', 'Surkh', 'Haldi', 'Kapaas'];
const MAX_DISTANCE = 40;

const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };



/** The light is a menu on the stage: the "Light" button opens it, a named button picks. */
async function setLight(page, name) {
  await page.getByRole('button', { name: /^Light$/i }).first().evaluate((el) => el.click());
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first().evaluate((el) => el.click());
  await page.waitForTimeout(400);
}

/** The wind is a toggle on the stage: a "Wind" button that opens into On and Off. */
async function setWind(page, on) {
  await page.getByRole('button', { name: /^Wind$/i }).first().evaluate((el) => el.click());
  await page.getByRole('button', { name: on ? /^On$/i : /^Off$/i }).first().evaluate((el) => el.click());
  await page.waitForTimeout(400);
}


/** Cuts are chosen through the picker on the stage: the "Garment" button opens it, a chip picks. */
async function pick(page, name) {
  await page.getByRole('button', { name: /^Garment$/i }).first().evaluate((el) => el.click());
  await page.waitForTimeout(500);
  const chip = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (!(await chip.count())) return false;
  await chip.evaluate((el) => el.click());
  await page.waitForTimeout(400);
  return true;
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/?quality=medium`, { waitUntil: 'networkidle' });
  // Fabrics open from the Showroom: its first room, the hall, hangs all eleven rolls in
  // catalogue order, and clicking one unrolls it into the lab.
  await page.getByRole('button', { name: /^Showroom$/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('[class*="pc-hv-lift-14"]').first().click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });
  await pick(page, 'Roll');
  await setLight(page, 'White Cyc');
  await setWind(page, false);
  // The loader holds at least a second and a half on a change of cut, and the cut fades in after.
  await page.waitForTimeout(5500);
  ok('the lab opened on the hanging panel under the white cyc');

  for (const shade of SHADES) {
    const chip = page.getByRole('button', { name: new RegExp(`^${shade}$`, 'i') }).filter({ visible: true }).first();
    if (!(await chip.count())) { console.log(`  – ${shade} (not in this quality)`); continue; }
    // The chip is painted in oklch(); a 2D canvas converts it to the sRGB bytes a screenshot has.
    const chipRgb = await chip.evaluate((el) => {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const ctx = c.getContext('2d'); ctx.fillStyle = getComputedStyle(el).backgroundColor; ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
    await chip.evaluate((el) => el.click());
    await page.waitForTimeout(3000);
    const png = decodePng(await page.locator('[data-stage] canvas').first().screenshot());
    const cx = Math.floor(png.width / 2), cy = Math.floor(png.height / 2);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy - 100; y < cy + 100; y += 2) for (let x = cx - 30; x < cx + 30; x += 2) { const o = (y * png.width + x) * png.channels; r += png.data[o]; g += png.data[o + 1]; b += png.data[o + 2]; n++; }
    const cloth = [r / n, g / n, b / n].map(Math.round);
    const distance = Math.hypot(cloth[0] - chipRgb[0], cloth[1] - chipRgb[1], cloth[2] - chipRgb[2]);
    if (distance > MAX_DISTANCE) bad(`${shade}: cloth rgb(${cloth}) is Δ${distance.toFixed(0)} from its chip rgb(${chipRgb})`);
    else ok(`${shade}: cloth rgb(${cloth}) vs chip rgb(${chipRgb}) — Δ${distance.toFixed(0)}`);
  }

  await browser.close();
  if (problems.length) { console.log(`\nM43 SMOKE FAILED — ${problems.length} problem(s)`); process.exit(1); }
  console.log('\nM43 SMOKE PASSED');
}

main().catch((err) => { console.error('M43 SMOKE FAILED:', err); process.exit(1); });
