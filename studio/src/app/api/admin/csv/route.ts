import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { requireStaff, requireAdmin } from '@/server/core/rbac';

/** GET /api/admin/csv — export the full colour catalogue as CSV (Priority 11). */
export async function GET(req: Request) {
  return run(req, async () => {
    await requireStaff();
    const csv = await getContainer().adminService.exportColoursCsv();
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="poddar-colours-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });
}

/** POST /api/admin/csv — import colour rows (upsert by fabricId + order). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireAdmin();
      const csv = await req.text();
      if (!csv || csv.length > 2_000_000) throw AppError.validation('CSV body required (max 2 MB)');

      const { adminService, audit, fabricService } = getContainer();
      const result = await adminService.importColoursCsv(csv);
      fabricService.invalidateCatalogue();

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'catalogue.csv_import', ip: info.ip, userAgent: info.userAgent, meta: { updated: result.updated, created: result.created, errors: result.errors.length } });
      return NextResponse.json(result);
    },
    { csrf: true }
  );
}
