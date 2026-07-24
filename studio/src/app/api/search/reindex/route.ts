import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/core/rbac';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';

/** POST /api/search/reindex — rebuild the search index (Meilisearch); no-op for Postgres. */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      await requireAdmin();
      const { searchService } = getContainer();
      const count = await searchService.reindex();
      return NextResponse.json({ ok: true, engine: searchService.engineName, documents: count });
    },
    { csrf: true }
  );
}
