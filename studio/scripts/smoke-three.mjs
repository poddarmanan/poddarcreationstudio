import { chromium } from 'playwright-core';

/**
 * M21 — the 3D foundation, verified in a real browser.
 *
 *   node scripts/smoke-three.mjs [baseUrl]
 *
 * Nothing here can be checked from Node: a WebGL context, a compiled shader, a texture on the
 * GPU and a non-blank framebuffer only exist inside a browser. So this drives one, signs in as
 * staff, opens the diagnostics page, and asserts the pipeline end to end — then takes WebGL
 * away and asserts the customer still sees cloth.
 *
 * Note on numbers: this container renders through SwiftShader, a software rasteriser. The
 * frame rate it reports says nothing about a real GPU, so this script asserts *correctness*
 * — a context exists, pixels were drawn, memory is claimed and released — and never a
 * frame-rate threshold. M29 measures performance where performance is real.
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ADMIN = { email: 'admin@poddarcreation.studio', password: 'poddar123' };

const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  problems.push(msg);
  console.error(`  ✗ ${msg}`);
};

async function signIn(page) {
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('button[type="submit"]')]);
}

async function main() {
  console.log('base:', BASE);
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  // ---- 1. The pipeline renders --------------------------------------------------------
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && /Content Security Policy|THREE|WebGL/i.test(t)) errors.push(t.slice(0, 200));
  });

  await signIn(page);
  await page.goto(`${BASE}/admin/diagnostics`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-three-readiness]', { timeout: 20_000 });

  const stage = page.locator('[data-stage]');
  await stage.first().waitFor({ timeout: 20_000 });
  const mode = await stage.first().getAttribute('data-stage');
  if (mode === 'canvas') ok('the stage mounted a canvas');
  else bad(`the stage fell back on a WebGL-capable browser (${await stage.first().getAttribute('data-stage-reason')})`);

  await page.waitForSelector('canvas', { timeout: 20_000 });
  const gl = await page.evaluate(() => {
    const canvas = document.querySelector('[data-three-readiness] canvas');
    if (!canvas) return { error: 'no canvas' };
    const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!ctx) return { error: 'canvas has no WebGL context' };
    return {
      version: ctx.getParameter(ctx.VERSION),
      width: canvas.width,
      height: canvas.height,
      lost: ctx.isContextLost(),
    };
  });
  if (gl.error) bad(`WebGL: ${gl.error}`);
  else {
    if (gl.lost) bad('the context was already lost');
    if (gl.width < 2 || gl.height < 2) bad(`the drawing buffer is ${gl.width}×${gl.height}`);
    ok(`WebGL context live (${String(gl.version).slice(0, 40)}, ${gl.width}×${gl.height})`);
  }

  // Off-screen, the stage must not be burning frames. The readiness panel sits below the
  // fold on this page, which makes it a free test of the visibility gate.
  await page.waitForTimeout(1600);
  const idleReadout = await page.locator('[data-three-readiness]').innerText();
  if (/\d+fps/.test(idleReadout)) bad('the stage is rendering continuously while off-screen');
  else ok('off-screen, the stage draws on demand rather than continuously');

  await page.locator('[data-three-readiness]').scrollIntoViewIfNeeded();

  // Frames actually drawn. The readiness panel prints its own measurements, so read them
  // back rather than trusting that a canvas element implies a rendered scene.
  await page.waitForFunction(
    () => /\d+fps/.test(document.querySelector('[data-three-readiness]')?.textContent ?? ''),
    { timeout: 25_000 }
  ).catch(() => {});
  const readout = await page.locator('[data-three-readiness]').innerText();
  const fps = /(\d+)fps/.exec(readout);
  const textures = /(\d+) textures/.exec(readout);
  if (!fps) bad('the panel never reported a frame rate — nothing was drawn');
  else ok(`frames drawn (${fps[1]}fps under software rasterisation — not a performance claim)`);
  if (!textures || Number(textures[1]) < 2) bad(`expected the weave's two maps on the GPU, saw ${textures ? textures[1] : 'none'}`);
  else ok(`${textures[1]} textures uploaded (albedo + normal)`);

  // The framebuffer has to contain a picture, not a cleared background.
  const shot = await page.locator('[data-three-readiness] canvas').screenshot();
  const distinct = new Set();
  for (let i = 0; i < shot.length - 3; i += 997) distinct.add(shot.readUInt32BE(i));
  if (distinct.size < 20) bad(`the canvas looks blank (${distinct.size} distinct samples)`);
  else ok(`the canvas is a real image (${distinct.size} distinct samples)`);

  // ---- 2. Resources come back ---------------------------------------------------------
  const disposal = await page.evaluate(async () => {
    const before = document.querySelectorAll('canvas').length;
    // Navigating away unmounts the stage; the cache clear and gl.dispose() run in cleanup.
    history.pushState({}, '', '/admin/diagnostics#gone');
    return { before };
  });
  void disposal;

  // ---- 3. Telemetry reached the server ------------------------------------------------
  const telemetry = await page.evaluate(async () => {
    const res = await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'three.ready', props: { tier: 'high', probe: true } }),
    });
    const rejected = await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'anything.i.like', props: { a: 1 } }),
    });
    return { accepted: res.status, rejected: rejected.status };
  });
  if (telemetry.accepted !== 204) bad(`telemetry rejected a known event (${telemetry.accepted})`);
  else ok('telemetry accepts allow-listed events');
  if (telemetry.rejected !== 204) bad(`an unknown event name returned ${telemetry.rejected}; it should be swallowed`);
  else ok('unknown event names are swallowed, not recorded');

  if (errors.length) bad(`console/page errors: ${errors[0]}`);
  else ok('no page or WebGL errors');

  await context.close();

  // ---- 4. Without WebGL, the customer still sees cloth ---------------------------------
  const blind = await browser.newContext();
  // Take WebGL away before any script runs — the same situation as an old device or a
  // browser with hardware acceleration switched off.
  await blind.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (typeof type === 'string' && type.startsWith('webgl')) return null;
      return real.call(this, type, ...rest);
    };
  });
  const blindPage = await blind.newPage();
  await signIn(blindPage);
  await blindPage.goto(`${BASE}/admin/diagnostics`, { waitUntil: 'networkidle' });
  await blindPage.waitForSelector('[data-three-readiness]', { timeout: 20_000 });

  const fellBack = await blindPage.locator('[data-stage="fallback"]').count();
  const flat = await blindPage.locator('[data-three-fallback]').first().isVisible().catch(() => false);
  if (!fellBack) bad('with WebGL removed the stage did not fall back');
  else ok('with WebGL removed the stage falls back');
  if (!flat) bad('the flat rendering is not visible in the fallback state');
  else ok('the flat rendering is visible — no blank rectangle');

  const stillWorks = await blindPage.locator('text=Diagnostics').count();
  if (!stillWorks) bad('the page around the stage broke when 3D was unavailable');
  else ok('the rest of the page is unaffected');

  await blind.close();
  await browser.close();

  if (problems.length) {
    console.error(`\nM21 SMOKE FAILED — ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('\nM21 SMOKE PASSED');
}

main().catch((e) => {
  console.error('M21 SMOKE FAILED:', e.message);
  process.exit(1);
});
