import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { requireRole } from '@/server/core/session';

const STAFF = ['ADMIN', 'MANAGER', 'SALES'];

const Patch = z.object({
  action: z.enum(['status', 'note']),
  status: z.enum(['APPROVED', 'DISPATCHED', 'DELIVERED', 'REJECTED']).optional(),
  courier: z.string().max(120).optional(),
  trackingNumber: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/samples/[id]'>) {
  return run(req, async () => {
    await requireRole(STAFF);
    const { id } = await ctx.params;
    const sample = await getContainer().sampleService.get(id);
    if (!sample) throw AppError.notFound('Sample request not found');
    return NextResponse.json({ sample });
  });
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/samples/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireRole(STAFF);
      const { id } = await ctx.params;
      const body = await parseJson(req, Patch);
      const svc = getContainer().sampleService;

      if (body.action === 'status') {
        if (!body.status) throw AppError.validation('status is required');
        await svc.updateStatus(id, body.status, user.id, { courier: body.courier, trackingNumber: body.trackingNumber, note: body.note });
      } else {
        if (!body.note) throw AppError.validation('note is required');
        await svc.addNote(id, body.note, user.id);
      }

      const info = clientInfo(req);
      await getContainer().audit.record({ actorId: user.id, action: `sample.${body.action}`, entity: 'SampleRequest', entityId: id, ip: info.ip, userAgent: info.userAgent, meta: { status: body.status } });
      return NextResponse.json({ sample: await svc.get(id) });
    },
    { csrf: true }
  );
}
