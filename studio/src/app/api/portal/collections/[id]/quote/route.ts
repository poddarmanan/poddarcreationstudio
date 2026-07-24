import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * Send a collection to sales as a quotation request (Phase 3 M13). The board's notes and
 * quantities travel with it, so the desk receives the customer's intent, not a bare list.
 */
const Input = z.object({
  company: z.string().max(200).optional(),
  email: z.string().email().max(320).nullish(),
  message: z.string().max(4000).nullish(),
  timeline: z.string().max(120).nullish(),
  country: z.string().max(120).nullish(),
});

export async function POST(req: Request, ctx: RouteContext<'/api/portal/collections/[id]/quote'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const input = await parseJson(req, Input);
      const { collectionService, dealerService, audit } = getContainer();

      const profile = await dealerService.getProfile(user.id);
      const quote = await collectionService.requestQuote(user.id, id, {
        name: user.name ?? 'Customer',
        company: input.company || profile?.company || user.name || 'Customer',
        email: input.email ?? user.email ?? null,
        message: input.message,
        timeline: input.timeline,
        country: input.country ?? profile?.shippingCountry ?? null,
      });

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'collection.quote.request', entity: 'Quote', entityId: quote.id, ip: info.ip, userAgent: info.userAgent, meta: { collectionId: id } });
      return NextResponse.json({ quote }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.quote }
  );
}
