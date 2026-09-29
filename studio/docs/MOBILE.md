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

The bottom pill costs 60px, shows its destinations at once (Showroom, Colours and the Swatch Book;
Admin for staff), and gives each a 49px target where the thumb already rests. The top bar keeps
identity and account in a single 50px line: the logo, which is the way to the Entrance, and the
user icon at the far right, which opens a small menu with sign in or out and the language.

## Search

A phone has no search. It used to be a header icon that unfurled into a full-width pill, with the
entrance's own search bar standing down to make room; the owner took the header search out, and
the entrance's bar stays off on a phone so the entrance still fits one screen above the pill.
Above 768px the hero keeps its search bar exactly as before.

## How the pieces fit

| Piece | Where | Note |
|---|---|---|
| `BottomNav` | `src/components/studio/BottomNav.tsx` | Three items (Showroom, Colours, Swatch Book); Admin added for staff. The header logo is the way to the Entrance |
| `UserMenu` | `src/components/studio/Nav.tsx` | The user icon's menu: sign in or out, and English or हिंदी |
| `useSearch` | `src/components/studio/search.ts` | Called once in `useStudio`; the desktop hero renders its result |
| `.pc-bottomnav*` | `src/app/globals.css` | Everything inside `@media (max-width: 767px)` |
| `.pc-topbar`, `.pc-hdrnav`, `.pc-hdricon`, `.pc-hdrbtn` | `src/app/globals.css` | The header's responsive properties |
| `--pc-topbar`, `--pc-bottombar` | `:root` | 64/0 on desktop, 50/78 on phones |
| `.pc-shell`, `.pc-view` | `src/app/globals.css` | Size views against the space between the bars |

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

**Any focused text field under 16px makes iOS zoom the page in, and it does not zoom back.** Keep
phone inputs at 16px.

**Move by transform and opacity, and let pages come to rest.** On a phone, lag is mostly painting,
not script. Five patterns cost the most:
- a gradient animated by `background-position`;
- `border-radius` or `left` animated;
- `backdrop-filter` over anything that moves or scrolls;
- `filter: drop-shadow` or `blur` on many small elements;
- CSS masks on many small elements.

All of these repaint on every frame. The entrance's drifting glow is an oversized layer moved by
transform, its cloth waves no longer change shape, its dust specks are soft gradients, not blurs,
and its search field is near-opaque, not frosted. Measured on a phone-sized screen with the idle
entrance traced for 3 s, rasterizing fell from 5.9 s of work (504 paints) to none. The top bar,
the tab bar and the gold buttons use no backdrop blur. The buttons' shine plays three times and
rests, so a page at rest draws nothing. The Swatch Book's notes in `M24_FABRIC_LAB.md` give its
own figures.

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
- the entrance fits without scrolling, and the hero's own search bar stays off on a phone

It runs at 390×844, again at 360×780 — the narrow case the labels have to survive — and once at
834px to prove the desktop header comes back.
