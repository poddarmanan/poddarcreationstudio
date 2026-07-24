import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { requireStaff } from '@/server/core/rbac';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import { normalizeQuoteStatus } from '@/server/quote/quote.service';

/**
 * Staff quote desk (Priority 7; lifecycle expanded in Phase 3 M15). The status union accepts
 * the Phase 2 names as aliases so an older client keeps working after the rename.
 */
const LIFECYCLE = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
const LEGACY = ['NEW', 'ASSIGNED', 'QUOTED', 'WON', 'LOST'] as const;

const Patch = z.object({
  action: z.enum(['assign', 'status', 'note', 'price']),
  assigneeId: z.string().max(64).optional(),
  status: z.enum([...LIFECYCLE, ...LEGACY]).optional(),
  note: z.string().max(2000).optional(),
  // Pricing (M15). Money in minor units so nothing is lost to float rounding.
  currency: z.string().length(3).optional(),
  totalValue: z.number().int().min(0).max(2_000_000_000).nullish(),
  priceNote: z.string().max(2000).nullish(),
  validUntil: z.string().datetime().nullish(),
  items: z
    .array(
      z.object({
        id: z.string().max(64),
        quantity: z.number().min(0).max(1_000_000).nullish(),
        unit: z.string().max(12).nullish(),
        unitPrice: z.number().int().min(0).max(2_000_000_000).nullish(),
        note: z.string().max(500).nullish(),
      })
    )
    .max(200)
    .optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/quotes/[id]'>) {
  return run(req, async () => {
    await requireStaff();
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
      const user = await requireStaff();
      const { id } = await ctx.params;
      const body = await parseJson(req, Patch);
      const { quoteService: svc, audit } = getContainer();

      if (body.action === 'assign') {
        if (!body.assigneeId) throw AppError.validation('assigneeId is required');
        await svc.assign(id, body.assigneeId, user.id);
      } else if (body.action === 'status') {
        if (!body.status) throw AppError.validation('status is required');
        await svc.updateStatus(id, normalizeQuoteStatus(body.status), user.id, body.note);
      } else if (body.action === 'price') {
        await svc.setPricing(
          id,
          {
            currency: body.currency,
            totalValue: body.totalValue,
            priceNote: body.priceNote,
            validUntil: body.validUntil === undefined ? undefined : body.validUntil === null ? null : new Date(body.validUntil),
            items: body.items,
          },
          user.id
        );
      } else {
        if (!body.note) throw AppError.validation('note is required');
        await svc.addNote(id, body.note, user.id);
      }

      const info = clientInfo(req);
      await audit.record({
        actorId: user.id,
        action: `quote.${body.action}`,
        entity: 'Quote',
        entityId: id,
        ip: info.ip,
        userAgent: info.userAgent,
        meta: { status: body.status && normalizeQuoteStatus(body.status), totalValue: body.totalValue ?? undefined },
      });
      return NextResponse.json({ quote: await svc.get(id) });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
