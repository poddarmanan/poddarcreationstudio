/**
 * Device capability detection (Phase 4 M21).
 *
 * Everything 3D in this app is opt-in on capability: we decide what a device can actually
 * render *before* mounting a canvas, and we never let a weak device stall the studio. The
 * detection is deliberately cheap and synchronous — it runs once, on the client, and its result
 * chooses the quality tier for every later decision (texture size, shadows, samples, DPR).
 *
 * SSR-safe: every function guards on `typeof window`, so this module can be imported from a
 * server component without exploding.
 */

export type QualityTier = 'off' | 'low' | 'medium' | 'high';

export interface Capability {
  /** WebGL2, WebGL1, or nothing at all. */
  webgl: 2 | 1 | 0;
  tier: QualityTier;
  /** Largest texture the GPU will accept — caps our generated map resolution. */
  maxTextureSize: number;
  /** Device pixel ratio we are willing to render at (never above 2; the cost is quadratic). */
  pixelRatio: number;
  mobile: boolean;
  /** The user asked for less motion; we honour it by holding the camera still. */
  reducedMotion: boolean;
  renderer: string;
  reason?: string;
  /** The tier was asked for (`?quality=`), so adaptation must not move it. */
  forced?: boolean;
}

const SERVER: Capability = {
  webgl: 0,
  tier: 'off',
  maxTextureSize: 0,
  pixelRatio: 1,
  mobile: false,
  reducedMotion: false,
  renderer: 'server',
  reason: 'Rendered on the server — capability is only known in the browser',
};

/**
 * The snapshot a server render sees. Exported so `useSyncExternalStore` can hand React a
 * stable server value and let it reconcile to the real one after hydration — reading the
 * capability during render would otherwise be a hydration mismatch on every page.
 */
export const SERVER_CAPABILITY: Capability = SERVER;

let cached: Capability | null = null;

/** Detects once and memoises. Returns a safe "off" capability during SSR. */
export function detectCapability(): Capability {
  if (typeof window === 'undefined') return SERVER;
  if (cached) return cached;

  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);

    if (!gl) {
      cached = { ...SERVER, renderer: 'none', reason: 'This browser or device has no WebGL support' };
      return cached;
    }

    const maxTextureSize = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 2048;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));

    // A software rasteriser reports itself honestly. It works, but it is roughly two orders of
    // magnitude slower than a GPU, so it gets the lowest tier rather than a broken experience.
    const software = /swiftshader|llvmpipe|software|microsoft basic/i.test(renderer);

    const detected: QualityTier = software ? 'low' : mobile ? 'medium' : gl2 ? 'high' : 'medium';
    // A stated preference wins over the guess: `?quality=high` on the URL, or `pc:quality` in
    // localStorage for a whole session. This is how a tier is checked on the device it is
    // meant for — and how a buyer with a strong phone and a weak default gets the better one.
    const forced = qualityOverride();
    const tier = forced ?? detected;

    cached = {
      webgl: gl2 ? 2 : 1,
      tier,
      maxTextureSize: Math.min(maxTextureSize, 4096),
      // Retina at full DPR quadruples the fragment cost for a difference few people can see on
      // fabric; 2 is the ceiling and mobile stays at 1.5 unless the tier was asked for.
      pixelRatio: Math.min(window.devicePixelRatio || 1, mobile && !forced ? 1.5 : 2),
      mobile,
      reducedMotion,
      renderer,
      forced: forced !== null,
      ...(software ? { reason: 'Software rendering detected — running at reduced quality' } : {}),
    };
    return cached;
  } catch (err) {
    cached = { ...SERVER, renderer: 'error', reason: err instanceof Error ? err.message : 'WebGL probe failed' };
    return cached;
  } finally {
    // Free the probe context immediately; browsers cap simultaneous WebGL contexts.
    canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

const TIERS_BY_NAME = new Set<QualityTier>(['low', 'medium', 'high']);

/** `?quality=` on the URL, else `pc:quality` in localStorage, else nothing. */
function qualityOverride(): QualityTier | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('quality');
    const fromStorage = window.localStorage?.getItem('pc:quality');
    const value = (fromUrl ?? fromStorage ?? '').toLowerCase() as QualityTier;
    if (fromUrl && TIERS_BY_NAME.has(value)) window.localStorage?.setItem('pc:quality', value);
    return TIERS_BY_NAME.has(value) ? value : null;
  } catch {
    return null;
  }
}

/** Test seam — lets the smoke scripts exercise every tier without a browser. */
export function __setCapabilityForTest(capability: Capability | null): void {
  cached = capability;
}

/** Resolution of the generated fabric maps for a tier, clamped to what the GPU accepts. */
export function textureSizeFor(tier: QualityTier, maxTextureSize: number): number {
  const wanted = tier === 'high' ? 1024 : tier === 'medium' ? 512 : 256;
  return Math.min(wanted, maxTextureSize || wanted);
}

/**
 * Whether a tier can afford shadow maps. One 1024px map from the key light is a single extra
 * pass over two or three meshes; a phone GPU does that comfortably, and cloth without a
 * shadow under its folds reads as a picture of cloth. Only the software tier goes without.
 */
export function shadowsAllowed(tier: QualityTier): boolean {
  return tier !== 'low';
}

/** Target frame budget in ms. Anything slower triggers adaptive quality (M29). */
export function frameBudgetMs(tier: QualityTier): number {
  // 60fps desktop = 16.7ms; 30fps mobile/software = 33.3ms.
  return tier === 'high' ? 16.7 : 33.3;
}
