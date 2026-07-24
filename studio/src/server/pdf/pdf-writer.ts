/**
 * A minimal PDF 1.4 writer (Phase 3 M17).
 *
 * Why hand-rolled: a catalogue page is swatch rectangles and short lines of text. That needs
 * filled rects, base-14 text and multiple pages — a few hundred bytes of PDF grammar. The
 * alternatives were a headless browser (hundreds of MB, a process to supervise, a new failure
 * mode) or a layout library we'd use 2% of. Neither earns its place in the deployment.
 *
 * Deliberate limits: base-14 fonts only (Helvetica family, WinAnsi), no embedded fonts, no
 * images, no compression. Everything a swatch catalogue needs, nothing it doesn't.
 */

export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A4 in PostScript points (1/72"). */
export const A4 = { width: 595.28, height: 841.89 };

const enc = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * PDF strings are WinAnsi-ish. Anything outside Latin-1 (Devanagari, curly quotes, ₹) has no
 * glyph in the base-14 fonts, so it is transliterated or dropped rather than emitted as a
 * broken byte that would make the file unopenable.
 */
function pdfString(text: string): string {
  const substitutions: Record<string, string> = {
    '‘': "'", '’': "'", '“': '"', '”': '"',
    '–': '-', '—': '-', '…': '...', ' ': ' ',
    '₹': 'INR ', '•': '-', '×': 'x', '→': '->',
  };
  let out = '';
  for (const char of text) {
    const mapped = substitutions[char] ?? char;
    for (const c of mapped) {
      const code = c.charCodeAt(0);
      if (code < 32) out += ' ';
      else if (code <= 255) out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
      // Anything else has no glyph in a base-14 font; dropping beats emitting mojibake.
    }
  }
  return out;
}

/** Width of a string in points, from the Helvetica metrics we need (approximate but stable). */
const WIDTHS: Record<string, number> = { default: 0.55, i: 0.24, l: 0.24, j: 0.24, t: 0.31, f: 0.29, r: 0.34, ' ': 0.28, I: 0.28, '.': 0.28, ',': 0.28, "'": 0.2, W: 0.94, M: 0.83, m: 0.83 };

export function textWidth(text: string, size: number): number {
  let units = 0;
  for (const c of text) units += WIDTHS[c] ?? WIDTHS.default;
  return units * size;
}

/** Truncate to fit a column, with an ellipsis, so long shade names never overrun their cell. */
export function fit(text: string, size: number, maxWidth: number): string {
  if (textWidth(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

class Page {
  readonly ops: string[] = [];

  constructor(
    readonly width: number,
    readonly height: number
  ) {}

  /** PDF's origin is bottom-left; callers think top-down, so y is flipped here once. */
  private y(top: number): number {
    return this.height - top;
  }

  rect(x: number, top: number, w: number, h: number, fill: Rgb): this {
    this.ops.push(`${enc(fill.r)} ${enc(fill.g)} ${enc(fill.b)} rg`, `${enc(x)} ${enc(this.y(top + h))} ${enc(w)} ${enc(h)} re f`);
    return this;
  }

  line(x1: number, top1: number, x2: number, top2: number, colour: Rgb, thickness = 0.6): this {
    this.ops.push(
      `${enc(colour.r)} ${enc(colour.g)} ${enc(colour.b)} RG`,
      `${enc(thickness)} w`,
      `${enc(x1)} ${enc(this.y(top1))} m ${enc(x2)} ${enc(this.y(top2))} l S`
    );
    return this;
  }

  text(x: number, top: number, content: string, opts: { size?: number; font?: FontName; colour?: Rgb; charSpace?: number } = {}): this {
    const size = opts.size ?? 10;
    const font = opts.font ?? 'Helvetica';
    const colour = opts.colour ?? { r: 0, g: 0, b: 0 };
    this.ops.push(
      'BT',
      `${enc(colour.r)} ${enc(colour.g)} ${enc(colour.b)} rg`,
      `/${font === 'Helvetica-Bold' ? 'F2' : font === 'Helvetica-Oblique' ? 'F3' : 'F1'} ${enc(size)} Tf`,
      opts.charSpace ? `${enc(opts.charSpace)} Tc` : '0 Tc',
      // Baseline sits `size` below the requested top edge, so callers position boxes, not baselines.
      `1 0 0 1 ${enc(x)} ${enc(this.y(top + size))} Tm`,
      `(${pdfString(content)}) Tj`,
      'ET'
    );
    return this;
  }

  get content(): string {
    return this.ops.join('\n');
  }
}

export class PdfDocument {
  private readonly pages: Page[] = [];

  constructor(
    private readonly width = A4.width,
    private readonly height = A4.height
  ) {}

  addPage(): Page {
    const page = new Page(this.width, this.height);
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Serialise to a complete PDF file with a correct cross-reference table. */
  build(meta: { title?: string; author?: string } = {}): Buffer {
    if (this.pages.length === 0) this.addPage();

    const objects: string[] = [];
    const add = (body: string) => objects.push(body) && objects.length; // 1-based object number

    // 1 Catalog · 2 Pages · 3-5 fonts, then per page: page object + content stream.
    const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = add(''); // patched below once page ids are known
    const fontIds = {
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),
    };
    const infoId = add(`<< /Title (${pdfString(meta.title ?? 'Catalogue')}) /Producer (Poddar Creation Studio) /Creator (${pdfString(meta.author ?? 'Poddar Creation')}) >>`);

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const content = page.content;
      const streamId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
      const pageId = add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${enc(this.width)} ${enc(this.height)}] ` +
          `/Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R >> >> ` +
          `/Contents ${streamId} 0 R >>`
      );
      pageIds.push(pageId);
    }
    objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'latin1');
  }
}

/** #RRGGBB (or a css-ish fallback) → the 0-1 triple PDF wants. */
export function hexToRgb(hex: string | null | undefined, fallback: Rgb = { r: 0.91, g: 0.87, b: 0.82 }): Rgb {
  if (!hex) return fallback;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}
