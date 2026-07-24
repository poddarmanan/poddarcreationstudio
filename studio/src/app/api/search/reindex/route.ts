import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

/** POST /api/search/reindex — rebuild the search index (Meilisearch); no-op for Postgres. */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const session = await auth();
      if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
        throw AppError.forbidden('Admin or manager role required');
      }
      const { searchService } = getContainer();
      const count = await searchService.reindex();
      return NextResponse.json({ ok: true, engine: searchService.engineName, documents: count });
    },
    { csrf: true }
  );
}
