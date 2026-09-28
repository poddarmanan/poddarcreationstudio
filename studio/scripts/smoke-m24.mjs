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

  // Medium quality, as the colour smoke: what this measures is not the tier, and a software
  // renderer at the high tier draws a supplied model at a frame a second.
  await page.goto(`${BASE}/?quality=medium`, { waitUntil: 'networkidle' });
  // Fabrics open from the Showroom: its first room, the hall, hangs all eleven rolls in
  // catalogue order, and clicking one unrolls it into the lab.
  await page.getByRole('button', { name: /^Showroom$/i }).first().click();
  await page.waitForTimeout(900);
  await page.locator('[class*="pc-hv-lift-14"]').first().click({ force: true });
  await page.waitForSelector('[data-stage="canvas"]', { timeout: 20_000 });
  ok('the lab opened onto a live canvas');
  // The lab opens with the wind on; the tests below want a still cloth, and the wind check
  // turns it back on itself.
  await setWind(page, false);
  // On the roll from here: every check below is about the cloth and the light, not the cut, and
  // the roll is a few thousand triangles where a supplied model is a few hundred thousand — the
  // difference between a frame and a stall on a software renderer.
  await pick(page, 'Roll');
  // A change of cut is a staged transition: the loader holds for at least a second and a half and
  // the new cut then fades in over another second. Measure the roll once it is fully on.
  await page.waitForTimeout(5500);

  const before = await signature(page);

  // ---- The lighting rail must change the light ----------------------------------------
  // Not a cosmetic claim: a wholesale buyer's first question about a dyed fabric is what it
  // does under their shop's lights, and a rail that does not change the render lies to them.
  await setLight(page, 'Golden Hour');
  const golden = await signature(page);
  if (distance(before, golden) < 3) bad(`golden hour barely changed the render (Δ${distance(before, golden).toFixed(1)})`);
  else ok(`the lighting rail changes the light (Δ${distance(before, golden).toFixed(1)})`);

  // Warmth has to be judged against another rig, not in absolute terms: the cloth's own dye
  // dominates the average, and a purple shade is blue-heavy under any light.
  const beforeWarmth = warmth(before);
  const goldenWarmth = warmth(golden);
  if (goldenWarmth <= beforeWarmth) bad(`golden hour is not warmer than studio (${goldenWarmth.toFixed(3)} vs ${beforeWarmth.toFixed(3)})`);
  else ok(`golden hour renders warmer than studio (${goldenWarmth.toFixed(3)} vs ${beforeWarmth.toFixed(3)})`);

  await setLight(page, 'Boutique');
  const boutique = await signature(page);
  if (boutique.r + boutique.g + boutique.b >= golden.r + golden.g + golden.b) {
    bad('boutique lighting should be darker than golden hour — it is a dark surround with tight spots');
  } else ok('boutique renders darker than golden hour');

  await setLight(page, 'Studio');
  await page.waitForTimeout(500);

  // ---- The tests must do something ------------------------------------------------------
  // The turntable rocks the cloth whenever it is left alone, and that rock moves more pixels
  // than a test adds on top of it. A held pointer stops the turntable dead (hold-and-release
  // is how a buyer stops it), so the stretch and the wind are measured with the stage held.
  const canvas = page.locator('[data-stage] canvas').first();
  const hold = async () => {
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
  };
  const release = async () => page.mouse.up();
  // A few held frames give the cloth's own residual motion (the folds drift, the bolt turns),
  // averaged, because it breathes; the test has to add clearly to it.
  const stillPair = async (pairs = 2) => {
    let last = await frame(page);
    let noise = 0;
    for (let i = 0; i < pairs; i++) {
      const next = await frame(page);
      const c = changedFraction(last, next);
      if (process.env.DEBUG) console.log(`      pair ${i}: ${(c * 100).toFixed(1)}%`);
      noise += c / pairs;
      last = next;
    }
    return { last, noise };
  };

  // The stretch test is the roll's: a length of cloth can be pulled, a made-up garment cannot.
  await hold();
  const restStill = await stillPair();
  await page.getByRole('button', { name: /^Stretch$/i }).first().evaluate((el) => el.click());
  await page.waitForTimeout(3000); // the pull eases in rather than snapping
  const pulledFrame = await frame(page);
  const stretched = changedFraction(restStill.last, pulledFrame);
  if (stretched < restStill.noise * 1.5 || stretched < restStill.noise + 0.02) bad(`the stretch test did not change the cloth (${(stretched * 100).toFixed(1)}% of pixels changed vs ${(restStill.noise * 100).toFixed(1)}% at rest)`);
  else ok(`stretch pulls the cloth taut (${(stretched * 100).toFixed(1)}% of pixels changed vs ${(restStill.noise * 100).toFixed(1)}% at rest)`);
  await page.getByRole('button', { name: /^Stretch$/i }).first().evaluate((el) => el.click());
  await release();
  await page.waitForTimeout(1200);

  // Compared against a fresh still reading, over the sweep's period, so neither the rock nor
  // the moment the light happens to be at the edge of its travel decides the answer.
  const shineButton = page.getByRole('button', { name: /^Shine$/i }).first();
  const states = async (label) => {
    if (!process.env.DEBUG) return;
    const st = await page.getByRole('button', { name: /^Stretch$/i }).first().getAttribute('aria-pressed');
    const sh = await shineButton.getAttribute('aria-pressed');
    const w = await page.getByRole('button', { name: /^Wind$/i }).first().getAttribute('title');
    console.log(`      [${label}] stretch=${st} shine=${sh} ${w}`);
  };
  await states('before shine');
  const unlit = await signatureOver(page);
  await shineButton.evaluate((el) => el.click());
  await page.waitForTimeout(900);
  await states('shine on');
  const shine = await signatureOver(page);
  const gain = shine.r + shine.g + shine.b - (unlit.r + unlit.g + unlit.b);
  if (gain <= 0) {
    bad(`the shine test should put more light on the cloth, not less (${gain.toFixed(1)})`);
  } else ok(`shine walks a light across the cloth (+${gain.toFixed(1)})`);
  await shineButton.evaluate((el) => el.click());
  // A sweeping light left on would be read as wind by the next check; make sure it is off.
  if ((await shineButton.getAttribute('aria-pressed')) === 'true') await shineButton.evaluate((el) => el.click());
  await page.waitForTimeout(1500);
  await states('before wind');

  // ---- Wind ------------------------------------------------------------------------------
  // On the roll, held still. The wind sways the hanging length sideways, which moves the
  // cloth's silhouette; the folds' own drift moves shading but not the silhouette, and under a
  // software renderer frames are seconds apart, so shading is the wrong thing to count. The
  // reading is the horizontal centre of the cloth over its lower rows, frame to frame.
  const centreOf = (png) => {
    const { width, height, channels, data } = png;
    let sum = 0;
    let rows = 0;
    for (let y = Math.floor(height * 0.6); y < Math.floor(height * 0.9); y += 2) {
      let left = -1;
      let right = -1;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * channels;
        // Cloth is darker than the backdrop for every shade the lab opens on.
        if (data[o] + data[o + 1] + data[o + 2] < 560) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (right - left > 20) {
        sum += (left + right) / 2;
        rows++;
      }
    }
    return rows ? sum / rows : NaN;
  };
  const spread = async (frames) => {
    const centres = [];
    for (let i = 0; i < frames; i++) centres.push(centreOf(await frame(page)));
    const mean = centres.reduce((a, b) => a + b, 0) / centres.length;
    if (process.env.DEBUG) console.log(`      centres: ${centres.map((c) => c.toFixed(1)).join(' ')}`);
    return Math.max(...centres.map((c) => Math.abs(c - mean)));
  };
  await hold();
  const stillSpread = await spread(4);
  await setWind(page, true);
  // The wind is a swell on a damped cloth, not a switch on its position: give it a moment.
  await page.waitForTimeout(2000);
  const windSpread = await spread(5);
  await release();
  // Strong wind has to swing the lower cloth by pixels the still cloth does not move.
  if (!(windSpread >= 4 && windSpread >= stillSpread * 3)) bad(`the wind rail did not move the cloth (lower cloth swings ±${windSpread.toFixed(1)}px vs ±${stillSpread.toFixed(1)}px at rest)`);
  else ok(`the wind rail moves the cloth (lower cloth swings ±${windSpread.toFixed(1)}px vs ±${stillSpread.toFixed(1)}px at rest)`);

  // ---- Every quality renders as itself ----------------------------------------------------
  // The failure mode that looks fine is a viewer that shows the same cloth whatever you open.
  const seen = [];
  for (const shade of ['Surkh', 'Firozi', 'Koyla']) {
    const chip = page.getByRole('button', { name: new RegExp(`^${shade}$`, 'i') }).filter({ visible: true }).first();
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
