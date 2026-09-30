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
/** Where the colour wheel is cut to lay it out in a line: between the pinks and the reds. */
const HUE_START = 350;
/**
 * Shades in one run of colour, as a mill hangs its cards: the neutrals first, light to dark, then
 * round the colour wheel from red, each hue light to dark where two sit close. A sort comparator.
 */
export function spectrum(a: ColourRow, b: ColourRow) {
  const an = a.c < NEUTRAL_C;
  const bn = b.c < NEUTRAL_C;
  if (an !== bn) return an ? -1 : 1;
  if (an) return b.l - a.l;
  const ha = (a.h - HUE_START + 720) % 360;
  const hb = (b.h - HUE_START + 720) % 360;
  return Math.abs(ha - hb) < 6 ? b.l - a.l : ha - hb;
}
