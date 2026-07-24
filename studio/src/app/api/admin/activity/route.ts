import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireRole } from '@/server/core/session';

/** GET /api/admin/activity — paged audit-log activity feed (Priority 11). */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireRole(['ADMIN', 'MANAGER']);
    const url = new URL(req.url);
    const feed = await getContainer().adminService.activity(
      Math.min(Number(url.searchParams.get('take')) || 40, 100),
      url.searchParams.get('cursor') || undefined
    );
    return NextResponse.json(feed);
  });
}
