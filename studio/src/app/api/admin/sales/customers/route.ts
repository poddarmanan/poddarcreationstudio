import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';

/** GET /api/admin/sales/customers — customer list, searchable by name, email or company. */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireStaff();
    const url = new URL(req.url);
    const customers = await getContainer().salesService.customers({
      search: url.searchParams.get('q') ?? undefined,
      take: Number(url.searchParams.get('take')) || undefined,
    });
    return NextResponse.json({ customers });
  });
}
