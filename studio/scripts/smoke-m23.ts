import 'dotenv/config';
import assert from 'node:assert';
import { FABRIC_DEFS, generateColours } from '../src/lib/fabric-generator';
import { drape } from '../src/lib/three/drape';
import { fabricMaterialSpec } from '../src/lib/three/fabric-spec';

/**
 * M23 — Fabric Viewer 2.0: the drape.
 *
 * Sweeps the whole parameter space rather than trusting a screenshot. The bug this exists to
 * prevent produced a NaN on exactly one row of vertices — the top one, where `y` lands one ULP
 * above `height / 2` — which degenerated the normals and drew a black band across the top of
 * every fabric in the studio. A screenshot showed it; nothing explained it.
 */
async function main() {
  const heights = [0.8, 1.35, 1.5, 2];
  const flows = [0, 0.3, 0.6, 0.9, 1];
  const winds = [0, 1, 2, 3];
  const pulls = [0, 0.5, 1];
  const times = [0, 0.37, 12.5, 3600];

  let samples = 0;
  let maxZ = 0;

  for (const height of heights) {
    // Vertex rows exactly as PlaneGeometry lays them out, including the top row whose
    // floating-point position is the whole reason this test exists.
    const segments = 48;
    for (let iy = 0; iy <= segments; iy++) {
      const y = iy * (height / segments) - height / 2;
      for (const flow of flows) {
        for (const wind of winds) {
          for (const pull of pulls) {
            for (const time of times) {
              const d = drape({ x: 0.31, y, height, flow, stretch: 0.9, wind, pull, time });
              assert(Number.isFinite(d.z), `NaN/Infinity z at y=${y} height=${height} flow=${flow}`);
              assert(Number.isFinite(d.x) && Number.isFinite(d.y), `NaN position at y=${y} height=${height}`);
              maxZ = Math.max(maxZ, Math.abs(d.z));
              samples += 1;
            }
          }
        }
      }
    }
  }
  console.log(`${samples.toLocaleString()} drape samples, all finite ✓`);
  assert(maxZ < 0.2, `folds reach ${maxZ.toFixed(3)}m — cloth that deep is a curtain, not a swatch`);
  console.log(`fold depth stays physical (max ${(maxZ * 1000).toFixed(0)}mm) ✓`);

  // ---- Drape reflects the spec sheet ---------------------------------------------------
  const at = (flow: number) => {
    let peak = 0;
    for (let i = 0; i <= 40; i++) {
      const d = drape({ x: -0.45 + (i / 40) * 0.9, y: -0.5, height: 1.35, flow, stretch: 0.2, wind: 0, pull: 0, time: 1 });
      peak = Math.max(peak, Math.abs(d.z));
    }
    return peak;
  };
  assert(at(0.9) > at(0.3) * 1.5, 'a fluid rayon must fall in deeper folds than a crisp PC/PC');
  console.log(`flow drives fold depth (${(at(0.9) * 1000).toFixed(1)}mm fluid vs ${(at(0.3) * 1000).toFixed(1)}mm crisp) ✓`);

  // Pulling taut flattens the cloth and lengthens it — and how far depends on the fabric.
  const relaxed = drape({ x: 0.4, y: -0.5, height: 1.35, flow: 0.9, stretch: 0.9, wind: 0, pull: 0, time: 1 });
  const taut = drape({ x: 0.4, y: -0.5, height: 1.35, flow: 0.9, stretch: 0.9, wind: 0, pull: 1, time: 1 });
  assert(Math.abs(taut.z) < Math.abs(relaxed.z), 'tension flattens folds');
  assert(taut.y < relaxed.y, 'a stretched panel hangs longer');
  assert(Math.abs(taut.x) < Math.abs(relaxed.x), 'a stretched panel narrows');

  const stiff = drape({ x: 0.4, y: -0.5, height: 1.35, flow: 0.9, stretch: 0.1, wind: 0, pull: 1, time: 1 });
  assert(Math.abs(stiff.y) < Math.abs(taut.y), 'a 0.1-stretch gajji barely moves where a 0.9 lycra pulls far');
  console.log('stretch behaves like the fabric\'s own recovery figure ✓');

  // Wind only moves cloth when there is wind.
  const still = drape({ x: 0.2, y: -0.4, height: 1.35, flow: 0.5, stretch: 0.2, wind: 0, pull: 0, time: 2 });
  const blown = drape({ x: 0.2, y: -0.4, height: 1.35, flow: 0.5, stretch: 0.2, wind: 3, pull: 0, time: 2 });
  assert(still.z !== blown.z, 'the wind rail must actually move the cloth');
  console.log('wind moves the cloth ✓');

  // ---- The viewer shows the fabric it was asked for --------------------------------------
  // A viewer that renders every fabric identically is the failure mode that looks fine.
  const specs = FABRIC_DEFS.map((f) => fabricMaterialSpec(f, generateColours(f)[f.heroIndex] ?? generateColours(f)[0]));
  const signatures = new Set(specs.map((s) => `${s.weave.kind}:${s.weave.threadCount}:${s.weave.hex}:${s.roughness.toFixed(3)}`));
  assert(signatures.size === specs.length, `${signatures.size} distinct materials from ${specs.length} fabrics`);
  console.log(`all ${specs.length} qualities render as different cloth ✓`);

  console.log('\nM23 SMOKE PASSED');
}

main().catch((e) => {
  console.error('M23 SMOKE FAILED:', e);
  process.exit(1);
});
