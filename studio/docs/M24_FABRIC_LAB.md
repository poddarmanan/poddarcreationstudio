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
details — name, the shade on the stage, weight, width, composition, hand, and the stretch — as
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
shades' names, then the note ("Order the swatch book to see / and feel these shades in hand.") and, past a gold
hairline with a small diamond, how many shades the book now holds, "Order swatch book →" to the Swatch Book and
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

**Headings and the rule.** Every page heading sits over a fine gold rule that fades out at both
ends and draws itself out from the middle (`Selvage` in `brand.tsx`, kept by name). The gold-and-ink
running stitch it used to be is gone from the whole site at the owner's word, with its style
constants. The Showroom's heading is set as a catalogue section: "The Showroom · 01 / 03" between
hairlines, the room's name with its second word in the room's accent in italic, the rule, and the
room's line in italic serif. Its room picker is three equal places in a glass pill that fits and
centres on any screen (it used to overflow a phone to the right), with one dark marker that slides
between them as the walk moves; the glass goes dark with a gold edge in the Silk Gallery.

**The roll hangs square.** Left alone, the stage used to rock gently from side to side — right for
a garment on a form, wrong for a bolt on a rod, which read as a tilted rod. On the roll the stage
now settles back square to the buyer; it can still be turned by hand. The corner label ("Studio ·
Wind") sits on a small frosted chip, so the roll's wires pass behind it rather than through it.

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

**The stretch reads beside its button.** One glass callout grows out of the left of the Stretch
button, level with it, with a small pointer to it. When the roll is chosen it is the hint ("Pull
the cloth →"); while the cloth is pulled it is only a small single-line tag above the button — how far
the cloth gives along (↕) and across (↔), e.g. ↕ 19.2% ↔ 10.5% for cotton lycra — so nothing sits
between the buyer and the cloth being stretched. The full reading is the closing section of the product
details under the stage's "i": "Stretch" in gold small caps, the two figures side by side in the
display serif (↕ along, ↔ across) either side of a fading gold divide, each labelled beneath, and
the fabric's note centred in italic. The callout keeps what it shows while it
animates out, and the hint retires once Stretch has been used. The note used to float over the rod at the top of the stage, and the hint
sat below the button because its slide-in animation overrode the transform that centred it.

**The stretch is realistic.** Pulling the roll lengthens and narrows it by the cloth's own
figures — a woven cotton about 3% along and 2.5% across, a rayon about 5%, a cotton lycra about
19% and 10% — and the bolt turns only a little faster while it is pulled. It had been far too
elastic (11% for cotton, 35% for lycra). The viewer smoke measures the pull as the cloth's outline changing
— the hem drops about 12 px and the cloth draws in 4–5 px on cotton, against 2 px of drift at rest —
since square-on the weave's shimmer moves more pixels than a realistic pull does.

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
and reappearing at the other in a single frame. The stage's test buttons read as the wind's does: always round
glass, the icon a light grey when the test is off. Switched on, the shine button's sun turns a
quarter and lights in warm gold with a breathing glow while its rays wheel slowly round; the
stretch button's icon goes to ink and its two bars pull apart once and hold there, easing back
together when the test is switched off — one movement each way, not a loop.

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

## The Swatch Book

The page is headed "Swatch Book" in the display face, over a gold rule. When there is more than
one fabric, the fabrics' Roman numerals follow, in the order they sit in the book, with the open
one underlined in gold; tapping one jumps to that fabric's title sheet. The large fabric heading,
its particulars and its arrows were removed at the owner's word, since the title sheet names the
fabric. Throughout the book, on screen and in the PDF, a fabric is headed "Fabric I", "Fabric II"
and so on, where it was once "Chapter I".

### Browsing: loose sheets

While the buyer is still choosing, the book is not yet bound. It is a stack of loose sheets, one
fabric after another, so it stays one sheet tall however many shades it holds:

- **Title sheet:** each fabric opens on a title sheet inside a gold double rule. It shows
  "Fabric" and its Roman numeral in foil, its name, its hand, a round window onto its
  first shade, and its count of shades and sheets. Along its foot it says which way to slide.
- **Sheets of cuttings:** each holds up to nine of the fabric's shades, scattered. Each cutting
  takes a slot in a loose grid (seeded, so it always falls the same way), is nudged off-centre,
  and lies at its own angle up to about 11° either way. It is pinked, pinned with a pearl-headed
  pin, and labelled on a luggage tag: the name alone when there are two or more cuttings to a
  row, and with its number when there is one. A running head gives "Fabric", its numeral and the name, and
  the foot gives the count, an italic folio and "Sheet 1 / 2".
- **Sliding.** The top sheet follows a finger or the pointer, and the sheet it will reveal lies
  beneath it. Let go past a threshold and the sheet is thrown off to that side. Sliding left
  always goes forward: from a title into that fabric's sheets, from sheet to sheet, and past the
  last sheet to the next fabric's title (after the last fabric, back to the first). Sliding right
  on a sheet of cuttings goes back a sheet, and on a title skips to the next fabric. Horizontal
  wheel scrolling and the arrow keys do the same.
- **Performance.** While the sheet is being dragged, it follows the finger by setting its
  transform directly, with no re-render per pointer move. Each sheet is its own compositor layer
  (`will-change: transform`, `contain: layout paint`), and the sheets under the stack are plain
  gradients on plain paper (no noise texture). A cutting is one clipped box: its pinking is a
  clip path, not a mask, its light is a layer of its own background, and its shadow is a plain
  box shadow under its body, hidden by the pinked edges, not a filter. No glass on this page
  blurs what is behind it: the top bar, the tab bar and the book's buttons are near-opaque. The
  buttons' shine, the star and the slide hint play a few times as the page arrives and then
  rest; the shine animates by transform, not `left`. At rest the page draws no frames at all.
  Measured on a phone-sized screen with the CPU slowed 4×, a swipe's raster time fell from
  1,369 ms to 394 ms and a scroll's from 340 ms to 149 ms.
- **Throw.** A sheet let go past the threshold carries on at speed and eases out, instead of
  starting from rest. The sheet beneath already shows its cuttings' remove marks, which only the
  top sheet's respond to, so nothing appears as it arrives.
- **Cuttings:** a cutting lifts and squares up under the pointer. Tapping it opens that shade in
  the lab, unless the tap was the end of a slide. Its × takes it out of the book.

Beneath the stack, a note says the sheets are bound into the book when it is ordered. Then come
"Order swatch book" and "Preview your book", which plays the binding ceremony without ordering and
ends on the bound book with its PDF. An empty Swatch Book shows the closed volume, with the way
to the Showroom.

### Ordering

"Order swatch book" no longer opens a form. What an order needs is taken from the buyer's
account.

- **Signed in, with a WhatsApp number on file:** the order starts at once. Confetti bursts from
  the button, and the binding ceremony plays while the order goes to the server. The server
  fills in the buyer's name, company and WhatsApp from their account: `DealerProfile.whatsapp`,
  then `contactPhone`, then a contact person's number.
- **Signed in, but no number on file** (an account made before sign-up asked for one): the
  sign-in page asks for that one detail, saves it to the profile, and the order starts.
- **Not signed in:** the sign-in page opens. Once the buyer signs in or creates an account, the
  confetti bursts and the ceremony starts.

The confetti is drawn on one canvas laid over everything, which removes itself when done
(`src/components/studio/confetti.ts`). It is described in full under the sign-in page below. None
is drawn under reduced motion.

**The sign-in page** (`AuthScreen.tsx`) is a page of the studio like any other, not an overlay.
It sits under the same top bar and above the same tabs, with a "← Swatch Book" link back. While
ordering it takes the Swatch Book's place; from the studio menu it takes the current view's place,
and any tab leaves it. It is set in the Swatch Book's cream reading room, and ordering shows the
buyer's own cuttings fanned under the heading, with their count.

It offers four ways in, as buttons:
- **Continue with WhatsApp**, the ink pill;
- **Continue with Google**, in white;
- after "or", **Sign in** and **Create account**, outlined side by side.

Each opens its form in a sheet. On a phone the sheet rises from the foot of the screen, with a
grip and a gold rule along its top, over a plain veil (no blur). On a wider screen it is a card at
the centre. It goes back down as it closes.

- **WhatsApp** (M46), in three steps:
  1. The number, starting "+91 ".
  2. A six-digit code, sent on WhatsApp. It is typed into six boxes: each digit pops into its box,
     the next box glows, and the sixth digit submits. A phone can fill the code from the message
     (`one-time-code`). There is a resend countdown (30 s) and a way to change the number.
  3. For a number no account has: name, company and city, which create the account with the same
     code.
  A number already on an account signs straight in. That includes accounts made with email that
  gave the number at sign-up.
- **Google** leaves for Google's sign-in and returns. What must survive the trip is kept in the
  session first: the view, the shades picked before signing in, and whether an order was under
  way. On return the order carries on. A Google account signs in as the buyer with the same email,
  who is created if new; they are asked for a WhatsApp number when they first order.
- **Sign in** asks for email and password, with links to reset the password or to create an
  account.
- **Create account** asks for full name, company, city, WhatsApp number, email and password.

WhatsApp and Google each say "being set up" in place of their form until their keys are set (see
`DEPLOYMENT.md`).

The page is choreographed:
- **The light:** warm light comes up over the room and breathes, with gold dust turning in it.
- **The book:** the closed volume glides in, turning into place in 3D. It then floats and turns a
  little over a halo and a breathing shadow, and light glints across its foil. Its cover takes
  the buyer's name as they type it.
- **The heading:** it rises word by word, the cuttings fan in, and a printer's rule draws out.
  The buttons then rise in turn.
- **Fields:** each field's name floats up as the field is entered. A gold line draws out from the
  centre, and a gold tick settles once the entry is good. A mistake shakes the message.
- **Success:** the sheet goes down and the page glides back to the book. Its cover swings open and
  light spills from the pages. The confetti bursts out of the open book, and the ceremony takes
  over.

Everything moves by transform or opacity, so a phone composites the page without repainting it.
Under reduced motion the loops stop and the dust is not drawn.

On the static preview, which has no accounts, WhatsApp accepts the code 246810 (the sheet says
so), and every way in shows the ordering experience without creating an account.

**The confetti** fills the room and lingers for some seven seconds. Two bursts fan out from the
source (the order button, or the open book), a beat apart. Then a slow rain falls across the whole
screen. The pieces are large scraps of the book's own shades, pinked, with gold-foil strips and
cream paper. They drift down like paper. "Preview your book" bursts it too.

**The Swatch Book's heading** is set as a title plate, each part rising in turn:
- "Poddar Creation" in spaced capitals, between hairlines that draw in;
- "Swatch *Book*" set large, "Book" in italic antique gold (`.pc-foil-deep`, a deeper foil that
  reads on cream) with one glint across it;
- what the book holds, e.g. "8 shades · 1 fabric — bound to order";
- a printer's rule.

**Registration.** It now records the WhatsApp number, company and city on the buyer's profile
(`DealerProfile`), and the number on the account (`User.whatsapp`, as digits with the country code,
unless another account signs in with it), so ordering never asks again. `POST /api/register` accepts optional `whatsapp`
and `city`, and `POST /api/quotes` takes a signed-in buyer's name and company from the account
when they are left out.

**Shades picked before signing in.** They are carried into the account when the buyer signs in.
`POST /api/swatchbook` accepts `{ items: [...] }` and adds them all in one request, skipping any
already there. Before this, signing in replaced the book with the saved one and lost them.

On the static preview, which has no server and so no accounts, the page says so, and continuing
shows the ordering experience without creating one.

The number is stored on the quote (`Quote.whatsapp`). The admin quote desk shows it as "Send the
book on WhatsApp", linked to `wa.me`, because the platform does not send WhatsApp messages itself.
The team sends the compiled book from there. The ceremony hands the book over once the order has
settled. If the order was saved, it ends on the WhatsApp delivery. If it was refused, it ends on
the bound book with a note to order again, and the PDF.

### The binding ceremony

The ceremony is a page of the studio, not an overlay. It takes the Swatch Book's place under the
same top bar and above the same tabs. It is set in the reading room's cream light, with the
caption in antique gold foil (`.pc-foil-deep`) and the buttons in the studio's own styles.

The page darkens into a lamplit room, and the book is made up in front of the buyer. Only
transforms and opacity are animated. Each cutting is one element from start to finish: it is laid
out in its place on the page and measured there. It is then moved out across the room by a
transform, and flies home by taking the transform away, so it lands exactly where it stays and
nothing is swapped mid-flight.

1. **Compiling your fine choices.** The open book comes up. The buyer's cuttings (up to
   twenty-four are shown, three or four to a row) are strewn across the table below the caption,
   and fly one by one onto the page.
2. **Binding your book.** As the last cutting settles, the binding's three brass posts are
   screwed home in turn, each flaring as it seats, and a glint runs down the gold fillet.
3. **Bound and fastened.** The front cover has lain open to the left from the start, marbled
   endpaper up, and now swings shut over the pages. The clasp is then pushed home over the catch.
   
4. **Handing over.**
   - After an order, the book gives way to the buyer's number, in gold, "on WhatsApp". Below is
     a chat as the book will arrive: "Poddar Creation", with the buyer's number, and a bubble
     holding the closed book as the file's preview. The file row "Poddar-Swatch-Book.pdf"
     downloads the PDF. The time and ticks follow, then "Download PDF" and "Done".
   - As a preview, the bound book stays, captioned "Your book is ready", with "Download PDF" and
     "Close".

Each caption fades out before the next fades in. With reduced motion, the ceremony goes straight
to the bound book.

### Ordering the fabric directly

Under "Order swatch book" and "Preview your book", after "or", an ink card edged in gold offers
**"Skip the swatch book"**. The title is in the display face at 19px, with "Order the fabric
itself, by the metre" beneath it in italic champagne. It has a small gold disc with a rolled bolt,
which tilts under the pointer, and an arrow in a gold ring. A sheen passes across it a few times
as it arrives. It opens the order page (`FabricOrder.tsx`), in the Swatch Book's place:

- **Heading:** "Direct from the mill" between hairlines that draw in, and "Order the *Fabric*"
  rising word by word, "Fabric" in italic antique gold.
- **A sheet for each fabric in the book:**
  - its numeral, name, weight and width, and its price per metre;
  - "All" presets (50, 100, 250 or 500 m) that set every shade of the fabric at once;
  - a row for each shade: a pinked cutting, the name, its number, the line's value, and a
    stepper (± 25 m, or typed). Every shade starts at 0 m, with nothing assumed, and reads
    "Not set" until its metres are chosen; shades left at 0 m are not ordered;
  - the fabric's metres and value at the foot.
- **When it is needed** (as soon as possible, within two weeks, within a month), and a note for
  the mill.
- **The dock:** a slip of cream paper edged in gold that follows the page above the tabs, with
  the total metres in the display face (which tick as they change), the shade count, the estimate
  in umber and an ink "Place order". Pressing it with
  nothing set shakes it and asks for at least one shade. The estimate is indicative, before taxes
  and freight.

Placing the order signs the buyer in first if need be, using the same sign-in page, whose words
change to "Your order awaits — your N metres go straight to the mill". It then sends a quote with:
- each shade's metres on its line (`QuoteItem.quantity`, unit `m`);
- `quantity` "1,250 m · Fabric order" and `expectedQty`;
- the timeline and the note as `message`;
- the buyer's details from their account.

The order's reference is PC- and the last six characters of its id.

**The dispatch** plays in the reading room while the order goes in:
1. **Folding your fabrics:** kraft paper is laid out and the fabrics fall onto it, folded, one
   after another.
2. **Wrapped in kraft:** its four flaps fold over them in turn.
3. **Tied with twine:** twine is drawn across both ways.
4. **Sealed by the house:** an oxblood wax seal with the "PC" monogram stamps down over the knot,
   and a gold ripple spreads from it.
5. A shipping tag swings in on its string with the order's reference.

Once the order has settled, the parcel lifts, confetti bursts from the seal, and the order is
summed up: its reference, metres and estimate. Below that, a line says the price and dispatch
date will be confirmed on WhatsApp to the buyer's number, followed by "Back to the Showroom" and
"Done". If the order failed, the page says so and offers to try again, keeping the selection. On
the static preview it notes that orders are not sent.

The reading room clips with `overflow: clip`, not `hidden`, so it does not become a scroll
container and the dock sticks to the window.

### The cart

The lab's action is now **"Add to…"**. It asks where the shades go, in a compact sheet over the lab
(`AddChooser.tsx`). From the top:
- **The shades,** fanned as pinked cuttings. Under them are the fabric's name in spaced capitals
  and the shades by name in italic (or "N shades"). A close mark sits at the corner.
- **The question:** a gold rule with a diamond, then "Where shall it go?", centred.
- **Two paper tiles, side by side:**
  - Cart, "The fabric, by the metre";
  - Swatch Book, "A cutting of each shade".

  Each has its icon in a gold-ringed disc. The chosen tile turns to ink edged in gold, lifts
  slightly, fills its disc with gold and shows a gold tick at its corner.
- **One italic line** says what the choice means:
  - for the cart, "₹ 96 / metre ✦ metres chosen in your cart", plus a note of any metres already
    there;
  - for the book, "Bound into your book when you order it".
- **The button:** the studio's ink pill, "Add to Cart" or "Add to Swatch Book".

**No metres are asked for, or assumed, when adding to the cart.** The shades go into the cart
with none set. The buyer chooses them in the cart, and the note that follows says so ("… · choose
metres in cart").

Under the button, "✓ In your book" and "✓ In your cart" say where the shade on the stage already
is.

Adding to either place plays the same arrival (`flyInto` in `AddChooser.tsx`). Small pinked
cuttings of the shades arc up into that tab, turning and shrinking as they go: the Cart, or the
Swatch Book (the tab bar on a phone, the header item on a desktop). The tab bounces, a gold ring
spreads from it, and its count pops. The state counts `cartBump` and `bookBump` drive this.

A small cream note then stands just above that tab (`AddedToast`), pointing at it with a small
caret. It is edged with a gold hairline and shows the shades as pinked chips, "✓ Added to your
cart" (or book), the shades with their metres (or the fabric), and "View cart →" or "View book →".
It leaves after a few seconds. On a desktop it sits under the header item instead. This replaces
the earlier full-width card for the book and the ink bar for the cart.

**The cart in the tab bar** is the fourth item, after the Swatch Book. It is set apart: an ink disc
edged in gold, with a shine crossing it a few times and a gold count badge.

**The cart page** (`CartBook.tsx`) is read as the Swatch Book is. It uses the same stack of loose
sheets, `SheetStack`, which is shared with `SwatchBook.tsx`, with the same slides and the same
fabric numerals. Its title plate reads "Your *Cart*", with the shades, the fabrics and the total
metres.
- **Each fabric's title sheet** also gives:
  - the price per metre;
  - what the fabric comes to (metres and ₹), or "Select metres for N shades" in red while any are
    unset;
  - a "Set metres for all" button that opens the picker for every shade of it.
- **Its sheets of scattered cuttings** carry each shade's metres on a small ink tab above its
  label. A shade without metres shows "Set metres" instead, on a cream tab edged in red that
  pulses a few times. The × takes the shade out of the cart, and each sheet's foot gives its
  metres.
- **The title plate** adds a notice while any shade is unset: "Select metres for N shades", with
  "Tap a cutting for its metres".

**Tapping a cutting opens the metre picker,** a sheet at the foot of the screen, which sets metres
with a slider alone.
- **The slider** is a gold rule with an ink thumb. It stops every 25 m up to 1,000 m, every 100 m
  up to 2,000 m, and every 250 m up to 5,000 m. That is fine where most orders fall, and still
  reaches a large order. It is labelled 0 · 250 · 500 · 1k · 2k · 5k at those stops.
- **The figure** stands large above the slider. Nothing is preset: until the slider is moved it
  reads "Slide to choose the metres", and the button, "Set metres", is disabled.
- **This shade or all N shades** is offered when the fabric has more than one shade.
- **Value:** the price per metre and the value.
- **Buttons:** "Done · 250 m", and "Remove from cart" (for a single shade).

**The dock** follows the page on a slip of the studio's cream paper, edged in gold. It shows the
total metres, the shades (or how many are not set) and the value, and an ink "Checkout" button.
- **While any shade is unset,** "Checkout" is dimmed. Pressing it shakes the button and the notice,
  and says "Select metres for every shade to check out."
- **Checkout** is the direct order page (`FabricOrder` with `source="cart"`), titled "Your *Order*",
  with "← Cart" as the way back. There each shade's metres are shown rather than edited, since
  they are set in the cart. The page adds when it is needed and a note for the mill.

**The checkout page** (and the direct order page) has three parts:
- **Steps:** a line of three steps by numeral: I Cart (or Book) · II Review · III Dispatch. The
  current step's numeral is gold, and the steps behind it (ticked) are ways back.
- **The order slip:** letterpress paper with a gold rule at its top. Its head reads "Poddar
  Creation · Surat" and "Order slip", with the date and the count of fabrics and shades opposite,
  over a gold double rule. Each fabric then follows:
  - its numeral in a gold ring, its name, weight and width, and its price per metre;
  - its shades;
  - its subtotal on a dotted leader.

  The totals are ruled off as in a ledger: metres and shades on dotted leaders, then the estimate
  large under a double gold rule. The fine print sits beneath, and the slip ends in a pinked foot,
  as if torn from a pad.
- **A note for the mill:** one slim line with a pen mark, then "Continue →" in the dock.

**III Dispatch** (`ShipPay.tsx`), titled "Delivery & *Payment*", comes after the review. A buyer
who is not signed in signs in first, since the address book belongs to the account. It has three
sections, each headed by its numeral in a gold ring:
- **Ship to:** the buyer's saved addresses as cards (`/api/portal/addresses`, the
  `ShippingAddress` book), default first and chosen already. Each card shows its label (with a gold
  "Default" pill), contact name, lines, city, state and PIN, and phone; the chosen one is edged in
  gold with a gold dot. "+ Add a new address" opens a sheet with the form:
  - label, contact name and phone;
  - address lines, city, PIN code and state.

  Saving adds the address to the book, the first becoming the default, and chooses it. With no
  saved address, the form opens by itself. On the static preview the book is kept on the device
  (`localStorage` `pc-addresses`).
- **When do you need it?** Three tiles like the chooser's ("Now", "2 weeks", "1 month", each with
  its full wording beneath). The chosen tile turns to ink edged in gold.
