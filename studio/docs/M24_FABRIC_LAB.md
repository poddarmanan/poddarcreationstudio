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
(`touch-action: pan-y`). The lab is remounted for every fabric (keyed on the fabric in
`StudioApp`), so a fabric opened from inside the lab — the strip, or a roll in "more fabrics" —
gets the whole Fabric Hall arrival: the unroll card (which now fades out rather than vanishing),
the page laying in from the top, and the stage's staged reveal with its loader. On a desktop the
strip shows two neighbours each side, on a phone one.

**Leaving the lab no longer throws.** drei's `Environment` disposes its cube render target after
React Three Fiber has disposed the renderer, and three's dispose handler then reads framebuffers
from the renderer's cleared records. It surfaced as an uncaught error on every exit from the lab.
`LightingRig` wraps `WebGLCubeRenderTarget.prototype.dispose` once to swallow that late dispose;
the target's GPU memory went with the context anyway.

**Product information on the stage.** A small "i" under the corner label opens the product
details — name, the shade on the stage, weight, width, composition, hand, price and stock — as
a near-opaque card over the stage, so a buyer can read the specifications without scrolling
away from the garment. A second tap, Escape, or a tap outside closes it.

**The buyer's column.** To the right of the stage (below it and its shade chart on a phone): the
price line, then Add to book, then the shade chart on a desktop. The price line sits between two
hairlines (the upper one gold): "Price" in gold small caps over the price per metre in the display
serif — one price for every customer, signed in or not, as the owner is standardising pricing —
and opposite, "In stock" with a softly pulsing dot and "Mill fresh". The product details under the
"i" show the same price. Add to book is the column's one action, in the primary fill (gold once the
shade is in the book). Adding opens a card near the bottom of the screen: a gold rule, the added
shades fanned out as pinked cuttings with a gold tick, "Added to your book", the fabric and the
shades' names, how many shades the book now holds, "Order swatch book →" to the Swatch Book and
"Continue browsing" — and it closes "Select multiple" as Done would. A quote is asked for from the
Swatch Book; the product details open from the stage's "i". There is no WhatsApp button.

**The lab opens on the roll** — the cloth itself, before any garment is cut from it.

**Scenes and the microscope** are a panel, not page sections. A camera button on the stage, above
the garment button, slides up a sheet with the scenes in the owner's sketched layout (a banner, a
large tile beside two small, the next banner), each opening full size. The sheet ends at its last
picture: the page behind is locked while it is up (`overflow: hidden` on the root) and the sheet
has `overscroll-behavior: contain`, because scrolling past its end used to carry on down the page
underneath and the sheet seemed to have no end. In its corner a round magnifying-glass button
pops the magnifications out to its left — 100×, 200×, 500× — in a glass pill, the way the wind's
On and Off pop out of the wind button. The pill floats beside the button rather than taking room
in the header row (on a phone it used to shove the buttons sideways in one frame), and the
fabric's physics note eases open beneath by animating its grid row from 0fr to 1fr, so the
pictures glide down rather than jump.

**Below the stage**, the page ends with "More fabrics" — headed as a catalogue sets a section (a
gold eyebrow, "The collection · 10 qualities", between hairlines; "More *fabrics*" in the display
serif with the second word in gold italic; a gold underline that draws itself out from the middle
as the section rises in) — and the Showroom's own fabric rolls (one shared
`FabricRoll` drawing: the bolt on its end, its core, the weave, the shadow and reflection, heavier
cloth taller; here in a narrower spread of heights, so the lightest roll does not leave a band of
empty wall above it) standing on a small showroom floor, each opening through the Showroom's unroll —
and then the downloads (spec sheet, colour catalogue, this view) and the share QR.

**The Showroom is one walk.** Every roll, 01 to 11, stands in one continuous walk in the
catalogue's order — the Cotton Gallery (01–05, Cotton Lycra now among them), the Rayon Room
(06–09), the Silk Gallery (10–11) — and that order is the studio's everywhere (`CATALOGUE_ORDER`
in the fabric data; `useStudio` sorts by it), so the numbers in the walk, the lab's number strip
and "more fabrics" all agree. As the walk is scrolled or dragged from one room's rolls into the
next, the slider follows and the room changes around it: each room's wall, floor and light are a
layer of their own that cross-fades, and the title, line and colours ease across. A room in the
slider glides the walk to its first roll. There is no "Fabric Hall" room any more and no round
arrows over the walk or over "more fabrics": both are dragged or scrolled.

**Arriving on a page.** Every change of page is announced by a cream curtain carrying the page's
name ("The Fabric Hall"), which covers at once, holds a beat and lifts away as the page lays in
(`ViewCurtain`; navigation itself is never delayed). In the Showroom the rolls then rise into
place one after another as the curtain lifts; in the lab's "more fabrics" they rise the same way
when the section scrolls into view, above the Showroom's own breathing "scroll · click a roll to
unroll" hint. The strip drags like the Showroom's walk — hold and move, by mouse or finger — and
has no scroll snapping, which fought the drag and pulled the strip back; its wall and floor fade
out of the page at the top and back into it at the bottom, so hall and page read as one piece.
On the Entrance, "Enter the Showroom" and "Explore colours" rise in, lift on hover and give when
pressed, and a slow light crosses the main button now and then. The first page of a visit has no curtain, and a fabric has the unroll instead.

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

**The stretch is realistic.** Pulling the roll lengthens and narrows it by the cloth's own
figures — a woven cotton about 3% along and 2.5% across, a rayon about 5%, a cotton lycra about
19% and 10% — and the bolt turns only a little faster while it is pulled. It had been far too
elastic (11% for cotton, 35% for lycra). The viewer smoke still sees the pull on cotton (4.5% of
pixels changed against 1.7% at rest).

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
between qualities visible. Each pass is a gesture rather than a loop: the light fades up from nothing at one edge, glides
across on a slight arc eased at both ends, fades back to nothing at the other and rests a moment
before the next (a 4.2 s cycle). It used to run a sawtooth at full strength, vanishing at one edge
and reappearing at the other in a single frame. The shine button's sun turns a quarter as it
switches on, and while it is on its rays wheel slowly round and breathe.

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
