/**
 * Pure, isomorphic domain logic for Poddar Creation Studio's fabric system.
 * Ported from the approved Claude Design prototype (project/Poddar Creation Studio.dc.html).
 * No DOM / DB dependency — safe to import from the Prisma seed script (Node) and from
 * client components (browser) alike. Fabric + Colour rows live in Postgres; this module
 * derives all presentation (OKLCH CSS, weave textures, physics notes) from their raw
 * numeric attributes, exactly as the original prototype computed them on the fly.
 */

import { SHADE_CARDS } from './shade-cards';

export type FabricFamily = 'cotton' | 'rayon' | 'slub' | 'wrinkle' | 'silk' | 'lycra';
export type GarmentKey = 'kurti' | 'shirt' | 'saree' | 'top' | 'tshirt' | 'roll';
export type LightKey = 'daylight' | 'golden' | 'studio' | 'boutique' | 'white';
export type RoomKey = 'cotton' | 'rayon' | 'silk';
export type Lang = 'en' | 'hi';

export interface FabricDef {
  id: string;
  name: string;
  family: FabricFamily;
  weight: string;
  width: string;
  comp: string;
  nc: number;
  hand: string;
  sheen: number;
  flow: number;
  stretch: number;
  seed: number;
  price: number;
  heroIndex: number;
}

export interface ColourBase {
  name: string;
  l: number;
  c: number;
  h: number;
}

export interface Colour {
  name: string;
  l: number;
  c: number;
  h: number;
  order: number;
  /** The shade's number on the mill's card. */
  code?: string;
}

// 24-shade named palette shared as a base across every fabric family (OKLCH: l 0-1, c chroma, h hue deg)
export const COLOUR_NAMES: ColourBase[] = [
  { name: 'Kapaas', l: 0.96, c: 0.015, h: 100 },
  { name: 'Ivory', l: 0.94, c: 0.03, h: 90 },
  { name: 'Motiya', l: 0.9, c: 0.04, h: 80 },
  { name: 'Badami', l: 0.76, c: 0.06, h: 60 },
  { name: 'Gehua', l: 0.82, c: 0.08, h: 78 },
  { name: 'Sunehri', l: 0.78, c: 0.13, h: 88 },
  { name: 'Haldi', l: 0.8, c: 0.16, h: 92 },
  { name: 'Kesar', l: 0.73, c: 0.17, h: 60 },
  { name: 'Sindoor', l: 0.62, c: 0.21, h: 32 },
  { name: 'Surkh', l: 0.53, c: 0.21, h: 27 },
  { name: 'Gulab', l: 0.78, c: 0.11, h: 10 },
  { name: 'Rani', l: 0.55, c: 0.23, h: 352 },
  { name: 'Falsa', l: 0.46, c: 0.17, h: 335 },
  { name: 'Jamun', l: 0.36, c: 0.11, h: 315 },
  { name: 'Kashish', l: 0.62, c: 0.05, h: 320 },
  { name: 'Neel', l: 0.4, c: 0.11, h: 268 },
  { name: 'Aasmani', l: 0.78, c: 0.08, h: 235 },
  { name: 'Firozi', l: 0.74, c: 0.11, h: 200 },
  { name: 'Peacock', l: 0.48, c: 0.11, h: 215 },
  { name: 'Dhani', l: 0.82, c: 0.11, h: 135 },
  { name: 'Angoori', l: 0.72, c: 0.12, h: 118 },
  { name: 'Mehendi', l: 0.5, c: 0.08, h: 125 },
  { name: 'Zaitooni', l: 0.55, c: 0.07, h: 108 },
  { name: 'Koyla', l: 0.32, c: 0.01, h: 70 },
];

// The range, as the mill's shade cards give it: name, width and weight from each card; shades and
// their numbers from `shade-cards.ts`. Composition, hand and price are the studio's own notes.
export const FABRIC_DEFS: FabricDef[] = [
  { id: 'pcpc', name: 'PC Cotton', family: 'cotton', weight: '8.8 kg', width: '41″', comp: '52% Polyester · 48% Cotton', nc: 52, hand: 'Crisp · Structured', sheen: 0.1, flow: 0.3, stretch: 0.1, seed: 0, price: 62, heroIndex: 17 },
  { id: 'cambric', name: 'Cambric Cotton', family: 'cotton', weight: '9 kg', width: '43″', comp: '100% Combed Cotton', nc: 20, hand: 'Fine · Smooth hand', sheen: 0.08, flow: 0.35, stretch: 0.1, seed: 1, price: 74, heroIndex: 12 },
  { id: 'jaam11', name: 'Jam Cotton', family: 'cotton', weight: '11 kg', width: '43″', comp: '100% Cotton · Jam weave', nc: 47, hand: 'Matte · Natural fall', sheen: 0.08, flow: 0.4, stretch: 0.12, seed: 2, price: 88, heroIndex: 32 },
  { id: 'rayon14', name: 'Rayon', family: 'rayon', weight: '14 kg', width: '43″', comp: '100% Viscose Rayon', nc: 55, hand: 'Fluid · Heavy drape', sheen: 0.22, flow: 0.9, stretch: 0.2, seed: 1, price: 82, heroIndex: 44 },
  { id: 'rayondyed', name: 'Rayon Dyed', family: 'rayon', weight: '14 kg', width: '43″', comp: '100% Viscose Rayon · Piece dyed', nc: 55, hand: 'Fluid · Soft drape', sheen: 0.22, flow: 0.88, stretch: 0.2, seed: 2, price: 82, heroIndex: 14 },
  { id: 'slub', name: 'Rayon Slub', family: 'slub', weight: '14 kg', width: '43″', comp: '100% Viscose · Slub yarn', nc: 31, hand: 'Textured · Flowing', sheen: 0.18, flow: 0.85, stretch: 0.18, seed: 0, price: 92, heroIndex: 4 },
  { id: 'roman', name: 'Roman Silk', family: 'silk', weight: '9.5 kg', width: '56″', comp: 'Poly roman weave · Silk touch', nc: 62, hand: 'Lustrous · Smooth folds', sheen: 0.38, flow: 0.65, stretch: 0.14, seed: 2, price: 98, heroIndex: 28 },
  { id: 'gajji', name: 'Gajji Silk', family: 'silk', weight: '22 kg', width: '58″', comp: 'Satin gajji · Heavy lustre', nc: 22, hand: 'Liquid shine · Weighted', sheen: 0.5, flow: 0.6, stretch: 0.12, seed: 0, price: 210, heroIndex: 9 },
  { id: 'lycra', name: 'Cotton Satin Lycra', family: 'lycra', weight: '21 kg', width: '58″', comp: 'Cotton satin · Lycra stretch', nc: 9, hand: 'Stretch · Satin face', sheen: 0.2, flow: 0.45, stretch: 0.9, seed: 1, price: 148, heroIndex: 4 },
];

/**
 * The rest of the mill's range: 72 more named shades, laid round the wheel (the near-greys first,
 * then earths, oranges and golds, greens, blues, violets, pinks and reds). A quality comes in the
 * 24 of the base palette and as many of these as its range holds (`nc`), picked evenly round the
 * wheel so each quality's range covers it; which ones differs from quality to quality.
 */
