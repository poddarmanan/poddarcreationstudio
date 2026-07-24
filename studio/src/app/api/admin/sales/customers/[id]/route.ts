import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireStaff } from '@/server/core/rbac';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * One customer's whole story for the sales team (Phase 3 M16), plus the annotations the team
 * may add: notes, follow-ups and sample assignment. Nothing here writes to the customer's own
 * records — the workspace annotates, it does not edit on their behalf.
 */
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('note'), body: z.string().min(1).max(4000), pinned: z.boolean().optional() }),
  z.object({
    action: z.literal('followUp'),
    subject: z.string().min(1).max(200),
    note: z.string().max(2000).nullish(),
    dueAt: z.string().datetime(),
    assigneeId: z.string().max(64).nullish(),
    visibleToCustomer: z.boolean().optional(),
  }),
  z.object({ action: z.literal('assignSample'), sampleId: z.string().max(64), assigneeId: z.string().max(64) }),
]);

export async function GET(req: Request, ctx: RouteContext<'/api/admin/sales/customers/[id]'>) {
  return run(req, async () => {
    await requireStaff();
    const { id } = await ctx.params;
    const customer = await getContainer().salesService.customer(id);
    return NextResponse.json({ customer });
  });
}

export async function POST(req: Request, ctx: RouteContext<'/api/admin/sales/customers/[id]'>) {
  return run(
    req,
    async () => {
      const staff = await requireStaff();
      const { id } = await ctx.params;
      const body = await parseJson(req, Action);
      const { salesService: svc, audit } = getContainer();
      const info = clientInfo(req);

      if (body.action === 'note') {
        const note = await svc.addNote(id, staff.id, body.body, body.pinned);
        await audit.record({ actorId: staff.id, action: 'sales.note.create', entity: 'CustomerNote', entityId: note.id, ip: info.ip, userAgent: info.userAgent, meta: { customerId: id } });
        return NextResponse.json({ note }, { status: 201 });
      }

      if (body.action === 'followUp') {
        const followUp = await svc.scheduleFollowUp(
          { userId: id, subject: body.subject, note: body.note, dueAt: new Date(body.dueAt), assigneeId: body.assigneeId, visibleToCustomer: body.visibleToCustomer },
          staff.id
        );
        await audit.record({ actorId: staff.id, action: 'sales.followup.create', entity: 'FollowUp', entityId: followUp.id, ip: info.ip, userAgent: info.userAgent, meta: { customerId: id, visibleToCustomer: followUp.visibleToCustomer } });
        return NextResponse.json({ followUp }, { status: 201 });
      }

      const sample = await svc.assignSample(body.sampleId, body.assigneeId);
      await audit.record({ actorId: staff.id, action: 'sales.sample.assign', entity: 'SampleRequest', entityId: sample.id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ sample });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
