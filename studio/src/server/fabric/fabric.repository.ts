import type { PrismaClient } from '@/generated/prisma/client';
import type { FabricRow } from '@/lib/types';
import { FABRIC_DEFS, type FabricFamily } from '@/lib/fabric-generator';

/** Catalogue/showroom ordering (the FABRIC_DEFS sequence), not alphabetical. */
const DISPLAY_ORDER = FABRIC_DEFS.map((f) => f.id);

/**
 * The live range only. A quality taken out of the range, or a shade past the end of its card, can
 * still be in the database because an order refers to it (the seed leaves those rows, so orders
 * keep their history); the studio does not offer them.
 */
function current<T extends { id: string; nc: number; colours: { order: number }[] }>(r: T): T {
  return { ...r, colours: r.colours.filter((c) => c.order < r.nc) };
}

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
    return rows
      .filter((r) => DISPLAY_ORDER.includes(r.id))
      .sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id))
      .map((r) => ({ ...current(r), family: r.family as FabricFamily }));
  }

  async findById(id: string): Promise<FabricRow | null> {
    const r = await this.db.fabric.findUnique({
      where: { id },
      include: { colours: { orderBy: { order: 'asc' } } },
    });
    return r && DISPLAY_ORDER.includes(r.id) ? { ...current(r), family: r.family as FabricFamily } : null;
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.db.fabric.count({ where: { id } });
    return count > 0;
  }
}
