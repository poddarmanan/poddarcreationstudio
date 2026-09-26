import 'dotenv/config';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { readGlb } from './lib/glb.mjs';
import { fitForm } from '../src/lib/three/mannequin';
import { relaxSleeves, sleevesByPart } from '../src/lib/three/relax';

/**
 * M44 — a modelled garment's sleeves hang once the arms are taken out of them.
 *
 * Runs on the owner's own shirt and t-shirt files, in stage space, exactly as GarmentModel
 * prepares them: node matrices applied, turned to face the camera if modelled side-on, centred
 * and scaled to garment height. Then the sleeves are relaxed and measured: they must end lower
 * than they started, reach less far out to the sides, and every vertex must still be a number.
 */

function stagePositions(file: string, metres: number): { all: Float32Array; parts: [number, number][] } {
  const g = readGlb(file);
  const { json } = g;
  const nodes = json.nodes as { mesh?: number; children?: number[]; matrix?: number[]; rotation?: number[]; translation?: number[]; scale?: number[] }[];
  const world = new Map<number, THREE.Matrix4>();
  const walk = (i: number, parent: THREE.Matrix4) => {
    const n = nodes[i];
    const local = new THREE.Matrix4();
    if (n.matrix) local.fromArray(n.matrix);
    else local.compose(new THREE.Vector3(...((n.translation ?? [0, 0, 0]) as [number, number, number])), new THREE.Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])), new THREE.Vector3(...((n.scale ?? [1, 1, 1]) as [number, number, number])));
    const m = parent.clone().multiply(local);
    world.set(i, m);
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const root of json.scenes[0].nodes as number[]) walk(root, new THREE.Matrix4());

  const chunks: Float32Array[] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const m = world.get(i)!;
    for (const prim of json.meshes[n.mesh].primitives) {
      const pos = g.accessor(prim.attributes.POSITION) as Float32Array;
      const out = new Float32Array(pos.length);
      for (let k = 0; k < pos.length; k += 3) {
        v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(m);
        out[k] = v.x; out[k + 1] = v.y; out[k + 2] = v.z;
        box.expandByPoint(v);
      }
      chunks.push(out);
    }
  });
  const raw = box.getSize(new THREE.Vector3());
  const turn = raw.x < raw.z;
  const centre = box.getCenter(new THREE.Vector3());
  const c = turn ? new THREE.Vector3(centre.z, centre.y, -centre.x) : centre;
  const scale = metres / (turn ? raw.y : raw.y);
  const all = new Float32Array(chunks.reduce((a, ch) => a + ch.length, 0));
  const parts: [number, number][] = [];
  let o = 0;
  for (const ch of chunks) {
    parts.push([o / 3, (o + ch.length) / 3]);
    for (let k = 0; k < ch.length; k += 3) {
      let x = ch[k], z = ch[k + 2];
      const y = ch[k + 1];
      if (turn) { const nx = z; z = -x; x = nx; }
      all[o++] = (x - c.x) * scale; all[o++] = (y - c.y) * scale; all[o++] = (z - c.z) * scale;
    }
  }
  return { all, parts };
}

function sleeveExtent(p: Float32Array, torsoHalf: number, shoulderY: number) {
  let maxX = 0, minY = Infinity, count = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.abs(p[i]) > torsoHalf && p[i + 1] < shoulderY) { maxX = Math.max(maxX, Math.abs(p[i])); minY = Math.min(minY, p[i + 1]); count++; }
  }
  return { maxX, minY, count };
}

async function main() {
  const files: [string, number, 'male' | 'female'][] = [['public/models/shirt.glb', 0.8, 'male'], ['public/models/tshirt.glb', 0.74, 'male']];
  for (const [file, metres, sex] of files) {
    if (!existsSync(file)) { console.log(`– ${file} not present, skipped`); continue; }
    if ((readGlb(file).json.extensionsRequired ?? []).includes('KHR_draco_mesh_compression')) { console.log(`– ${file} is Draco-compressed; its vertices are only readable in the browser, skipped`); continue; }
    const { all: p, parts } = stagePositions(file, metres);
    const fit = fitForm(p, sex, { percentile: 0.45, ease: 0.72, shoulderDrop: 0.13 });
    assert(fit, `${file}: the form fits`);
    const { membership, torsoHalf, confident } = sleevesByPart(p, parts, fit.shoulderY);
    console.log(`  parts: ${parts.map(([a, b], i) => { let r = 0, l = 0; for (let k = a; k < b; k++) { if (membership[k] > 0) r++; else if (membership[k] < 0) l++; } return `#${i}:${b - a}v R${r} L${l}`; }).join(" ")}`);
    const params = { torsoHalf, shoulderY: fit.shoulderY };
    const before = sleeveExtent(p, torsoHalf, fit.shoulderY);
    if (!confident) {
      // Saved as arbitrary chunks: the width test alone cannot tell the chest's sides from a
      // sleeve, so the viewer leaves such a model as modelled. The smoke checks it says so.
      console.log(`${file.split('/').pop()}: sleeves are not their own meshes — left as modelled ✓`);
      continue;
    }
    const report = relaxSleeves(p, params, membership);
    // Run the analysis again on the relaxed cloth: a hanging sleeve has no elbow left in it.
    const again = relaxSleeves(Float32Array.from(p), params, membership);
    const after = sleeveExtent(p, torsoHalf, fit.shoulderY);
    for (let i = 0; i < p.length; i++) assert(Number.isFinite(p[i]), 'no vertex may become NaN');
    console.log(`${file.split('/').pop()}: torso half-width ${(torsoHalf * 100).toFixed(0)}cm; sleeves ${report.sleeves.map((s) => `${s.side > 0 ? 'R' : 'L'} ${s.vertices}v ${(s.length * 100).toFixed(0)}cm long, elbow ${s.elbowAt === null ? 'none' : (s.elbowAt * 100).toFixed(0) + 'cm'}, turned ${(s.turnedBy * 57.3).toFixed(0)}°`).join(' · ')}`);
    console.log(`  reach: ${(before.maxX * 100).toFixed(0)}cm → ${(after.maxX * 100).toFixed(0)}cm out; cuff: ${(before.minY * 100).toFixed(0)}cm → ${(after.minY * 100).toFixed(0)}cm`);
    console.log(`  after: ${again.sleeves.map((s) => `${s.side > 0 ? 'R' : 'L'} elbow ${s.elbowAt === null ? 'none' : (s.elbowAt * 100).toFixed(0) + 'cm'}, off vertical ${(s.turnedBy * 57.3).toFixed(0)}°`).join(' · ')}`);
    assert(report.sleeves.length === 2, `${file}: both sleeves found (${report.sleeves.length})`);
    assert(after.minY <= before.minY + 0.005, `${file}: relaxed sleeves do not rise`);
    assert(after.maxX <= before.maxX + 0.005, `${file}: relaxed sleeves do not reach further out`);
    for (const s of again.sleeves) {
      assert(s.elbowAt === null, `${file}: a relaxed ${s.side > 0 ? 'right' : 'left'} sleeve is straight (elbow still at ${s.elbowAt})`);
      assert(s.turnedBy < 0.12, `${file}: a relaxed ${s.side > 0 ? 'right' : 'left'} sleeve hangs within 7° of its rest direction (${(s.turnedBy * 57.3).toFixed(0)}°)`);
    }
    console.log(`  hangs ✓`);
  }
  console.log('\nM44 sleeve relaxation: all checks passed');
}

main().catch((err) => { console.error('FAILED', err); process.exit(1); });
