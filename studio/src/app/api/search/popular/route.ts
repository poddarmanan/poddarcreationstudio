import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';

/** GET /api/search/popular — aggregate popular searches + the caller's recent searches. */
export async function GET(req: Request) {
  return run(req, async () => {
    const { searchService } = getContainer();
    const session = await auth();
    const [popular, recent] = await Promise.all([
      searchService.popular(8),
      session?.user?.id ? searchService.recentForUser(session.user.id, 6) : Promise.resolve([]),
    ]);
    return NextResponse.json({ popular, recent });
  });
}
