import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';

/**
 * Liveness (Phase 3 M20). Answers "is this process alive?" and nothing else — it touches no
 * dependency, so a load balancer never restarts a healthy instance because the database
 * blinked. Public and unauthenticated, because that is what a probe needs.
 */
export async function GET() {
  return NextResponse.json(getContainer().healthService.liveness(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
