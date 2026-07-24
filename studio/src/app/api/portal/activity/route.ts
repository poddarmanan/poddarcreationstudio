import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

/** The customer's own journey log (Phase 3 M14). Never exposes another account's events. */
export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const take = Math.min(Number(new URL(req.url).searchParams.get('take')) || 20, 100);
    const activity = await getContainer().activityService.list(user.id, take);
    return NextResponse.json({ activity });
  });
}
