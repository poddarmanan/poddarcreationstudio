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

**The head of the page is a catalogue plate.** A number strip in the house gold — this
fabric's number large, its neighbours small and faded either side, "/11" beneath — then a rule,
the fabric's name in display capitals with its spec line (composition · hand · the shade on the
stage), and at the right, from a tablet up, the lab's own mark, which scrolls to the stage.
There is no back link or italic story line: the site nav and the Showroom are the way back. On a
phone the name and the spec line each stay on one line: `FitLine` renders them at their CSS size
and, if a line overflows, scales it in em just enough to fit (the spec line never below 6.5 px,
which Roman Silk's, the longest, reaches on a 390 px screen; most sit near 8 px). Every place a
fabric is shown — the showroom's rolls and the lab's "more fabrics" strip — carries the same
number, so a buyer can say "the third one".

**The plate changes fabric.** A sideways swipe anywhere on the head of the page (the plate and
its padding), a sideways scroll over it, a tap on
a neighbouring number, or the arrow keys when it has focus moves to the next or previous fabric
in catalogue order, wrapping round. The strip slides one place, and the switch is the Showroom's
own: its full-screen unroll card, then the lab's staged reveal with the loader. The "more
fabrics" strip switches the same way. A vertical drag over the plate still scrolls the page
(`touch-action: pan-y`). The lab is not remounted for a switch — the staged reveal is keyed on
the fabric as well as the cut — which keeps the canvas and makes the switch cheaper. On a
desktop the strip shows two neighbours each side, on a phone one.

**Leaving the lab no longer throws.** drei's `Environment` disposes its cube render target after
React Three Fiber has disposed the renderer, and three's dispose handler then reads framebuffers
from the renderer's cleared records. It surfaced as an uncaught error on every exit from the lab.
`LightingRig` wraps `WebGLCubeRenderTarget.prototype.dispose` once to swallow that late dispose;
the target's GPU memory went with the context anyway.

**Product information on the stage.** A small "i" under the corner label opens the product
details — name, the shade on the stage, weight, width, composition, hand, price and stock — as
a near-opaque card over the stage, so a buyer can read the specifications without scrolling
away from the garment. A second tap, Escape, or a tap outside closes it.

**The buyer's column.** To the right of the stage (below it and its shade chart on a phone):
Add to book, the column's one action, in the primary fill (gold once the shade is in the book),
then the shade chart on a desktop. Adding opens a card near the bottom of the screen — what was
added, and "Order swatch book →" to the Swatch Book, where the book is ordered, or "Keep
browsing" — and closes "Select multiple" as Done would. A quote is asked for from the Swatch
Book; the product details open from the stage's "i". There is no WhatsApp button in the lab.

**Scenes and the microscope** are a panel, not page sections. A camera button on the stage, above
the garment button, slides up a sheet with the scenes in the owner's sketched layout (a banner, a
large tile beside two small, the next banner), each opening full size. The sheet ends at its last
picture: the page behind is locked while it is up (`overflow: hidden` on the root) and the sheet
has `overscroll-behavior: contain`, because scrolling past its end used to carry on down the page
underneath and the sheet seemed to have no end. In its corner a round magnifying-glass button
pops the magnifications out to its left — 100×, 200×, 500× — in a glass pill, the way the wind's
On and Off pop out of the wind button, with the fabric's physics note.

**Below the stage**, the page ends with "More fabrics" — the Showroom's own fabric rolls (one shared
`FabricRoll` drawing: the bolt on its end, its core, the weave, the shadow and reflection, heavier
cloth taller) standing on a small showroom floor, each opening through the Showroom's unroll —
and then the downloads (spec sheet, colour catalogue, this view) and the share QR.

**Motion.** Every panel, menu and popup now animates out as well as in — the scenes sheet slides
down, the light and account menus fold up, the info card, the garment picker, the wind options,
the magnifications and the book prompt fade and settle — through one `usePresence` hook that
keeps a thing mounted while its closing keyframes play (a panel that vanished in a frame was what
read as choppy). Openings are slower and softer on one curve (`--pc-ease`, 0.7–0.9 s), buttons
and links ease their colour, border and lift, and the page's sections rise into place as they
scroll into view (`Reveal`). Reduced motion turns the reveals off.

**Select multiple.** Beside the shade count, a small chip turns the chart into a picker: the
shade on the stage starts ticked, each tap ticks or unticks a chip (and puts a newly ticked shade
on the stage), and the count shows beside the heading. While shades are ticked, Add to book adds
all of them, with the count as a badge on the button. The selection belongs to the fabric and
clears on a change of fabric or on Done.

**Every change of cut is a staged transition.** The garment on the stage fades out and the loader
comes up. A cut already loaded is revealed after a second and a half; one that is still being
fetched or decoded keeps the loader up until it has fully arrived, then a beat more so its first
frames draw under cover. The loader then fades away as the new garment fades in over a second.
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
