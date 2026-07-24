import type { FabricRepository } from './fabric.repository';
import type { FabricRow } from '@/lib/types';
import { AppError } from '../core/errors';
import { TtlCache, CACHE_KEYS } from '../core/ttl-cache';

const CATALOGUE_TTL_MS = 5 * 60 * 1000;

/**
 * Fabric read model. The catalogue list is the hottest read in the app (home SSR +
 * /api/fabrics on every visit), so it's served through the TTL cache (Priority 12);
 * catalogue writes (CSV import, canonical reset) invalidate it explicitly.
 */
export class FabricService {
  constructor(
    private readonly fabrics: FabricRepository,
    private readonly cache: TtlCache
  ) {}

  listCatalogue(): Promise<FabricRow[]> {
    return this.cache.getOrSet(CACHE_KEYS.catalogue, CATALOGUE_TTL_MS, () => this.fabrics.listWithColours());
  }

  invalidateCatalogue(): void {
    this.cache.invalidate(CACHE_KEYS.catalogue);
  }

  async getOrThrow(id: string): Promise<FabricRow> {
    const fabric = await this.fabrics.findById(id);
    if (!fabric) throw AppError.notFound('Unknown fabric');
    return fabric;
  }
}
