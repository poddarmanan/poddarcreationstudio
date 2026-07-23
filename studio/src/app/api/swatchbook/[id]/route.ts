import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

export async function DELETE(req: Request, ctx: RouteContext<'/api/swatchbook/[id]'>) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user) throw AppError.unauthorized();
    const { id } = await ctx.params;
    const item = await prisma.swatchBookItem.findUnique({ where: { id } });
    if (!item || item.userId !== session.user.id) throw AppError.notFound();
    await prisma.swatchBookItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }, { csrf: true });
}
