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
