import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Dismiss one notification (Phase 3 M19). Owner-scoped; a foreign id answers 404. */
export async function DELETE(req: Request, ctx: RouteContext<'/api/notifications/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      await getContainer().notificationService.remove(user.id, id);
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
