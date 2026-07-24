import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run, enforceRateLimit } from '@/server/core/http';
import type { SearchFilters } from '@/server/search';

/** GET /api/search?q=&limit=&type=&family=&temperature=&fabricId= */
export async function GET(req: Request) {
  return run(req, async () => {
    // Search is high-frequency (typeahead); use the generous read policy.
    enforceRateLimit(req, { name: 'search', limit: 120, windowMs: 60_000 });

    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit')) || 8));
    const filters: SearchFilters = {
      type: (url.searchParams.get('type') as SearchFilters['type']) || undefined,
      family: url.searchParams.get('family') || undefined,
      temperature: url.searchParams.get('temperature') || undefined,
      fabricId: url.searchParams.get('fabricId') || undefined,
    };

    const { searchService } = getContainer();
    const session = await auth();
    const [results, suggestions] = await Promise.all([
      searchService.search(q, { limit, filters, userId: session?.user?.id ?? null }),
      q.trim().length >= 1 ? searchService.suggest(q, 6) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      engine: results.engine,
      total: results.total,
      hits: results.hits,
      suggestions,
    });
  });
}
