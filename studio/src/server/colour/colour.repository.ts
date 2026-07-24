import type { PrismaClient } from '@/generated/prisma/client';
import type { ColourMetrics } from '@/lib/colour-science';
import type { ColourRelationKind } from '@/generated/prisma/enums';

export interface ColourAnalysisRow {
  id: string;
  fabricId: string;
  name: string;
  l: number;
  c: number;
  h: number;
  labL: number | null;
  labA: number | null;
  labB: number | null;
}

export interface RelationshipRow {
  fromColourId: string;
  toColourId: string;
  kind: ColourRelationKind;
  distance: number;
  rank: number;
}

export interface ColourRepository {
  listForAnalysis(): Promise<ColourAnalysisRow[]>;
  updateMetrics(id: string, m: ColourMetrics): Promise<void>;
  replaceRelationships(rows: RelationshipRow[]): Promise<void>;
  findRelated(colourId: string, kind: ColourRelationKind, limit: number): Promise<
    Array<{ id: string; name: string; hex: string | null; fabricId: string; fabricName: string; distance: number }>
  >;
}

export class PrismaColourRepository implements ColourRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForAnalysis(): Promise<ColourAnalysisRow[]> {
    return this.db.colour.findMany({
      select: { id: true, fabricId: true, name: true, l: true, c: true, h: true, labL: true, labA: true, labB: true },
    });
  }

  async updateMetrics(id: string, m: ColourMetrics): Promise<void> {
    await this.db.colour.update({ where: { id }, data: { ...m } });
  }

  async replaceRelationships(rows: RelationshipRow[]): Promise<void> {
    // Rebuild wholesale so re-runs are idempotent.
    await this.db.$transaction([
      this.db.colourRelationship.deleteMany({}),
      this.db.colourRelationship.createMany({ data: rows }),
    ]);
  }

  async findRelated(colourId: string, kind: ColourRelationKind, limit: number) {
    const rels = await this.db.colourRelationship.findMany({
      where: { fromColourId: colourId, kind },
      orderBy: { rank: 'asc' },
      take: limit,
      include: { toColour: { include: { fabric: { select: { name: true } } } } },
    });
    return rels.map((r) => ({
      id: r.toColour.id,
      name: r.toColour.name,
      hex: r.toColour.hex,
      fabricId: r.toColour.fabricId,
      fabricName: r.toColour.fabric.name,
      distance: r.distance,
    }));
  }
}
