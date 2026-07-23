import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { run, parseJson } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const PinInput = z.object({ fabricId: z.string(), colourId: z.string() });

export async function GET(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ items: [] });
    const items = await prisma.swatchBookItem.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
      include: { colour: true },
    });
    return NextResponse.json({ items });
  });
}

export async function POST(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user) throw AppError.unauthorized('Sign in to build a swatch book');
    const data = await parseJson(req, PinInput);

    const colour = await prisma.colour.findFirst({
      where: { id: data.colourId, fabricId: data.fabricId },
    });
    if (!colour) throw AppError.notFound('Unknown shade');

    const item = await prisma.swatchBookItem.upsert({
      where: {
        userId_fabricId_colourId: {
          userId: session.user.id,
          fabricId: data.fabricId,
          colourId: data.colourId,
        },
      },
      create: { userId: session.user.id, fabricId: data.fabricId, colourId: data.colourId },
      update: {},
      include: { colour: true },
    });
    return NextResponse.json({ item }, { status: 201 });
  }, { csrf: true, rateLimit: RATE_LIMITS.write });
}
