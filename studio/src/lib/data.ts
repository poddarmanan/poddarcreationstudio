import { prisma } from '@/lib/prisma';
import type { FabricRow } from '@/lib/types';
import type { FabricFamily } from '@/lib/fabric-generator';

export async function getFabricsWithColours(): Promise<FabricRow[]> {
  const rows = await prisma.fabric.findMany({
    include: { colours: { orderBy: { order: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  // Preserve catalogue/showroom order (matches the original FABRIC_DEFS sequence), not alpha.
  const ORDER = ['pcpc', 'cambric', 'jaam11', 'jaam125', 'rayon14', 'rayon17', 'slub', 'wrinkle', 'roman', 'gajji', 'lycra'];
  rows.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return rows.map((r) => ({ ...r, family: r.family as FabricFamily }));
}
