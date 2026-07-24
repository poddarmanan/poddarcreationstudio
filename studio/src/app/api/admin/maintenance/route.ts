import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireAdmin } from '@/server/core/rbac';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * Scheduled maintenance, exposed as an endpoint so a cron or the diagnostics page can trigger
 * it (Phase 3 M20). Admin-only, audited, and each task is idempotent.
 */
const Task = z.object({ task: z.enum(['expireQuotes', 'measureStorage']) });

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const actor = await requireAdmin();
      const { task } = await parseJson(req, Task);
      const { quoteService, analyticsService, audit } = getContainer();
      const info = clientInfo(req);

      const result =
        task === 'expireQuotes'
          ? { expired: await quoteService.expireStale() }
          : await analyticsService.measureObjects();

      await audit.record({ actorId: actor.id, action: `maintenance.${task}`, ip: info.ip, userAgent: info.userAgent, meta: result as Record<string, unknown> });
      return NextResponse.json({ ok: true, task, result });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
