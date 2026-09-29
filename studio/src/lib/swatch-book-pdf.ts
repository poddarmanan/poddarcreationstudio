import type { ColourRow, FabricRow } from './types';
import { oklchToRgb, type Rgb } from './colour-science';

/**
 * The compiled swatch book as a PDF, drawn in the browser.
 *
 * Every page is painted on a canvas at A4 / 150 dpi, in the book's own materials: oxblood leather
 * and gold foil on the cover, cotton-rag paper inside, and each shade as a pinked cutting woven in
 * its fabric's structure. The pages are embedded as JPEG images in a small PDF 1.4 file written
 * here: an image per page needs only a few lines of PDF, and drawing on a canvas lets the book look
 * the way it does on screen, in the studio's fonts, without a layout library. It works on the
 * static preview too, since nothing goes to the server.
 */

export interface BookChapter {
  fabric: FabricRow;
  colours: ColourRow[];
}

export interface BookStrings {
  book: string;
  chapterWord: string;
  shade: string;
  shades: string;
  fabricWordOne: string;
  fabricWordMany: string;
  preparedFor: string;
  shadeNo: string;
  contents: string;
  compiledOn: string;
  colophon: string;
}

export interface BookPdfInput {
  chapters: BookChapter[];
  preparedFor: string | null;
  strings: BookStrings;
  /** The display and body font stacks, as the page resolves them. */
  fonts: { display: string; body: string };
}

const W = 1240;
const H = 1754;
const PT_W = 595.28;
const PT_H = 841.89;

const INK = '#1C1917';
const UMBER = '#8A6D45';
const GOLD = '#C9A55E';
const PAPER = '#FBF7EE';
const PER_PLATE = 12;

function roman(n: number) {
  const table: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out;
}

const rgb = ({ r, g, b }: Rgb, a = 1) => `rgba(${r},${g},${b},${a})`;
const shade = (c: ColourRow, dl: number) => oklchToRgb(Math.max(0.04, Math.min(0.98, c.l + dl)), c.c, c.h);

/** A small seeded random, so the same book always draws the same way. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  return { c, ctx };
}

/** A tile of fine noise, used as leather grain and paper tooth. */
function noiseTile(size: number, alpha: number, seed: number) {
  const t = document.createElement('canvas');
  t.width = size;
  t.height = size;
  const x = t.getContext('2d')!;
  const img = x.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = alpha * 255;
  }
  x.putImageData(img, 0, 0);
  return t;
}

