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

Every garment hangs on a black dress form (`lib/three/mannequin.ts`, `Mannequin.tsx`). The
first form was a fixed profile — a man's or a woman's — scaled to a chest measured at the
garment's narrowest band, and it sat well inside the cloth. From the front that read as a
garment on a stand; turned, or looked at down a neckline or through an armhole, it read as a
shell with nothing in it. A form in a showroom fills the garment, so the form is now the body
read out of the garment itself (`bodyFromGarment`): at every two centimetres of height, in each
of 32 directions round the axis, how far out the cloth is — sleeves left out, a low percentile
so a fold that bulges does not push the body out with it — less the thickness of the cloth, is
a point on the body. The collar becomes the neck, the shoulders the shoulders, the waist the
waist, and a cross-section that is not an ellipse (a shirt is flatter across the chest than an
ellipse through its extremes would be) is followed rather than overshot. The torso is a tube
through those rings, with a neck stump above and a rounded hip below; the collider the cloth
feels is the same rings. A drawn cut is read with more clearance than a model, because a drawn
silhouette is a garment on a person with a garment's ease in it, and a body that held the
cloth out at every vertex crumpled it.

The procedural cuts are then run by a cloth simulation (`lib/three/cloth.ts`): position-based
dynamics, both shells as one cloth, the outline tied front to back so the seams stay closed,
struts across the interior so the garment keeps its volume, the shoulder line pinned. It hangs
under gravity, is kept outside the form by a collider built from the profile, feels the
turntable — centrifugal flare on a spin, a sideways kick on a flick — and is pushed about by
the wind as a force. The drape function's folds ride on top as detail. `smoke-m42.ts` steps
the simulation without a renderer and checks the things a position-based cloth gets wrong:
melting off its pins, ringing forever, tearing through a collider.

A fresh cloth is given two and a half seconds of still air to settle on to its form — but from
the frame loop, a few steps per frame within an 8 ms budget, never all at once before the
first frame. At a few thousand vertices one step costs a phone tens of milliseconds, and the
seconds of blocked main thread that the original pre-settle spent on load are exactly what a
phone browser kills a page for: the kurti and the top, the two cuts with no model, showed
nothing at all on one. The garment is drawn throughout and settles in front of the viewer.

Supplied models are rigid; they get the form, the lean and the wind, not the simulation. A
200,000-vertex t-shirt is not something a phone can relax every frame. The wind reaches them
through the vertex shader (`FabricMaterial`'s `sway`): the loose lower part of the garment is
lifted forward and swung sideways in a slow swell, more the further it hangs from the shoulders
and more with the rail; and a sleeve swings from its shoulder — out from the body and back, a
little fore and aft, the cuff most — by way of a per-vertex attribute (`pcSleeve`, signed by
side, 0 at the shoulder seam and 1 at the cuff) that the relaxation writes. The wind rail is
read linearly (a third per step) for the models and as a 1.5 power for the simulation: the
square it was made "Low" invisible, and "Low" is what the lab opens on.

## Supplied models

`public/models/<cut>.glb` overrides the procedural cut with a real garment model, re-dressed in
the same `FabricMaterial` so cloth, shade and light stay the studio's (`GarmentModel.tsx`).
Presence is probed once with a HEAD request; a model that fails to load falls back to the
silhouette through an error boundary. While a model is probed for or downloads the stage stays
empty and the lab shows a loader — the procedural cut no longer stands in, since it read as the
wrong garment appearing first.
`public/models/README.md` covers filenames, size and licence attribution. The Draco decoder is
vendored under `public/draco/`; it is WebAssembly, so the content security policy in
`proxy.ts` admits `'wasm-unsafe-eval'` (WebAssembly only, not `eval()`) and `connect-src blob:`
for the textures a loader unpacks from the file. Without both, a compressed model never loads
behind the policy, while the static preview — which has no policy — shows it, which is the kind
of difference that gets reported as "works on one phone, not the other".

Every part of a model is baked into a fresh geometry in stage space (turned to face the camera
if modelled side-on, centred, scaled to garment height), its own normals carried along rather
than recomputed — a modeller's winding is not always consistent, and a normal computed from it
can point inward, which under the shadow map's normal bias reads as a dark stain on the cloth.

### Sleeves let down

A garment model is saved as it was worn: sleeves bent at the elbow with the hands forward, or
held out. On a dress form there are no arms in them, so `lib/three/relax.ts` lets them down
from the geometry alone. A part whose vertices lie mostly beyond the torso's width on one side
is a sleeve (a stray piece of collar in the same mesh stays body); its centreline is found by
binning its vertices on distance from the shoulder seam; a sharp turn in the middle of that
line is the elbow (a turn of less than 29°, which the centreline of a straight sleeve wobbles
by, is not one). The upper arm is rotated about the shoulder to hang almost straight down, the
forearm about the elbow to continue, the armhole blended over a few centimetres so the seam
does not tear, and below the shoulder cap the tube is softened: settled front-to-back to
about 70% of its depth and a little wider, slightly tapered to the cuff. Not more — a first
attempt flattened it to a strip with creases on it, and from the side that read as a ragged
ribbon rather than a sleeve. The body is then read from the garment as it now hangs.

Only a model whose sleeves are their own meshes is touched. From the width test alone the
chest's sides read as sleeve too, and moving those distorts the body — so a model saved as
arbitrary chunks (the t-shirt is four 65,532-vertex pieces) keeps its sleeves as modelled.
`smoke-m44.ts` runs the relaxation on the shirt file and checks the sleeves end lower, reach
no further out, and read as straight afterwards; and that the t-shirt is left alone.

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
