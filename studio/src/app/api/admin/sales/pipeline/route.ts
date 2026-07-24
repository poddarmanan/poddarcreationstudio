import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';

/** GET /api/admin/sales/pipeline — the quote board plus samples and overdue follow-ups. */
export async function GET(req: Request) {
  return run(req, async () => {
    const staff = await requireStaff();
    const mine = new URL(req.url).searchParams.get('mine') === '1';
    const pipeline = await getContainer().salesService.pipeline(mine ? { assigneeId: staff.id } : {});
    return NextResponse.json(pipeline);
  });
}
