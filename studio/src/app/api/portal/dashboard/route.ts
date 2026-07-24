import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

/**
 * The whole customer dashboard in one call (Phase 3 M14). The portal page server-renders
 * from the same service; this endpoint exists for client refreshes and future clients.
 */
export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const dashboard = await getContainer().dashboardService.forUser(user.id);
    return NextResponse.json(dashboard);
  });
}
