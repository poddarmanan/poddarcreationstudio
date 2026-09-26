import 'dotenv/config';
import assert from 'node:assert';
import { Cloth, bendEdgesOf, edgesOf } from '../src/lib/three/cloth';

/**
 * M42 — the cloth simulation, stepped without a renderer.
 *
 * What is being protected: a garment that hangs, holds its shape, comes to rest, and never
 * explodes. The specific failure modes a position-based cloth has — melting off the form under
 * gravity, ringing forever after a push, tearing through a collider — each get a check.
 */

/** A hanging rectangle of cloth, `cols` wide and `rows` tall, pinned along its top edge. */
function sheet(cols: number, rows: number, width: number, height: number) {
  const rest = new Float32Array(cols * rows * 3);
  const pinned = new Uint8Array(cols * rows);
  const index: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      rest[i * 3] = (c / (cols - 1) - 0.5) * width;
      rest[i * 3 + 1] = (0.5 - r / (rows - 1)) * height;
      rest[i * 3 + 2] = 0;
      if (r === 0) pinned[i] = 1;
      if (r < rows - 1 && c < cols - 1) index.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
    }
  }
  return { rest, pinned, index };
}

const still = { gravity: 2.4, wind: [0, 0, 0] as [number, number, number], spin: { omega: 0, alpha: 0 }, tug: 0 };

function lowestY(cloth: Cloth) {
  let low = Infinity;
  for (let i = 1; i < cloth.pos.length; i += 3) low = Math.min(low, cloth.pos[i]);
  return low;
}
function maxSpeed(cloth: Cloth, before: Float32Array, dt: number) {
  let v = 0;
  for (let i = 0; i < cloth.pos.length; i += 3) v = Math.max(v, Math.hypot(cloth.pos[i] - before[i], cloth.pos[i + 1] - before[i + 1], cloth.pos[i + 2] - before[i + 2]) / dt);
  return v;
}

async function main() {
  const { rest, pinned, index } = sheet(12, 30, 0.6, 1.2);
  // Edges plus bending springs, as the garments use them.
  const bends = bendEdgesOf(index);
  assert(bends.length > 0 && bends.length % 2 === 0, 'bending springs are produced for a sheet');
  const cloth = new Cloth(rest, new Uint32Array([...edgesOf(index), ...bends]), pinned);

  // ---- Hangs, and holds -----------------------------------------------------------------------
  for (let i = 0; i < 300; i++) cloth.step(1 / 60, still, null);
  const sag = -0.6 - lowestY(cloth);
  assert(sag >= 0, 'a hanging sheet does not rise');
  assert(sag < 0.05, `a 1.2m sheet must not stretch more than 5cm under gravity (sagged ${(sag * 100).toFixed(1)}cm)`);
  for (let i = 0; i < cloth.pos.length; i++) assert(Number.isFinite(cloth.pos[i]), 'no vertex may become NaN');
  console.log(`hangs from its pins and stretches ${(sag * 100).toFixed(1)}cm — holds its shape ✓`);

  // ---- Comes to rest ----------------------------------------------------------------------------
  const before = Float32Array.from(cloth.pos);
  cloth.step(1 / 60, still, null);
  const speed = maxSpeed(cloth, before, 1 / 60);
  assert(speed < 0.01, `after five seconds a still cloth must be still (fastest vertex ${speed.toFixed(3)} m/s)`);
  console.log('comes to rest ✓');

  // ---- A flick swings it, and the swing dies -----------------------------------------------------
  const flick = { ...still, spin: { omega: 0, alpha: 60 } };
  for (let i = 0; i < 6; i++) cloth.step(1 / 60, flick, null);
  let kicked = Float32Array.from(cloth.pos);
  cloth.step(1 / 60, still, null);
  const kickedSpeed = maxSpeed(cloth, kicked, 1 / 60);
  assert(kickedSpeed > 0.05, `a hard flick must move the hem (fastest vertex ${kickedSpeed.toFixed(3)} m/s)`);
  for (let i = 0; i < 240; i++) cloth.step(1 / 60, still, null);
  kicked = Float32Array.from(cloth.pos);
  cloth.step(1 / 60, still, null);
  const settled = maxSpeed(cloth, kicked, 1 / 60);
  assert(settled < 0.02, `four seconds after a flick the swing must have died (fastest vertex ${settled.toFixed(3)} m/s)`);
  console.log(`a flick moves the hem at ${kickedSpeed.toFixed(2)} m/s and dies away within four seconds ✓`);

  // ---- Stays outside a solid ---------------------------------------------------------------------
  // A cylinder of radius 0.2 down the middle; the sheet starts inside it and must be pushed out.
  const radius = 0.2;
  const collide = (x: number, y: number, z: number, out: Float32Array) => {
    const d = Math.hypot(x, z);
    if (d >= radius) return false;
    const k = radius / (d || 1e-6);
    out[0] = x * k; out[1] = y; out[2] = z * k;
    return true;
  };
  cloth.reset();
  for (let i = 0; i < 120; i++) cloth.step(1 / 60, still, collide);
  let inside = 0;
  for (let i = 0; i < cloth.count; i++) {
    if (pinned[i]) continue;
    if (Math.hypot(cloth.pos[i * 3], cloth.pos[i * 3 + 2]) < radius - 0.002) inside++;
  }
  assert(inside === 0, `${inside} free vertices remain inside the collider`);
  console.log('is kept outside a solid ✓');

  // ---- Wind pushes it, sideways, and it comes back ----------------------------------------------
  cloth.reset();
  const gust = { ...still, wind: [0, 0, 3] as [number, number, number] };
  for (let i = 0; i < 90; i++) cloth.step(1 / 60, gust, null);
  let pushed = 0;
  for (let i = 2; i < cloth.pos.length; i += 3) pushed = Math.max(pushed, cloth.pos[i]);
  assert(pushed > 0.1, `a steady wind must blow the hem out (moved ${(pushed * 100).toFixed(0)}cm)`);
  for (let i = 0; i < 300; i++) cloth.step(1 / 60, still, null);
  let back = 0;
  for (let i = 2; i < cloth.pos.length; i += 3) back = Math.max(back, cloth.pos[i]);
  assert(back < pushed * 0.35, `when the wind drops the cloth must fall back (from ${(pushed * 100).toFixed(0)}cm to ${(back * 100).toFixed(0)}cm)`);
  console.log(`wind blows the hem out ${(pushed * 100).toFixed(0)}cm and it falls back to ${(back * 100).toFixed(0)}cm ✓`);

  console.log('\nM42 cloth simulation: all checks passed');
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
