# Mobile

The studio is one application with two navigation shapes. Below 768px the header's link row is
replaced by a floating pill at the bottom of the screen; at 768px and above the header carries
the navigation exactly as it always has. Nothing else about the design changes — same
typography, same palette, same animations, same components.

## Why the navigation moved

The header put seven text links in a scrolling row at the top. On a 390px phone that cost about
155px of screen — a quarter of the viewport — and still cut off the last two items, so "Swatch
Book" was unreachable without discovering a horizontal scroll. Each link was a 24px tap target,
roughly half the 44px minimum both Apple and Google publish.

The bottom pill costs 60px, shows six destinations at once, and gives each a 49px target where
the thumb already rests. The top bar keeps identity and account in a single 50px line.

## Why the search moved too

The search bar was the last element of the entrance — the tallest screen in the studio — so on a
phone it was the first thing to fall off the bottom. It also only ever existed on the entrance,
which meant a buyer three taps into the colour wall had no way to search at all.

On phones it is now a 36px icon in the top-right corner of the header that unfurls into a
full-width pill. It is reachable from every view and costs nothing until it is wanted. The pill
is anchored to the same right edge the icon sits on, so opening it grows the bar leftward from
under the icon: the one thing on screen the thumb is already aimed at does not move.

Above 768px none of this exists — the hero keeps its own search bar exactly as before.

## How the pieces fit

| Piece | Where | Note |
|---|---|---|
| `BottomNav` | `src/components/studio/BottomNav.tsx` | Six items; Admin replaces Compare for staff |
| `MobileSearch` | `src/components/studio/MobileSearch.tsx` | The header's expanding search pill |
| `useSearch` | `src/components/studio/search.ts` | Called once in `useStudio`; both surfaces render its result |
| `.pc-bottomnav*`, `.pc-msearch*` | `src/app/globals.css` | Everything inside `@media (max-width: 767px)` |
| `.pc-topbar`, `.pc-hdrnav`, `.pc-hdricon`, `.pc-hdrbtn` | `src/app/globals.css` | The header's responsive properties |
| `--pc-topbar`, `--pc-bottombar` | `:root` | 64/0 on desktop, 50/78 on phones |
| `.pc-shell`, `.pc-view` | `src/app/globals.css` | Size views against the space between the bars |

The search runs in `useStudio`, not in a component, because two surfaces ask the same question —
the hero bar on a desktop, the header pill on a phone. One hook means one debounce and one
request per keystroke; two copies of the logic would fire two identical fetches.

A view sized with `.pc-view` runs the full height under the header and reserves the pill's space
as its own padding, so its background reaches the bottom of the screen while its contents still
centre in what is visible. Scrolling views are not `.pc-view` and take the shell's bottom padding
instead.

## Rules worth keeping

**A media query cannot override an inline style.** Any property a breakpoint needs to change has
to live in the stylesheet. This is not theoretical: `display: flex` inline on the header's link
row silently defeated `display: none` in the phone breakpoint, and the row kept rendering
off-screen while every measurement said it was hidden.

**Two `@keyframes` of the same name are resolved by source order, not by media specificity.** A
phone-only override must appear after the definition it replaces.

**Never let a transform make the page wider than the screen.** A mobile browser answers an
over-wide page by zooming the whole thing out, and does not zoom back in when the cause passes.
The view-entry animation's `rotateX` under a perspective did exactly that: every view after the
entrance rendered at 0.8–0.9×, text and all. On phones that keyframe drops the tilt.

**A drawn control and its tap target need not be the same rectangle.** The header's 36px account
button carries a `::after` grown to 48px rather than being enlarged to suit a thumb.

**A flex row narrower than its contents overflows towards the end, not the start.** The collapsed
search bar is 36px wide with `overflow: hidden`; with default alignment the icon was laid out
past the clip and simply never drawn, while every measurement of the container said it was
there. `justify-content: flex-end` puts the icon in the corner and spills the field leftwards
under the clip, which is also the animation the design wants.

**Any focused text field under 16px makes iOS zoom the page in, and it does not zoom back.** The
search input is 16px exactly for that reason.

## Verifying

```bash
npm run build && npm run start          # the audit needs a production build
npm run smoke:mobile                    # captures ./screens-mobile and audits
```

`scripts/capture-mobile.mjs` drives a real phone-emulated browser through every view *using the
pill itself*, so the screenshots are evidence the navigation works rather than that it renders.
Alongside each capture it asserts what a screenshot cannot show:

- the page does not scroll sideways
- the browser has not zoomed the page out (`innerWidth` still equals the device width)
- every navigation tap target is at least 44px, hit area included
- no navigation label is truncated
- the pill is present on phones and absent at 768px and above, where the header nav returns
- the entrance fits without scrolling, and the hero's own search bar has stood down
- the search icon is drawn inside its clip, opens to the full width without moving sideways,
  focuses its field, is 16px, and is a pill with a shadow and no border
- typing a known shade returns results, and choosing one opens the fabric and closes the bar

It runs at 390×844, again at 360×780 — the narrow case the labels have to survive — and once at
834px to prove the desktop header comes back.
