import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { run } from '@/server/core/http';
import { requireRole } from '@/server/core/session';

/** GET /api/admin/staff — assignable staff (for the quote/sample desk assignee picker). */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireRole(['ADMIN', 'MANAGER', 'SALES']);
    const staff = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MANAGER', 'SALES'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ staff });
  });
}
