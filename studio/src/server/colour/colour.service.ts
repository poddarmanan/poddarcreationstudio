import type { ColourRepository, RelationshipRow } from './colour.repository';
import { computeColourMetrics, rgbToLab, oklchToRgb, type Lab } from '@/lib/colour-science';
import type { ColourRelationKind } from '@/generated/prisma/enums';

const SIMILAR_K = 6;
const COMPLEMENTARY_K = 3;
const ANALOGOUS_K = 3;
const CHROMATIC_MIN = 0.04; // below this a colour is treated as neutral (no hue relationships)

interface Analyzed {
  id: string;
  c: number;
  h: number;
  lab: Lab;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Colour intelligence service (Priority 9). Computes and persists every colour's derived
 * metrics, then rebuilds the similar / complementary / analogous relationship graph. Pure
 * ranking logic lives here; persistence is behind the repository.
 */
export class ColourService {
  constructor(private readonly colours: ColourRepository) {}

  /** One pass: compute + store metrics for all colours, then rebuild the relationship graph. */
  async analyzeAll(): Promise<{ coloursUpdated: number; relationships: number }> {
    const rows = await this.colours.listForAnalysis();

    const analyzed: Analyzed[] = [];
    for (const row of rows) {
      const metrics = computeColourMetrics(row.l, row.c, row.h);
      await this.colours.updateMetrics(row.id, metrics);
      analyzed.push({ id: row.id, c: row.c, h: row.h, lab: rgbToLab(oklchToRgb(row.l, row.c, row.h)) });
    }

    const relationships = this.buildRelationships(analyzed);
    await this.colours.replaceRelationships(relationships);
    return { coloursUpdated: analyzed.length, relationships: relationships.length };
  }

  private buildRelationships(items: Analyzed[]): RelationshipRow[] {
    const out: RelationshipRow[] = [];

    for (const from of items) {
      const others = items.filter((o) => o.id !== from.id);

      // SIMILAR — nearest in CIELAB.
      const bySimilar = [...others]
        .map((o) => ({ o, d: Math.sqrt((from.lab.L - o.lab.L) ** 2 + (from.lab.a - o.lab.a) ** 2 + (from.lab.b - o.lab.b) ** 2) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, SIMILAR_K);
      pushRanked(out, from.id, bySimilar, 'SIMILAR');

      if (from.c >= CHROMATIC_MIN) {
        const target = (from.h + 180) % 360;
        const chromatic = others.filter((o) => o.c >= CHROMATIC_MIN);

        // COMPLEMENTARY — hue closest to the opposite hue.
        const byComp = chromatic
          .map((o) => ({ o, d: hueDistance(o.h, target) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, COMPLEMENTARY_K);
        pushRanked(out, from.id, byComp, 'COMPLEMENTARY');

        // ANALOGOUS — adjacent hues, lightness-aware.
        const byAnalog = chromatic
          .map((o) => ({ o, d: hueDistance(o.h, from.h) + Math.abs(from.lab.L - o.lab.L) * 0.4 }))
          .filter((x) => hueDistance(x.o.h, from.h) <= 40)
          .sort((a, b) => a.d - b.d)
          .slice(0, ANALOGOUS_K);
        pushRanked(out, from.id, byAnalog, 'ANALOGOUS');
      }
    }
    return out;
  }

  getRelated(colourId: string, kind: ColourRelationKind, limit = 6) {
    return this.colours.findRelated(colourId, kind, limit);
  }
}

function pushRanked(out: RelationshipRow[], fromColourId: string, ranked: Array<{ o: Analyzed; d: number }>, kind: ColourRelationKind) {
  ranked.forEach((x, i) => {
    out.push({ fromColourId, toColourId: x.o.id, kind, distance: Math.round(x.d * 100) / 100, rank: i });
  });
}
