'use client';

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { GarmentKey } from '@/lib/fabric-generator';
import type { QualityTier } from '@/lib/three/capability';
import { shadowsAllowed } from '@/lib/three/capability';
import type { FabricMaterialSpec } from '@/lib/three/fabric-spec';
import { tileRepeat } from '@/lib/three/fabric-spec';
import { FabricMaterial } from './FabricMaterial';
import { Mannequin } from './Mannequin';
import { FORM_SEX } from './GarmentMesh';
import { bodyFromGarment, fitForm } from '@/lib/three/mannequin';
import { relaxSleeves, sleevesByPart } from '@/lib/three/relax';

/**
 * Modelled garments (Phase 4 M25, extended).
 *
 * The procedural silhouettes in `GarmentMesh` need no assets and always work. A real garment
 * model — a kurti with a placket, a shirt with a collar and cuffs — is what a buyer recognises,
 * and the owner supplies those as glTF files, one per cut, in `public/models/`:
 *
 *   kurti.glb · shirt.glb · saree.glb · top.glb · tshirt.glb
 *
 * Drop a file in and that cut uses it; take it out and the cut falls back. Nothing else to
 * configure. The model's own materials are discarded: every surface is re-dressed in the same
 * `FabricMaterial` the rest of the studio uses, so a modelled kurti in Peacock rayon and a
 * hanging panel of Peacock rayon are the same cloth under the same light. The geometry is
 * scaled to a real garment height and centred, whatever units the modeller worked in.
 *
 * Presence is checked once per file with a HEAD request rather than by attempting the load, so
 * a cut with no model does not spend a failed download and a console error on every visit.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const GARMENT_MODEL_FILES: Partial<Record<GarmentKey, string>> = {
  kurti: `${BASE}/models/kurti.glb`,
  shirt: `${BASE}/models/shirt.glb`,
  saree: `${BASE}/models/saree.glb`,
  top: `${BASE}/models/top.glb`,
  tshirt: `${BASE}/models/tshirt.glb`,
};

/**
 * A model's own texture sometimes does the cutting out: a top photographed on to a dress form
 * comes with the form in the mesh and nothing but transparent texels over it. That alpha is
 * kept, as the only thing of the model's material that is — turned into a mask the studio's
 * cloth honours, and used to decide which vertices are garment when fitting and centring it.
 */
interface Cutout {
  mask: THREE.Texture;
  visible: (u: number, v: number) => boolean;
}

function cutoutOf(material: THREE.Material | THREE.Material[] | undefined): Cutout | null {
  const single = (Array.isArray(material) ? material[0] : material) as THREE.MeshStandardMaterial | undefined;
  const map = single?.map;
  const image = map?.image as { width?: number; height?: number } | undefined;
  if (!single || !map || !image?.width || !image.height || typeof document === 'undefined') return null;
  if (!(single.transparent || single.alphaTest > 0)) return null;
  const w = image.width;
  const h = image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0);
  } catch {
    return null;
  }
  const alpha = ctx.getImageData(0, 0, w, h).data;
  let hidden = 0;
  for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 128) hidden++;
  if (hidden / (w * h) < 0.02) return null; // nothing is cut out; the texture is just a picture
  const grey = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i += 4) {
    const a = alpha[i + 3];
    grey.data[i] = a;
    grey.data[i + 1] = a;
    grey.data[i + 2] = a;
    grey.data[i + 3] = 255;
  }
  ctx.putImageData(grey, 0, 0);
  const mask = new THREE.CanvasTexture(canvas);
  mask.flipY = map.flipY;
  mask.wrapS = map.wrapS;
  mask.wrapT = map.wrapT;
  mask.channel = map.channel;
  mask.colorSpace = THREE.NoColorSpace;
  const flip = map.flipY;
  const visible = (u: number, v: number) => {
    const fu = u - Math.floor(u);
    const fv = v - Math.floor(v);
    const x = Math.min(w - 1, Math.floor(fu * w));
    const y = Math.min(h - 1, Math.floor((flip ? 1 - fv : fv) * h));
    return alpha[(y * w + x) * 4 + 3] >= 128;
  };
  return { mask, visible };
}

const availability = new Map<string, Promise<boolean>>();

function isAvailable(url: string): Promise<boolean> {
  let pending = availability.get(url);
  if (!pending) {
    pending = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && !/text\/html/i.test(r.headers.get('content-type') ?? ''))
      .catch(() => false);
    availability.set(url, pending);
  }
  return pending;
}

export type GarmentModelStatus = 'checking' | 'present' | 'absent';

/**
 * Whether a cut has a model: `checking` until the HEAD request answers, then `present` with
 * its URL or `absent`. The distinction matters on the stage — while checking, nothing is drawn
 * rather than the built-in cut, which would only be replaced a moment later.
 */
