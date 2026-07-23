import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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
  const body = await req.json().catch(() => null);
  const parsed = QuoteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid quote request' }, { status: 400 });
  }
  const session = await auth();

  const quote = await prisma.quote.create({
    data: {
      userId: session?.user?.id ?? null,
      name: parsed.data.name,
      company: parsed.data.company,
      quantity: parsed.data.quantity,
      subject: parsed.data.subject,
      items: { create: parsed.data.items },
    },
    include: { items: true },
  });
  return NextResponse.json({ quote }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'MANAGER', 'SALES'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { items: { include: { fabric: true, colour: true } } },
  });
  return NextResponse.json({ quotes });
}
