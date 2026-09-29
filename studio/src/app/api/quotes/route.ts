import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { requireStaff } from '@/server/core/rbac';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import type { QuoteStatus } from '@/generated/prisma/enums';

const QuoteInput = z.object({
  // A signed-in buyer's name, company and WhatsApp come from their account when left out.
  name: z.string().min(1).max(200).optional(),
  company: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).nullish(),
  // A phone number with its country code: digits, spaces, dashes, an optional leading +.
  whatsapp: z.string().trim().regex(/^\+?[\d\s-]{8,24}$/).nullish(),
  quantity: z.string().min(1).max(200),
  subject: z.string().min(1).max(1000),
  moq: z.string().max(120).nullish(),
  expectedQty: z.string().max(120).nullish(),
  country: z.string().max(120).nullish(),
  shippingMethod: z.string().max(120).nullish(),
  // A fabric order's delivery address, written out, and the chosen payment method.
  shipTo: z.string().max(1000).nullish(),
  paymentMethod: z.string().max(120).nullish(),
  // A payment made online with Razorpay, to be verified against the items before it is recorded.
  razorpay: z.object({ orderId: z.string().min(1).max(100), paymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200) }).nullish(),
  timeline: z.string().max(120).nullish(),
  message: z.string().max(2000).nullish(),
  // A direct fabric order gives the metres for each shade; a swatch book or a quote request does not.
  items: z.array(z.object({ fabricId: z.string(), colourId: z.string(), quantity: z.number().positive().max(1_000_000).optional(), unit: z.enum(['m', 'kg']).optional() })).max(300).default([]),
});

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const data = await parseJson(req, QuoteInput);
      const session = await auth();
      const { quoteService, audit, customerService, paymentService } = getContainer();
      // Paid online: the payment must check out against exactly these items before anything is recorded.
      const paid = data.razorpay
        ? await paymentService.confirm(
            data.items.map((i) => ({ fabricId: i.fabricId, colourId: i.colourId, metres: i.quantity ?? 0 })),
            data.razorpay
          )
        : null;

      const account = session?.user?.id ? await customerService.account(session.user.id) : null;
      const contact = account?.contacts.find((c) => c.whatsapp || c.phone);
      const name = data.name ?? account?.user.name ?? null;
      const company = data.company ?? account?.profile?.company ?? account?.user.company ?? name;
      if (!name || !company) throw AppError.validation('Name and company are required');
      const whatsapp = data.whatsapp ?? account?.profile?.whatsapp ?? account?.profile?.contactPhone ?? contact?.whatsapp ?? contact?.phone ?? null;

      const quote = await quoteService.create({
        userId: session?.user?.id ?? null,
        name,
        company,
        // A WhatsApp-only account's reserved address can never receive mail.
        email: data.email ?? (session?.user?.email?.endsWith('.invalid') ? null : session?.user?.email) ?? null,
        whatsapp,
        quantity: data.quantity,
        subject: data.subject,
        moq: data.moq,
        expectedQty: data.expectedQty,
        country: data.country,
        shippingMethod: data.shippingMethod,
        shipTo: data.shipTo,
        paymentMethod: data.paymentMethod,
        ...(paid ?? {}),
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
    const staff = await requireStaff();

    const url = new URL(req.url);
    const status = (url.searchParams.get('status') as QuoteStatus | null) ?? undefined;
    const mine = url.searchParams.get('mine') === '1';
    const quotes = await getContainer().quoteService.list({ status, assigneeId: mine ? staff.id : undefined });
    return NextResponse.json({ quotes });
  });
}