export const MORE_COLOURS: ColourBase[] = [
  { name: 'Doodhiya', l: 0.99, c: 0.004, h: 200 },
  { name: 'Kewra', l: 0.92, c: 0.04, h: 120 },
  { name: 'Chandni', l: 0.9, c: 0.012, h: 250 },
  { name: 'Seepi', l: 0.87, c: 0.025, h: 60 },
  { name: 'Chandi', l: 0.8, c: 0.01, h: 250 },
  { name: 'Pathar', l: 0.67, c: 0.02, h: 70 },
  { name: 'Raakh', l: 0.56, c: 0.01, h: 90 },
  { name: 'Dhuaan', l: 0.61, c: 0.016, h: 260 },
  { name: 'Surmai', l: 0.44, c: 0.018, h: 250 },
  { name: 'Loha', l: 0.36, c: 0.014, h: 230 },
  { name: 'Kajal', l: 0.24, c: 0.012, h: 280 },
  { name: 'Kaala', l: 0.19, c: 0.005, h: 70 },
  { name: 'Ret', l: 0.83, c: 0.045, h: 82 },
  { name: 'Chandan', l: 0.71, c: 0.05, h: 68 },
  { name: 'Oont', l: 0.66, c: 0.08, h: 72 },
  { name: 'Mitti', l: 0.6, c: 0.065, h: 52 },
  { name: 'Dalchini', l: 0.52, c: 0.1, h: 46 },
  { name: 'Akhrot', l: 0.44, c: 0.065, h: 56 },
  { name: 'Kattha', l: 0.39, c: 0.085, h: 36 },
  { name: 'Kahwa', l: 0.32, c: 0.045, h: 58 },
  { name: 'Khaprail', l: 0.58, c: 0.12, h: 40 },
  { name: 'Aadu', l: 0.85, c: 0.08, h: 52 },
  { name: 'Moonga', l: 0.68, c: 0.15, h: 34 },
  { name: 'Tamba', l: 0.6, c: 0.14, h: 48 },
  { name: 'Zang', l: 0.49, c: 0.13, h: 42 },
  { name: 'Gerua', l: 0.65, c: 0.15, h: 58 },
  { name: 'Narangi', l: 0.68, c: 0.19, h: 46 },
  { name: 'Genda', l: 0.8, c: 0.17, h: 72 },
  { name: 'Kahruba', l: 0.68, c: 0.15, h: 74 },
  { name: 'Shehed', l: 0.74, c: 0.13, h: 80 },
  { name: 'Peetal', l: 0.63, c: 0.11, h: 92 },
  { name: 'Aam', l: 0.84, c: 0.16, h: 84 },
  { name: 'Makhan', l: 0.93, c: 0.07, h: 96 },
  { name: 'Champa', l: 0.88, c: 0.11, h: 92 },
  { name: 'Sarson', l: 0.72, c: 0.15, h: 100 },
  { name: 'Keri', l: 0.86, c: 0.13, h: 106 },
  { name: 'Neembu', l: 0.88, c: 0.15, h: 118 },
  { name: 'Pista', l: 0.86, c: 0.08, h: 130 },
  { name: 'Tota', l: 0.7, c: 0.18, h: 140 },
  { name: 'Paan', l: 0.6, c: 0.14, h: 134 },
  { name: 'Hara', l: 0.54, c: 0.15, h: 148 },
  { name: 'Kai', l: 0.46, c: 0.08, h: 120 },
  { name: 'Saunf', l: 0.76, c: 0.1, h: 152 },
  { name: 'Zamurrad', l: 0.5, c: 0.12, h: 162 },
  { name: 'Botal', l: 0.35, c: 0.08, h: 160 },
  { name: 'Pudina', l: 0.87, c: 0.07, h: 168 },
  { name: 'Kahi', l: 0.63, c: 0.1, h: 176 },
  { name: 'Morpankh', l: 0.52, c: 0.1, h: 192 },
  { name: 'Barf', l: 0.93, c: 0.03, h: 220 },
  { name: 'Samundar', l: 0.58, c: 0.11, h: 222 },
  { name: 'Faulad', l: 0.52, c: 0.04, h: 232 },
  { name: 'Akash', l: 0.84, c: 0.06, h: 244 },
  { name: 'Nila', l: 0.56, c: 0.14, h: 256 },
  { name: 'Neelam', l: 0.44, c: 0.16, h: 266 },
  { name: 'Gehra Neel', l: 0.28, c: 0.08, h: 266 },
  { name: 'Lajward', l: 0.5, c: 0.15, h: 280 },
  { name: 'Kasni', l: 0.66, c: 0.1, h: 294 },
  { name: 'Bakaini', l: 0.8, c: 0.06, h: 304 },
  { name: 'Jamuni', l: 0.46, c: 0.15, h: 300 },
  { name: 'Baingani', l: 0.3, c: 0.14, h: 298 },
  { name: 'Sosani', l: 0.62, c: 0.14, h: 326 },
  { name: 'Aloo Bukhara', l: 0.4, c: 0.1, h: 340 },
  { name: 'Pyaazi', l: 0.75, c: 0.07, h: 352 },
  { name: 'Gulabi', l: 0.7, c: 0.15, h: 356 },
  { name: 'Kusum', l: 0.63, c: 0.19, h: 4 },
  { name: 'Gudhal', l: 0.5, c: 0.21, h: 8 },
  { name: 'Sharmili', l: 0.87, c: 0.05, h: 20 },
  { name: 'Manik', l: 0.45, c: 0.19, h: 18 },
  { name: 'Anaar', l: 0.56, c: 0.2, h: 22 },
  { name: 'Sharabi', l: 0.33, c: 0.12, h: 12 },
  { name: 'Kachnar', l: 0.72, c: 0.1, h: 330 },
  { name: 'Kirmizi', l: 0.39, c: 0.15, h: 24 },
];

/** A quality's shades: its shade card's, in card order, each under its number on the card. A
 *  quality with no card (none at present) falls back to the base 24 and as many more as its range
 *  holds, evenly round the wheel from a point its own. */
export function generateColours(fabric: FabricDef): Colour[] {
  const card = SHADE_CARDS[fabric.id];
  if (card) return card.map(([code, name, l, c, h], order) => ({ name, l, c, h, order, code }));
  const tone = (base: ColourBase, j: number): Colour => {
    const L = Math.min(0.97, Math.max(0.19, base.l + (((fabric.seed + j) % 3) - 1) * 0.015));
    return { name: base.name, l: L, c: base.c, h: base.h, order: j };
  };
  const out = COLOUR_NAMES.map(tone);
  const extra = Math.max(0, Math.min(MORE_COLOURS.length, fabric.nc - COLOUR_NAMES.length));
  let off = 0;
  for (const ch of fabric.id) off = (off * 31 + ch.charCodeAt(0)) % MORE_COLOURS.length;
  for (let k = 0; k < extra; k++) {
    const base = MORE_COLOURS[(Math.floor((k * MORE_COLOURS.length) / extra) + off) % MORE_COLOURS.length];
    out.push(tone(base, COLOUR_NAMES.length + k));
  }
  return out;
}

/** A shade's number as the buyer knows it: the number beside it on the mill's card ("13", "401");
 *  for a shade with none, its place in the range, from 01. */
