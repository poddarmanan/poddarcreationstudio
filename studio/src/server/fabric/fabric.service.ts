import type { FabricRepository } from './fabric.repository';
import type { FabricRow } from '@/lib/types';
import { AppError } from '../core/errors';

/**
 * Fabric read model. Thin today, but the single place catalogue business rules
 * (visibility, draft/published filtering in M9, caching in M10) will live.
 */
export class FabricService {
  constructor(private readonly fabrics: FabricRepository) {}

  listCatalogue(): Promise<FabricRow[]> {
    return this.fabrics.listWithColours();
  }

  async getOrThrow(id: string): Promise<FabricRow> {
    const fabric = await this.fabrics.findById(id);
    if (!fabric) throw AppError.notFound('Unknown fabric');
    return fabric;
  }
}
