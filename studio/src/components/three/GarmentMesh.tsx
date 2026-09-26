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

export function GarmentMesh({ garment, spec, tier, flow, stretch, wind = 0, pulled = false, metres = 1.15, depth = 0.09 }: GarmentMeshProps) {
  const front = useRef<THREE.Mesh>(null);
  const back = useRef<THREE.Mesh>(null);
  const pull = useRef(0);

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
    return {
      front: result.geometry,
      back: result.geometry.clone(),
      rest: Float32Array.from(result.geometry.attributes.position.array),
      room: result.room,
    };
  }, [garment, metres, tier]);

  const repeat = useMemo(() => tileRepeat(spec, metres), [spec, metres]);

  useFrame((state, delta) => {
    const f = front.current;
    const b = back.current;
    if (!f || !b || !built) return;
    const fp = f.geometry.attributes.position;
    const bp = b.geometry.attributes.position;
    pull.current += ((pulled ? 1 : 0) - pull.current) * Math.min(1, delta * 4);

    for (let i = 0; i < fp.count; i++) {
      const rx = built.rest[i * 3];
      const d = drape({
        // Half the fold frequency of a free-hanging length. Cloth on a body settles into three
        // or four broad folds across a torso, not the eight or nine a hanging panel of the same
        // quality shows — and broad folds are also the ones the tessellation can carry.
        x: rx * 0.5,
        y: built.rest[i * 3 + 1],
        height: metres,
        flow,
        stretch,
        wind,
        pull: pull.current,
        time: state.clock.elapsedTime,
      });
      const room = built.room[i];
      const body = depth * room;
      // Folds are scaled by how much room the shell has at that point: full depth down the
      // middle, nothing at the side seams. Without this the front's folds and the back's cross
      // each other near the edges, and from any oblique angle the garment reads as shredded.
      // A garment on a form folds a little less than a length hung free, hence the 0.9.
      const fold = (d.z - d.gust) * 0.9 * room;
      // Wind does two things to a garment on a form. It pushes the whole thing — applied
      // undamped and with the same sign to both shells, so it can never make them cross — and
      // it agitates the cloth: short, quick ripples that grow towards the hem, where the cloth
      // is loose. The push alone moves the garment without changing how it is lit, which is
      // not what wind looks like.
      const t = state.clock.elapsedTime;
      const hang = Math.max(0, 0.5 - built.rest[i * 3 + 1] / metres);
      const flutter = wind * 0.03 * Math.sin(rx * 18 + t * 5 + built.rest[i * 3 + 1] * 4) * hang * room;
      // And the hem swings: the loose lower part of a garment moves sideways in a gust, more the
      // further from the shoulders it hangs. Both shells together, so nothing crosses.
      const swing = wind * 0.02 * Math.sin(t * 1.1) * hang * hang;
      // `drape` was handed half the x for the fold frequency; its x output is scaled the same
      // way, so it is doubled back. (Left as-is, every garment rendered at half its width.)
      const x = d.x * 2;
      fp.setXYZ(i, x + swing, d.y, body + fold + flutter + d.gust);
      // The back carries the same folds, shallower and mirrored, so the two halves stay a
      // closed shell at the sides whatever the cloth is doing.
      bp.setXYZ(i, x + swing, d.y, -body - (fold + flutter) * 0.5 + d.gust);
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
      <mesh ref={front} geometry={built.front} castShadow={shadows} receiveShadow={shadows}>
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
      <mesh ref={back} geometry={built.back} castShadow={shadows} receiveShadow={shadows}>
        <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
      </mesh>
    </group>
  );
}
