# M24 — Fabric Lab

The Lab's controls now drive the real scene. Same rails, same pills, same layout — what changed
is that pressing them alters physics rather than a CSS filter.

| Control | What it now does |
|---|---|
| Lighting rail | Swaps the actual three-light rig and the renderer's exposure (`LightingRig`) |
| Wind rail | Feeds the drape function, moving the cloth |
| Stretch | Eases the panel taut — narrower, longer, flatter folds — by the fabric's own recovery figure |
| Shine | Walks a point light across the cloth, timed to the same 2.4s period as the CSS sweep |
| Watch in 3D | Releases the rotation clamp and puts the cloth on a stand |

**Shine is a measurement, not an effect.** A merchant checking lustre walks a light across the
cloth and watches where the highlight goes: on a matte cambric it barely moves, on a gajji satin
it runs along the warp floats. That travel is the whole test, and a still image cannot show it.
The brighter raking light on a shinier cloth is deliberate — the point is to make the difference
between qualities visible.

**The stand exists for scale.** A length of fabric floating in space has no size; a stand of
known height gives the eye something to measure against, which is why a showroom drapes cloth
over a rail rather than holding it up.

## A test that measured nothing

The first version of `smoke-m24.mjs` sampled the bytes of Playwright's screenshot directly and
computed a mean — of *deflate output*. The numbers moved plausibly, two assertions "failed" for
invented reasons, and none of it was measuring the picture.

`scripts/lib/png.mjs` decodes properly now (IHDR, concatenated IDAT, inflate, per-scanline filter
reversal). The same assertions went from Δ4.6 and Δ6.6 to Δ100.6 and Δ126.7 — the render had
always been fine; the instrument was broken. Anything claiming "this render changed" has to look
at pixels.

## Verifying

```bash
npm run build && npm run start
node scripts/smoke-m24.mjs      # included in npm run smoke -- --http
```

Every assertion is a claim about behaviour that no type checker can reach:

- the lighting rail changes the render, and golden hour is measurably warmer than studio —
  judged *relative to another rig*, because the cloth's own dye dominates the average and a
  purple shade is blue-heavy under any light
- boutique renders darker than golden hour, as a dark surround with tight spots should
- stretch changes the cloth; shine puts more light on it; the wind rail moves it
- each shade renders as its own colour — a viewer that shows the same cloth whatever you open
  is the failure mode that looks fine