export function useGarmentModel(garment: GarmentKey | undefined): { status: GarmentModelStatus; url: string | null } {
  const url = garment ? GARMENT_MODEL_FILES[garment] : undefined;
  // Keyed by URL so a stale answer for the previous cut is never read as this one's.
  const [known, setKnown] = useState<{ url: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    isAvailable(url).then((ok) => {
      if (live) setKnown({ url, ok });
    });
    return () => {
      live = false;
    };
  }, [url]);
  if (!url) return { status: 'absent', url: null };
  if (known?.url !== url) return { status: 'checking', url: null };
  return known.ok ? { status: 'present', url } : { status: 'absent', url: null };
}

/** Rendered in place of a model while it loads: says so to whoever is listening, draws nothing. */
function LoadingSignal({ onLoading }: { onLoading?: (loading: boolean) => void }) {
  useEffect(() => {
    onLoading?.(true);
    return () => onLoading?.(false);
  }, [onLoading]);
  return null;
}

export interface GarmentModelProps {
  url: string;
  garment: GarmentKey;
  /** World y of the floor the form's pole stands on. Omit for no mannequin. */
  floor?: number;
  spec: FabricMaterialSpec;
  tier: QualityTier;
  wind?: number;
  /** Height the model is scaled to, metres. */
  metres?: number;
}

