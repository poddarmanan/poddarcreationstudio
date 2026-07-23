import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const PinInput = z.object({ fabricId: z.string(), colourId: z.string() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ items: [] });
  const items = await prisma.swatchBookItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    include: { colour: true },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Sign in to build a swatch book' }, { status: 401 });
  const parsed = PinInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid pin' }, { status: 400 });

  const colour = await prisma.colour.findFirst({
    where: { id: parsed.data.colourId, fabricId: parsed.data.fabricId },
  });
  if (!colour) return NextResponse.json({ error: 'Unknown shade' }, { status: 404 });

  const item = await prisma.swatchBookItem.upsert({
    where: {
      userId_fabricId_colourId: {
        userId: session.user.id,
        fabricId: parsed.data.fabricId,
        colourId: parsed.data.colourId,
      },
    },
    create: { userId: session.user.id, fabricId: parsed.data.fabricId, colourId: parsed.data.colourId },
    update: {},
    include: { colour: true },
  });
  return NextResponse.json({ item }, { status: 201 });
}
