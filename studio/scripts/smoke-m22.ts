import 'dotenv/config';
import assert from 'node:assert';
import { FABRIC_DEFS, generateColours } from '../src/lib/fabric-generator';
import { FABRIC_PRESETS, fabricMaterialSpec, tileRepeat } from '../src/lib/three/fabric-spec';
import { oklchToHex } from '../src/lib/three/colour';

/**
 * M22 — the fabric material framework.
 *
 * Pure, so it runs in a second and covers every quality in the catalogue rather than the one a
 * screenshot happens to show. What it is really testing is that the *framework* holds: a
 * preset per family, the merchant's spec sheet modulating it, and no fabric able to produce a
 * material that is physically wrong however the catalogue is edited.
 */
async function main() {
  const rows = FABRIC_DEFS.map((f) => ({ fabric: f, colours: generateColours(f) }));
  assert(rows.length === 9 && rows.every((r) => r.colours.length === r.fabric.nc), 'the whole catalogue is covered, each quality with its whole shade card');

  // ---- Every fabric produces a physically sane material -------------------------------
  for (const { fabric, colours } of rows) {
    const spec = fabricMaterialSpec(fabric, colours[fabric.heroIndex] ?? colours[0]);

    assert(spec.roughness >= 0.45 && spec.roughness <= 1, `${fabric.id}: roughness ${spec.roughness} — cloth is never a mirror`);
    assert(spec.sheen > 0 && spec.sheen <= 1, `${fabric.id}: sheen ${spec.sheen} — without it, cloth reads as painted plastic`);
    assert(spec.transmission >= 0 && spec.transmission <= 0.25, `${fabric.id}: transmission ${spec.transmission}`);
    assert(spec.anisotropy >= 0 && spec.anisotropy <= 1, `${fabric.id}: anisotropy ${spec.anisotropy}`);
    assert(spec.weave.threadCount >= 32, `${fabric.id}: ${spec.weave.threadCount} threads is not a woven cloth`);
    assert(/^#[0-9a-f]{6}$/i.test(spec.weave.hex), `${fabric.id}: colour "${spec.weave.hex}" is not a hex triplet`);
    assert(spec.tileMetres > 0 && spec.tileMetres < 0.2, `${fabric.id}: a tile covering ${spec.tileMetres}m is not a weave`);
  }
  console.log(`every quality yields a physical material (${rows.length} fabrics) ✓`);

  // ---- Presets give each family its own character -------------------------------------
  const families = new Set(FABRIC_DEFS.map((f) => f.family));
  for (const family of families) {
    assert(FABRIC_PRESETS[family], `family "${family}" has no preset — it would silently render as cotton`);
  }
  const silk = rows.find((r) => r.fabric.family === 'silk')!;
  const cotton = rows.find((r) => r.fabric.family === 'cotton')!;
  const silkSpec = fabricMaterialSpec(silk.fabric, silk.colours[0]);
  const cottonSpec = fabricMaterialSpec(cotton.fabric, cotton.colours[0]);

  assert(silkSpec.roughness < cottonSpec.roughness, 'silk is smoother than cotton');
  assert(silkSpec.sheenRoughness < cottonSpec.sheenRoughness, 'filament silk takes a tighter sheen than staple cotton');
  assert(silkSpec.anisotropy > cottonSpec.anisotropy * 2, 'satin floats stretch a highlight; a plain weave has nowhere to stretch');
  assert(silkSpec.weave.kind === 'satin', `silk should weave as satin, got ${silkSpec.weave.kind}`);
  console.log('presets separate the families — silk is not a shinier cotton ✓');

  // ---- The spec sheet, not an artist, decides ------------------------------------------
  const light = rows.find((r) => r.fabric.id === 'pcpc')!;
  const heavy = rows.find((r) => r.fabric.id === 'gajji')!;
  const lightSpec = fabricMaterialSpec(light.fabric, light.colours[0]);
  const heavySpec = fabricMaterialSpec(heavy.fabric, heavy.colours[0]);

  assert(heavySpec.weave.threadCount > lightSpec.weave.threadCount, 'a 20kg cloth is denser than an 8.8kg one');
  assert(heavySpec.transmission === 0, 'a 20kg gajji does not pass light');
  assert(lightSpec.transmission > 0, 'an 8.8kg PC/PC passes a little light');
  console.log('weight and composition drive the render, not a tuning table ✓');

  // A merchant editing the row must move the render. This is the whole promise of deriving
  // from the catalogue, so it is asserted rather than assumed.
  const dulled = fabricMaterialSpec({ ...heavy.fabric, sheen: 0.08 }, heavy.colours[0]);
  assert(dulled.roughness > heavySpec.roughness, 'lowering a fabric\'s sheen in the catalogue must roughen the render');
  assert(dulled.anisotropy < heavySpec.anisotropy, 'lowering sheen must shorten the directional highlight');
  console.log('editing the catalogue changes the material ✓');

  // ---- Determinism ---------------------------------------------------------------------
  const a = fabricMaterialSpec(heavy.fabric, heavy.colours[3]);
  const b = fabricMaterialSpec(heavy.fabric, heavy.colours[3]);
  assert.deepStrictEqual(a, b, 'the same fabric and shade must produce byte-identical materials');
  const other = fabricMaterialSpec(heavy.fabric, heavy.colours[4]);
  assert(other.weave.seed !== a.weave.seed, 'two shades of one quality must not share a weave seed');
  console.log('deterministic per fabric and shade, distinct between shades ✓');

  // ---- Tiling is physical ---------------------------------------------------------------
  // A metre of cloth has to show the right number of threads, or the microscope (M27) and the
  // garment (M25) disagree about how big a thread is.
  const perMetre = tileRepeat(heavySpec, 1);
  assert(perMetre > 4 && perMetre < 400, `${perMetre} tiles to the metre is not a believable thread scale`);
  assert(tileRepeat(heavySpec, 2) > perMetre, 'two metres of cloth shows more weave than one');
  console.log(`thread scale is physical (${perMetre} tiles per metre) ✓`);

  // ---- Shades are actually different colours ---------------------------------------------
  // The catalogue speaks OKLCH and a texture is sRGB bytes. When that conversion is missing
  // the generator's parser rejects every colour and falls back to one beige, so the whole
  // shade wall renders identically and it looks like a lighting bug.
  // Lightness is 0-1 in the data; handing this a percentage sends everything to near-black.
  assert(oklchToHex(0, 0, 0) === '#000000', `black round-trips, got ${oklchToHex(0, 0, 0)}`);
  assert(oklchToHex(1, 0, 0) === '#ffffff', `white round-trips, got ${oklchToHex(1, 0, 0)}`);
  assert(oklchToHex(0.63, 0.16, 29).toLowerCase() !== oklchToHex(0.63, 0.16, 210).toLowerCase(), 'hue must change the colour');

  // Every shade of one quality must be its own colour — that is what the shade wall sells.
  for (const { fabric, colours } of rows) {
    const distinct = new Set(colours.map((c) => fabricMaterialSpec(fabric, c).weave.hex));
    assert(
      distinct.size === colours.length,
      `${fabric.id}: ${distinct.size} distinct colours from ${colours.length} shades — the conversion is collapsing them`
    );
    // A near-black wall is what a units mistake looks like, and it is otherwise silent.
    const dark = [...distinct].filter((hex) => parseInt(hex.slice(1, 3), 16) < 24 && parseInt(hex.slice(3, 5), 16) < 24).length;
    assert(dark < colours.length / 2, `${fabric.id}: ${dark} of ${colours.length} shades came out near-black`);
  }
  console.log(`every shade of every quality is its own colour (${rows[0].colours.length} per fabric) ✓`);

  console.log('\nM22 SMOKE PASSED');
}

main().catch((e) => {
  console.error('M22 SMOKE FAILED:', e);
  process.exit(1);
});
