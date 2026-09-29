/**
 * Pure, isomorphic domain logic for Poddar Creation Studio's fabric system.
 * Ported from the approved Claude Design prototype (project/Poddar Creation Studio.dc.html).
 * No DOM / DB dependency — safe to import from the Prisma seed script (Node) and from
 * client components (browser) alike. Fabric + Colour rows live in Postgres; this module
 * derives all presentation (OKLCH CSS, weave textures, physics notes) from their raw
 * numeric attributes, exactly as the original prototype computed them on the fly.
 */

export type FabricFamily = 'cotton' | 'rayon' | 'slub' | 'wrinkle' | 'silk' | 'lycra';
export type GarmentKey = 'kurti' | 'shirt' | 'dress' | 'top' | 'tshirt' | 'roll';
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

export const FABRIC_DEFS: FabricDef[] = [
  { id: 'pcpc', name: 'PC / PC', family: 'cotton', weight: '8.800 kg', width: '41″+', comp: '52% Polyester · 48% Cotton', nc: 64, hand: 'Crisp · Structured', sheen: 0.1, flow: 0.3, stretch: 0.1, seed: 0, price: 62, heroIndex: 14 },
  { id: 'cambric', name: 'Cambric Cotton', family: 'cotton', weight: '9.000 kg', width: '42″+', comp: '100% Combed Cotton', nc: 72, hand: 'Fine · Smooth hand', sheen: 0.08, flow: 0.35, stretch: 0.1, seed: 1, price: 74, heroIndex: 16 },
  { id: 'jaam11', name: 'Jaam Cotton', family: 'cotton', weight: '11.000 kg', width: '42″+', comp: '100% Cotton · Jaam weave', nc: 80, hand: 'Matte · Natural fall', sheen: 0.08, flow: 0.4, stretch: 0.12, seed: 2, price: 88, heroIndex: 21 },
  { id: 'jaam125', name: 'Jaam Cotton Supreme', family: 'cotton', weight: '12.500 kg', width: '44″+', comp: '100% Cotton · Dense jaam', nc: 80, hand: 'Full-bodied · Matte', sheen: 0.08, flow: 0.35, stretch: 0.12, seed: 0, price: 96, heroIndex: 3 },
  { id: 'rayon14', name: 'Rayon', family: 'rayon', weight: '14 kg', width: '42″+', comp: '100% Viscose Rayon', nc: 96, hand: 'Fluid · Heavy drape', sheen: 0.22, flow: 0.9, stretch: 0.2, seed: 1, price: 82, heroIndex: 18 },
  { id: 'rayon17', name: 'Rayon Heavy', family: 'rayon', weight: '17 kg', width: '56″+', comp: '100% Viscose Rayon', nc: 96, hand: 'Fluid · Cascading', sheen: 0.24, flow: 0.85, stretch: 0.2, seed: 2, price: 104, heroIndex: 15 },
  { id: 'slub', name: 'Rayon Slub', family: 'slub', weight: '14 kg', width: '42″+', comp: '100% Viscose · Slub yarn', nc: 64, hand: 'Textured · Flowing', sheen: 0.18, flow: 0.85, stretch: 0.18, seed: 0, price: 92, heroIndex: 7 },
  { id: 'wrinkle', name: 'Rayon Wrinkle', family: 'wrinkle', weight: '17 kg', width: '56″+', comp: '100% Viscose · Crinkle finish', nc: 56, hand: 'Crushed · Airy', sheen: 0.15, flow: 0.8, stretch: 0.16, seed: 1, price: 118, heroIndex: 12 },
  { id: 'roman', name: 'Roman Silk', family: 'silk', weight: '9.500 kg', width: '43″+', comp: 'Poly roman weave · Silk touch', nc: 72, hand: 'Lustrous · Smooth folds', sheen: 0.38, flow: 0.65, stretch: 0.14, seed: 2, price: 98, heroIndex: 8 },
  { id: 'gajji', name: 'Gajji Silk', family: 'silk', weight: '20 kg', width: '56″+', comp: 'Satin gajji · Heavy lustre', nc: 88, hand: 'Liquid shine · Weighted', sheen: 0.5, flow: 0.6, stretch: 0.12, seed: 0, price: 210, heroIndex: 13 },
  { id: 'lycra', name: 'Cotton Lycra', family: 'lycra', weight: '21 kg', width: '56″+', comp: '95% Cotton · 5% Spandex', nc: 56, hand: 'Stretch · Recovery', sheen: 0.12, flow: 0.45, stretch: 0.9, seed: 1, price: 148, heroIndex: 22 },
];

