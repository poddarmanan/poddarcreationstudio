import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const Patch = z.object({ status: z.enum(['DONE', 'CANCELLED']) });

/** Close a follow-up reminder (Phase 3 M16). */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/sales/followups/[id]'>) {
  return run(
    req,
    async () => {
      const staff = await requireStaff();
      const { id } = await ctx.params;
      const { status } = await parseJson(req, Patch);
      const { salesService, audit } = getContainer();
      const followUp = await salesService.closeFollowUp(id, status);
      const info = clientInfo(req);
      await audit.record({ actorId: staff.id, action: 'sales.followup.close', entity: 'FollowUp', entityId: id, ip: info.ip, userAgent: info.userAgent, meta: { status } });
      return NextResponse.json({ followUp });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
