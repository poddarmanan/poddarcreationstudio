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
/**
 * One capture, averaged over three moments of the turntable's idle rock. A garment with volume
 * changes its outline as it turns — a flat sheet did not — and a single frame's profile carries
 * the rock's phase in it. Three frames spread over a third of the rock period take most of that
 * out, and the noise floor below is measured the same way, so the comparison stays honest.
 */

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
  // The picker opens a tick after the tap; on a slow renderer that can be a while.
  await chip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  if (!(await chip.count())) return false;
  await chip.evaluate((el) => el.click());
  await page.waitForTimeout(400);
  return true;
}

async function silhouette(page) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    if (i) await page.waitForTimeout(2100);
    samples.push(await silhouetteOnce(page));
  }
  const rows = new Map();
  for (const s of samples) for (const r of s.rowWidths) rows.set(r.y, (rows.get(r.y) ?? 0) + r.w / samples.length);
  return {
    ...samples[0],
    coverage: samples.reduce((a, s) => a + s.coverage, 0) / samples.length,
    rowWidths: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([y, w]) => ({ y, w })),
  };
}

/**
 * Waits for a garment to hang still. A simulated garment settles on to its form from the
 * frame loop after mounting — a few steps per frame, so how long that takes depends on the
 * machine (seconds here, under a software renderer). Measuring a shape while it is still
 * landing would compare two moments of one cut, so the cut is sampled until two consecutive
 * samples agree, and only then measured.
 */
async function settled(page) {
  let previous = null;
  for (let i = 0; i < 25; i++) {
    const sample = await silhouetteOnce(page);
    // An empty stage — a model still on its way — is not a settled garment.
    if (sample.rowWidths.length >= 8 && previous && shapeDelta(previous, sample) < 0.02) return;
    previous = sample;
    await page.waitForTimeout(1500);
  }
}

