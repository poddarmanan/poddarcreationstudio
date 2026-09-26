'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GarmentKey } from '@/lib/fabric-generator';
import { GARMENTS } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import { drape } from '@/lib/three/drape';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { tileRepeat } from '@/lib/three/fabric-spec';
import { FabricMaterial } from './FabricMaterial';
import { Mannequin } from './Mannequin';
import { fitForm, formRadii, type FormFit, type FormSex } from '@/lib/three/mannequin';
import { Cloth, bendEdgesOf, edgesOf, type Collider } from '@/lib/three/cloth';

/** Whose form each cut is shown on. */
export const FORM_SEX: Record<GarmentKey, FormSex> = { shirt: 'male', tshirt: 'male', kurti: 'female', dress: 'female', top: 'female', roll: 'female' };

/**
 * The Garment Visualiser (Phase 4 M25).
 *
 * The silhouettes are the studio's own — the same path data the flat rendering has always
 * drawn, lifted straight out of `GARMENTS`. That is the whole trick: nobody has to model a
 * kurti, the shapes already exist and are already the ones the brand uses, so the 3D view and
 * the flat view can never disagree about what a kurti looks like.
 *
 * What the 3D adds is the thing a buyer actually needs: **this cloth, in this shape, moving**.
 * A fluid rayon in a dress silhouette falls quite differently from a crisp PC/PC in the same
 * cut, and that is precisely the judgement a wholesale buyer is making when they choose between
 * two qualities for one style.
 *
 * The geometry is the silhouette triangulated and then displaced by the same drape function the
 * hanging panel uses, so a garment and a swatch of the same fabric always behave alike.
 *
 * Two things stop it reading as a paper cut-out — which is what a flat shape turned in 3D is,
 * and what the first version looked like:
 *
 * **Volume.** The silhouette is drawn twice, front and back, each inflated like a cushion —
 * depth rising with distance from the nearest edge — so the garment is a closed shell around
 * a body that is not there. Turned side-on it has a width; turned round it shows a back rather
 * than the inside of the front.
 *
 * **Uniform triangles.** A triangulated outline is made of long slivers spanning the whole
 * shape. Displace those per vertex and the recomputed normals skew along the sliver — a hard
 * dark crease from shoulder to shoulder that reads as a lighting fault. Tessellating to a
 * maximum edge length before displacement gives every fold an honest normal.
 */

export interface GarmentMeshProps {
  garment: GarmentKey;
  spec: FabricMaterialSpec;
  tier: QualityTier;
  flow: number;
  stretch: number;
  wind?: number;
  pulled?: boolean;
  /** Height of the finished garment in metres — a kurti is about 1.1m. */
  metres?: number;
  /** Half the front-to-back depth of the shell, metres. A torso is about 0.2m deep. */
  depth?: number;
  /** World y of the floor the form's pole stands on. Omit for no mannequin. */
  floor?: number;
}