/** A supplied model, re-dressed in the studio's cloth. Suspends while loading; throws on failure. */
export function GarmentModel({ url, garment, spec, tier, wind = 0, metres = 1.15, floor }: GarmentModelProps) {
  const gltf = useGLTF(url, `${BASE}/draco/`);
  const group = useRef<THREE.Group>(null);

  const built = useMemo(() => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const sources: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; cutout: Cutout | null }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.attributes.position) sources.push({ geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), cutout: cutoutOf(mesh.material) });
    });
    const total = sources.reduce((n, s) => n + s.geometry.attributes.position.count, 0);
    // Every vertex in the model's own space, its normal with it, and whether its texels are
    // there to be seen. The model's own normals are kept rather than recomputed: a modeller's
    // winding is not always consistent, and a normal computed from it can point inward, which
    // under a shadow map's normal bias reads as a dark stain on the cloth.
    const world = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    const shown = new Uint8Array(total);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let o = 0;
    for (const source of sources) {
      const pos = source.geometry.attributes.position;
      const nor = source.geometry.attributes.normal;
      const uv = source.geometry.attributes.uv;
      normalMatrix.getNormalMatrix(source.matrix);
      for (let i = 0; i < pos.count; i++, o++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(source.matrix);
        world[o * 3] = v.x;
        world[o * 3 + 1] = v.y;
        world[o * 3 + 2] = v.z;
        shown[o] = source.cutout && uv ? (source.cutout.visible(uv.getX(i), uv.getY(i)) ? 1 : 0) : 1;
        if (shown[o]) box.expandByPoint(v);
        if (nor) {
          v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
          normals[o * 3] = v.x;
          normals[o * 3 + 1] = v.y;
          normals[o * 3 + 2] = v.z;
        }
      }
    }
    // A texture atlas has transparent texels between its islands and no vertex on them; such
    // a model is not cut out at all, and carries no mask.
    let from = 0;
    for (const source of sources) {
      const count = source.geometry.attributes.position.count;
      let hidden = 0;
      for (let i = from; i < from + count; i++) if (!shown[i]) hidden++;
      if (source.cutout && hidden === 0) {
        source.cutout.mask.dispose();
        source.cutout = null;
      }
      from += count;
    }
    if (box.isEmpty()) box.setFromObject(scene);
    const raw = box.getSize(new THREE.Vector3());
    const rawCentre = box.getCenter(new THREE.Vector3());
    // Modellers do not agree on which way is forward. A garment is wider than it is deep, so
    // if the model's x extent is the smaller of the two it is standing side-on to the camera
    // and is turned a quarter to face it: a quarter turn about y maps (x, z) to (z, -x). The
    // scene itself is left untouched (it is cached and shared); every part is baked into a
    // fresh geometry in stage space — turned, centred, scaled to garment height — so that the
    // sleeves can be moved and the form fitted on the very vertices that are drawn.
    const turn = raw.x < raw.z;
    const centre = turn ? new THREE.Vector3(rawCentre.z, rawCentre.y, -rawCentre.x) : rawCentre;
    const scale = raw.y > 0 ? metres / raw.y : 1;
    const all = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) {
      v.set(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]);
      if (turn) v.set(v.z, v.y, -v.x);
      v.sub(centre).multiplyScalar(scale);
      all[i * 3] = v.x;
      all[i * 3 + 1] = v.y;
      all[i * 3 + 2] = v.z;
      if (turn) {
        const nx = normals[i * 3 + 2];
        normals[i * 3 + 2] = -normals[i * 3];
        normals[i * 3] = nx;
      }
    }
    // The garment alone, for measuring: cut-out vertices are drawn nowhere, so they have no
    // say in where the form goes or which vertices are sleeve.
    const index: number[] = [];
    const ranges: [number, number][] = [];
    let at = 0;
    for (const source of sources) {
      const count = source.geometry.attributes.position.count;
      const start = index.length;
      for (let i = at; i < at + count; i++) if (shown[i]) index.push(i);
      ranges.push([start, index.length]);
      at += count;
    }
    const garmentOnly = new Float32Array(index.length * 3);
    const normalsOnly = new Float32Array(index.length * 3);
    index.forEach((i, k) => {
      for (let c = 0; c < 3; c++) {
        garmentOnly[k * 3 + c] = all[i * 3 + c];
        normalsOnly[k * 3 + c] = normals[i * 3 + c];
      }
    });
    // A modelled garment has real sleeves hanging beside the torso and a real collar above it,
    // so the form is read lower down the band, filled less, and hung lower than for a flat cut.
    const fitOptions = { percentile: 0.45, ease: 0.72, shoulderDrop: 0.13 } as const;
    const fit = fitForm(garmentOnly, FORM_SEX[garment], fitOptions);
    // The model was saved as it was worn — sleeves bent at the elbow, or held out. On a form
    // there are no arms in them, so they are let down to hang. Only a model whose sleeves are
    // their own meshes is touched. `swing` says, per vertex, how far along a sleeve it is, for
    // the wind to swing it from the shoulder.
    let relaxed = false;
    const swing = new Float32Array(total);
    let membership: Int8Array | null = null;
    if (fit) {
      const sleeves = sleevesByPart(garmentOnly, ranges, fit.shoulderY);
      membership = sleeves.membership;
      if (sleeves.confident) {
        const swingOnly = new Float32Array(index.length);
        relaxSleeves(garmentOnly, { torsoHalf: sleeves.torsoHalf, shoulderY: fit.shoulderY }, sleeves.membership, normalsOnly, swingOnly);
        index.forEach((i, k) => {
          for (let c = 0; c < 3; c++) {
            all[i * 3 + c] = garmentOnly[k * 3 + c];
            normals[i * 3 + c] = normalsOnly[k * 3 + c];
          }
          swing[i] = swingOnly[k];
        });
        relaxed = true;
      }
    }
    // The form is the body read out of the garment as it now hangs — the cloth lies on it.
    const body = bodyFromGarment(garmentOnly, membership, FORM_SEX[garment]);
    at = 0;
    const parts = sources.map((source) => {
      const count = source.geometry.attributes.position.count;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(all.subarray(at * 3, (at + count) * 3), 3));
      at += count;
      const uv = source.geometry.attributes.uv;
      if (uv) geometry.setAttribute('uv', uv);
      if (source.geometry.index) geometry.setIndex(source.geometry.index);
      if (source.geometry.attributes.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(normals.subarray((at - count) * 3, at * 3), 3));
      else geometry.computeVertexNormals();
      geometry.setAttribute('pcSleeve', new THREE.BufferAttribute(swing.subarray(at - count, at), 1));
      return { geometry, mask: source.cutout?.mask };
    });
    return { parts, body, relaxed };
  }, [gltf, metres, garment]);
  useEffect(
    () => () => {
      for (const part of built.parts) {
        part.geometry.dispose();
        part.mask?.dispose();
      }
    },
    [built]
  );

  const repeat = useMemo(() => tileRepeat(spec, metres), [spec, metres]);
  const shadows = shadowsAllowed(tier);

  // A rigid model does not drape, but it need not stand like a statue: the material ripples
  // its surface a little, more towards the hem and more in the wind (see FabricMaterial's
  // `sway`), and the whole garment leans slightly with a gust.
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.rotation.x = Math.sin(state.clock.elapsedTime * 1.1) * 0.004 * wind;
  });
  const sway = useMemo(() => ({ top: metres / 2, hem: -metres / 2, amount: 0.35 + 0.65 * Math.min(1, wind / 3), wind: Math.min(1, wind / 3) }), [metres, wind]);

  return (
    <group ref={group}>
      {built.body && floor !== undefined && <Mannequin body={built.body} floor={floor} />}
      {built.parts.map((part, i) => (
        <mesh key={i} geometry={part.geometry} castShadow={shadows} receiveShadow={shadows}>
          <FabricMaterial spec={spec} tier={tier} repeat={repeat} sway={sway} mask={part.mask} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A model that fails to load — a bad file, a lost connection — must never take the stage down
 * with it. The boundary hands the cut back to the procedural silhouette and stays there for the
 * life of the view.
 */
export class GarmentModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * While a model loads the stage stays empty and `onLoading` is told, so the lab can show a
 * loader rather than the built-in cut (which used to stand in, and read as the wrong garment
 * appearing first). `fallback` is for a model that fails to load.
 */
export function ModelledGarment({ url, fallback, onLoading, ...props }: GarmentModelProps & { fallback: ReactNode; onLoading?: (loading: boolean) => void }) {
  return (
    <GarmentModelBoundary fallback={fallback}>
      <Suspense fallback={<LoadingSignal onLoading={onLoading} />}>
        <GarmentModel url={url} {...props} />
      </Suspense>
    </GarmentModelBoundary>
  );
}
