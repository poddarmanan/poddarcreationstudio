import * as THREE from 'three';

/**
 * Relaxing a modelled garment's sleeves.
 *
 * A garment model is nearly always saved as it was worn: sleeves out along a T-pose, or bent at
 * the elbow with the cuff brought forward. On a dress form there are no arms in them, so they
 * should hang — straight down from the shoulder, a little outward, the way a shirt hangs on a
 * hanger. This works that out from the geometry alone, in stage space (metres, y up, the
 * garment facing +z), with no rigging and no knowledge of which mesh is which:
 *
 *   1. Sleeve vertices are the ones outside the torso's width below the shoulder line.
 *   2. Each sleeve gets a centreline, by binning its vertices on distance from the shoulder.
 *   3. If the centreline turns sharply somewhere in its middle, that is the elbow.
 *   4. The upper arm is rotated about the shoulder to hang; the forearm about the elbow to
 *      continue straight down. Vertices near the armhole blend, so the seam does not tear.
 *
 * `positions` are xyz triples, modified in place; the return value says what was found.
 */

export interface RelaxParams {
  /** Half-width of the torso at the chest, metres; anything wider is sleeve. */
  torsoHalf: number;
  /** World y of the shoulder line. */
  shoulderY: number;
  /** How far outward (radians) a relaxed sleeve hangs from vertical. */
  splay?: number;
}

export interface RelaxReport {
  sleeves: { side: 1 | -1; vertices: number; length: number; elbowAt: number | null; /** Sharpest turn found in the centreline, radians. */ bend: number; turnedBy: number }[];
}

const BIN = 0.03;

/**
 * Which sleeve each vertex belongs to, when the caller knows better than the width test can —
 * a model whose sleeves are their own meshes says so exactly. -1 left, 1 right, 0 body.
 */
export type SleeveMembership = Int8Array;

/**
 * Membership from mesh structure, and the torso width that goes with it.
 *
 * The torso is first guessed from every vertex: at each of the lower bands the median of |x| is
 * about 0.7 of a ring's radius, and the narrowest band is the one with the least sleeve in it.
 * A part is then a sleeve when most of its vertices lie outside that width, on one side — a
 * collar or a torso half is mostly inside it, however far off-centre its centroid sits. The
 * torso is measured again on the body parts alone (80th percentile of |x| is about 0.95 of the
 * radius), and parts that span the centre — a model saved as arbitrary chunks — fall back to the
 * width test against that. `parts` are [start, end) vertex ranges.
 */
export interface SleeveMap {
  membership: SleeveMembership;
  torsoHalf: number;
  /**
   * True when both sleeves are their own meshes. Then the map is exact and the sleeves can be
   * moved. From the width test alone the chest's sides are read as sleeve too, and moving those
   * would distort the body — a garment saved as arbitrary chunks keeps its sleeves as modelled.
   */
  confident: boolean;
}

export function sleevesByPart(positions: Float32Array, parts: [number, number][], shoulderY: number): SleeveMap {
  const n = positions.length / 3;
  const out = new Int8Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, positions[i * 3]);
    maxX = Math.max(maxX, positions[i * 3]);
    top = Math.max(top, positions[i * 3 + 1]);
    bottom = Math.min(bottom, positions[i * 3 + 1]);
  }
  const height = top - bottom;
  const bandWidth = (percentile: number, radiusRatio: number, include: (i: number) => boolean) => {
    let best = Infinity;
    for (let f = 0.3; f <= 0.7; f += 0.05) {
      const yc = top - height * f;
      const values: number[] = [];
      for (let i = 0; i < n; i++) if (include(i) && Math.abs(positions[i * 3 + 1] - yc) < height * 0.03) values.push(Math.abs(positions[i * 3]));
      if (values.length < 8) continue;
      values.sort((a, b) => a - b);
      best = Math.min(best, values[Math.floor(values.length * percentile)] / radiusRatio);
    }
    return Number.isFinite(best) ? best : (maxX - minX) * 0.25;
  };
  const guess = bandWidth(0.5, 0.7, () => true);

  const spanning: [number, number][] = [];
  for (const [start, end] of parts) {
    let sum = 0;
    let outside = 0;
    for (let i = start; i < end; i++) {
      const x = positions[i * 3];
      sum += x;
      if (Math.abs(x) > guess) outside++;
    }
    const count = Math.max(1, end - start);
    const centroid = sum / count;
    const side = outside / count >= 0.5 && Math.abs(centroid) > guess * 0.5 ? (centroid > 0 ? 1 : -1) : 0;
    if (!side) { spanning.push([start, end]); continue; }
    // A sleeve mesh sometimes carries a stray piece of collar or yoke; anything well inside the
    // torso's width stays body, or the sleeve's shoulder would be found at the neck.
    for (let i = start; i < end; i++) if (positions[i * 3] * side > guess * 0.6) out[i] = side;
  }

  const torsoHalf = bandWidth(0.8, 0.95, (i) => out[i] === 0);

  // A side whose sleeve is its own part is settled: the body's yoke and armhole, however wide
  // they reach, are body. Only a side with no such part is classified vertex by vertex.
  // Only the bands a sleeve actually crosses count: a band whose widest vertex is well beyond
  // the torso has a sleeve in it, while a hem that merely flares does not.
  const found = new Set<number>();
  for (let i = 0; i < n; i++) if (out[i]) found.add(out[i]);
  const confident = found.has(1) && found.has(-1);
  const bandOf = (y: number) => Math.floor((top - y) / 0.02);
  const widest: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = bandOf(positions[i * 3 + 1]);
    widest[b] = Math.max(widest[b] ?? 0, Math.abs(positions[i * 3]));
  }
  const sleeveBand = widest.map((w) => w > torsoHalf + Math.max(0.04, torsoHalf * 0.25));
  for (const [start, end] of spanning) {
    for (let i = start; i < end; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const side = x > 0 ? 1 : -1;
      if (!found.has(side) && sleeveBand[bandOf(y)] && Math.abs(x) > torsoHalf + 0.03 && y < shoulderY + 0.03) out[i] = side;
    }
  }
  return { membership: out, torsoHalf, confident };
}

