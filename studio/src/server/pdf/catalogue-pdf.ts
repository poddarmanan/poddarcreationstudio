import { PdfDocument, A4, hexToRgb, fit, textWidth, type Rgb } from './pdf-writer';

/**
 * The collection catalogue as a PDF (Phase 3 M17) — the thing a buyer prints and carries into
 * a meeting. Laid out in the studio's own palette and proportions: cream page, ink text, gold
 * eyebrow, the selvage rule under the title, pinked swatch edges suggested by the swatch grid.
 */

const INK: Rgb = { r: 0.11, g: 0.098, b: 0.09 }; // #1C1917
const GOLD: Rgb = { r: 0.541, g: 0.427, b: 0.271 }; // #8A6D45
const MUTED: Rgb = { r: 0.45, g: 0.44, b: 0.43 };
const HAIRLINE: Rgb = { r: 0.85, g: 0.84, b: 0.82 };
const CREAM: Rgb = { r: 0.98, g: 0.972, b: 0.961 }; // #FAF8F5

const MARGIN = 46;
const COLUMNS = 3;
const GUTTER = 18;
const CARD_WIDTH = (A4.width - MARGIN * 2 - GUTTER * (COLUMNS - 1)) / COLUMNS;
const SWATCH_HEIGHT = 92;
const CARD_HEIGHT = SWATCH_HEIGHT + 54;

export interface CatalogueItem {
  colourName: string;
  hex: string | null;
  fabricName: string;
  fabricSpec?: string | null;
  note?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface CatalogueInput {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  preparedFor?: string | null;
  items: CatalogueItem[];
  /** Rendered in the footer of every page. */
  reference?: string | null;
}

/** Draws the brand header and returns the vertical cursor beneath it. */
function header(page: ReturnType<PdfDocument['addPage']>, input: CatalogueInput, pageIndex: number): number {
  page.rect(0, 0, A4.width, A4.height, CREAM);

  if (pageIndex === 0) {
    page.text(MARGIN, 44, 'PODDAR', { size: 17, font: 'Helvetica-Bold', colour: INK, charSpace: 2.4 });
    page.text(MARGIN, 66, 'CREATION . STUDIO', { size: 6.5, colour: GOLD, charSpace: 3.4 });
    page.text(MARGIN, 104, 'COLLECTION', { size: 7.5, colour: GOLD, charSpace: 4 });
    page.text(MARGIN, 118, fit(input.title, 26, A4.width - MARGIN * 2), { size: 26, font: 'Helvetica-Bold', colour: INK });

    // The selvage rule: alternating gold and ink dashes, as on screen.
    let x = MARGIN;
    for (let i = 0; i < 9; i++) {
      page.rect(x, 156, 9, 1.6, i % 2 === 0 ? GOLD : INK);
      x += 16;
    }

    let cursor = 176;
    if (input.subtitle) {
      page.text(MARGIN, cursor, fit(input.subtitle, 10, A4.width - MARGIN * 2), { size: 10, colour: MUTED });
      cursor += 16;
    }
    if (input.description) {
      for (const line of wrap(input.description, 10, A4.width - MARGIN * 2, 3)) {
        page.text(MARGIN, cursor, line, { size: 10, colour: MUTED });
        cursor += 14;
      }
    }
    if (input.preparedFor) {
      page.text(MARGIN, cursor + 4, `Prepared for ${input.preparedFor}`, { size: 9.5, font: 'Helvetica-Oblique', colour: GOLD });
      cursor += 20;
    }
    return cursor + 14;
  }

  page.text(MARGIN, 40, 'PODDAR', { size: 10, font: 'Helvetica-Bold', colour: INK, charSpace: 1.6 });
  page.text(MARGIN, 54, fit(input.title, 8, 300), { size: 8, colour: GOLD, charSpace: 1.2 });
  page.line(MARGIN, 72, A4.width - MARGIN, 72, HAIRLINE);
  return 92;
}

function footer(page: ReturnType<PdfDocument['addPage']>, input: CatalogueInput, pageNumber: number, pageCount: number): void {
  const y = A4.height - 44;
  page.line(MARGIN, y - 12, A4.width - MARGIN, y - 12, HAIRLINE);
  page.text(MARGIN, y, 'Poddar Creation . Wholesale Dyed Fabrics . Surat', { size: 7.5, colour: MUTED });
  if (input.reference) page.text(MARGIN, y + 11, input.reference, { size: 7, colour: MUTED });
  const label = `${pageNumber} / ${pageCount}`;
  page.text(A4.width - MARGIN - textWidth(label, 7.5), y, label, { size: 7.5, colour: MUTED });
}

/** Greedy word wrap against the same metrics the writer uses. */
function wrap(text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export function renderCataloguePdf(input: CatalogueInput): Buffer {
  const doc = new PdfDocument();
  const perPageFirst = Math.max(1, Math.floor((A4.height - 300 - 70) / CARD_HEIGHT) * COLUMNS);
  const perPageRest = Math.max(1, Math.floor((A4.height - 92 - 70) / CARD_HEIGHT) * COLUMNS);

  // Paginate first so the footer can honestly say "2 / 4".
  const pages: CatalogueItem[][] = [];
  let remaining = [...input.items];
  if (remaining.length === 0) pages.push([]);
  while (remaining.length) {
    const size = pages.length === 0 ? perPageFirst : perPageRest;
    pages.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }

  pages.forEach((items, pageIndex) => {
    const page = doc.addPage();
    let top = header(page, input, pageIndex);
    const rowTop = top;

    items.forEach((item, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x = MARGIN + column * (CARD_WIDTH + GUTTER);
      const y = rowTop + row * CARD_HEIGHT;

      page.rect(x, y, CARD_WIDTH, SWATCH_HEIGHT, hexToRgb(item.hex));
      // A hairline under the swatch stands in for the pinked edge used on screen.
      page.line(x, y + SWATCH_HEIGHT + 0.5, x + CARD_WIDTH, y + SWATCH_HEIGHT + 0.5, HAIRLINE, 0.8);

      page.text(x, y + SWATCH_HEIGHT + 8, fit(item.colourName, 11.5, CARD_WIDTH), { size: 11.5, font: 'Helvetica-Bold', colour: INK });
      page.text(x, y + SWATCH_HEIGHT + 23, fit(item.fabricName, 8, CARD_WIDTH), { size: 8, colour: MUTED });
      const spec = [item.fabricSpec, item.hex?.toUpperCase()].filter(Boolean).join(' . ');
      if (spec) page.text(x, y + SWATCH_HEIGHT + 33, fit(spec, 7, CARD_WIDTH), { size: 7, colour: MUTED });

      const detail = [item.quantity ? `${item.quantity}${item.unit ?? 'm'}` : null, item.note].filter(Boolean).join(' . ');
      if (detail) page.text(x, y + SWATCH_HEIGHT + 43, fit(detail, 7.5, CARD_WIDTH), { size: 7.5, colour: GOLD });

      top = y + CARD_HEIGHT;
    });

    if (items.length === 0) {
      page.text(MARGIN, top, 'This collection has no shades yet.', { size: 10, font: 'Helvetica-Oblique', colour: MUTED });
    }

    footer(page, input, pageIndex + 1, pages.length);
  });

  return doc.build({ title: input.title, author: 'Poddar Creation Studio' });
}
