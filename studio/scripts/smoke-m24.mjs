import { chromium } from 'playwright-core';
import { decodePng, meanColour, colourDistance, warmth } from './lib/png.mjs';

/**
 * M24 — the Fabric Lab, verified through the controls a buyer actually uses.
 *
 *   node scripts/smoke-m24.mjs [baseUrl]
 *
 * Every one of these tests is a claim about what the cloth *does*, and every one of them is
 * invisible to a type checker: does pressing Stretch change the geometry, does the lighting
 * rail change the pixels, does the wind rail move anything. So this drives the real controls
 * in a real browser and compares what came out of the framebuffer.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { problems.push(m); console.error(`  ✗ ${m}`); };

/** Mean colour of the canvas, from decoded pixels — never from the encoded PNG's bytes. */
async function signature(page) {
  await page.waitForTimeout(700);
  const shot = await page.locator('[data-stage] canvas').first().screenshot();
  return meanColour(decodePng(shot));
}

const distance = colourDistance;

/**
 * Mean colour averaged over a few moments. The shine sweep crosses the cloth on a 2.4s period
 * and the turntable rocks, so one frame carries the phase of both; three frames spread over the
 * period take most of that out.
 */
async function signatureOver(page, samples = 3, gapMs = 800) {
  const acc = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < samples; i++) {
    if (i) await page.waitForTimeout(gapMs);
    const s = await signature(page);
    acc.r += s.r / samples;
    acc.g += s.g / samples;
    acc.b += s.b / samples;
  }
  return acc;
}

/** A decoded frame of the stage, for pixel-level comparison. */
async function frame(page) {
  await page.waitForTimeout(700);
  return decodePng(await page.locator('[data-stage] canvas').first().screenshot());
}

/**
 * Fraction of pixels that changed between two frames of the same size.
 *
 * Movement is asked about here, and a mean colour is a poor witness to movement: cloth that
 * flutters brightens some folds and darkens others and leaves the mean where it was — which is
 * how a garment visibly rippling in a strong wind once measured as Δ0.5 and "did not move".
 * Counting changed pixels sees any motion; the caller compares it against two still frames so
 * the idle rock and the folds' own drift are not mistaken for wind.
 */
function changedFraction(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const o = i * a.channels;
    const p = i * b.channels;
    const d = Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
    if (d > 20) changed += 1;
  }
  return changed / n;
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
  ok('the lab opened onto a live canvas');

  const before = await signature(page);

  // ---- The lighting rail must change the light ----------------------------------------
  // Not a cosmetic claim: a wholesale buyer's first question about a dyed fabric is what it
  // does under their shop's lights, and a rail that does not change the render lies to them.
  await page.getByRole('button', { name: /^Golden Hour$/i }).first().click();
  const golden = await signature(page);
  if (distance(before, golden) < 3) bad(`golden hour barely changed the render (Δ${distance(before, golden).toFixed(1)})`);
  else ok(`the lighting rail changes the light (Δ${distance(before, golden).toFixed(1)})`);

  // Warmth has to be judged against another rig, not in absolute terms: the cloth's own dye
  // dominates the average, and a purple shade is blue-heavy under any light.
  const beforeWarmth = warmth(before);
  const goldenWarmth = warmth(golden);
  if (goldenWarmth <= beforeWarmth) bad(`golden hour is not warmer than studio (${goldenWarmth.toFixed(3)} vs ${beforeWarmth.toFixed(3)})`);
  else ok(`golden hour renders warmer than studio (${goldenWarmth.toFixed(3)} vs ${beforeWarmth.toFixed(3)})`);

  await page.getByRole('button', { name: /^Boutique$/i }).first().click();
  const boutique = await signature(page);
  if (boutique.r + boutique.g + boutique.b >= golden.r + golden.g + golden.b) {
    bad('boutique lighting should be darker than golden hour — it is a dark surround with tight spots');
  } else ok('boutique renders darker than golden hour');

  await page.getByRole('button', { name: /^Studio$/i }).first().click();
  await page.waitForTimeout(500);

  // ---- The tests must do something ------------------------------------------------------
  const rest = await signature(page);
  await page.getByRole('button', { name: /^Stretch$/i }).first().click();
  await page.waitForTimeout(1400); // the pull eases in rather than snapping
  const pulled = await signature(page);
  if (distance(rest, pulled) < 1.5) bad(`the stretch test did not change the cloth (Δ${distance(rest, pulled).toFixed(1)})`);
  else ok(`stretch pulls the cloth taut (Δ${distance(rest, pulled).toFixed(1)})`);
  await page.getByRole('button', { name: /^Stretch$/i }).first().click();
  await page.waitForTimeout(1200);

  // Compared against a fresh still reading, over the sweep's period, so neither the rock nor
  // the moment the light happens to be at the edge of its travel decides the answer.
  const unlit = await signatureOver(page);
  await page.getByRole('button', { name: /^Shine$/i }).first().click();
  await page.waitForTimeout(900);
  const shine = await signatureOver(page);
  const gain = shine.r + shine.g + shine.b - (unlit.r + unlit.g + unlit.b);
  if (gain <= 0) {
    bad(`the shine test should put more light on the cloth, not less (${gain.toFixed(1)})`);
  } else ok(`shine walks a light across the cloth (+${gain.toFixed(1)})`);
  await page.getByRole('button', { name: /^Shine$/i }).first().click();

  // ---- Wind ------------------------------------------------------------------------------
  // Two still frames first, so the cloth's own idle motion is measured rather than assumed.
  const stillA = await frame(page);
  const stillB = await frame(page);
  const baseline = changedFraction(stillA, stillB);
  await page.getByRole('button', { name: /^Strong$/i }).first().click();
  const windy = await frame(page);
  const moved = changedFraction(stillB, windy);
  // Strong wind has to add at least two fifths again to the cloth's own idle motion — the rock
  // and the folds' drift are not nothing — and at least a full point of the frame.
  if (moved < baseline * 1.4 || moved < baseline + 0.01) bad(`the wind rail did not move the cloth (${(moved * 100).toFixed(1)}% of pixels changed vs ${(baseline * 100).toFixed(1)}% at rest)`);
  else ok(`the wind rail moves the cloth (${(moved * 100).toFixed(1)}% of pixels changed vs ${(baseline * 100).toFixed(1)}% at rest)`);

  // ---- Every quality renders as itself ----------------------------------------------------
  // The failure mode that looks fine is a viewer that shows the same cloth whatever you open.
  const seen = [];
  for (const shade of ['Surkh', 'Firozi', 'Koyla']) {
    const chip = page.getByRole('button', { name: new RegExp(`^${shade}$`, 'i') }).first();
    if (!(await chip.count())) continue;
    await chip.click();
    seen.push(await signature(page));
  }
  if (seen.length >= 2) {
    const spread = Math.min(...seen.slice(1).map((s, i) => distance(seen[i], s)));
    if (spread < 8) bad(`switching shade barely changed the render (min Δ${spread.toFixed(1)}) — the viewer may be ignoring the colour`);
    else ok(`each shade renders as its own colour (min Δ${spread.toFixed(1)})`);
  }

  await browser.close();

  if (problems.length) {
    console.error(`\nM24 SMOKE FAILED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('\nM24 SMOKE PASSED');
}

main().catch((e) => { console.error('M24 SMOKE FAILED:', e.message); process.exit(1); });