function paper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(120,90,50,.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(noiseTile(160, 0.05, 7), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function goldFill(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#B08A45');
  g.addColorStop(0.3, '#F2DFA6');
  g.addColorStop(0.5, '#C9A55E');
  g.addColorStop(0.75, '#EBD294');
  g.addColorStop(1, '#A9843F');
  return g;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, fill: string | CanvasGradient, align: CanvasTextAlign = 'center', spacing = 0) {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  ctx.fillText(s, x, y);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

/** Trims a line to a width, with an ellipsis. */
function fitText(ctx: CanvasRenderingContext2D, s: string, font: string, max: number) {
  ctx.font = font;
  if (ctx.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

function fleuron(ctx: CanvasRenderingContext2D, cx: number, y: number, half: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx - 14, y);
  ctx.moveTo(cx + 14, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, y - 7);
  ctx.lineTo(cx + 7, y);
  ctx.lineTo(cx, y + 7);
  ctx.lineTo(cx - 7, y);
  ctx.closePath();
  ctx.fill();
}

function corner(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(38, 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 38);
  ctx.moveTo(16, 16);
  ctx.bezierCurveTo(38, 16, 48, 28, 42, 40);
  ctx.bezierCurveTo(37, 48, 26, 45, 29, 37);
  ctx.moveTo(16, 16);
  ctx.bezierCurveTo(16, 38, 28, 48, 40, 42);
  ctx.bezierCurveTo(48, 37, 45, 26, 37, 29);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(56, 56, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function frame(ctx: CanvasRenderingContext2D, inset: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 12, inset + 12, W - (inset + 12) * 2, H - (inset + 12) * 2);
  const c = inset + 22;
  corner(ctx, c, c, 1, 1, color);
  corner(ctx, W - c, c, -1, 1, color);
  corner(ctx, c, H - c, 1, -1, color);
  corner(ctx, W - c, H - c, -1, -1, color);
}

/** A shade woven in its fabric's structure: the base colour, the weave, and the fabric's sheen. */
function weave(ctx: CanvasRenderingContext2D, f: FabricRow, c: ColourRow, x: number, y: number, w: number, h: number, seed: number) {
  const base = oklchToRgb(c.l, c.c, c.h);
  ctx.fillStyle = rgb(base);
  ctx.fillRect(x, y, w, h);
  const dark = rgb(shade(c, -0.06), 0.55);
  const r = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const p = 6;
  if (f.family === 'silk') {
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += p + 3) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i - h * 0.47, y + h);
      ctx.stroke();
    }
  } else if (f.family === 'wrinkle') {
    for (let i = -h; i < w + h; i += 11) {
      ctx.strokeStyle = r() > 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.07)';
      ctx.lineWidth = 3 + r() * 4;
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.bezierCurveTo(x + i + 18, y + h * 0.3, x + i - 14, y + h * 0.7, x + i + h * 0.36, y + h);
      ctx.stroke();
    }
  } else {
    // A plain weave: warp threads down, weft across; slub adds its thick, irregular picks.
    ctx.fillStyle = dark;
    for (let i = 0; i < w; i += f.family === 'lycra' ? p - 2 : p) ctx.fillRect(x + i, y, 1.5, h);
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    for (let j = 0; j < h; j += p) ctx.fillRect(x, y + j, w, 1.5);
    if (f.family === 'slub') {
      ctx.fillStyle = rgb(shade(c, -0.08), 0.5);
      for (let j = 0; j < h; j += 10 + r() * 22) ctx.fillRect(x, y + j, w, 3 + r() * 3);
    }
  }
  if (f.sheen >= 0.2) {
    const g = ctx.createLinearGradient(x, y + h * 0.2, x + w, y + h * 0.8);
    const a = 0.12 + f.sheen * 0.45;
    g.addColorStop(0.25, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, 'rgba(255,255,255,.03)');
    g.addColorStop(0.8, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  const shadeG = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  shadeG.addColorStop(0, 'rgba(255,255,255,.12)');
  shadeG.addColorStop(0.5, 'rgba(255,255,255,0)');
  shadeG.addColorStop(1, 'rgba(0,0,0,.1)');
  ctx.fillStyle = shadeG;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** A cutting pinked along its top and bottom edges, lying on the page with a soft shadow. */
function cutting(ctx: CanvasRenderingContext2D, f: FabricRow, c: ColourRow, x: number, y: number, w: number, h: number, seed: number) {
  const tooth = 12;
  const path = new Path2D();
  path.moveTo(x, y + tooth / 2);
  for (let i = 0; i < w; i += tooth) {
    path.lineTo(x + i + tooth / 2, y);
    path.lineTo(x + Math.min(w, i + tooth), y + tooth / 2);
  }
  path.lineTo(x + w, y + h - tooth / 2);
  for (let i = w; i > 0; i -= tooth) {
    path.lineTo(x + i - tooth / 2, y + h);
    path.lineTo(x + Math.max(0, i - tooth), y + h - tooth / 2);
  }
  path.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(40,26,12,.28)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = rgb(oklchToRgb(c.l, c.c, c.h));
  ctx.fill(path);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  weave(ctx, f, c, x, y, w, h, seed);
  ctx.restore();
}

function cover(input: BookPdfInput, shadesCount: number) {
  const { c, ctx } = canvas();
  const { fonts, strings: t } = input;
  const g = ctx.createRadialGradient(W * 0.25, H * 0.1, 40, W * 0.4, H * 0.4, H * 0.95);
  g.addColorStop(0, '#6A2027');
  g.addColorStop(0.45, '#44111A');
  g.addColorStop(1, '#27070B');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(noiseTile(200, 0.35, 3), 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // The spine's edge and its raised bands.
  const sp = ctx.createLinearGradient(0, 0, 110, 0);
  sp.addColorStop(0, '#160406');
  sp.addColorStop(0.5, '#4A1419');
  sp.addColorStop(1, '#2A080D');
  ctx.fillStyle = sp;
  ctx.fillRect(0, 0, 110, H);
  for (const yy of [0.14, 0.37, 0.63, 0.86]) {
    ctx.fillStyle = goldFill(ctx, 0, 110);
    ctx.fillRect(0, H * yy - 18, 110, 3);
    ctx.fillRect(0, H * yy + 15, 110, 3);
    ctx.fillStyle = 'rgba(255,214,196,.12)';
    ctx.fillRect(0, H * yy - 12, 110, 10);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, H * yy - 2, 110, 14);
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(110, 0, 8, H);
  // The tooled frame, with the monogram and title.
  ctx.save();
  ctx.translate(55, 0);
  ctx.scale((W - 55) / W, 1);
  frame(ctx, 90, GOLD);
  ctx.restore();
  const cx = W / 2 + 28;
  text(ctx, 'PODDAR CREATION', cx, 520, `500 30px ${fonts.body}`, goldFill(ctx, cx - 260, cx + 260), 'center', 14);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, 720, 120, 150, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, 720, 106, 136, 0, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, 'PC', cx - 4, 762, `italic 500 118px ${fonts.display}`, goldFill(ctx, cx - 90, cx + 90), 'center', -6);
  text(ctx, t.book, cx, 1010, `italic 500 128px ${fonts.display}`, goldFill(ctx, cx - 360, cx + 360));
  fleuron(ctx, cx, 1070, 110, GOLD);
  const count = `${input.chapters.length} ${input.chapters.length === 1 ? t.fabricWordOne : t.fabricWordMany}  ·  ${shadesCount} ${shadesCount === 1 ? t.shade : t.shades}`.toUpperCase();
  text(ctx, count, cx, 1140, `400 26px ${fonts.body}`, goldFill(ctx, cx - 300, cx + 300), 'center', 8);
  if (input.preparedFor) {
    text(ctx, t.preparedFor.toUpperCase(), cx, 1470, `400 22px ${fonts.body}`, goldFill(ctx, cx - 200, cx + 200), 'center', 10);
    text(ctx, fitText(ctx, input.preparedFor, `italic 500 54px ${fonts.display}`, 760), cx, 1535, `italic 500 54px ${fonts.display}`, goldFill(ctx, cx - 300, cx + 300));
  } else {
    text(ctx, 'SURAT', cx, 1520, `400 24px ${fonts.body}`, goldFill(ctx, cx - 100, cx + 100), 'center', 12);
  }
  return c;
}

function contents(input: BookPdfInput, starts: number[]) {
  const { c, ctx } = canvas();
  const { fonts, strings: t } = input;
  paper(ctx);
  text(ctx, t.contents.toUpperCase(), W / 2, 250, `500 26px ${fonts.body}`, UMBER, 'center', 14);
  fleuron(ctx, W / 2, 300, 90, '#B8904A');
  let y = 420;
  input.chapters.forEach((ch, i) => {
    text(ctx, roman(i + 1), 230, y, `500 44px ${fonts.display}`, UMBER, 'right');
    text(ctx, fitText(ctx, ch.fabric.name, `italic 500 46px ${fonts.display}`, 560), 270, y, `italic 500 46px ${fonts.display}`, INK, 'left');
    text(ctx, `${ch.colours.length} ${ch.colours.length === 1 ? t.shade : t.shades}`, 270, y + 36, `400 22px ${fonts.body}`, 'rgba(28,25,23,.5)', 'left', 3);
    // Dot leaders to the page number.
    ctx.fillStyle = 'rgba(138,109,69,.45)';
    ctx.font = `italic 500 46px ${fonts.display}`;
    const end = 270 + ctx.measureText(fitText(ctx, ch.fabric.name, `italic 500 46px ${fonts.display}`, 560)).width + 24;
    for (let x = end; x < W - 250; x += 16) ctx.fillRect(x, y - 8, 3, 3);
    text(ctx, String(starts[i]), W - 200, y, `500 40px ${fonts.display}`, INK, 'right');
    y += 110;
  });
  folio(ctx, input, 2);
  return c;
}

function folio(ctx: CanvasRenderingContext2D, input: BookPdfInput, n: number) {
  text(ctx, `— ${roman(n).toLowerCase()} —`, W / 2, H - 90, `italic 500 30px ${input.fonts.display}`, UMBER);
}

function chapterPage(input: BookPdfInput, ch: BookChapter, i: number, page: number) {
  const { c, ctx } = canvas();
  const { fonts, strings: t } = input;
  paper(ctx);
  frame(ctx, 70, 'rgba(184,144,74,.8)');
  const cx = W / 2;
  text(ctx, t.chapterWord.toUpperCase(), cx, 470, `500 28px ${fonts.body}`, UMBER, 'center', 18);
  text(ctx, roman(i + 1), cx, 660, `500 190px ${fonts.display}`, goldFill(ctx, cx - 160, cx + 160));
  fleuron(ctx, cx, 730, 110, '#B8904A');
  text(ctx, fitText(ctx, ch.fabric.name, `italic 500 96px ${fonts.display}`, 900), cx, 860, `italic 500 96px ${fonts.display}`, INK);
  text(ctx, `${ch.fabric.weight}  ·  ${ch.fabric.width}  ·  ${ch.fabric.comp}`.toUpperCase(), cx, 930, `400 24px ${fonts.body}`, 'rgba(28,25,23,.55)', 'center', 5);
  text(ctx, ch.fabric.hand, cx, 985, `italic 500 38px ${fonts.display}`, UMBER);
  // A round window onto the chapter's first shade.
  const first = ch.colours[0];
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, 1200, 130, 0, Math.PI * 2);
  ctx.clip();
  weave(ctx, ch.fabric, first, cx - 130, 1070, 260, 260, i + 1);
  const inner = ctx.createRadialGradient(cx, 1190, 90, cx, 1200, 132);
  inner.addColorStop(0, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = inner;
  ctx.fillRect(cx - 130, 1070, 260, 260);
  ctx.restore();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, 1200, 138, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(184,144,74,.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, 1200, 147, 0, Math.PI * 2);
  ctx.stroke();
  text(ctx, `${ch.colours.length} ${ch.colours.length === 1 ? t.shade : t.shades}`, cx, 1440, `italic 500 40px ${fonts.display}`, UMBER);
  folio(ctx, input, page);
  return c;
}

function plate(input: BookPdfInput, ch: BookChapter, i: number, colours: ColourRow[], page: number) {
  const { c, ctx } = canvas();
  const { fonts, strings: t } = input;
  paper(ctx);
  text(ctx, `${t.chapterWord} ${roman(i + 1)}`.toUpperCase(), 110, 130, `500 22px ${fonts.body}`, UMBER, 'left', 8);
  text(ctx, ch.fabric.name.toUpperCase(), W - 110, 130, `500 22px ${fonts.body}`, UMBER, 'right', 8);
  ctx.fillStyle = 'rgba(138,109,69,.4)';
  ctx.fillRect(110, 158, W - 220, 2);
  const cols = 3;
  const gx = 110;
  const gw = W - 220;
  const cellW = gw / cols;
  const cellH = 360;
  colours.forEach((col, k) => {
    const cx = gx + (k % cols) * cellW;
    const cy = 215 + Math.floor(k / cols) * cellH;
    const w = cellW - 56;
    const h = cellH - 110;
    cutting(ctx, ch.fabric, col, cx + 28, cy, w, h, i * 1000 + col.order);
    text(ctx, `${t.shadeNo} ${String(col.order).padStart(2, '0')}`.toUpperCase(), cx + 28, cy + h + 48, `500 19px ${fonts.body}`, '#9C7A45', 'left', 5);
    ctx.font = `500 19px ${fonts.body}`;
    // The number is set with 5px letter spacing, which measureText does not count.
    const numberW = ctx.measureText(`${t.shadeNo} 00`).width + `${t.shadeNo} 00`.length * 5 + 18;
    text(ctx, fitText(ctx, col.name, `italic 500 38px ${fonts.display}`, w - numberW), cx + 28 + numberW, cy + h + 50, `italic 500 38px ${fonts.display}`, INK, 'left');
    const hex = oklchToRgb(col.l, col.c, col.h);
    text(ctx, `#${[hex.r, hex.g, hex.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`, cx + 28, cy + h + 84, `400 18px ${fonts.body}`, 'rgba(28,25,23,.42)', 'left', 3);
  });
  folio(ctx, input, page);
  return c;
}

function colophon(input: BookPdfInput, page: number) {
  const { c, ctx } = canvas();
  const { fonts, strings: t } = input;
  paper(ctx);
  const cx = W / 2;
  fleuron(ctx, cx, 760, 90, '#B8904A');
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  text(ctx, `${t.compiledOn} ${date}`, cx, 850, `italic 500 44px ${fonts.display}`, INK);
  if (input.preparedFor) text(ctx, `${t.preparedFor} ${input.preparedFor}`, cx, 910, `italic 500 36px ${fonts.display}`, UMBER);
  text(ctx, 'PODDAR CREATION  ·  SURAT', cx, 1000, `500 22px ${fonts.body}`, UMBER, 'center', 10);
  ctx.font = `400 24px ${fonts.body}`;
  const words = t.colophon.split(' ');
  let line = '';
  let y = 1100;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > 760) {
      text(ctx, line, cx, y, `400 24px ${fonts.body}`, 'rgba(28,25,23,.5)');
      line = w;
      y += 38;
    } else line = next;
  }
  if (line) text(ctx, line, cx, y, `400 24px ${fonts.body}`, 'rgba(28,25,23,.5)');
  folio(ctx, input, page);
  return c;
}

const jpeg = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('Could not encode a page'))), 'image/jpeg', 0.9),
  );

