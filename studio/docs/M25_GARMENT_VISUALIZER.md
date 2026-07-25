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