/**
 * `normals`, when given, are the matching xyz triples of vertex normals and are turned with
 * their vertices — as the blend of the same rotations, which for shading is close enough.
 */
/**
 * `swing`, when given, receives per vertex how far along its sleeve the vertex is (0 at the
 * shoulder seam, 1 at the cuff), signed by side and 0 for the body — what the wind needs to
 * swing a sleeve from its shoulder without knowing anything else about the mesh.
 */
export function relaxSleeves(positions: Float32Array, params: RelaxParams, membership?: SleeveMembership, normals?: Float32Array, swing?: Float32Array): RelaxReport {
  const { torsoHalf, shoulderY, splay = 0.04 } = params;
  const report: RelaxReport = { sleeves: [] };
  const n = positions.length / 3;
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (const side of [1, -1] as const) {
    // 1. Membership: told, or by width. Either way the weight fades in over the first few
    // centimetres from the shoulder seam, so the armhole does not tear.
    const members: number[] = [];
    let topY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3] * side;
      const y = positions[i * 3 + 1];
      const isMember = membership ? membership[i] === side : x > torsoHalf * 0.98 && y <= shoulderY + 0.03;
      if (!isMember) continue;
      members.push(i);
      topY = Math.max(topY, y);
    }
    if (members.length < 60) continue;

    // The shoulder seam: where the sleeve meets the body, at its top. With told membership the
    // innermost of the sleeve's top vertices; otherwise the torso's edge at the shoulder line.
    const pivot = new THREE.Vector3(side * torsoHalf, shoulderY - 0.02, 0);
    if (membership) {
      let sx = 0, sy = 0, sz = 0, count = 0;
      for (const i of members) {
        if (positions[i * 3 + 1] < topY - 0.05) continue;
        sx += positions[i * 3]; sy += positions[i * 3 + 1]; sz += positions[i * 3 + 2]; count++;
      }
      if (count) pivot.set(sx / count, sy / count, sz / count);
    }
    const weight = members.map((i) => {
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).sub(pivot);
      return Math.min(1, v.length() / 0.08);
    });

    // 2. Centreline: centroid per distance bin from the shoulder.
    const bins: { sum: THREE.Vector3; count: number }[] = [];
    let reach = 0;
    for (const i of members) {
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).sub(pivot);
      const r = v.length();
      reach = Math.max(reach, r);
      const b = Math.floor(r / BIN);
      (bins[b] ??= { sum: new THREE.Vector3(), count: 0 }).sum.add(v);
      bins[b].count += 1;
    }
    const line: { r: number; c: THREE.Vector3 }[] = [];
    bins.forEach((b, k) => {
      if (b && b.count >= 3) line.push({ r: (k + 0.5) * BIN, c: b.sum.clone().divideScalar(b.count) });
    });
    if (line.length < 3) continue;

    // 3. The elbow: the sharpest turn of the centreline in its middle half, if it is sharp at
    // all. A short sleeve has no elbow in it; what its centreline does is noise.
    let elbow: number | null = null;
    let sharpest = 0;
    for (let k = 2; k < line.length - 2 && line.length >= 10; k++) {
      const f = k / line.length;
      if (f < 0.3 || f > 0.75) continue;
      const before = line[k].c.clone().sub(line[k - 2].c).normalize();
      const after = line[k + 2].c.clone().sub(line[k].c).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, before.dot(after))));
      if (angle > sharpest) {
        sharpest = angle;
        elbow = k;
      }
    }
    if (sharpest < 0.5) elbow = null; // under 29°: a straight arm; the centreline of a real one wobbles by up to 20°

    // 4. Rotate to hang.
    const hang = new THREE.Vector3(side * Math.sin(splay), -Math.cos(splay), 0.02).normalize();
    const upperEnd = elbow === null ? line[line.length - 1] : line[elbow];
    const upperDir = upperEnd.c.clone().normalize();
    const r1 = q.clone().setFromUnitVectors(upperDir, hang);
    const turnedBy = Math.acos(Math.max(-1, Math.min(1, upperDir.dot(hang))));

    let r2: THREE.Quaternion | null = null;
    let elbowPoint: THREE.Vector3 | null = null;
    let elbowR = Infinity;
    if (elbow !== null) {
      const foreDir = line[line.length - 1].c.clone().sub(line[elbow].c).normalize().applyQuaternion(r1);
      r2 = q.clone().setFromUnitVectors(foreDir, hang);
      elbowPoint = line[elbow].c.clone().applyQuaternion(r1);
      elbowR = line[elbow].r;
    }

    const turnedAll = new Float32Array(members.length * 3);
    for (let m = 0; m < members.length; m++) {
      const i = members[m];
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).sub(pivot);
      const r = v.length();
      const turned = v.clone().applyQuaternion(r1);
      if (r2 && elbowPoint) {
        // The forearm continues from the elbow; blended over 4cm so the joint does not crease.
        const f = Math.min(1, Math.max(0, (r - elbowR + 0.02) / 0.04));
        if (f > 0) {
          const about = turned.clone().sub(elbowPoint).applyQuaternion(r2).add(elbowPoint);
          turned.lerp(about, f);
        }
      }
      turnedAll[m * 3] = turned.x;
      turnedAll[m * 3 + 1] = turned.y;
      turnedAll[m * 3 + 2] = turned.z;
    }

    // 5. Flatten, and let go. A sleeve with no arm in it does not stay a tube: it settles
    // front-to-back into a flattened oval, a little wider than it was round, narrower towards
    // the cuff (an empty cuff collapses), with the soft horizontal creases of cloth that is
    // holding nothing up. About the hanging centreline, below the shoulder cap (which keeps its
    // shape over the yoke): depth to 42%, width up 18%, a 10% taper to the cuff, a 5% crease.
    const rows: { sum: THREE.Vector3; count: number }[] = [];
    for (let m = 0; m < members.length; m++) {
      const b = Math.floor(Math.hypot(turnedAll[m * 3], turnedAll[m * 3 + 1], turnedAll[m * 3 + 2]) / BIN);
      (rows[b] ??= { sum: new THREE.Vector3(), count: 0 }).sum.add(v.set(turnedAll[m * 3], turnedAll[m * 3 + 1], turnedAll[m * 3 + 2]));
      rows[b].count += 1;
    }
    const centre = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    const blend = new THREE.Quaternion();
    const normal = new THREE.Vector3();
    for (let m = 0; m < members.length; m++) {
      const i = members[m];
      const w = weight[m];
      const turned = v.set(turnedAll[m * 3], turnedAll[m * 3 + 1], turnedAll[m * 3 + 2]);
      const r = turned.length();
      if (normals) {
        normal.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
        normal.applyQuaternion(blend.slerpQuaternions(identity, r1, w));
        if (r2) {
          const f = Math.min(1, Math.max(0, (r - elbowR + 0.02) / 0.04)) * w;
          if (f > 0) normal.applyQuaternion(blend.slerpQuaternions(identity, r2, f));
        }
        normal.normalize();
        normals[i * 3] = normal.x;
        normals[i * 3 + 1] = normal.y;
        normals[i * 3 + 2] = normal.z;
      }
      const row = rows[Math.floor(r / BIN)];
      const flat = Math.min(1, Math.max(0, (r - 0.1) / 0.08)) * w;
      const along = Math.min(1, r / Math.max(0.05, reach));
      if (row && flat > 0) {
        centre.copy(row.sum).divideScalar(row.count);
        const crease = 1 - flat * (0.1 * along + 0.05 * (0.5 - 0.5 * Math.sin(r * 40)));
        turned.x = centre.x + (turned.x - centre.x) * (1 + 0.18 * flat) * crease;
        turned.z = centre.z + (turned.z - centre.z) * (1 - 0.58 * flat) * crease;
      }
      if (swing) swing[i] = side * along * w;
      const rest = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).sub(pivot);
      rest.lerp(turned, w).add(pivot);
      positions[i * 3] = rest.x;
      positions[i * 3 + 1] = rest.y;
      positions[i * 3 + 2] = rest.z;
    }

    report.sleeves.push({ side, vertices: members.length, length: reach, elbowAt: elbow === null ? null : line[elbow].r, bend: sharpest, turnedBy });
  }
  return report;
}
