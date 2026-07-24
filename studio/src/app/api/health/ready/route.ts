import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { isStaff } from '@/server/core/rbac';
import { auth } from '@/auth';

/**
 * Readiness (Phase 3 M20). Runs every dependency check and answers 503 when unhealthy, so an
 * orchestrator stops sending traffic to an instance that cannot serve it.
 *
 * The **summary** is public — a probe cannot authenticate. The **detail** (which dependency,
 * which error, which configuration finding) is staff-only: an anonymous reader learning that
 * "AUTH_SECRET is a development placeholder" is a gift to an attacker.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  const report = await getContainer().healthService.readiness({ deep });

  const session = await auth();
  const detailed = isStaff(session?.user?.role);

  const body = detailed
    ? report
    : {
        status: report.status,
        checkedAt: report.checkedAt,
        uptimeSeconds: report.uptimeSeconds,
        // Names only, never the reason.
        failing: report.checks.filter((c) => c.status === 'fail').map((c) => c.name),
      };

  return NextResponse.json(body, {
    status: report.status === 'unhealthy' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
