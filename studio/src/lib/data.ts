import { getContainer } from '@/server/container';
import type { FabricRow } from '@/lib/types';

/**
 * Server-component catalogue read. Delegates to the fabric service (repository pattern)
 * so the sort/shape logic lives in exactly one place. Kept as a named export because
 * `app/page.tsx` imports it directly.
 */
export async function getFabricsWithColours(): Promise<FabricRow[]> {
  return getContainer().fabricService.listCatalogue();
}
