import * as THREE from 'three';
import { generateWeaveMaps, weaveCacheKey, type WeaveSpec } from './weave';
import { approxTextureBytes, getTextureCache } from './texture-cache';

/**
 * Turns a weave specification into GPU textures (Phase 4 M21).
 *
 * This is the seam between the pure, canvas-based generator in `weave.ts` — which knows
 * nothing about three.js and can run in a worker — and the renderer. Everything here is about
 * *resources*: creating them once, sharing them between every surface that wants the same
 * cloth, and releasing them when nobody does.
 *
 * The cache is keyed on the specification rather than on the fabric id, so a shade shown in
 * the viewer, in a comparison, and on a garment is one texture on the GPU, not three.
 */

export interface WeaveTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** Edge length in pixels — the tier decided this, not the fabric. */
  size: number;
}

/**
 * Colour maps carry sRGB values; normal maps carry vectors. Tagging them wrong is the classic
 * way to get washed-out cloth and lighting that leans the wrong way, and it is silent.
 */
function configure(texture: THREE.Texture, colour: boolean, aniso: number): THREE.Texture {
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = aniso;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The albedo and normal maps for a weave, generated on first request and shared thereafter.
 *
 * Both maps come out of a single generation pass, because the normal is derived from the same
 * height field that shades the albedo — asking for them separately would either generate twice
 * or risk the two disagreeing.
 */
export function weaveTextures(spec: WeaveSpec, size: number, anisotropy = 1): WeaveTextures {
  const cache = getTextureCache();
  const albedoKey = weaveCacheKey(spec, size, 'albedo');
  const normalKey = weaveCacheKey(spec, size, 'normal');

  // One pass, memoised: whichever map is asked for first generates both and parks the other.
  let generated: ReturnType<typeof generateWeaveMaps> | null = null;
  const generate = () => (generated ??= generateWeaveMaps(spec, size));
  const bytes = approxTextureBytes(size);

  const map = cache.get(albedoKey, () => configure(new THREE.CanvasTexture(generate().albedo), true, anisotropy), bytes);
  const normalMap = cache.get(normalKey, () => configure(new THREE.CanvasTexture(generate().normal), false, anisotropy), bytes);

  return { map, normalMap, size };
}

/**
 * Claims a weave's textures for as long as a surface is drawing with them. Call from an
 * effect, release in its cleanup — never during render, where StrictMode's double invocation
 * would leak a claim.
 */
export function retainWeaveTextures(spec: WeaveSpec, size: number): void {
  const cache = getTextureCache();
  cache.retain(weaveCacheKey(spec, size, 'albedo'));
  cache.retain(weaveCacheKey(spec, size, 'normal'));
}

/** Gives up the claim. The textures stay cached and become evictable once nobody holds them. */
export function releaseWeaveTextures(spec: WeaveSpec, size: number): void {
  const cache = getTextureCache();
  cache.release(weaveCacheKey(spec, size, 'albedo'));
  cache.release(weaveCacheKey(spec, size, 'normal'));
}
