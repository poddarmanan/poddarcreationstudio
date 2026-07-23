import type { PrismaClient } from '@/generated/prisma/client';
import type { FabricRow } from '@/lib/types';
import type { FabricFamily } from '@/lib/fabric-generator';

/** Catalogue/showroom ordering (matches FABRIC_DEFS sequence), not alphabetical. */
const DISPLAY_ORDER = ['pcpc', 'cambric', 'jaam11', 'jaam125', 'rayon14', 'rayon17', 'slub', 'wrinkle', 'roman', 'gajji', 'lycra'];

export interface FabricRepository {
  listWithColours(): Promise<FabricRow[]>;
  findById(id: string): Promise<FabricRow | null>;
  exists(id: string): Promise<boolean>;
}

/**
 * Prisma-backed repository. Isolates persistence so services depend on the interface,
 * not on Prisma — the seam future data sources (read replicas, cache) plug into.
 */
export class PrismaFabricRepository implements FabricRepository {
  constructor(private readonly db: PrismaClient) {}

  async listWithColours(): Promise<FabricRow[]> {
    const rows = await this.db.fabric.findMany({
      include: { colours: { orderBy: { order: 'asc' } } },
    });
    rows.sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));
    return rows.map((r) => ({ ...r, family: r.family as FabricFamily }));
  }

  async findById(id: string): Promise<FabricRow | null> {
    const r = await this.db.fabric.findUnique({
      where: { id },
      include: { colours: { orderBy: { order: 'asc' } } },
    });
    return r ? { ...r, family: r.family as FabricFamily } : null;
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.db.fabric.count({ where: { id } });
    return count > 0;
  }
}
