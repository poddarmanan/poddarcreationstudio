import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

const QuoteInput = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  quantity: z.string().min(1).max(200),
  subject: z.string().min(1).max(1000),
  items: z
    .array(z.object({ fabricId: z.string(), colourId: z.string() }))
    .max(100)
    .default([]),
});

export async function POST(req: Request) {
  return run(req, async () => {
    const data = await parseJson(req, QuoteInput);
    const session = await auth();
    const { telemetry, audit } = getContainer();

    const quote = await prisma.quote.create({
      data: {
        userId: session?.user?.id ?? null,
        name: data.name,
        company: data.company,
        quantity: data.quantity,
        subject: data.subject,
        items: { create: data.items },
      },
      include: { items: true },
    });

    const info = clientInfo(req);
    await audit.record({ actorId: session?.user?.id, action: 'quote.create', entity: 'Quote', entityId: quote.id, ip: info.ip, userAgent: info.userAgent, meta: { items: data.items.length } });
    telemetry.capture({ name: 'quote.requested', actorId: session?.user?.id, props: { items: data.items.length } });

    return NextResponse.json({ quote }, { status: 201 });
  });
}

export async function GET(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user || !['ADMIN', 'MANAGER', 'SALES'].includes(session.user.role)) {
      throw AppError.forbidden();
    }
    const quotes = await prisma.quote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: { include: { fabric: true, colour: true } } },
    });
    return NextResponse.json({ quotes });
  });
}