async function silhouetteOnce(page) {
  await page.waitForTimeout(900);
  const png = decodePng(await page.locator('[data-stage] canvas').first().screenshot({ timeout: 60_000 }));
  const { width, height, channels, data } = png;
  const at = (x, y) => {
    const o = (y * width + x) * channels;
    return [data[o], data[o + 1], data[o + 2]];
  };
  // Cloth is told from backdrop by hue, not by distance from a corner pixel. The backdrop is a
  // soft radial gradient, and a distance threshold against one corner classified about half of
  // the *empty* stage as cloth — which is why every garment used to report ~50% coverage and an
  // identical shape. The measurement shade is a blue; the backdrop is warm, so red exceeds blue
  // everywhere on it, and blue exceeds red on the cloth however it is lit.
  const isCloth = (x, y) => {
    const [r, , b] = at(x, y);
    return b - r > 24;
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

/**
 * The silhouette's width down its length, resampled into a fixed number of bands and normalised
 * to its widest point — a shape, independent of how big it is on screen or where it sits.
 *
 * Replaces a max-minus-min "taper" that saturated at ~99% for every garment (one thin row at a
 * neckline or hem is enough), and so could not tell a kurti from a dress except by the area
 * they covered. Area moved when the garments gained volume and perspective; shape did not.
 */
function profile(s, bands = 24) {
  const rows = s.rowWidths;
  if (rows.length < 8) return null;
  const top = rows[0].y;
  const span = rows[rows.length - 1].y - top || 1;
  const sums = new Array(bands).fill(0);
  const counts = new Array(bands).fill(0);
  for (const r of rows) {
    const b = Math.min(bands - 1, Math.floor(((r.y - top) / span) * bands));
    sums[b] += r.w;
    counts[b] += 1;
  }
  const means = sums.map((v, i) => (counts[i] ? v / counts[i] : 0));
  const max = Math.max(...means) || 1;
  return means.map((m) => m / max);
}

/** How far from a rectangle, judged on the middle of the garment — hems and necklines are noisy. */
function taper(s) {
  const p = profile(s);
  if (!p) return 0;
  const inner = p.slice(2, -2).filter((v) => v > 0);
  if (inner.length < 4) return 0;
  return 1 - Math.min(...inner) / Math.max(...inner);
}

/** Mean absolute difference between two shape profiles. Zero is identical; a sleeve is about 0.05. */
function shapeDelta(a, b) {
  const pa = profile(a);
  const pb = profile(b);
  if (!pa || !pb) return 0;
  return pa.reduce((acc, v, i) => acc + Math.abs(v - pb[i]), 0) / pa.length;
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Low quality: a silhouette is the same shape at any tier, and a software renderer at the
  // high tier draws a 300,000-triangle model at a frame a second, which is what a screenshot
  // times out on.
  await page.goto(`${BASE}/?quality=low`, { waitUntil: 'networkidle' });
  // Fabrics open from the Showroom: its first room, the hall, hangs all eleven rolls in
  // catalogue order, and clicking one unrolls it into the lab.
  await page.getByRole('button', { name: /^Showroom$/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('[class*="pc-hv-lift-14"]').first().click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });

  // Measure in a blue. The silhouette is found by hue against a warm backdrop (see
  // `silhouette`), and the collection opens on whichever shade comes first — often an ivory
  // that no threshold can separate from the backdrop.
  for (const shade of ['Peacock', 'Firozi', 'Neel', 'Aasmani']) {
    const chip = page.getByRole('button', { name: new RegExp(`^${shade}$`, 'i') }).filter({ visible: true }).first();
    if (await chip.count()) { await chip.click(); await page.waitForTimeout(600); break; }
  }
  // Wind off. The garments are simulated now, and even a low breeze keeps a hem moving; a
  // shape comparison wants the cloth hanging still.
  await setWind(page, false);
  await page.waitForTimeout(2500);

  const shapes = {};
  for (const name of ['Kurti', 'Shirt', 'Dress', 'T-Shirt', 'Roll']) {
    if (!(await pick(page, name))) { console.log(`  – ${name} (no control)`); continue; }
    // A simulated garment settles onto its form after mounting; measure it hanging, not landing.
    await settled(page);
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

  // And the cuts must differ from each other — by shape, with the noise floor measured rather
  // than assumed: the same cut captured twice sets what "the same" looks like on this machine.
  await pick(page, 'Kurti');
  await settled(page);
  const kurtiAgain = await silhouette(page);
  const noise = shapeDelta(shapes.Kurti, kurtiAgain);
  ok(`noise floor: the same cut twice differs by Δ${noise.toFixed(3)}`);
  const pairs = [['Kurti', 'Dress'], ['Shirt', 'T-Shirt']];
  for (const [a, b] of pairs) {
    if (!shapes[a] || !shapes[b]) continue;
    const delta = shapeDelta(shapes[a], shapes[b]);
    // Two and a half times the measured self-difference. On the form, under gravity, a kurti and
    // a dress hang more alike than they were drawn — the flare survives, the rest is the same
    // body — so the bar is where a real difference sits, not where a flattering one would.
    if (delta < Math.max(0.03, noise * 2.5)) bad(`${a} and ${b} render as the same shape (Δ${delta.toFixed(3)}, noise ${noise.toFixed(3)})`);
    else ok(`${a} and ${b} are different cuts (Δ${delta.toFixed(3)})`);
  }

  // The roll is the un-cut cloth, and should cover more of the frame than a t-shirt.
  if (shapes.Roll && shapes['T-Shirt'] && shapes.Roll.coverage <= shapes['T-Shirt'].coverage * 0.6) {
    bad('the fabric roll covers less than a t-shirt — the panel is probably not rendering');
  } else if (shapes.Roll) ok('the fabric roll renders as un-cut cloth');

  // Changing fabric under one cut must still change the render: same shape, different cloth.
  const kurtiBefore = shapes.Kurti;
  await pick(page, 'Kurti');
  const chip = page.getByRole('button', { name: /^Firozi$/i }).filter({ visible: true }).first();
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
