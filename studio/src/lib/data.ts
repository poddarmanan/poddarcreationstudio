import { cache } from 'react';
import { getContainer } from '@/server/container';
import type { FabricRow } from '@/lib/types';

/**
 * Server-component catalogue read. Delegates to the fabric service (repository pattern)
 * so the sort/shape logic lives in exactly one place, wrapped in React cache() so a
 * render pass touching it from several components issues one lookup (Priority 12).
 * The service layer adds the cross-request TTL cache on top.
 */
export const getFabricsWithColours = cache(async (): Promise<FabricRow[]> => {
  return getContainer().fabricService.listCatalogue();
});
