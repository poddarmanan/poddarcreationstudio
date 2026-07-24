import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const AddItem = z.object({ fabricId: z.string(), colourId: z.string(), note: z.string().max(500).nullish() });

/** POST adds an item to the collection; DELETE removes the whole collection. */
export async function POST(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const { fabricId, colourId, note } = await parseJson(req, AddItem);
      const item = await getContainer().dealerService.addToCollection(user.id, id, fabricId, colourId, note ?? null);
      return NextResponse.json({ item }, { status: 201 });
    },
    { csrf: true }
  );
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const itemId = new URL(req.url).searchParams.get('itemId');
      const svc = getContainer().dealerService;
      if (itemId) await svc.removeCollectionItem(user.id, id, itemId);
      else await svc.deleteCollection(user.id, id);
      return NextResponse.json({ ok: true });
    },
    { csrf: true }
  );
}
