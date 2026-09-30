import { css, fg, shade, weave, tex } from '@/lib/fabric-generator';
import type { FabricRow, ColourRow } from '@/lib/types';

export function colourCss(c: ColourRow) {
  return css(c.l, c.c, c.h);
}

export function colourFg(c: ColourRow) {
  return fg(c.l);
}

export function fabricTex(f: FabricRow, c: ColourRow, p = 3) {
  return tex(f.sheen, f.family, c, p);
}

export function fabricWeave(f: FabricRow, c: ColourRow, p = 3) {
  return weave(f.family, c, p);
}

export function colourShade(c: ColourRow, dl: number) {
  return shade(c, dl);
}

export function heroColour(f: FabricRow): ColourRow {
  return f.colours[f.heroIndex] ?? f.colours[0];
}

/** A fabric's place in the catalogue, printed the way a catalogue prints it: "01" of "11". */
export function fabricNo(fabrics: { id: string }[], id: string) {
  return String(fabrics.findIndex((f) => f.id === id) + 1).padStart(2, '0');
}

export const FONT_DISPLAY = "var(--font-display), 'Cormorant Garamond', serif";
export const FONT_BODY = "var(--font-body), 'Jost', sans-serif";

export function chipStyle(on: boolean) {
  return on
    ? { background: '#1C1917', color: '#FAF8F5', borderColor: '#1C1917' }
    : { background: 'transparent', color: '#1C1917', borderColor: 'rgba(28,25,23,.2)' };
}

/** Below this OKLCH chroma a shade reads as a grey, and is hung with the neutrals. */
const NEUTRAL_C = 0.035;
/**
 * The colour families of a shade card, round the OKLCH wheel from red: each is where its hues
 * start. The pinks run on to 360°, so a rani or gulabi pink (350°–359°) hangs with the pinks, and
 * the reds start at 0°. A shade belongs to the last family whose start it has passed.
 */
const FAMILY_STARTS = [0, 40, 75, 115, 170, 220, 275, 315]; // red, orange, yellow, green, teal, blue, violet, pink
/** Where a shade sits on a shade card: 0 for the neutrals, then 1 to 8 for each family in turn. */
export function colourFamily(c: ColourRow): number {
  if (c.c < NEUTRAL_C) return 0;
  const h = ((c.h % 360) + 360) % 360;
  let f = 0;
  FAMILY_STARTS.forEach((start, i) => {
    if (h >= start) f = i;
  });
  return 1 + f;
}
/**
 * Shades in the order of a shade card: the neutrals first, white to black, then family by family
 * round the wheel (reds, oranges, yellows, greens, teals, blues, violets, pinks), each family light
 * to dark, and shades of the same lightness by hue. A sort comparator, and a proper one (a single
 * key compared in turn), so every list of shades on the site comes out in the same order.
 */
export function spectrum(a: ColourRow, b: ColourRow) {
  const fa = colourFamily(a);
  const fb = colourFamily(b);
  if (fa !== fb) return fa - fb;
  const dl = Math.round((b.l - a.l) * 1000);
  if (dl !== 0) return dl;
  return a.h - b.h || a.order - b.order;
}

/**
 * Sets the page's scroll at once, in every browser. The site scrolls smoothly by default
 * (`scroll-behavior: smooth`), and `behavior: 'instant'` is not understood by older Safari (it
 * throws, and the scroll never happens), so the smooth scrolling is set aside for the one call and
 * the plain two-number form is used.
 */
export function jumpTo(y: number) {
  const h = document.documentElement;
  const was = h.style.scrollBehavior;
  h.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  h.style.scrollBehavior = was;
}
