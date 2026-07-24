import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';

/** GET /api/admin/analytics — catalogue + workflow aggregates (Priority 11). */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireStaff();
    const analytics = await getContainer().adminService.analytics();
    return NextResponse.json({ analytics });
  });
}
