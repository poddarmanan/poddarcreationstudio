# M25 — Garment Visualizer

The garment dial now cuts the cloth into the chosen shape.

## The silhouettes are the studio's own

`GARMENTS` already held the path data the flat rendering has always drawn. `GarmentMesh` parses
exactly that, triangulates it, and displaces the result with the same `drape` function the
hanging panel uses.

Nobody had to model a kurti — the shapes exist, they are the ones the brand uses, and the 3D
view and the flat view therefore cannot disagree about what a kurti looks like. Adding a sixth
garment is a path string.

What the 3D adds is the judgement a wholesale buyer is actually making: **this cloth, in this
shape, moving**. A fluid rayon in a dress falls quite differently from a crisp PC/PC in the same
cut, and choosing between two qualities for one style is exactly that comparison.

## A garment has a body in it

The first version drew the silhouette once, flat. Face-on it passed; turned, it was a paper
cut-out — no width side-on, gone edge-on, and a dark crease across the shoulders where the
outline's long sliver triangles skewed the displaced normals. Three changes, in the order they
mattered:

**Inflation.** The cut is drawn twice, front and back, and each is pushed out like a cushion:
depth is a function of distance to the *nearest edge* of the outline (`inflation()`), rising
from nothing at a seam to full about 12cm in. That one rule handles side seams, armholes,
necklines and slits alike. Two earlier attempts bowed each row on its own width, which put a
cliff under every armhole and a sawtooth down every seam where rows and outline disagreed. The
hem is left out of the distance, because a garment is open at the bottom and a cushion is not.

**Uniform triangles.** `TessellateModifier` splits the outline's slivers to a bounded edge
length before displacement (3–5cm by tier), then `mergeVertices` re-shares vertices so the
per-frame normals are smooth. Folds also need several vertices per wavelength or they render as
flat slats; garments use half the panel's fold frequency for that reason and because a torso
shows three or four broad folds, not nine.

**Wind is not a fold.** `drape()` now exposes its gust separately. Folds are damped towards the
seams so the two shells can never cross; the gust is applied to both shells together; and a
short quick flutter, growing towards the hem, is what makes a strong wind *look* like wind
rather than a garment sliding sideways.

## On a form, and simulated

Every garment now hangs on a black dress form — a man's for the shirt and t-shirt, a woman's
for the kurti, dress and top (`lib/three/mannequin.ts`, `Mannequin.tsx`). The form is measured
from the garment itself: width at the garment's *narrowest* band between underarm and waist,
read at a percentile so a sleeve hanging at the side does not count as torso; depth the same
way, capped by how deep the cloth actually is. That is why one profile fits a procedural cut
and a supplied model alike.

The procedural cuts are then run by a cloth simulation (`lib/three/cloth.ts`): position-based
dynamics, both shells as one cloth, the outline tied front to back so the seams stay closed,
struts across the interior so the garment keeps its volume, the shoulder line pinned. It hangs
under gravity, is kept outside the form by a collider built from the profile, feels the
turntable — centrifugal flare on a spin, a sideways kick on a flick — and is pushed about by
the wind as a force. The drape function's folds ride on top as detail. `smoke-m42.ts` steps
the simulation without a renderer and checks the things a position-based cloth gets wrong:
melting off its pins, ringing forever, tearing through a collider.

Supplied models are rigid; they get the form and the lean, not the simulation. A 200,000-vertex
t-shirt is not something a phone can relax every frame.

## Supplied models

`public/models/<cut>.glb` overrides the procedural cut with a real garment model, re-dressed in
the same `FabricMaterial` so cloth, shade and light stay the studio's (`GarmentModel.tsx`).
Presence is probed once with a HEAD request; a model that fails to load falls back to the
silhouette through an error boundary and the procedural cut shows while a model downloads.
`public/models/README.md` covers filenames, size and licence attribution. The Draco decoder is
vendored under `public/draco/`.

## UVs come from the silhouette's bounding box

`ShapeGeometry` writes raw model coordinates into `uv`, so the weave would tile at whatever scale
the path happened to be drawn at — a kurti and a shirt would show different thread counts of the
same cloth. Normalising to the shape's own bounding box keeps thread scale constant across cuts.

SVG counts y downwards and three.js counts it up, so the geometry is flipped as it is scaled to
metres.

## A test that matched nothing

The first version detected the silhouette by alpha. Playwright composites a canvas screenshot
onto an opaque backing, so a transparent WebGL canvas comes back as solid RGB — every garment
measured 0% coverage and 0% taper while the render was perfectly correct. Detection is now
relative to the backdrop colour sampled from a corner the cloth never reaches.

That is the second time in this phase a visual assertion measured something other than the
picture. Both times the render was right and the instrument was wrong, and both times the
failure was loud rather than silent only because the numbers were absurd.

## Verifying

```bash
node scripts/smoke-m25.mjs      # included in npm run smoke -- --http
```

- every garment renders as a shaped silhouette rather than a rectangle — a visualiser that
  quietly falls back to the flat panel would pass every other check in this repository
- a kurti and a dress are measurably different cuts, as are a shirt and a t-shirt
- the fabric roll renders as un-cut cloth
- the same cut in a different shade still changes the render
