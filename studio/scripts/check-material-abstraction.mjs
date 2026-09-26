import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Enforces the M22 rule: **only `FabricMaterial` shades cloth.**
 *
 * Every rendering component describes *what* fabric it is showing and never *how* to shade it.
 * That is what keeps the renderer flexible as the catalogue grows — a merchant adding a
 * twelfth quality, or asking for gajji to read wetter, changes one preset and every surface in
 * the app follows.
 *
 * A rule like that survives exactly as long as something checks it. Left to convention, the
 * third viewer that needs "just a slightly rougher variant" inlines a material, and six months
 * later there is no single place to change.
 *
 *   node scripts/check-material-abstraction.mjs
 */
const ROOT = 'src';

/** Materials that carry shading parameters. Helpers like `lineBasicMaterial` are fine. */
const SHADING_MATERIALS = /<mesh(Physical|Standard|Phong|Lambert|Toon)Material|new THREE\.Mesh(Physical|Standard|Phong|Lambert|Toon)Material/;

/** The one file allowed to name them, plus the presets it reads. */
// Mannequin.tsx shades a dress form, not cloth — the one thing on the stage that is not fabric.
const ALLOWED = new Set(['src/components/three/FabricMaterial.tsx', 'src/components/three/Mannequin.tsx']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  const offenders = [];

  for (const file of files) {
    const rel = file.split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    const source = await readFile(file, 'utf8');
    if (!SHADING_MATERIALS.test(source)) continue;
    const line = source.split('\n').findIndex((l) => SHADING_MATERIALS.test(l)) + 1;
    offenders.push(`${rel}:${line}`);
  }

  if (offenders.length) {
    console.error('MATERIAL ABSTRACTION VIOLATED — these set shader parameters directly:');
    for (const o of offenders) console.error(`  ✗ ${o}`);
    console.error('\nRender cloth with <FabricMaterial spec={...} tier={...} />, and if the look is');
    console.error('wrong, change the family preset in src/lib/three/fabric-spec.ts.');
    process.exit(1);
  }

  console.log(`  ✓ material abstraction intact (${files.length} files, only FabricMaterial shades cloth)`);
}

main().catch((e) => {
  console.error('CHECK FAILED:', e.message);
  process.exit(1);
});
