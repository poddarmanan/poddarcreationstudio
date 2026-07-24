import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import type { QuoteStatus } from '@/generated/prisma/enums';

const QuoteInput = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(320).nullish(),
  quantity: z.string().min(1).max(200),
  subject: z.string().min(1).max(1000),
  moq: z.string().max(120).nullish(),
  expectedQty: z.string().max(120).nullish(),
  country: z.string().max(120).nullish(),
  shippingMethod: z.string().max(120).nullish(),
  timeline: z.string().max(120).nullish(),
  message: z.string().max(2000).nullish(),
  items: z.array(z.object({ fabricId: z.string(), colourId: z.string() })).max(100).default([]),
});

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const data = await parseJson(req, QuoteInput);
      const session = await auth();
      const { quoteService, audit } = getContainer();

      const quote = await quoteService.create({
        userId: session?.user?.id ?? null,
        name: data.name,
        company: data.company,
        email: data.email ?? session?.user?.email ?? null,
        quantity: data.quantity,
        subject: data.subject,
        moq: data.moq,
        expectedQty: data.expectedQty,
        country: data.country,
        shippingMethod: data.shippingMethod,
        timeline: data.timeline,
        message: data.message,
        items: data.items,
      });

      const info = clientInfo(req);
      await audit.record({ actorId: session?.user?.id, action: 'quote.create', entity: 'Quote', entityId: quote.id, ip: info.ip, userAgent: info.userAgent, meta: { items: data.items.length } });
      return NextResponse.json({ quote }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.quote }
  );
}

export async function GET(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user || !['ADMIN', 'MANAGER', 'SALES'].includes(session.user.role)) throw AppError.forbidden();

    const url = new URL(req.url);
    const status = (url.searchParams.get('status') as QuoteStatus | null) ?? undefined;
    const mine = url.searchParams.get('mine') === '1';
    const quotes = await getContainer().quoteService.list({ status, assigneeId: mine ? session.user.id : undefined });
    return NextResponse.json({ quotes });
  });
}
