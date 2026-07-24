import type { PrismaClient } from '@/generated/prisma/client';
import type { SearchDoc, SearchEngine, SearchHit, SearchOptions, SearchResults } from './engine';

interface RawRow {
  colourId: string | null;
  name: string;
  hex: string | null;
  temperature: string | null;
  fabricId: string;
  fabricName: string;
  family: string;
  weight: string;
  width: string;
  composition: string;
  score: number;
}

/**
 * Postgres trigram search engine (default; zero external deps). Uses pg_trgm similarity()
 * + the GIN trigram indexes for typo tolerance, and ILIKE for substring/prefix matches.
 * The catalogue tables ARE the index, so reindex/upsert/remove are no-ops here.
 */
export class PostgresSearchEngine implements SearchEngine {
  readonly name = 'postgres';
  constructor(private readonly db: PrismaClient) {}

  async reindex(): Promise<void> {}
  async upsert(): Promise<void> {}
  async remove(): Promise<void> {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResults> {
    const q = query.trim();
    const limit = options.limit ?? 8;
    if (!q) return { hits: [], total: 0, engine: this.name };

    const like = `%${q}%`;
    const prefix = `${q}%`;
    const pool = limit * 4;

    const colourRows = await this.db.$queryRaw<RawRow[]>`
      SELECT c.id AS "colourId", c.name, c.hex, c.temperature,
             f.id AS "fabricId", f.name AS "fabricName", f.family, f.weight, f.width, f.comp AS composition,
             GREATEST(
               similarity(c.name, ${q}),
               CASE WHEN c.name ILIKE ${prefix} THEN 1.0 ELSE 0.0 END,
               CASE WHEN c.name ILIKE ${like} THEN 0.6 ELSE 0.0 END,
               CASE WHEN f.name ILIKE ${like} THEN 0.45 ELSE 0.0 END
             ) AS score
      FROM "Colour" c JOIN "Fabric" f ON f.id = c."fabricId"
      WHERE similarity(c.name, ${q}) > 0.2 OR c.name ILIKE ${like} OR f.name ILIKE ${like} OR c.temperature ILIKE ${like}
      ORDER BY score DESC
      LIMIT ${pool}`;

    const fabricRows = await this.db.$queryRaw<RawRow[]>`
      SELECT NULL AS "colourId", f.name, NULL AS hex, NULL AS temperature,
             f.id AS "fabricId", f.name AS "fabricName", f.family, f.weight, f.width, f.comp AS composition,
             GREATEST(
               similarity(f.name, ${q}),
               CASE WHEN f.name ILIKE ${prefix} THEN 1.0 ELSE 0.0 END,
               CASE WHEN f.name ILIKE ${like} THEN 0.6 ELSE 0.0 END,
               CASE WHEN f.comp ILIKE ${like} OR f.family ILIKE ${like} THEN 0.4 ELSE 0.0 END
             ) AS score
      FROM "Fabric" f
      WHERE similarity(f.name, ${q}) > 0.2 OR f.name ILIKE ${like} OR f.comp ILIKE ${like} OR f.family ILIKE ${like}
      ORDER BY score DESC
      LIMIT ${pool}`;

    let hits: SearchHit[] = [
      ...colourRows.map((r) => this.toHit(r, 'colour')),
      ...fabricRows.map((r) => this.toHit(r, 'fabric')),
    ];

    const f = options.filters;
    if (f) {
      hits = hits.filter(
        (h) =>
          (!f.type || h.type === f.type) &&
          (!f.family || h.family === f.family) &&
          (!f.temperature || h.temperature === f.temperature) &&
          (!f.fabricId || h.fabricId === f.fabricId)
      );
    }

    hits.sort((a, b) => b.score - a.score);
    return { hits: hits.slice(0, limit), total: hits.length, engine: this.name };
  }

  async suggest(prefix: string, limit = 6): Promise<string[]> {
    const p = prefix.trim();
    if (!p) return [];
    const like = `${p}%`;
    const fuzzy = p;
    const rows = await this.db.$queryRaw<{ name: string }[]>`
      SELECT name FROM (
        SELECT c.name, GREATEST(similarity(c.name, ${fuzzy}), CASE WHEN c.name ILIKE ${like} THEN 1 ELSE 0 END) AS s FROM "Colour" c
        UNION
        SELECT f.name, GREATEST(similarity(f.name, ${fuzzy}), CASE WHEN f.name ILIKE ${like} THEN 1 ELSE 0 END) AS s FROM "Fabric" f
      ) t
      WHERE s > 0.2 OR name ILIKE ${like}
      GROUP BY name, s
      ORDER BY s DESC, name ASC
      LIMIT ${limit}`;
    // De-dupe while preserving order.
    return [...new Set(rows.map((r) => r.name))].slice(0, limit);
  }

  private toHit(r: RawRow, type: 'colour' | 'fabric'): SearchHit {
    const doc: SearchDoc = {
      id: `${type}:${type === 'colour' ? r.colourId : r.fabricId}`,
      type,
      name: r.name,
      fabricId: r.fabricId,
      fabricName: r.fabricName,
      colourId: r.colourId ?? undefined,
      family: r.family,
      weight: r.weight,
      width: r.width,
      composition: r.composition,
      hex: r.hex ?? undefined,
      temperature: r.temperature ?? undefined,
      text: '',
    };
    return { ...doc, score: Math.round(r.score * 1000) / 1000 };
  }
}
