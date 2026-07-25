'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
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
}

/** SVG paths are in a y-down space of unknown extent; three.js is y-up and wants metres. */
function buildGeometry(pathData: string, metres: number, segments: number) {
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
  geometry.computeVertexNormals();
  return geometry;
}

export function GarmentMesh({ garment, spec, tier, flow, stretch, wind = 0, pulled = false, metres = 1.15 }: GarmentMeshProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const pull = useRef(0);

  const built = useMemo(() => {
    const path = GARMENTS[garment]?.d;
    if (!path) return null;
    const geometry = buildGeometry(path, metres, tier === 'low' ? 6 : 12);
    if (!geometry) return null;
    return { geometry, rest: Float32Array.from(geometry.attributes.position.array) };
  }, [garment, metres, tier]);

  const repeat = useMemo(() => tileRepeat(spec, metres), [spec, metres]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m || !built) return;
    const position = m.geometry.attributes.position;
    pull.current += ((pulled ? 1 : 0) - pull.current) * Math.min(1, delta * 4);

    for (let i = 0; i < position.count; i++) {
      const d = drape({
        x: built.rest[i * 3],
        y: built.rest[i * 3 + 1],
        height: metres,
        flow,
        stretch,
        wind,
        pull: pull.current,
        time: state.clock.elapsedTime,
      });
      position.setXYZ(i, d.x, d.y, d.z);
    }
    position.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });

  if (!built) return null;
  const shadows = shadowsAllowed(tier);

  return (
    <mesh ref={mesh} geometry={built.geometry} castShadow={shadows} receiveShadow={shadows}>
      <FabricMaterial spec={spec} tier={tier} repeat={repeat} />
    </mesh>
  );
}