export function shadeCode(c: { order: number; code?: string | null }): string {
  return c.code || String(c.order + 1).padStart(2, '0');
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function css(l: number, c: number, h: number): string {
  return `oklch(${(l * 100).toFixed(1)}% ${c} ${h})`;
}

export function fg(l: number): string {
  return l > 0.62 ? '#1C1917' : '#FAF8F5';
}

export function shade(o: { l: number; c: number; h: number }, dl: number): string {
  return `oklch(${clamp((o.l + dl) * 100, 6, 98).toFixed(1)}% ${o.c} ${o.h})`;
}

export function weave(family: FabricFamily, o: { l: number; c: number; h: number }, p = 3): string {
  const warp = `repeating-linear-gradient(90deg, ${shade(o, -0.05)} 0 1px, transparent 1px ${p}px)`;
  const weft = `repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px ${p}px)`;
  if (family === 'silk') return `repeating-linear-gradient(115deg, rgba(255,255,255,.07) 0 2px, transparent 2px ${p + 2}px)`;
  if (family === 'slub') return `repeating-linear-gradient(0deg, ${shade(o, -0.07)} 0 2px, transparent 2px ${p * 3}px), ${weft}`;
  if (family === 'wrinkle') return `repeating-linear-gradient(70deg, rgba(0,0,0,.05) 0 3px, rgba(255,255,255,.06) 3px 7px), repeating-linear-gradient(105deg, rgba(255,255,255,.05) 0 2px, transparent 2px ${p * 3}px)`;
  if (family === 'lycra') return `repeating-linear-gradient(90deg, ${shade(o, -0.04)} 0 1px, transparent 1px ${Math.max(2, p - 1)}px)`;
  return `${weft}, ${warp}`;
}

export function tex(fabricSheen: number, family: FabricFamily, o: { l: number; c: number; h: number }, p = 3): string {
  const base = `linear-gradient(${css(o.l, o.c, o.h)},${css(o.l, o.c, o.h)})`;
  const sheenLayer = fabricSheen >= 0.2
    ? `linear-gradient(102deg, rgba(255,255,255,0) 28%, rgba(255,255,255,${(0.12 + fabricSheen * 0.5).toFixed(2)}) 45%, rgba(255,255,255,.03) 58%, rgba(255,255,255,0) 78%), `
    : '';
  return `${sheenLayer}${weave(family, o, p)}, ${base}`;
}

export const FABRIC_STORIES: Record<string, string> = {
  pcpc: 'Holds a crease like a promise — shirting that stays sharp.',
  cambric: 'Fine combed threads, a cool hand — the everyday luxury.',
  jaam11: 'The kurta maker’s workhorse — matte, honest, dependable.',
  rayon14: 'Falls like evening water — cut it for hems that move.',
  rayondyed: 'Dyed in the piece — the same fall, the colour right through.',
  slub: 'Irregular on purpose — texture you can read across a room.',
  roman: 'A quiet lustre — silk manners at cotton sense.',
  gajji: 'Liquid shine, bridal weight — the roll that ends the search.',
  lycra: 'Moves with the body and returns — tailored, then forgiving.',
};

export const PHYSICS_NOTES: Record<FabricFamily, string> = {
  cotton: 'Cotton holds its shape — matte surface, natural wrinkles, a structured fall.',
  rayon: 'Rayon falls heavy and fluid — soft folds that move like liquid.',
  slub: 'Slub yarn breaks the surface with irregular texture while keeping rayon’s flow.',
  wrinkle: 'A permanent crinkle finish — airy, crushed, relaxed movement.',
  silk: 'High lustre catches every light change — smooth, weighted, luxurious folds.',
  lycra: 'Spandex recovery — the cloth stretches and returns, keeping a clean silhouette.',
};

export const STRETCH_TEST_NOTES: Record<FabricFamily, string> = {
  cotton: 'Cotton gives little — a firm, stable cloth.',
  rayon: 'Rayon eases slightly on the bias.',
  slub: 'Slub eases slightly on the bias.',
  wrinkle: 'The crinkle opens a little under tension.',
  silk: 'Gajji holds firm — stretch lives in the drape, not the yarn.',
  lycra: '5% spandex — stretches and snaps back clean.',
};

export const WATER_TEST_NOTES: Record<FabricFamily, string> = {
  cotton: 'Absorbs quickly and darkens — classic cotton.',
  rayon: 'Drinks water fast; darkens deeply, dries soft.',
  slub: 'Absorbs along the slub lines first.',
  wrinkle: 'Water settles into the crinkle valleys.',
  silk: 'Beads first, then a shallow mark — wipe it away.',
  lycra: 'Cotton face absorbs; recovery unharmed.',
};

export const WATER_OPACITY: Record<FabricFamily, number> = {
  cotton: 0.28, rayon: 0.32, slub: 0.3, wrinkle: 0.3, silk: 0.12, lycra: 0.24,
};

export const GARMENTS: Record<GarmentKey, { d: string; label: string }> = {
  kurti: { d: 'M100 24c-9 0-16-3-21-7L42 30l7 74 15-4v52l-8 84h32v-36h24v36h32l-8-84v-52l15 4 7-74-37-13c-5 4-12 7-21 7Z', label: 'Kurti' },
  shirt: { d: 'M100 26c-10 0-18-3-24-7L38 34l9 86 17-4v112h72V116l17 4 9-86-38-15c-6 4-14 7-24 7Z', label: 'Shirt' },
  // A saree on the form: a short-sleeved blouse, the skirt falling straight to the floor, and the
  // pallu over the left shoulder, hanging down that side to a point.
  saree: { d: 'M100 24c-9 0-16-3-21-7L46 30L34 198L44 214L66 150L56 252H150L136 102L140 74L144 64L157 60L150 30L121 17C116 21 109 24 100 24Z', label: 'Saree' },
  top: { d: 'M79 30l-11 7 5 58 9-2v103h36V93l9 2 5-58-11-7c-8 9-34 9-42 0Z', label: 'Top' },
  tshirt: { d: 'M100 28c-11 0-19-4-25-8L36 36l13 27 17-9v176h68V54l17 9 13-27-39-16c-6 4-14 8-25 8Z', label: 'T-Shirt' },
  roll: { d: '', label: 'Fabric Roll' },
};

export const LIGHTS: Record<LightKey, { en: string; bg: string; filter: string; glow: string; fg: string }> = {
  daylight: { en: 'Daylight', bg: 'linear-gradient(180deg,#EAF1F6,#F6F4EF 60%,#E8E4DC)', filter: 'brightness(1.05) saturate(1.03)', glow: 'rgba(150,180,210,.25)', fg: '#1C1917' },
  golden: { en: 'Golden Hour', bg: 'linear-gradient(180deg,#F4E3C6,#EFDCC2 60%,#E0C9A8)', filter: 'sepia(.2) brightness(1.04) saturate(1.12)', glow: 'rgba(220,165,80,.4)', fg: '#1C1917' },
  studio: { en: 'Studio', bg: 'linear-gradient(180deg,#F4F2EE,#E7E3DC)', filter: 'contrast(1.05)', glow: 'rgba(255,255,255,.6)', fg: '#1C1917' },
  boutique: { en: 'Boutique', bg: 'linear-gradient(180deg,#2B2724,#3C342E)', filter: 'brightness(1.05) contrast(1.1)', glow: 'rgba(235,190,115,.35)', fg: '#FAF8F5' },
  white: { en: 'White Cyc', bg: 'linear-gradient(180deg,#FFFFFF,#EFEFEF)', filter: 'none', glow: 'rgba(0,0,0,.04)', fg: '#1C1917' },
};

export interface RoomDef {
  k: RoomKey;
  ids: string[];
  bg: string;
  glow: string;
  fg: string;
  sub: string;
  accent: string;
  labelKey: string;
  descKey: string;
}

export const ROOMS: RoomDef[] = [
  { k: 'cotton', ids: ['pcpc', 'cambric', 'jaam11', 'lycra'], bg: 'linear-gradient(180deg,#EEF3F4 0%,#EDEFE9 62%,#DCDFD4 62.2%,#CFD2C5 100%)', glow: 'rgba(160,190,200,.32)', fg: '#1C1917', sub: 'rgba(28,25,23,.55)', accent: '#5B7263', labelKey: 'cottonG', descKey: 'cottonDesc' },
  { k: 'rayon', ids: ['rayon14', 'rayondyed', 'slub'], bg: 'linear-gradient(180deg,#F2EEF4 0%,#EDE8EE 62%,#DED6DF 62.2%,#D0C7D2 100%)', glow: 'rgba(180,160,200,.3)', fg: '#1C1917', sub: 'rgba(28,25,23,.55)', accent: '#6B5B7A', labelKey: 'rayonR', descKey: 'rayonDesc' },
  { k: 'silk', ids: ['roman', 'gajji'], bg: 'linear-gradient(180deg,#2E2A26 0%,#3A332C 62%,#241F1B 62.2%,#1C1815 100%)', glow: 'rgba(235,190,115,.4)', fg: '#FAF8F5', sub: 'rgba(250,248,245,.6)', accent: '#C9A96A', labelKey: 'silkG', descKey: 'silkDesc' },
];

/**
 * The catalogue's order: the rooms' order, cotton to rayon to silk. Every number a fabric carries
 * (01–11) and every list of fabrics follows it, so the Showroom's walk, its slider and the lab's
 * number strip all agree.
 */
export const CATALOGUE_ORDER: string[] = ROOMS.flatMap((r) => r.ids);

export function inCatalogueOrder<T extends { id: string }>(list: T[]): T[] {
  const at = (id: string) => {
    const i = CATALOGUE_ORDER.indexOf(id);
    return i < 0 ? CATALOGUE_ORDER.length : i;
  };
  return [...list].sort((a, b) => at(a.id) - at(b.id));
}

export type Dict = Record<string, string>;

const EN: Dict = { home: 'Entrance', showroom: 'Showroom', colours: 'Colour Closet', closetShort: 'Closet', book: 'Swatch Book', admin: 'Admin', adminTitle: 'Catalogue Studio', est: 'WHOLESALE DYED FABRICS · EST. SURAT', estWhat: 'Wholesale dyed fabrics', estWhere: 'Est. Surat', heroSub: 'Nine qualities. Over three hundred and fifty shades. A showroom that never closes.', enter: 'Enter the Showroom', explore: 'Open the Colour Closet', searchPh: 'Search — or ask: “summer kurtis”…', byImage: 'Search by image', signin: 'Sign in', signed: 'Approved buyer ✓', shades: 'shades', hall: 'The Fabric Hall', hallDesc: 'Every quality under one roof — walk right, or step into a gallery.', cottonG: 'Cotton Gallery', cottonDesc: 'Crisp, matte, structured — daylight suits cotton.', rayonR: 'Rayon Room', rayonDesc: 'Fluid drape, soft folds — cloth that moves like water.', silkG: 'Silk Gallery', silkDesc: 'Boutique light. Lustre that answers every lamp.', scrollHint: 'SCROLL → · CLICK A ROLL TO UNROLL', lab: 'FABRIC LAB', study: 'Material study', sheet: 'Product details', selectMulti: 'Select multiple', pricePerMetre: 'Price', metre: 'metre', inStockShort: 'In stock', millFresh: 'Mill fresh', yourBook: 'Your Book', bookAdded: 'Added to Your Book', bookNudge: 'Order the swatch book to see', bookNudge2: 'and feel these shades in hand.', orderBook: 'Order swatch book', keepBrowsing: 'Continue browsing', shade: 'shade', qualities: 'qualities', done: 'Done', selected: 'selected', inBook: 'In your book', garment: 'Garment', lighting: 'Lighting', windL: 'Wind', scope: 'Microscope', scopeNote: 'SIMULATED WEAVE · MACRO', scenes: 'Scenes', weight: 'Weight', width: 'Width', comp: 'Composition', hand: 'Hand & drape', price: 'Price / metre', stock: 'Stock', inStock: 'In stock · mill fresh', downloads: 'Downloads', spec: 'Spec sheet', cat: 'Colour catalogue', qr: 'SHARE · QR', quote: 'Request a quote', quoteBook: 'Quote this book', quoteSend: 'Send request', quoteThanks: 'Request received.', quoteFollow: 'Our sales team will respond within one working day.', pin: 'Add to book', open: 'Open fabric', colourWall: 'The Colour Closet', closetTitleA: 'The Colour', sealTitle: 'Securing your details', sealDone: 'Sealed and kept safe', sealLine1: 'Sent to us over an encrypted connection.', sealLine2: 'Your password is kept only as a one-way hash: no one can read it, not even us.', sealCode: 'One-time code', trackMenu: 'Track your order', trackTitle: 'Track your Order', trackSub1: 'Every order, and where it stands.', trackSub2: 'We confirm each step on WhatsApp too.', trackFind: 'Your reference, as PC-4F2K9A', trackNone: 'No orders yet', trackNoneSub: 'Once you place an order it appears here, and you can follow it from the mill to your door.', trackSignIn: 'Sign in to see your orders', trackMiss: 'No order with that reference.', trackPreview: 'preview', trackClosed: 'Closed', trackReviewing: 'Being reviewed', trackReceived: 'Received', trackPriced: 'Price confirmed', trackDyeing: 'In the dye house', trackDispatched: 'Dispatched', trackDelivered: 'Delivered', trackClosedLine: 'This order was closed. Call us if you would like to go ahead with it.', trackNow0: 'We have your order. We confirm the price and the dispatch date with you on WhatsApp.', trackNow1: 'The price is confirmed. Your fabric is next in line at the dye house.', trackNow2: 'Your fabric is being dyed and finished. We will tell you the day it leaves the mill.', trackPaid: 'Paid online', trackQuoted: 'Quoted', trackTo: 'To', trackWhen: 'Needed', trackCall: 'Ask about this order', trackDeviceNote: 'These are the orders placed from this device.', priceAsk: 'Not satisfied with the price?', priceCall: 'Give us a call', closetTitleB: 'Closet', closetSub: 'Every quality in a closet of its own. {n} shades, hung and ready to be parted.', closetOpen: 'Open the closet', slideHint: 'slide along a rail to part the slips · tap the parted one to open', emptyBoard: 'Add shades from any fabric — build a swatch book for your buyer.', bookSub: 'Your collection — export, share, or turn it into a quotation.', drapeLive: 'LIVE DRAPE', fName: 'Your name', fCompany: 'Company / City', fQty: 'Quantity (metres or kg)', aiBusy: 'MATCHING FABRIC & SHADE…', aiTitle: 'Closest match', aiConf: 'CONFIDENCE', aiAlts: 'Alternatives', dropHint: 'Drag & drop fabric photos or videos', dropFiles: 'files queued', recent: 'Recent uploads', moreFab: 'More fabrics', moreWord: 'More', inBookWord: 'in your book', chapterWord: 'Fabric', preparedFor: 'Prepared for', shadeNo: 'No.', looseNote: 'Loose cuttings, for now. They are bound into your book when you order it.', waPh: 'WhatsApp number, with country code', waBad: 'Enter a WhatsApp number with its country code.', compiling: 'Compiling your fine choices', bindingWord: 'Binding your book', boundWord: 'Bound and fastened', onItsWay: 'On its way to', onWhatsApp: 'on WhatsApp', bookFile: 'Poddar Swatch Book', bookDone: 'Our team will share your compiled book on this number shortly.', youWord: 'You', contents: 'Contents', compiledOn: 'Compiled on', colophon: 'Colours on screen and on paper are a guide; the cuttings in your hand are the reference.', previewBook: 'Preview your book', downloadPdf: 'Download PDF', preparing: 'Preparing your PDF…', bookReady: 'Your book is ready', orderFailed: 'We could not place your order just now. Your book is ready to download; please try ordering again.', demoNote: 'This preview site does not send orders; on the live site your book goes to this number.', closeWord: 'Close', slideOpen: 'Slide left to open', slideSkip: 'right for the next fabric', slideMore: 'Slide left for more', slideBack: 'right to go back', sheetWord: 'Sheet', authOrderTitle: 'Your book awaits', authOrderSub: 'Sign in, and your {n} shades are bound and sent to your WhatsApp.', authAccountTitle: 'The Poddar atelier', authAccountSub: 'Wholesale prices, your quotations and your swatch books, in one place.', authWaTitle: 'One last detail', authWaSub: 'Where shall we send your book?', signInTab: 'Sign in', createTab: 'Create account', fEmail: 'Email', fPassword: 'Password', fFullName: 'Full name', fCompanyOnly: 'Company', fCity: 'City', fWhatsapp: 'WhatsApp number', signInOrder: 'Sign in & order', createOrder: 'Create account & order', saveOrder: 'Save & order', createBtn: 'Create account', authFine: 'New accounts see wholesale prices once our team approves them.', authPreview: 'This preview site has no accounts. Continuing shows the ordering experience without creating one.', forgotPw: 'Forgotten your password?', continueWhatsapp: 'Continue with WhatsApp', continueGoogle: 'Continue with Google', orWord: 'or', signInTitle: 'Welcome back', signInSub: 'Sign in with your email and password.', createTitle: 'Create your account', createSub: 'Once, and never asked again.', haveAccount: 'I have an account', waSheetSub: 'We will send a six-digit code to your WhatsApp.', sendCode: 'Send code', codeSentTo: 'Code sent on WhatsApp to', enterCode: 'The six-digit code', verifyCode: 'Verify & continue', resendIn: 'Resend in {s}s', resend: 'Resend code', changeNumber: 'Change number', badCode: 'That code is not right, or it has expired.', aboutYou: 'A little about you', aboutYouSub: 'Your number is new to us. Who shall we address your book to?', devCodeNote: 'Development: the code is {code}', previewCodeNote: 'Preview: use the code {code}', googleSoon: 'Google sign-in is being set up. Please use WhatsApp or email for now.', waSoon: 'WhatsApp sign-in is being set up. Please use email for now.', boundToOrder: 'bound to order', authFabricTitle: 'Your order awaits', authFabricSub: 'Sign in, and your {m} metres go straight to the mill.', fabricOrderBack: 'Your order', skipBook: 'Skip the swatch book', skipBookSub: 'Order the fabric itself, by the metre', directEyebrow: 'Direct from the mill', orderThe: 'Order the', fabricWordTitle: 'Fabric', directSub: 'Set the metres for each shade. We confirm the price and dispatch date on WhatsApp.', perMetre: 'per metre', setAll: 'All', metresWord: 'metres', notIncluded: 'Not included', whenNeeded: 'When do you need it?', whenSoon: 'As soon as possible', when2w: 'Within two weeks', whenMonth: 'Within a month', noteForMill: 'A note for the mill', placeOrder: 'Place order', estimate: 'Estimate', estimateNote: 'Indicative, before taxes and freight. Our team confirms the final price.', shadesChosen: 'shades', pkFolding: 'Folding your fabrics', pkWrapping: 'Boxed in kraft', pkTying: 'Taped and tied', pkSealing: 'Sealed by the house', pkPlaced: 'Your order is placed', orderRef: 'Order', pkConfirm: 'We will confirm the price and dispatch date on WhatsApp.', pkConfirmTo: 'We will confirm the price and dispatch date on WhatsApp to {n}.', pkPreview: 'This preview site does not send orders; on the live site your order goes straight to the mill.', pkFailed: 'We could not place your order just now. Your selection is kept; please try again.', backToShowroom: 'Back to the Showroom', tryAgain: 'Try again', nothingChosen: 'Set metres for at least one shade.', cartWord: 'Cart', addTo: 'Add to…', addWhere: 'Where shall it go?', addWhereSub: 'Order the fabric now, or keep a cutting in your swatch book first.', toCart: 'Add to Cart', toCartSub: 'Order the fabric itself, by the metre', toBook: 'Add to Swatch Book', toBookSub: 'A cutting of each shade, bound and sent to you', addedCart: 'Added to your cart', inCart: 'In your cart', viewCart: 'View cart', inCartAlready: 'already in your cart', cartTitleA: 'Your', cartTitleB: 'Cart', cartEmpty: 'Your cart is empty', cartEmptySub: 'Choose a shade in the Showroom and add it to your cart by the metre.', removeWord: 'Remove', cartSub: 'Adjust the metres for each shade. We confirm the price and dispatch date on WhatsApp.', googlePreview: 'Google sign-in works on the live site.', pwShort: 'At least 8 characters.', saveFailed: 'We could not save your number just now. Please try again.', fabricWordOne: 'fabric', fabricWordMany: 'fabrics', pageWord: 'Page', turnPage: 'Slide the page to turn it', theShowroom: 'The Showroom', fabricsWord: 'fabrics', theCollection: 'The collection', addedBook: 'Added to your book', viewBook: 'View book', cartNote: 'Tap a cutting to set its metres. Slide the sheets for every fabric.', checkout: 'Checkout', setMetres: 'Set metres', thisShade: 'This shade', allShadesN: 'All {n} shades', removeFromCart: 'Remove from cart', orderTitleA: 'Your', orderTitleB: 'Order', tapForMetres: 'Tap a cutting for its metres', slideMetres: 'Slide, or tap a figure', cartChooseLater: 'You choose the metres for each shade in your cart.', chooseInCart: 'choose metres in cart', metresNeeded: 'Select metres for {n} shades', metresNeededOne: 'Select metres for 1 shade', setAllMetres: 'Set metres for all', slideToChoose: 'Slide to choose the metres', selectAllFirst: 'Select metres for every shade to check out.', notSet: 'Not set', tileCart: 'The fabric, by the metre', tileBook: 'A cutting of each shade', chooseInCartLong: 'metres chosen in your cart', bookLine: 'Bound into your book when you order it', checkoutSub: 'Your metres, as set in your cart. We confirm the price and dispatch date on WhatsApp.', orderSlip: 'Order slip', stepReview: 'Review', stepDispatch: 'Dispatch', whenSoonShort: 'Now', when2wShort: '2 weeks', whenMonthShort: '1 month', continueWord: 'Continue', shipTitleA: 'Delivery &', shipTitleB: 'Payment', shipTo: 'Ship to', addAddress: 'Add a new address', addressDefault: 'Default', deliveryAddress: 'Delivery address', fLabel: 'Label, e.g. Warehouse', fContact: 'Contact name', fPhone: 'Phone', fLine1: 'Address line 1', fLine2: 'Address line 2 (optional)', fState: 'State', fPincode: 'PIN code', saveAddress: 'Save address', addressNeeded: 'Choose or add a delivery address.', addressIncomplete: 'Enter the address and city.', addressSaveFailed: 'We could not save this address. Please try again.', paymentTitle: 'Payment', payUpi: 'UPI', payUpiSub: 'Any UPI app', payBank: 'Bank transfer', payBankSub: 'NEFT · RTGS · IMPS', payCredit: 'Credit terms', payCreditSub: 'For approved accounts', payNote: 'Nothing is charged now. Once our team confirms the final price on WhatsApp, we send the payment details for the method you choose.', millSurat: 'Surat mill', payNowGroup: 'Pay now', payLaterGroup: 'Pay after we confirm', payRazorpay: 'Pay online', payRazorpaySub: 'Razorpay · cards · UPI · netbanking', paySecure: 'Secure', payComingSoon: 'Being set up', payNowNote: 'You pay the estimate now, securely through Razorpay. Any difference after taxes and freight is settled when we confirm.', payDemoNote: 'Preview: no payment is taken here. On the live site, Razorpay opens to take the payment.', payDemoPaying: 'Securing your payment…', payDemoDone: 'Paid. Placing your order…', payOpening: 'Opening payment…', payWord: 'Pay', previewWord: 'Preview', todayWord: 'Today', neededBy: 'Needed by', payDismissed: 'The payment was not completed, so the order is not placed yet.', payFailed: 'The payment did not go through. Please try again.', payUnavailable: 'Online payment is not available just now. Please choose another method.', paidWord: 'Paid', noteSticky: 'Note for the mill', notePlaceholder: 'Write a note…', tearToContinue: 'Tear to continue', tearAria: 'Tear off the order slip and go on to dispatch', paymentReceived: 'Payment received', paidThanks: 'Thank you. Your order is on its way to the mill.', tearOff: 'Tear it off', tearHint: 'Along the dots', tearLabel: 'Tear along the dots', tearCallA: 'Tear here', tearCallB: 'to send your order', tearDock: 'Tear the slip to send', measuring: 'Measuring your order', measureFoot: 'Cut to your order', pkLabelling: 'Labelled for {city}', pkLabellingAny: 'Labelled for its journey', fromWord: 'From', toWord: 'To' };

const HI: Dict = { home: 'प्रवेश', showroom: 'शोरूम', colours: 'रंग अलमारी', closetShort: 'अलमारी', book: 'स्वॉच बुक', admin: 'ऐडमिन', adminTitle: 'कैटलॉग स्टूडियो', est: 'थोक रंगे कपड़े · सूरत', estWhat: 'थोक रंगे कपड़े', estWhere: 'सूरत', heroSub: 'नौ क्वालिटी। साढ़े तीन सौ से अधिक शेड। एक शोरूम जो कभी बंद नहीं होता।', enter: 'शोरूम में प्रवेश', explore: 'रंग अलमारी खोलें', searchPh: 'खोजें — या पूछें: “गर्मी की कुर्ती”…', byImage: 'फ़ोटो से खोजें', signin: 'साइन इन', signed: 'स्वीकृत क्रेता ✓', shades: 'शेड', hall: 'फ़ैब्रिक हॉल', hallDesc: 'हर क्वालिटी एक छत के नीचे।', cottonG: 'कॉटन गैलरी', cottonDesc: 'कड़क, मैट — कॉटन को दिन का उजाला।', rayonR: 'रेयॉन कक्ष', rayonDesc: 'पानी जैसा बहता ड्रेप।', silkG: 'सिल्क गैलरी', silkDesc: 'बुटीक रोशनी में चमक।', scrollHint: 'स्क्रॉल → · रोल खोलने हेतु क्लिक', lab: 'फ़ैब्रिक लैब', study: 'सामग्री अध्ययन', sheet: 'उत्पाद विवरण', selectMulti: 'कई चुनें', pricePerMetre: 'मूल्य', metre: 'मीटर', inStockShort: 'स्टॉक में', millFresh: 'मिल से ताज़ा', yourBook: 'आपकी बुक', bookAdded: 'आपकी बुक में जुड़ा', bookNudge: 'स्वॉच बुक ऑर्डर करें —', bookNudge2: 'इन शेड को हाथ में देखें।', orderBook: 'स्वॉच बुक ऑर्डर करें', keepBrowsing: 'देखते रहें', shade: 'शेड', qualities: 'क्वालिटी', done: 'हो गया', selected: 'चुने', inBook: 'बुक में है', garment: 'परिधान', lighting: 'प्रकाश', windL: 'हवा', scope: 'माइक्रोस्कोप', scopeNote: 'बुनावट · मैक्रो', scenes: 'दृश्य', weight: 'वज़न', width: 'चौड़ाई', comp: 'संरचना', hand: 'ड्रेप', price: 'मूल्य / मीटर', stock: 'स्टॉक', inStock: 'स्टॉक में', downloads: 'डाउनलोड', spec: 'स्पेक शीट', cat: 'रंग सूची', qr: 'साझा · QR', quote: 'कोटेशन मांगें', quoteBook: 'बुक का कोटेशन', quoteSend: 'भेजें', quoteThanks: 'अनुरोध प्राप्त।', quoteFollow: 'हमारी टीम एक कार्यदिवस में उत्तर देगी।', pin: 'बुक में जोड़ें', open: 'कपड़ा खोलें', colourWall: 'रंग अलमारी', closetTitleA: 'रंग', sealTitle: 'आपकी जानकारी सुरक्षित की जा रही है', sealDone: 'सील और सुरक्षित', sealLine1: 'एन्क्रिप्टेड कनेक्शन से हम तक भेजी गई।', sealLine2: 'आपका पासवर्ड सिर्फ़ एकतरफ़ा हैश के रूप में रखा जाता है: इसे कोई नहीं पढ़ सकता, हम भी नहीं।', sealCode: 'वन-टाइम कोड', trackMenu: 'ऑर्डर ट्रैक करें', trackTitle: 'अपना ऑर्डर ट्रैक करें', trackSub1: 'हर ऑर्डर, और वह कहाँ तक पहुँचा।', trackSub2: 'हर कदम WhatsApp पर भी बताते हैं।', trackFind: 'आपका रेफ़रेंस, जैसे PC-4F2K9A', trackNone: 'अभी कोई ऑर्डर नहीं', trackNoneSub: 'ऑर्डर देते ही वह यहाँ दिखेगा, मिल से आपके दरवाज़े तक।', trackSignIn: 'अपने ऑर्डर देखने को साइन इन करें', trackMiss: 'इस रेफ़रेंस का कोई ऑर्डर नहीं।', trackPreview: 'प्रीव्यू', trackClosed: 'बंद', trackReviewing: 'जाँच में', trackReceived: 'मिला', trackPriced: 'कीमत तय', trackDyeing: 'रंगाई में', trackDispatched: 'रवाना', trackDelivered: 'पहुँचा', trackClosedLine: 'यह ऑर्डर बंद हो गया। आगे बढ़ना हो तो हमें कॉल करें।', trackNow0: 'आपका ऑर्डर मिल गया। कीमत और रवानगी की तारीख WhatsApp पर तय करेंगे।', trackNow1: 'कीमत तय है। आपका कपड़ा रंगाई की कतार में अगला है।', trackNow2: 'आपका कपड़ा रंगा और फिनिश हो रहा है। मिल से निकलने का दिन बताएँगे।', trackPaid: 'ऑनलाइन भुगतान', trackQuoted: 'कोटेशन', trackTo: 'कहाँ', trackWhen: 'कब तक', trackCall: 'इस ऑर्डर के बारे में पूछें', trackDeviceNote: 'ये इस डिवाइस से दिए गए ऑर्डर हैं।', priceAsk: 'कीमत से संतुष्ट नहीं?', priceCall: 'हमें कॉल करें', closetTitleB: 'अलमारी', closetSub: 'हर क्वालिटी की अपनी अलमारी। {n} शेड, टँगे हुए, देखने को तैयार।', closetOpen: 'अलमारी खोलें', slideHint: 'पर्चियाँ अलग करने को रेल पर उँगली फेरें · खुली पर्ची पर टैप करें', emptyBoard: 'शेड जोड़ें — स्वॉच बुक बनाएं।', bookSub: 'आपका कलेक्शन — साझा करें या कोटेशन बनाएं।', drapeLive: 'लाइव ड्रेप', fName: 'आपका नाम', fCompany: 'कंपनी / शहर', fQty: 'मात्रा', aiBusy: 'मिलान जारी…', aiTitle: 'निकटतम मेल', aiConf: 'विश्वास', aiAlts: 'विकल्प', dropHint: 'फ़ोटो/वीडियो यहां ड्रॉप करें', dropFiles: 'फ़ाइलें कतार में', recent: 'हाल के अपलोड', moreFab: 'और कपड़े', moreWord: 'और', inBookWord: 'आपकी बुक में', chapterWord: 'कपड़ा', preparedFor: 'इनके लिए तैयार', shadeNo: 'क्र.', looseNote: 'अभी खुली कतरनें — ऑर्डर करने पर ये आपकी बुक में बंध जाएंगी।', waPh: 'व्हाट्सऐप नंबर, कंट्री कोड सहित', waBad: 'कंट्री कोड सहित व्हाट्सऐप नंबर दें।', compiling: 'आपकी चुनी हुई कतरनें संकलित हो रही हैं', bindingWord: 'बुक बंध रही है', boundWord: 'बंधी और बंद', onItsWay: 'भेजी जा रही है', onWhatsApp: 'व्हाट्सऐप पर', bookFile: 'पोद्दार स्वॉच बुक', bookDone: 'हमारी टीम जल्द ही इस नंबर पर आपकी बुक भेजेगी।', youWord: 'आप', contents: 'अनुक्रमणिका', compiledOn: 'संकलित', colophon: 'स्क्रीन और कागज़ पर रंग मार्गदर्शक हैं; आपके हाथ की कतरनें ही असली संदर्भ हैं।', previewBook: 'अपनी बुक देखें', downloadPdf: 'PDF डाउनलोड करें', preparing: 'PDF तैयार हो रही है…', bookReady: 'आपकी बुक तैयार है', orderFailed: 'अभी ऑर्डर नहीं हो सका। आपकी बुक डाउनलोड के लिए तैयार है; कृपया फिर से ऑर्डर करें।', demoNote: 'यह प्रीव्यू साइट ऑर्डर नहीं भेजती; लाइव साइट पर आपकी बुक इस नंबर पर जाती है।', closeWord: 'बंद करें', slideOpen: 'खोलने के लिए बाएं सरकाएं', slideSkip: 'अगले कपड़े के लिए दाएं', slideMore: 'और देखने के लिए बाएं सरकाएं', slideBack: 'वापस जाने के लिए दाएं', sheetWord: 'शीट', authOrderTitle: 'आपकी बुक तैयार है', authOrderSub: 'साइन इन करें — आपके {n} शेड बंधकर आपके व्हाट्सऐप पर भेजे जाएंगे।', authAccountTitle: 'पोद्दार एटेलियर', authAccountSub: 'थोक मूल्य, आपके कोटेशन और स्वॉच बुक — एक जगह।', authWaTitle: 'बस एक जानकारी', authWaSub: 'आपकी बुक कहां भेजें?', signInTab: 'साइन इन', createTab: 'खाता बनाएं', fEmail: 'ईमेल', fPassword: 'पासवर्ड', fFullName: 'पूरा नाम', fCompanyOnly: 'कंपनी', fCity: 'शहर', fWhatsapp: 'व्हाट्सऐप नंबर', signInOrder: 'साइन इन कर ऑर्डर करें', createOrder: 'खाता बनाकर ऑर्डर करें', saveOrder: 'सेव कर ऑर्डर करें', createBtn: 'खाता बनाएं', authFine: 'नए खातों को हमारी टीम की स्वीकृति के बाद थोक मूल्य दिखते हैं।', authPreview: 'इस प्रीव्यू साइट पर खाते नहीं हैं। आगे बढ़ने पर बिना खाता बनाए ऑर्डर का अनुभव दिखेगा।', forgotPw: 'पासवर्ड भूल गए?', continueWhatsapp: 'व्हाट्सऐप से जारी रखें', continueGoogle: 'Google से जारी रखें', orWord: 'या', signInTitle: 'फिर से स्वागत है', signInSub: 'अपने ईमेल और पासवर्ड से साइन इन करें।', createTitle: 'अपना खाता बनाएं', createSub: 'एक बार, फिर कभी नहीं पूछा जाएगा।', haveAccount: 'मेरा खाता है', waSheetSub: 'हम आपके व्हाट्सऐप पर छह अंकों का कोड भेजेंगे।', sendCode: 'कोड भेजें', codeSentTo: 'व्हाट्सऐप पर कोड भेजा गया', enterCode: 'छह अंकों का कोड', verifyCode: 'जांचें और जारी रखें', resendIn: '{s} सेकंड में फिर भेजें', resend: 'कोड फिर भेजें', changeNumber: 'नंबर बदलें', badCode: 'यह कोड सही नहीं है, या इसकी अवधि समाप्त हो गई है।', aboutYou: 'आपके बारे में थोड़ा', aboutYouSub: 'यह नंबर हमारे लिए नया है। आपकी बुक किसके नाम भेजें?', devCodeNote: 'डेवलपमेंट: कोड {code} है', previewCodeNote: 'प्रीव्यू: कोड {code} डालें', googleSoon: 'Google साइन-इन तैयार किया जा रहा है। अभी व्हाट्सऐप या ईमेल से साइन इन करें।', waSoon: 'व्हाट्सऐप साइन-इन तैयार किया जा रहा है। अभी ईमेल से साइन इन करें।', boundToOrder: 'ऑर्डर पर बंधेगी', authFabricTitle: 'आपका ऑर्डर तैयार है', authFabricSub: 'साइन इन करें — आपके {m} मीटर सीधे मिल को जाएंगे।', fabricOrderBack: 'आपका ऑर्डर', skipBook: 'स्वॉच बुक छोड़ें', skipBookSub: 'सीधे कपड़ा ऑर्डर करें, मीटर के हिसाब से', directEyebrow: 'सीधे मिल से', orderThe: 'ऑर्डर करें', fabricWordTitle: 'कपड़ा', directSub: 'हर शेड के मीटर चुनें। मूल्य और डिस्पैच की तारीख हम व्हाट्सऐप पर बताएंगे।', perMetre: 'प्रति मीटर', setAll: 'सभी', metresWord: 'मीटर', notIncluded: 'शामिल नहीं', whenNeeded: 'कब चाहिए?', whenSoon: 'जल्द से जल्द', when2w: 'दो हफ्तों में', whenMonth: 'एक महीने में', noteForMill: 'मिल के लिए नोट', placeOrder: 'ऑर्डर करें', estimate: 'अनुमान', estimateNote: 'सांकेतिक, कर और भाड़ा अलग। अंतिम मूल्य हमारी टीम बताएगी।', shadesChosen: 'शेड', pkFolding: 'आपके कपड़े तह हो रहे हैं', pkWrapping: 'क्राफ्ट के डिब्बे में', pkTying: 'टेप और सुतली से बंधे', pkSealing: 'घर की मुहर', pkPlaced: 'आपका ऑर्डर हो गया', orderRef: 'ऑर्डर', pkConfirm: 'मूल्य और डिस्पैच की तारीख हम व्हाट्सऐप पर बताएंगे।', pkConfirmTo: 'मूल्य और डिस्पैच की तारीख हम व्हाट्सऐप पर {n} को बताएंगे।', pkPreview: 'यह प्रीव्यू साइट ऑर्डर नहीं भेजती; लाइव साइट पर आपका ऑर्डर सीधे मिल को जाता है।', pkFailed: 'अभी ऑर्डर नहीं हो सका। आपका चयन सुरक्षित है; कृपया फिर से कोशिश करें।', backToShowroom: 'शोरूम पर वापस', tryAgain: 'फिर से कोशिश करें', nothingChosen: 'कम से कम एक शेड के मीटर चुनें।', cartWord: 'कार्ट', addTo: 'जोड़ें…', addWhere: 'इसे कहां जोड़ें?', addWhereSub: 'अभी कपड़ा ऑर्डर करें, या पहले स्वॉच बुक में कतरन रखें।', toCart: 'कार्ट में जोड़ें', toCartSub: 'सीधे कपड़ा, मीटर के हिसाब से', toBook: 'स्वॉच बुक में जोड़ें', toBookSub: 'हर शेड की कतरन, बंधकर आपको भेजी जाएगी', addedCart: 'आपके कार्ट में जुड़ा', inCart: 'कार्ट में है', viewCart: 'कार्ट देखें', inCartAlready: 'पहले से कार्ट में', cartTitleA: 'आपका', cartTitleB: 'कार्ट', cartEmpty: 'आपका कार्ट खाली है', cartEmptySub: 'शोरूम में शेड चुनें और मीटर के हिसाब से कार्ट में जोड़ें।', removeWord: 'हटाएं', cartSub: 'हर शेड के मीटर बदलें। मूल्य और डिस्पैच की तारीख हम व्हाट्सऐप पर बताएंगे।', googlePreview: 'Google साइन-इन लाइव साइट पर काम करता है।', pwShort: 'कम से कम 8 अक्षर।', saveFailed: 'अभी नंबर सेव नहीं हो सका। कृपया फिर से कोशिश करें।', fabricWordOne: 'कपड़ा', fabricWordMany: 'कपड़े', pageWord: 'पृष्ठ', turnPage: 'पृष्ठ पलटने हेतु सरकाएं', theShowroom: 'शोरूम', fabricsWord: 'कपड़े', theCollection: 'कलेक्शन', addedBook: 'आपकी बुक में जुड़ा', viewBook: 'बुक देखें', cartNote: 'मीटर चुनने हेतु कतरन छुएं। हर कपड़े के लिए शीट सरकाएं।', checkout: 'चेकआउट', setMetres: 'मीटर चुनें', thisShade: 'यह शेड', allShadesN: 'सभी {n} शेड', removeFromCart: 'कार्ट से हटाएं', orderTitleA: 'आपका', orderTitleB: 'ऑर्डर', tapForMetres: 'मीटर हेतु कतरन छुएं', slideMetres: 'सरकाएं, या कोई संख्या छुएं', cartChooseLater: 'हर शेड के मीटर आप कार्ट में चुनेंगे।', chooseInCart: 'मीटर कार्ट में चुनें', metresNeeded: '{n} शेड के मीटर चुनें', metresNeededOne: '1 शेड के मीटर चुनें', setAllMetres: 'सभी के मीटर चुनें', slideToChoose: 'मीटर चुनने हेतु सरकाएं', selectAllFirst: 'चेकआउट के लिए हर शेड के मीटर चुनें।', notSet: 'चुना नहीं', tileCart: 'कपड़ा, मीटर के हिसाब से', tileBook: 'हर शेड की कतरन', chooseInCartLong: 'मीटर कार्ट में चुनें', bookLine: 'ऑर्डर करने पर आपकी बुक में बंधेगी', checkoutSub: 'कार्ट में चुने आपके मीटर। मूल्य और डिस्पैच की तारीख हम व्हाट्सऐप पर बताएंगे।', orderSlip: 'ऑर्डर पर्ची', stepReview: 'समीक्षा', stepDispatch: 'डिस्पैच', whenSoonShort: 'अभी', when2wShort: '2 हफ्ते', whenMonthShort: '1 महीना', continueWord: 'आगे बढ़ें', shipTitleA: 'डिलीवरी और', shipTitleB: 'भुगतान', shipTo: 'कहां भेजें', addAddress: 'नया पता जोड़ें', addressDefault: 'डिफ़ॉल्ट', deliveryAddress: 'डिलीवरी पता', fLabel: 'नाम, जैसे गोदाम', fContact: 'संपर्क नाम', fPhone: 'फ़ोन', fLine1: 'पता पंक्ति 1', fLine2: 'पता पंक्ति 2 (वैकल्पिक)', fState: 'राज्य', fPincode: 'पिन कोड', saveAddress: 'पता सेव करें', addressNeeded: 'डिलीवरी का पता चुनें या जोड़ें।', addressIncomplete: 'पता और शहर दर्ज करें।', addressSaveFailed: 'अभी यह पता सेव नहीं हो सका। कृपया फिर से कोशिश करें।', paymentTitle: 'भुगतान', payUpi: 'UPI', payUpiSub: 'कोई भी UPI ऐप', payBank: 'बैंक ट्रांसफ़र', payBankSub: 'NEFT · RTGS · IMPS', payCredit: 'क्रेडिट शर्तें', payCreditSub: 'स्वीकृत खातों के लिए', payNote: 'अभी कुछ नहीं लिया जाएगा। व्हाट्सऐप पर अंतिम मूल्य की पुष्टि के बाद हम आपके चुने तरीके के भुगतान विवरण भेजेंगे।', millSurat: 'सूरत मिल', payNowGroup: 'अभी भुगतान', payLaterGroup: 'पुष्टि के बाद भुगतान', payRazorpay: 'ऑनलाइन भुगतान', payRazorpaySub: 'Razorpay · कार्ड · UPI · नेटबैंकिंग', paySecure: 'सुरक्षित', payComingSoon: 'तैयार किया जा रहा है', payNowNote: 'अनुमानित राशि अभी Razorpay से सुरक्षित रूप से चुकाएं। कर और भाड़े का अंतर पुष्टि के समय तय होगा।', payDemoNote: 'प्रीव्यू: यहां कोई भुगतान नहीं लिया जाता। लाइव साइट पर भुगतान के लिए Razorpay खुलता है।', payDemoPaying: 'आपका भुगतान सुरक्षित हो रहा है…', payDemoDone: 'भुगतान हो गया। ऑर्डर दिया जा रहा है…', payOpening: 'भुगतान खुल रहा है…', payWord: 'भुगतान', previewWord: 'प्रीव्यू', todayWord: 'आज', neededBy: 'इस तारीख तक', payDismissed: 'भुगतान पूरा नहीं हुआ, इसलिए ऑर्डर अभी नहीं दिया गया।', payFailed: 'भुगतान नहीं हो सका। कृपया फिर से कोशिश करें।', payUnavailable: 'ऑनलाइन भुगतान अभी उपलब्ध नहीं है। कृपया दूसरा तरीका चुनें।', paidWord: 'भुगतान हुआ', noteSticky: 'मिल के लिए नोट', notePlaceholder: 'नोट लिखें…', tearToContinue: 'फाड़कर आगे बढ़ें', tearAria: 'ऑर्डर पर्ची फाड़ें और डिस्पैच पर जाएं', paymentReceived: 'भुगतान प्राप्त', paidThanks: 'धन्यवाद। आपका ऑर्डर मिल को जा रहा है।', tearOff: 'फाड़ लें', tearHint: 'बिंदुओं के साथ', tearLabel: 'बिंदुओं पर फाड़ें', tearCallA: 'यहाँ से फाड़ें', tearCallB: 'ऑर्डर भेजने के लिए', tearDock: 'भेजने के लिए पर्ची फाड़ें', measuring: 'आपका ऑर्डर नापा जा रहा है', measureFoot: 'आपके ऑर्डर के नाप से कटा', pkLabelling: '{city} के लिए लेबल लगा', pkLabellingAny: 'यात्रा के लिए लेबल लगा', fromWord: 'से', toWord: 'को' };

export function dict(lang: Lang): Dict {
  return lang === 'hi' ? { ...EN, ...HI } : EN;
}

/** Keyword matcher behind the search bar's "Studio Assistant" — same table as the prototype. */
export function assistant(q: string): { note: string; ids: string[] } | null {
  const K: [RegExp, string, string[]][] = [
    [/summer|गर्म/i, 'Light and breathable for summer:', ['cambric', 'rayon14', 'slub']],
    [/kurti|कुर्त/i, 'Kurtis drape beautifully in:', ['rayon14', 'jaam11', 'slub']],
    [/wedding|bridal|festive|शादी/i, 'For festive lustre:', ['gajji', 'roman', 'rayondyed']],
    [/dress|gown/i, 'For dresses with fall:', ['rayondyed', 'gajji', 'rayon14']],
    [/shirt/i, 'Crisp shirting:', ['pcpc', 'cambric', 'jaam11']],
    [/stretch|fitted|legging/i, 'With elastic recovery:', ['lycra']],
    [/winter|heavy/i, 'Fuller-bodied cloth:', ['jaam11', 'lycra', 'gajji']],
    [/saree|साड़/i, 'Saree-ready lustre:', ['gajji', 'roman']],
  ];
  for (const [re, note, ids] of K) if (re.test(q)) return { note, ids };
  if (q.trim().split(/\s+/).length >= 2) return { note: 'Popular with designers right now:', ids: ['rayon14', 'jaam11', 'gajji'] };
  return null;
}

/** Deterministic "nearest named shade" match, used as the AI colour-naming fallback when no vision API key is configured. */
export function nearestColourName(l: number, c: number, h: number): { name: string; distance: number } {
  let best = COLOUR_NAMES[0];
  let bestDist = Infinity;
  for (const cand of COLOUR_NAMES) {
    const dl = (l - cand.l) * 100;
    const dc = (c - cand.c) * 300;
    let dh = Math.abs(h - cand.h);
    if (dh > 180) dh = 360 - dh;
    const dist = Math.sqrt(dl * dl + dc * dc + dh * dh * 0.15);
    if (dist < bestDist) { bestDist = dist; best = cand; }
  }
  return { name: best.name, distance: bestDist };
}

export function fabricById(id: string): FabricDef | undefined {
  return FABRIC_DEFS.find((f) => f.id === id);
}
