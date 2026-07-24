import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { requireRole } from '@/server/core/session';

const STAFF = ['ADMIN', 'MANAGER', 'SALES'];

const Patch = z.object({
  action: z.enum(['assign', 'status', 'note']),
  assigneeId: z.string().optional(),
  status: z.enum(['NEW', 'ASSIGNED', 'QUOTED', 'WON', 'LOST']).optional(),
  note: z.string().max(2000).optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/quotes/[id]'>) {
  return run(req, async () => {
    const user = await requireRole(STAFF);
    void user;
    const { id } = await ctx.params;
    const quote = await getContainer().quoteService.get(id);
    if (!quote) throw AppError.notFound('Quote not found');
    return NextResponse.json({ quote });
  });
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/quotes/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireRole(STAFF);
      const { id } = await ctx.params;
      const body = await parseJson(req, Patch);
      const svc = getContainer().quoteService;

      if (body.action === 'assign') {
        if (!body.assigneeId) throw AppError.validation('assigneeId is required');
        await svc.assign(id, body.assigneeId, user.id);
      } else if (body.action === 'status') {
        if (!body.status) throw AppError.validation('status is required');
        await svc.updateStatus(id, body.status, user.id, body.note);
      } else {
        if (!body.note) throw AppError.validation('note is required');
        await svc.addNote(id, body.note, user.id);
      }

      const info = clientInfo(req);
      await getContainer().audit.record({ actorId: user.id, action: `quote.${body.action}`, entity: 'Quote', entityId: id, ip: info.ip, userAgent: info.userAgent, meta: { status: body.status } });
      return NextResponse.json({ quote: await svc.get(id) });
    },
    { csrf: true }
  );
}
