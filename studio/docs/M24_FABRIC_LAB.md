# M24 — Fabric Lab

The Lab's controls drive the real scene: pressing them alters physics rather than a CSS filter.

| Control | Where | What it does |
|---|---|---|
| Light | On the stage, top right | A round button painted the shade as it renders under the current light; it opens into the five lights, each a button painted the shade under that light and named. Choosing one swaps the three-light rig and the exposure (`LightingRig`). The buttons are the metamerism strip (M26) — choosing a light is choosing which of them to look at; the worst shift is in the tooltip. The rail of light names this replaces overflowed a phone |
| Wind | On the stage, bottom right | A round glass button with a wind mark; it opens into On and Off. On is the strong setting, and the lab opens with it on |
| Garment | On the stage, bottom left | A small glass button naming the cut; a tap veils the stage in frosted glass and lays the six cuts out as silhouettes. It is the only garment control — the rotary dial that used to sit in the right column is gone |
| Stretch | On the stage, right, above the wind — on the Roll only | A round button: pulls the length of cloth, which draws in from both sides and lengthens downward from the bolt it hangs on, the bolt turning faster as it gives; every cloth shows the pull, the fabric's own recovery figure decides how much more. A made-up garment cannot be pulled, so the button is not offered on one; choosing the roll points it out for a few seconds |
| Shine | On the stage, right, above the wind | A round button: walks a point light across the cloth, timed to a 2.4s period |

Three things that were there are gone, on the owner's instruction after using it on a phone:
the "Watch in 3D" pill (the turntable is always live; hold and spin), the four-step wind rail
(a buyer wants to see the cloth move, not choose a breeze), and a screen-wide bright band that
used to sweep the whole stage with the shine — the shine is the raking light on the cloth, and
nothing else should light up.

**The head of the page is a catalogue plate.** Above a hairline, the way back to the fabric
library and the plate number ("Fabric 03 / 11"); below it the number over its count, a rule,
the fabric's name in display capitals with its spec line (composition · hand · the shade on
the stage), and at the right, from a tablet up, the lab's own mark, which scrolls to the stage.
Every place a fabric is shown — the showroom's rolls, the collection's cards, the lab's
"more fabrics" strip — carries the same plate number, so a buyer can say "the third one".

**The buyer's column.** To the right of the stage (below it on a phone): Request a quote and
Enquire on WhatsApp first, the product details sheet under them, and the shade chart under
that on a desktop. The microscope, which used to head the column, sits further down the page
beside the downloads. "Add to book" floats at the bottom centre of the viewport, above the
phone's bottom bar, from anywhere on the page; it fills dark once the shade on the stage is in
the book. It is portalled to the body because the lab's root animates a transform as it lays
in, and a transformed ancestor turns a fixed child into a page-positioned one.

**Every change of cut is a staged transition.** The garment on the stage fades out, the loader
comes up and holds for at least three and a half seconds while the new cut is prepared under it
(cached model or not), then the loader fades away as the new garment fades in over a second.
Nothing snaps: a garment that simply appeared read as a glitch. The lab opens the same way.

**A model arrives to a loader, not to the old cut.** While a supplied model is checked for,
fetched and decoded, the stage is empty but for a small glass loader — a thread drawn round a
ring and "Draping the kurti" — and the built-in cut is not shown first. It used to stand in, and
read as the wrong garment appearing and then being swapped. The built-in cut now appears only
for a cut that has no model file at all (the dress, until one is uploaded).

**The roll rocks as one thing.** Bolt, wires and cloth hang from the wires' top and swing front
and back together in the wind, in the phase of the cloth's own gust, so the top of the cloth and
the bolt move as one; the hem rests on the floor rather than hanging in the air.

**The roll hangs from a bolt on a rod.** The Roll cut shows the cloth coming off a bolt of
itself laid across the top of the panel, on a cardboard core, on a brass rod hung from two
wires, turning very slowly — cloth being unrolled from a display rod, not a sheet pinned to
nothing (`Bolt` in `FabricViewer`).

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