export function generateColours(fabric: FabricDef): Colour[] {
  return COLOUR_NAMES.map((base, j) => {
    const L = Math.min(0.97, Math.max(0.25, base.l + (((fabric.seed + j) % 3) - 1) * 0.015));
    return { name: base.name, l: L, c: base.c, h: base.h, order: j };
  });
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
  jaam125: 'Denser, weightier — for silhouettes that stand their ground.',
  rayon14: 'Falls like evening water — cut it for hems that move.',
  rayon17: 'A heavier pour — cascades from the shoulder in one line.',
  slub: 'Irregular on purpose — texture you can read across a room.',
  wrinkle: 'Pre-crushed, carefree — the pleats are already yours.',
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
  dress: { d: 'M100 24c-9 0-16-3-21-7L46 28l9 42 12-3 5 38-30 127h116L128 105l5-38 12 3 9-42-33-11c-5 4-12 7-21 7Z', label: 'Dress' },
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
  { k: 'cotton', ids: ['pcpc', 'cambric', 'jaam11', 'jaam125', 'lycra'], bg: 'linear-gradient(180deg,#EEF3F4 0%,#EDEFE9 62%,#DCDFD4 62.2%,#CFD2C5 100%)', glow: 'rgba(160,190,200,.32)', fg: '#1C1917', sub: 'rgba(28,25,23,.55)', accent: '#5B7263', labelKey: 'cottonG', descKey: 'cottonDesc' },
  { k: 'rayon', ids: ['rayon14', 'rayon17', 'slub', 'wrinkle'], bg: 'linear-gradient(180deg,#F2EEF4 0%,#EDE8EE 62%,#DED6DF 62.2%,#D0C7D2 100%)', glow: 'rgba(180,160,200,.3)', fg: '#1C1917', sub: 'rgba(28,25,23,.55)', accent: '#6B5B7A', labelKey: 'rayonR', descKey: 'rayonDesc' },
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

const EN: Dict = { home: 'Entrance', showroom: 'Showroom', colours: 'Colours', book: 'Swatch Book', admin: 'Admin', adminTitle: 'Catalogue Studio', est: 'WHOLESALE DYED FABRICS · EST. SURAT', heroSub: 'Eleven constructions. Over eight hundred shades. A showroom that never closes.', enter: 'Enter the Showroom', explore: 'Explore colours', searchPh: 'Search — or ask: “summer kurtis”…', byImage: 'Search by image', signin: 'Sign in', signed: 'Approved buyer ✓', shades: 'shades', hall: 'The Fabric Hall', hallDesc: 'Every quality under one roof — walk right, or step into a gallery.', cottonG: 'Cotton Gallery', cottonDesc: 'Crisp, matte, structured — daylight suits cotton.', rayonR: 'Rayon Room', rayonDesc: 'Fluid drape, soft folds — cloth that moves like water.', silkG: 'Silk Gallery', silkDesc: 'Boutique light. Lustre that answers every lamp.', scrollHint: 'SCROLL → · CLICK A ROLL TO UNROLL', lab: 'FABRIC LAB', study: 'Material study', sheet: 'Product details', selectMulti: 'Select multiple', pricePerMetre: 'Price', metre: 'metre', inStockShort: 'In stock', millFresh: 'Mill fresh', yourBook: 'Your Book', bookAdded: 'Added to Your Book', bookNudge: 'Order the swatch book to see', bookNudge2: 'and feel these shades in hand.', orderBook: 'Order swatch book', keepBrowsing: 'Continue browsing', shade: 'shade', qualities: 'qualities', done: 'Done', selected: 'selected', inBook: 'In your book', garment: 'Garment', lighting: 'Lighting', windL: 'Wind', scope: 'Microscope', scopeNote: 'SIMULATED WEAVE · MACRO', scenes: 'Scenes', weight: 'Weight', width: 'Width', comp: 'Composition', hand: 'Hand & drape', price: 'Price / metre', stock: 'Stock', inStock: 'In stock · mill fresh', downloads: 'Downloads', spec: 'Spec sheet', cat: 'Colour catalogue', qr: 'SHARE · QR', quote: 'Request a quote', quoteBook: 'Quote this book', quoteSend: 'Send request', quoteThanks: 'Request received.', quoteFollow: 'Our sales team will respond within one working day.', pin: 'Add to book', open: 'Open fabric', colourWall: 'The Colour Wall', wallSub: 'every shade, every quality — click to open', emptyBoard: 'Add shades from any fabric — build a swatch book for your buyer.', bookSub: 'Your collection — export, share, or turn it into a quotation.', drapeLive: 'LIVE DRAPE', fName: 'Your name', fCompany: 'Company / City', fQty: 'Quantity (metres or kg)', aiBusy: 'MATCHING FABRIC & SHADE…', aiTitle: 'Closest match', aiConf: 'CONFIDENCE', aiAlts: 'Alternatives', dropHint: 'Drag & drop fabric photos or videos', dropFiles: 'files queued', recent: 'Recent uploads', moreFab: 'More fabrics', moreWord: 'More', inBookWord: 'in your book', chapterWord: 'Chapter', fabricWordOne: 'fabric', fabricWordMany: 'fabrics', pageWord: 'Page', turnPage: 'Slide the page to turn it', theShowroom: 'The Showroom', fabricsWord: 'fabrics', theCollection: 'The collection' };

const HI: Dict = { home: 'प्रवेश', showroom: 'शोरूम', colours: 'रंग', book: 'स्वॉच बुक', admin: 'ऐडमिन', adminTitle: 'कैटलॉग स्टूडियो', est: 'थोक रंगे कपड़े · सूरत', heroSub: 'ग्यारह क्वालिटी। आठ सौ से अधिक शेड। एक शोरूम जो कभी बंद नहीं होता।', enter: 'शोरूम में प्रवेश', explore: 'रंग देखें', searchPh: 'खोजें — या पूछें: “गर्मी की कुर्ती”…', byImage: 'फ़ोटो से खोजें', signin: 'साइन इन', signed: 'स्वीकृत क्रेता ✓', shades: 'शेड', hall: 'फ़ैब्रिक हॉल', hallDesc: 'हर क्वालिटी एक छत के नीचे।', cottonG: 'कॉटन गैलरी', cottonDesc: 'कड़क, मैट — कॉटन को दिन का उजाला।', rayonR: 'रेयॉन कक्ष', rayonDesc: 'पानी जैसा बहता ड्रेप।', silkG: 'सिल्क गैलरी', silkDesc: 'बुटीक रोशनी में चमक।', scrollHint: 'स्क्रॉल → · रोल खोलने हेतु क्लिक', lab: 'फ़ैब्रिक लैब', study: 'सामग्री अध्ययन', sheet: 'उत्पाद विवरण', selectMulti: 'कई चुनें', pricePerMetre: 'मूल्य', metre: 'मीटर', inStockShort: 'स्टॉक में', millFresh: 'मिल से ताज़ा', yourBook: 'आपकी बुक', bookAdded: 'आपकी बुक में जुड़ा', bookNudge: 'स्वॉच बुक ऑर्डर करें —', bookNudge2: 'इन शेड को हाथ में देखें।', orderBook: 'स्वॉच बुक ऑर्डर करें', keepBrowsing: 'देखते रहें', shade: 'शेड', qualities: 'क्वालिटी', done: 'हो गया', selected: 'चुने', inBook: 'बुक में है', garment: 'परिधान', lighting: 'प्रकाश', windL: 'हवा', scope: 'माइक्रोस्कोप', scopeNote: 'बुनावट · मैक्रो', scenes: 'दृश्य', weight: 'वज़न', width: 'चौड़ाई', comp: 'संरचना', hand: 'ड्रेप', price: 'मूल्य / मीटर', stock: 'स्टॉक', inStock: 'स्टॉक में', downloads: 'डाउनलोड', spec: 'स्पेक शीट', cat: 'रंग सूची', qr: 'साझा · QR', quote: 'कोटेशन मांगें', quoteBook: 'बुक का कोटेशन', quoteSend: 'भेजें', quoteThanks: 'अनुरोध प्राप्त।', quoteFollow: 'हमारी टीम एक कार्यदिवस में उत्तर देगी।', pin: 'बुक में जोड़ें', open: 'कपड़ा खोलें', colourWall: 'रंग दीवार', wallSub: 'हर शेड — खोलने हेतु क्लिक', emptyBoard: 'शेड जोड़ें — स्वॉच बुक बनाएं।', bookSub: 'आपका कलेक्शन — साझा करें या कोटेशन बनाएं।', drapeLive: 'लाइव ड्रेप', fName: 'आपका नाम', fCompany: 'कंपनी / शहर', fQty: 'मात्रा', aiBusy: 'मिलान जारी…', aiTitle: 'निकटतम मेल', aiConf: 'विश्वास', aiAlts: 'विकल्प', dropHint: 'फ़ोटो/वीडियो यहां ड्रॉप करें', dropFiles: 'फ़ाइलें कतार में', recent: 'हाल के अपलोड', moreFab: 'और कपड़े', moreWord: 'और', inBookWord: 'आपकी बुक में', chapterWord: 'अध्याय', fabricWordOne: 'कपड़ा', fabricWordMany: 'कपड़े', pageWord: 'पृष्ठ', turnPage: 'पृष्ठ पलटने हेतु सरकाएं', theShowroom: 'शोरूम', fabricsWord: 'कपड़े', theCollection: 'कलेक्शन' };

export function dict(lang: Lang): Dict {
  return lang === 'hi' ? { ...EN, ...HI } : EN;
}

/** Keyword matcher behind the search bar's "Studio Assistant" — same table as the prototype. */
export function assistant(q: string): { note: string; ids: string[] } | null {
  const K: [RegExp, string, string[]][] = [
    [/summer|गर्म/i, 'Light and breathable for summer:', ['cambric', 'rayon14', 'slub']],
    [/kurti|कुर्त/i, 'Kurtis drape beautifully in:', ['rayon14', 'jaam11', 'slub']],
    [/wedding|bridal|festive|शादी/i, 'For festive lustre:', ['gajji', 'roman', 'rayon17']],
    [/dress|gown/i, 'For dresses with fall:', ['rayon17', 'gajji', 'rayon14']],
    [/shirt/i, 'Crisp shirting:', ['pcpc', 'cambric', 'jaam11']],
    [/stretch|fitted|legging/i, 'With elastic recovery:', ['lycra']],
    [/winter|heavy/i, 'Fuller-bodied cloth:', ['jaam125', 'lycra', 'gajji']],
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
