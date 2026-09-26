# M26 — Lighting Studio

The five lighting conditions are real lights (M23/M24). What M26 adds is the readout that makes
them worth having.

## Metamerism is the product

A buyer approves a shade under the seller's lights; the garment is worn under someone else's.
When those two disagree the complaint comes back as a rejected lot, and for a wholesale
dyed-fabric business that is the most expensive routine failure there is.

The strip under the lighting rail shows the current shade rendered under all five rigs, plus the
worst shift from neutral in OKLab units:

- **under 2** — nobody would argue
- **2–5** — a buyer notices side by side
- **above 5** — two different shades

The arithmetic is the renderer's own (albedo × summed illumination, tone-mapped), so the strip
and the canvas cannot disagree. The rig numbers live in `src/lib/three/rig-light.ts`, imported by
both the React component that turns them into lights and the model that computes colours without
a GPU — one definition, two consumers.

## The room

Physically based cloth is lit by everything around it, and the first rig lit it with two lamps
in a void. Sheen — the reason a rayon reads as rayon — is a grazing-angle reflection of the
*room*, and with no room to reflect it was dead; the cloth looked painted.

`LightingRig` now builds a room the way a product photographer does, from light panels
(`drei`'s `Environment` with `Lightformer`s, rendered once per rig to a cube map, no download):
a large soft source in front and above, a dimmer panel straight ahead at cloth height, softboxes
either side with one dominant, a rim from behind, a dark floor. Each rig tints and scales the
panels (`ROOM`), and the key and fill still come from `rig-light.ts`, so the metamerism readout
and the render describe the same light.

Soft shadow maps are on at every tier that has a GPU (only the software tier goes without), and
a contact shadow sits under the hem so the garment stands on something.

`?quality=high|medium|low` on the URL forces a tier and locks adaptation — the way to check a
tier on the device it is meant for.

## What this is not

Real metamerism is spectral: two dyes with different reflectance curves match under one
illuminant and not another. This catalogue records no spectral data — no reflectance curves for
the dyes, no power distributions for the lamps — so the readout is a **chromatic-adaptation**
figure: how far each rig pushes a *given* shade. It is not a prediction that two lots will
disagree with each other.

That distinction cost a test. An earlier assertion said saturated dyes shift more than neutrals,
which is true of real dyes and false of this model — under pure multiplication a near-grey moves
further in OKLab than a saturated red whose chroma already dominates. The assertion was wrong,
not the code, and the fix was to test the claim the model actually supports: shift tracks how far
the key light's colour is from white.

If spectral data is ever added to the catalogue, this is the file that grows a real illuminant
model, and the UI above it does not change.

## Verifying

```bash
npx tsx scripts/smoke-m26.ts
```

- 1,320 shade/light readings across the whole catalogue, all valid colours
- golden hour runs warmer than a white cyc; daylight runs cooler than golden hour; a boutique's
  dark surround renders darker than a studio box
- the neutral cyc is its own reference and cannot shift a shade away from itself
- shift tracks how tinted the key light is (golden 14.3 against studio 2.9)
- verdict thresholds are ordered, and the readout is deterministic
