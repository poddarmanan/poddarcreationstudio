import 'dotenv/config';
import assert from 'node:assert';
import { FABRIC_DEFS, generateColours } from '../src/lib/fabric-generator';
import { oklchToHex, shadeDistance } from '../src/lib/three/colour';
import { RIG_LIGHT } from '../src/lib/three/rig-light';
import { metamerism, shadeUnderLight, shiftVerdict } from '../src/lib/three/metamerism';

/**
 * M26 — the Lighting Studio.
 *
 * The metamerism readout is a number a buyer may act on, so it has to be right across the whole
 * catalogue rather than plausible on one shade. Pure, so it covers all 264 of them.
 */
async function main() {
  const rigs = Object.keys(RIG_LIGHT) as (keyof typeof RIG_LIGHT)[];
  assert(rigs.length === 5, `expected the studio's five lighting conditions, got ${rigs.length}`);

  // ---- Every rig produces a real colour for every shade ---------------------------------
  let readings = 0;
  for (const fabric of FABRIC_DEFS) {
    for (const colour of generateColours(fabric)) {
      const albedo = oklchToHex(colour.l, colour.c, colour.h);
      for (const rig of rigs) {
        const hex = shadeUnderLight(albedo, RIG_LIGHT[rig]);
        assert(/^#[0-9a-f]{6}$/i.test(hex), `${fabric.id}/${colour.name} under ${rig}: "${hex}"`);
        readings += 1;
      }
    }
  }
  console.log(`${readings.toLocaleString()} shade/light readings, all valid colours ✓`);

  // ---- Warm light warms, cool light cools -------------------------------------------------
  // If the rigs do not differ, the whole feature is decoration.
  const grey = '#808080';
  const golden = shadeUnderLight(grey, RIG_LIGHT.golden);
  const daylight = shadeUnderLight(grey, RIG_LIGHT.daylight);
  const neutral = shadeUnderLight(grey, RIG_LIGHT.white);
  const red = (h: string) => parseInt(h.slice(1, 3), 16);
  const blue = (h: string) => parseInt(h.slice(5, 7), 16);

  assert(red(golden) - blue(golden) > red(neutral) - blue(neutral), `golden hour must run warmer than a white cyc (${golden} vs ${neutral})`);
  assert(blue(daylight) - red(daylight) > blue(golden) - red(golden), `daylight must run cooler than golden hour (${daylight} vs ${golden})`);
  console.log(`the rigs genuinely differ (golden ${golden}, daylight ${daylight}, neutral ${neutral}) ✓`);

  // A boutique's dark surround must render a shade darker than a studio box.
  const boutique = shadeUnderLight(grey, RIG_LIGHT.boutique);
  const studio = shadeUnderLight(grey, RIG_LIGHT.studio);
  const luma = (h: string) => red(h) * 0.2126 + parseInt(h.slice(3, 5), 16) * 0.7152 + blue(h) * 0.0722;
  assert(luma(boutique) < luma(studio), `boutique should be darker than a studio box (${boutique} vs ${studio})`);
  console.log('boutique renders darker than a studio box ✓');

  // ---- The reading is anchored to neutral -------------------------------------------------
  const { readings: r, worst } = metamerism('#B03A48');
  const white = r.find((x) => x.light === 'white')!;
  assert(white.shiftFromNeutral < 0.001, `the neutral cyc must be its own reference, got ${white.shiftFromNeutral}`);
  assert(worst > 0, 'at least one light must move the shade, or the readout says nothing');
  assert(worst === Math.max(...r.map((x) => x.shiftFromNeutral)), 'the worst figure must be the worst reading');
  console.log(`a mid red shifts ${worst.toFixed(1)} at worst — "${shiftVerdict(worst)}" ✓`);

  // ---- The reading scales with how far the light is from neutral -----------------------------
  //
  // This is the claim the model can actually support, and it is worth stating what it cannot.
  // Real metamerism is spectral: two dyes with different reflectance curves match under one
  // illuminant and not another. This catalogue records no spectral data, so the readout is a
  // chromatic-adaptation figure — how far each rig pushes a *given* shade — not a prediction
  // that two lots will disagree. An earlier version of this test asserted that saturated dyes
  // shift more than neutrals, which is true of real dyes and false of this model; the
  // assertion was wrong, not the code.
  const albedo = oklchToHex(0.55, 0.14, 25);
  const shiftFor = (rig: keyof typeof RIG_LIGHT) => shadeDistance(shadeUnderLight(albedo, RIG_LIGHT[rig]), shadeUnderLight(albedo, RIG_LIGHT.white));
  const fromNeutral = (rig: keyof typeof RIG_LIGHT) => shadeDistance(RIG_LIGHT[rig].key.colour, '#ffffff');

  assert(shiftFor('golden') > shiftFor('studio'), 'a strongly tinted key must move a shade further than a white one');
  assert(fromNeutral('golden') > fromNeutral('studio'), 'the golden key really is further from white');
  assert(shiftFor('white') < 0.001, 'the neutral cyc cannot shift a shade away from itself');
  console.log(`shift tracks how tinted the key is (golden ${shiftFor('golden').toFixed(1)}, studio ${shiftFor('studio').toFixed(1)}) ✓`);

  // ---- Verdicts are ordered ------------------------------------------------------------------
  assert(shiftVerdict(0.5) === 'steady' && shiftVerdict(3) === 'noticeable' && shiftVerdict(9) === 'strong', 'verdict thresholds');
  assert(shadeDistance('#ffffff', '#ffffff') === 0, 'a colour does not differ from itself');
  assert(shadeDistance('#000000', '#ffffff') > 90, 'black and white are far apart');
  console.log('verdicts and distances are ordered ✓');

  // ---- Determinism ----------------------------------------------------------------------------
  assert.deepStrictEqual(metamerism('#3C6E8F'), metamerism('#3C6E8F'), 'the readout must be stable');
  console.log('deterministic ✓');

  console.log('\nM26 SMOKE PASSED');
}

main().catch((e) => { console.error('M26 SMOKE FAILED:', e); process.exit(1); });
