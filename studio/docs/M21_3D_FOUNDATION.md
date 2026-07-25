# M21 — 3D foundation

The host every later 3D milestone mounts into, plus the resource discipline that keeps it from
becoming a memory leak with a camera.

## The contract

**3D is an enhancement, never a requirement.** A buyer on a five-year-old Android in a Surat
market must see the fabric. So `Stage` decides — before loading a byte of three.js — whether the
device can render, and shows the flat rendering the studio has always had if it cannot. The same
applies if the GL context is lost or the scene throws. There is no state in which a customer gets
a blank rectangle.

| State | What the customer sees |
|---|---|
| No WebGL, or `tier: off` | The flat rendering. three.js is never downloaded. |
| Server render / pre-hydration | The flat rendering. |
| Context lost | The flat rendering, already mounted underneath — no flash of empty canvas. |
| Scene throws | The flat rendering. The page around it is untouched. |
| Everything fine | The canvas. |

## The pieces

| File | Does |
|---|---|
| `src/lib/three/capability.ts` | One synchronous probe → tier, max texture size, DPR, renderer name |
| `src/lib/three/weave.ts` | Procedural albedo + normal maps from a fabric's own specification |
| `src/lib/three/textures.ts` | Weave → GPU textures, shared and reference-counted |
| `src/lib/three/texture-cache.ts` | LRU with real `dispose()`, and retain/release |
| `src/components/three/Stage.tsx` | Capability gate, error boundary, fallback, telemetry |
| `src/components/three/StageCanvas.tsx` | The `<Canvas>`: context loss, disposal, visibility, frame stats |
| `src/components/three/WeaveSurface.tsx` | The smallest complete path — spec to lit cloth. M22 replaces the material. |
| `src/components/three/ThreeReadiness.tsx` | The staff diagnostics panel |
| `src/app/api/telemetry/route.ts` | The browser's allow-listed channel into the telemetry pipeline |

## Decisions worth keeping

**Textures are cached by content, not by fabric.** A shade shown in the viewer, in a comparison,
and on a garment is one texture on the GPU rather than three.

**Retain and release are separate from `get`.** `get` runs during render, and StrictMode renders
twice; effects are guaranteed to be paired. Claiming inside `get` would leak a reference on every
re-render. An entry a live surface is drawing with is never evicted however old it is — freeing a
texture out from under a material gives you a white plane, not a smaller footprint.

**Capability is read through `useSyncExternalStore`.** Reading it directly during render is a
hydration mismatch on every page: the server has no GPU and says "off" while the browser says
"high".

**Frames are drawn on demand unless something moves, someone is looking, and they asked for
motion.** A fabric behind a modal, or in a tab left open yesterday, costs exactly as much as one
being looked at. An `IntersectionObserver` and `visibilitychange` decide; the M21 smoke asserts
the off-screen case.

**React unmounts the tree; it does not unmount VRAM.** The canvas disposes the renderer and
clears the texture cache in an unmount effect.

**`preserveDrawingBuffer` is off.** It costs memory and only matters for reading pixels back,
which is M30's problem and M30 can ask.

**Client telemetry is allow-listed.** Without that, `/api/telemetry` is an unauthenticated write
endpoint anyone can fill with arbitrary records. Names come from `CLIENT_EVENTS`; properties are
capped in count, key length and value length; unknown events are swallowed with a 204 rather than
reported back to a page that cannot read the answer anyway.

## Why the textures are generated rather than downloaded

A stock fabric texture is a photograph of *some* cloth. This catalogue has eleven qualities with
real specifications already in the codebase — weight, composition, thread count, hand, sheen —
and a customer is deciding whether to order *this* one. Deriving the weave from those numbers
means the render is a picture of the actual product: a 40s cambric and a 20kg gajji silk differ
on screen because they differ on the spec sheet.

It is also deterministic, licence-free, resolution-independent, and adds nothing to the bundle.
This container cannot download HDRIs or texture packs, so the approach is also the only one
available here; if that changes, `weave.ts` is the one file that would need to grow an
image-loading path.

## Verifying

```bash
npm run build && npm run start
npm run smoke:three          # or npm run smoke -- --http, which now includes it
```

`scripts/smoke-three.mjs` drives a real browser, signs in as staff, and asserts:

- the stage mounts a canvas with a live WebGL context and a non-degenerate drawing buffer
- off-screen, the stage draws on demand rather than continuously
- once scrolled into view, frames are drawn and both weave maps reach the GPU
- the framebuffer contains an image, not a cleared background
- `/api/telemetry` accepts allow-listed events and swallows everything else
- with `getContext('webgl*')` removed, the stage falls back, the flat rendering is visible, and
  the rest of the page is unaffected

**On frame rates:** this container renders through SwiftShader, a software rasteriser. Its
numbers say nothing about a real GPU, so the smoke asserts correctness — a context exists, pixels
were drawn, memory is claimed and released — and never a frame-rate threshold. M29 measures
performance where performance is real.

Staff can read the same numbers off any device at `/admin/diagnostics` → **3D readiness**, which
is the only client-rendered section on that page and exists precisely because a GPU's capability
is knowable nowhere else.
