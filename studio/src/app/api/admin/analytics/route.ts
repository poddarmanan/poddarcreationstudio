import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';

/**
 * GET /api/admin/analytics — catalogue + workflow aggregates.
 *
 * Phase 2's counters stay in `analytics` so existing callers keep working; Phase 3 M18 adds the
 * full business overview under `business` (top fabrics, conversion, trends, storage).
 */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireStaff();
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 7), 365);
    const { adminService, analyticsService } = getContainer();

    const [analytics, business] = await Promise.all([
      adminService.analytics(),
      url.searchParams.get('business') === '0' ? Promise.resolve(null) : analyticsService.overview(days),
    ]);

    return NextResponse.json({ analytics, business });
  });
}
