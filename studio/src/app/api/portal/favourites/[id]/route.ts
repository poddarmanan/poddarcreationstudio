import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/favourites/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      await getContainer().dealerService.removeFavourite(user.id, id);
      return NextResponse.json({ ok: true });
    },
    { csrf: true }
  );
}