- **Payment:** UPI, Bank transfer (NEFT · RTGS · IMPS) and Credit terms (for approved accounts), as
  rows with an icon disc and a radio ring. Nothing is charged on the site. The note says so: once
  the team confirms the final price on WhatsApp, it sends the payment details for the chosen
  method.

The dock gives the metres, where the order ships and the estimate, with "Place order". Without an
address, it shakes and opens the form.

The order (`Quote`) carries the address written out (`shipTo`) and the payment method
(`paymentMethod`, migration `m47_order_ship_pay`), with the timing. The quote desk shows both.

**Italics are kept for accents only.** Only the last word of a page's heading is italic (Swatch
*Book*, Your *Cart*, Your *Order*), as is the PC monogram on the cover. Body copy, names,
figures, notes and labels are set upright, in the studio pages and in the PDF. Placing the order goes through the same sign-in, dispatch and confetti. Once the
order is taken, its lines leave the cart.

An empty cart shows a floating ink bag, "Your cart is empty" and the way to the Showroom.

After a sheet has been slid, the next tap on it counts. Each new press clears the "that was a
slide" flag, so on touch screens a tap made right after a swipe is no longer swallowed.

The cart is kept on this device in `localStorage` (`pc-cart`): a line per shade with its metres.
Adding a shade already there adds to its metres.

