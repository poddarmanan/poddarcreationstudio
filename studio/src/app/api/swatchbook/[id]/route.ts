import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(_req: Request, ctx: RouteContext<'/api/swatchbook/[id]'>) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.swatchBookItem.findUnique({ where: { id } });
  if (!item || item.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.swatchBookItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
