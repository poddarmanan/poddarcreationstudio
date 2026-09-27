# M24 — Fabric Lab

The Lab's controls drive the real scene: pressing them alters physics rather than a CSS filter.

| Control | Where | What it does |
|---|---|---|
| Lighting rail | Below the stage | Swaps the actual three-light rig and the renderer's exposure (`LightingRig`) |
| Wind | On the stage, bottom right | A round glass button with a wind mark; it opens into On and Off. On is the strong setting, and the lab opens with it on |
| Garment | On the stage, bottom left | A small glass button naming the cut; a tap veils the stage in frosted glass and lays the six cuts out as silhouettes. The rotary dial in the right column still works too |
| Stretch | Pill, bottom centre | Pulls the cloth from the hem — the shoulders are held, the lower cloth draws taut and in on to the body — by the fabric's own recovery figure |
| Shine | Pill, bottom centre | Walks a point light across the cloth, timed to a 2.4s period |

Three things that were there are gone, on the owner's instruction after using it on a phone:
the "Watch in 3D" pill (the turntable is always live; hold and spin), the four-step wind rail
(a buyer wants to see the cloth move, not choose a breeze), and a screen-wide bright band that
used to sweep the whole stage with the shine — the shine is the raking light on the cloth, and
nothing else should light up.

**The roll hangs from a bolt.** The Roll cut shows the cloth coming off a bolt of itself laid
across the top of the panel, on a cardboard core, turning very slowly — cloth being unrolled,
not a sheet pinned to nothing (`Bolt` in `FabricViewer`).

**On a phone** the stage is taller (`clamp(440px, 62vh, 760px)`), the three stage controls
share its bottom edge — garment left, pills centre, wind right — and every entrance and change
of state is eased over half a second or so rather than snapped. An entrance animation that sets
`transform` overwrites a centring translate, so the centred pill bar is centred by an outer
element and animated by an inner one.

**Shine is a measurement, not an effect.** A merchant checking lustre walks a light across the
cloth and watches where the highlight goes: on a matte cambric it barely moves, on a gajji satin
it runs along the warp floats. That travel is the whole test, and a still image cannot show it.
The brighter raking light on a shinier cloth is deliberate — the point is to make the difference
between qualities visible.

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
- stretch changes the cloth; shine puts more light on it; the wind toggle moves it (the smoke
  turns it off first — the lab opens with it on — and back on for that check)
- each shade renders as its own colour — a viewer that shows the same cloth whatever you open
  is the failure mode that looks fine
