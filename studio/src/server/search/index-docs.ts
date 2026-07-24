import type { PrismaClient } from '@/generated/prisma/client';
import type { SearchDoc } from './engine';

/**
 * Builds the search corpus from the catalogue: one document per fabric plus one per colour
 * (colours carry their fabric's context so a shade search returns the right fabric). Shared
 * by both engines so Meilisearch and the Postgres fallback index identical documents.
 */
export async function buildSearchDocuments(db: PrismaClient): Promise<SearchDoc[]> {
  const fabrics = await db.fabric.findMany({
    include: { colours: { orderBy: { order: 'asc' } } },
  });

  const docs: SearchDoc[] = [];
  for (const f of fabrics) {
    docs.push({
      id: `fabric:${f.id}`,
      type: 'fabric',
      name: f.name,
      fabricId: f.id,
      fabricName: f.name,
      family: f.family,
      weight: f.weight,
      width: f.width,
      composition: f.comp,
      text: `${f.name} ${f.family} ${f.comp} ${f.weight} ${f.width} ${f.hand}`,
    });
    for (const c of f.colours) {
      docs.push({
        id: `colour:${c.id}`,
        type: 'colour',
        name: c.name,
        fabricId: f.id,
        fabricName: f.name,
        colourId: c.id,
        family: f.family,
        weight: f.weight,
        width: f.width,
        composition: f.comp,
        hex: c.hex ?? undefined,
        temperature: c.temperature ?? undefined,
        text: `${c.name} ${f.name} ${f.family} ${c.temperature ?? ''} ${f.comp}`,
      });
    }
  }
  return docs;
}