/** SVG paths are in a y-down space of unknown extent; three.js is y-up and wants metres. */
function buildGeometry(pathData: string, metres: number, maxEdge: number) {
  const segments = 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><path d="${pathData}"/></svg>`;
  const parsed = new SVGLoader().parse(svg);
  const shapes = parsed.paths.flatMap((p) => SVGLoader.createShapes(p));
  if (!shapes.length) return null;

  const geometry = new THREE.ShapeGeometry(shapes, segments);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const scale = metres / height;

  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    // Normalised UVs across the silhouette's own bounding box. ShapeGeometry writes raw model
    // coordinates into `uv`, which would tile the weave at whatever scale the path happened to
    // be drawn at — a kurti and a shirt would show different thread counts of the same cloth.
    uv.setXY(i, (x - box.min.x) / width, (y - box.min.y) / height);
    // Centre, scale to metres, and flip: SVG counts y downwards.
    position.setXYZ(i, (x - (box.min.x + width / 2)) * scale, -(y - (box.min.y + height / 2)) * scale, 0);
  }

  // Split the slivers down to a bounded edge length, then re-share vertices so the normals
  // computed after each frame's displacement are smooth across the new seams.
  const tessellated = mergeVertices(new TessellateModifier(maxEdge, 16).modify(geometry), 1e-5);
  tessellated.computeVertexNormals();
  geometry.dispose();

  // The outline, in the same metres-and-y-up space as the vertices, for the inflation below.
  const outline = shapes.flatMap((shape) =>
    shape.getPoints(segments).map((pt) => new THREE.Vector2((pt.x - (box.min.x + width / 2)) * scale, -(pt.y - (box.min.y + height / 2)) * scale))
  );
  return { geometry: tessellated, room: inflation(tessellated, outline, metres) };
}

/**
 * How much of the shell's full depth each vertex gets: 0 on the outline, rising smoothly to 1
 * about `REACH` metres in from it.
 *
 * This is how a flat cut becomes a garment with a body in it: inflate it like a cushion, so the
 * depth is a function of distance to the *nearest edge* — side seam, armhole, neckline or slit
 * alike. Earlier versions bowed each row on its own width, which put a cliff under every
 * armhole and, because rows and the outline never quite agreed, a sawtooth down every seam.
 *
 * The hem is left out of the distance: a garment is open at the bottom, and a cushion is not.
 */
const REACH = 0.12;

function inflation(geometry: THREE.BufferGeometry, outline: THREE.Vector2[], metres: number): Float32Array {
  const position = geometry.attributes.position;
  const hem = -metres / 2 + 0.02;
  const segments: [THREE.Vector2, THREE.Vector2][] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (a.distanceTo(b) < 1e-6) continue;
    // Skip the hem: near-horizontal edges along the bottom of the garment.
    if (a.y < hem && b.y < hem && Math.abs(a.y - b.y) < Math.abs(a.x - b.x) * 0.3) continue;
    segments.push([a, b]);
  }
  const p = new THREE.Vector2();
  const q = new THREE.Vector2();
  const out = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    p.set(position.getX(i), position.getY(i));
    let nearest = Infinity;
    for (const [a, b] of segments) {
      q.subVectors(b, a);
      const len2 = q.lengthSq();
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * q.x + (p.y - a.y) * q.y) / len2));
      const dx = a.x + q.x * t - p.x;
      const dy = a.y + q.y * t - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearest) nearest = d2;
    }
    const d = Math.min(1, Math.sqrt(nearest) / REACH);
    // Quick rise from the edge, flat across the middle: a cushion, not a cone.
    out[i] = 1 - (1 - d) * (1 - d);
  }
  return out;
}

/** How high on the cloth the pins go: the top 5cm, which is the shoulder line and the neck. */
const PIN_BAND = 0.05;

/**
 * Builds the simulation for a cut: both shells as one cloth, the outline tied front-to-back so
 * the seams stay closed, struts across the interior so the garment keeps its volume when it is
 * off the form, and the shoulder line pinned.
 */
function buildCloth(geometry: THREE.BufferGeometry, rest: Float32Array, room: Float32Array, depth: number) {
  const n = rest.length / 3;
  const all = new Float32Array(n * 6);
  const pinned = new Uint8Array(n * 2);
  let top = -Infinity;
  for (let i = 1; i < rest.length; i += 3) top = Math.max(top, rest[i]);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const body = depth * room[i];
    all[o] = rest[o];
    all[o + 1] = rest[o + 1];
    all[o + 2] = body;
    all[n * 3 + o] = rest[o];
    all[n * 3 + o + 1] = rest[o + 1];
    all[n * 3 + o + 2] = -body;
    if (rest[o + 1] > top - PIN_BAND) pinned[i] = pinned[n + i] = 1;
  }
  // Edges keep the cloth from stretching; bending springs keep it from crumpling.
  const index = geometry.index!.array;
  const shell = new Uint32Array([...edgesOf(index), ...bendEdgesOf(index)]);
  const edges = new Uint32Array(shell.length * 2 + n * 2);
  edges.set(shell, 0);
  for (let e = 0; e < shell.length; e++) edges[shell.length + e] = shell[e] + n;
  // Seam ties (zero length on the outline) and volume struts (2 × depth inside) are the same
  // constraint at different rest lengths, and the rest length is simply the rest distance.
  for (let i = 0; i < n; i++) {
    edges[shell.length * 2 + i * 2] = i;
    edges[shell.length * 2 + i * 2 + 1] = n + i;
  }
  const cloth = new Cloth(all, edges, pinned);
  // Settle before the first frame, so a garment does not visibly drop onto its form on load.
  for (let i = 0; i < 40; i++) cloth.step(1 / 60, { gravity: 3, wind: [0, 0, 0], spin: { omega: 0, alpha: 0 }, tug: 0 }, null);
  return cloth;
}

/** Pushes a point out of the form, with a little clearance for the cloth's own thickness. */
function colliderFor(fit: FormFit | null): Collider | null {
  if (!fit) return null;
  const clearance = 0.01;
  return (x, y, z, out) => {
    const r = formRadii(fit, y);
    if (!r) return false;
    const rx = r.rx + clearance;
    const rz = r.rz + clearance;
    const d = (x * x) / (rx * rx) + (z * z) / (rz * rz);
    if (d >= 1) return false;
    const k = 1 / Math.sqrt(d || 1e-9);
    out[0] = x * k;
    out[1] = y;
    out[2] = z * k;
    return true;
  };
}

export function GarmentMesh({ garment, spec, tier, flow, stretch, wind = 0, pulled = false, metres = 1.15, depth = 0.09, floor }: GarmentMeshProps) {
  const front = useRef<THREE.Mesh>(null);
  const back = useRef<THREE.Mesh>(null);
  const pull = useRef(0);
  const spin = useRef({ angle: 0, omega: 0, seeded: false });

  const built = useMemo(() => {
    const path = GARMENTS[garment]?.d;
    if (!path) return null;
    // Edge length in metres. Finer than the panel's grid at the same tier, because a silhouette
    // has curves the grid does not and the eye goes straight to the neckline — and because a
    // fold needs several vertices per wavelength or it renders as flat slats, which from an
    // oblique angle look like the garment has been cut into strips.
    const maxEdge = tier === 'high' ? 0.03 : tier === 'medium' ? 0.035 : 0.05;
    const result = buildGeometry(path, metres, maxEdge);
    if (!result) return null;
    const rest = Float32Array.from(result.geometry.attributes.position.array);
    return {
      front: result.geometry,
      back: result.geometry.clone(),
      rest,
      room: result.room,
      cloth: buildCloth(result.geometry, rest, result.room, depth),
    };
  }, [garment, metres, tier, depth]);

  const repeat = useMemo(() => tileRepeat(spec, metres), [spec, metres]);
  // The cloth is `depth` deep at most, so the form is capped a little inside that.
  const fit = useMemo(() => (built ? fitForm(built.rest, FORM_SEX[garment], depth * 0.62) : null), [built, garment, depth]);
  const collider = useMemo(() => colliderFor(fit), [fit]);

  useFrame((state, delta) => {
    const f = front.current;
    const b = back.current;
    if (!f || !b || !built) return;
    const dt = Math.min(delta, 1 / 30);
    const t = state.clock.elapsedTime;
    pull.current += ((pulled ? 1 : 0) - pull.current) * Math.min(1, dt * 4);

    // What the turntable is doing, read from the group that turns us: the cloth feels a spin
    // as centrifugal flare and a change of speed as a sideways kick.
    let turntable: THREE.Object3D | null = f.parent;
    for (let depthUp = 0; depthUp < 4 && turntable && turntable.rotation.y === 0; depthUp++) turntable = turntable.parent;
    const angle = turntable?.rotation.y ?? 0;
    const sp = spin.current;
    if (!sp.seeded) {
      sp.angle = angle;
      sp.seeded = true;
    }
    // Derivatives use the real frame time, not the clamped one: after a hitch (a tab switch, a
    // slow machine) the clamped step would read a modest turn as a violent one and fling the
    // garment off its form. A gap over a fifth of a second is simply not a measurement.
    const measurable = delta > 0 && delta < 0.2;
    const turned = Math.atan2(Math.sin(angle - sp.angle), Math.cos(angle - sp.angle));
    const omega = measurable ? Math.max(-4, Math.min(4, turned / delta)) : 0;
    const alpha = measurable ? Math.max(-25, Math.min(25, (omega - sp.omega) / delta)) : 0;
    sp.angle = angle;
    sp.omega = omega;

    // Wind as a force: a steady push that breathes, plus a little turbulence. Sized against
    // the reduced gravity so that "Low" stirs the hem and "Strong" lifts it, and nothing lays
    // the garment out flat.
    const gust = wind * 0.32 * (0.9 + 0.5 * Math.sin(t * 1.4) + 0.2 * Math.sin(t * 3.7));
    built.cloth.step(
      dt,
      {
        gravity: 3,
        wind: [gust * 0.15 * Math.sin(t * 0.7), 0, gust],
        spin: { omega: omega * 0.6, alpha: alpha * 0.6 },
        tug: pull.current * 5,
      },
      collider,
      2,
      tier === 'high' ? 7 : 5
    );

    // The simulation says where the cloth is; the drape function still supplies the folds, as
    // a detail layer along the shell's thickness. Folds are scaled by how much room the shell
    // has, so they never cross the seams.
    const n = built.rest.length / 3;
    const pos = built.cloth.pos;
    const fp = f.geometry.attributes.position;
    const bp = b.geometry.attributes.position;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const rx = built.rest[o];
      const ry = built.rest[o + 1];
      const room = built.room[i];
      const d = drape({ x: rx * 0.5, y: ry, height: metres, flow, stretch, wind, pull: pull.current, time: t });
      const hang = Math.max(0, 0.5 - ry / metres);
      const flutter = wind * 0.03 * Math.sin(rx * 18 + t * 5 + ry * 4) * hang * room;
      const fold = ((d.z - d.gust) * 0.9 + flutter) * room;
      fp.setXYZ(i, pos[o], pos[o + 1], pos[o + 2] + fold);
      const q = n * 3 + o;
      bp.setXYZ(i, pos[q], pos[q + 1], pos[q + 2] - fold * 0.5);
    }
    fp.needsUpdate = true;
    bp.needsUpdate = true;
    f.geometry.computeVertexNormals();
    b.geometry.computeVertexNormals();
  });

  if (!built) return null;
  const shadows = shadowsAllowed(tier);

  return (
    <group>
      {fit && floor !== undefined && <Mannequin fit={fit} floor={floor} />}
      <mesh ref={front} geometry={built.front} castShadow={shadows} receiveShadow={shadows}>
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
      <mesh ref={back} geometry={built.back} castShadow={shadows} receiveShadow={shadows}>
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
    </group>
  );
}