### The PDF

"Download PDF" saves `Poddar-Swatch-Book.pdf`, made in the browser (`src/lib/swatch-book-pdf.ts`),
so it works on the static preview too. It is made while the book is handed over, so saving it is
a single tap. Every page is painted on a canvas at A4 and 150 dpi, in the studio's own fonts, and
embedded as a JPEG in a small PDF 1.4 file written there.

The pages are:
1. **Cover:** the oxblood leather cover, with its spine bands, gold frame and corner ornaments,
   "PC" cartouche and "Swatch Book" in gold. It gives the fabric and shade counts, and "Prepared
   for" with the buyer's name, or "Surat".
2. **Contents:** each fabric's numeral, fabric, shade count and page, with dot leaders.
3. **Fabrics:** each fabric has a title page, with its numeral in gold, name, particulars,
   hand, a round window onto its first shade, and its shade count. Its plates follow, twelve
   pinked cuttings to a page, woven in the fabric's own structure: plain weave, silk's diagonal
   lustre, slub's thick picks, wrinkle's crinkle, and the fabric's sheen. Each plate gives its
   number, name and hex code.
4. **Colophon:** the date it was compiled, who it was prepared for, and a note that colours on
   screen and paper are a guide and the physical cuttings are the reference.

### The volume

The bound book, as it appears in the ceremony and on the empty page:

- **Binding:** oxblood morocco with a pebbled grain lit from the upper left. The spine has four
  raised bands, each set between gold fillets. The outer corners carry brass protectors, and a
  champagne silk ribbon marker, cut to a swallowtail, hangs from its foot.
- **Front cover:** a blind-tooled frame and a double gold fillet with curled ornaments at its
  corners. Inside that is a "PC" monogram in an oval cartouche, with "Swatch Book" in burnished
  gold foil. Beneath the title are the book's fabric and shade counts, then "Prepared for" and
  the buyer's name when they are signed in (otherwise "Surat").
- **Inside the cover:** a marbled endpaper.
- **Clasp:** a stitched leather strap across the cover's right edge ends in a brass plate over a
  brass catch on the back board.
- **Pages:** cotton-rag paper, gilt on the fore-edge and foot. They are held by a leather binding
  strip down their inner margin, with three brass posts.
