import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * A customer's view of one quotation (Phase 3 M15): progress, timeline, pricing — and the
 * two decisions they are allowed to make. Internal sales notes never appear here.
 */
const Decision = z.object({
  action: z.enum(['accept', 'reject', 'submit']),
  note: z.string().max(2000).optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/portal/quotes/[id]'>) {
  return run(req, async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const quote = await getContainer().quoteService.forCustomer(id, user.id);
    return NextResponse.json({ quote });
  });
}

export async function POST(req: Request, ctx: RouteContext<'/api/portal/quotes/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const body = await parseJson(req, Decision);
      const { quoteService: svc, audit } = getContainer();

      if (body.action === 'submit') await svc.submit(id, user.id);
      else await svc.decide(id, user.id, body.action === 'accept' ? 'ACCEPTED' : 'REJECTED', body.note);

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: `quote.customer.${body.action}`, entity: 'Quote', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ quote: await svc.forCustomer(id, user.id) });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