/** A PDF 1.4 file with one full-page JPEG per page. */
function pdfFromJpegs(pages: Uint8Array[], title: string): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // 1 catalog, 2 pages, 3 info, then per page: page, contents, image.
  const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  const safe = title.replace(/[()\\]/g, '');
  obj(3, `<< /Title (${safe}) /Producer (Poddar Creation Studio) >>`);
  pages.forEach((img, i) => {
    const p = 4 + i * 3;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    const stream = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im${i} Do Q`;
    obj(p + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
      push(img);
      push('\nendstream');
    });
  });
  const xref = size;
  const count = 4 + n * 3;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Paints the book and returns it as a PDF. */
export async function buildSwatchBookPdf(input: BookPdfInput): Promise<Blob> {
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`italic 500 40px ${input.fonts.display}`),
      document.fonts.load(`500 40px ${input.fonts.display}`),
      document.fonts.load(`400 20px ${input.fonts.body}`),
      document.fonts.load(`500 20px ${input.fonts.body}`),
    ]).catch(() => undefined);
  }
  const shadesCount = input.chapters.reduce((s, ch) => s + ch.colours.length, 0);
  // Page numbers: 1 cover, 2 contents, then each chapter's title page and its plates.
  const starts: number[] = [];
  let pageNo = 3;
  for (const ch of input.chapters) {
    starts.push(pageNo);
    pageNo += 1 + Math.ceil(ch.colours.length / PER_PLATE);
  }
  const canvases: HTMLCanvasElement[] = [cover(input, shadesCount), contents(input, starts)];
  let p = 3;
  input.chapters.forEach((ch, i) => {
    canvases.push(chapterPage(input, ch, i, p++));
    for (let k = 0; k < ch.colours.length; k += PER_PLATE) canvases.push(plate(input, ch, i, ch.colours.slice(k, k + PER_PLATE), p++));
  });
  canvases.push(colophon(input, p));
  const pages: Uint8Array[] = [];
  for (const c of canvases) {
    pages.push(await jpeg(c));
    // Let the page breathe between pages, so an animation on screen does not stall.
    await new Promise((r) => setTimeout(r, 0));
  }
  return pdfFromJpegs(pages, input.strings.book);
}

/** Resolves a CSS font stack (with its variables) to the families the page actually uses. */
export function resolveFont(stack: string): string {
  const probe = document.createElement('span');
  probe.style.fontFamily = stack;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || 'serif';
}

/** Hands a file to the browser to save. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
