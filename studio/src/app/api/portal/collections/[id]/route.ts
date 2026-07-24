import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const AddItem = z.object({
  fabricId: z.string().min(1).max(64),
  colourId: z.string().min(1).max(64),
  note: z.string().max(500).nullish(),
  quantity: z.number().min(0).max(1_000_000).nullish(),
  unit: z.string().max(12).nullish(),
});

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullish(),
  coverItemId: z.string().max(64).nullish(),
  /** Every item id, in the order they should appear. */
  order: z.array(z.string().max(64)).max(500).optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(req, async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const collection = await getContainer().collectionService.get(user.id, id);
    return NextResponse.json({ collection });
  });
}

/** Rename, re-describe, set a cover, or persist a reorder. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const { order, ...fields } = await parseJson(req, Patch);
      const { collectionService: svc, audit } = getContainer();

      if (order) await svc.reorder(user.id, id, order);
      const collection = Object.keys(fields).length ? await svc.update(user.id, id, fields) : await svc.get(user.id, id);

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'collection.update', entity: 'Collection', entityId: id, ip: info.ip, userAgent: info.userAgent, meta: { reordered: !!order } });
      return NextResponse.json({ collection });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

/** POST adds an item to the collection. */
export async function POST(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const input = await parseJson(req, AddItem);
      const item = await getContainer().collectionService.addItem(user.id, id, input);
      return NextResponse.json({ item }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

/** DELETE removes the whole collection, or a single item via ?itemId=. */
export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/collections/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const itemId = new URL(req.url).searchParams.get('itemId');
      const { collectionService: svc, audit } = getContainer();
      const info = clientInfo(req);

      if (itemId) {
        await svc.removeItem(user.id, id, itemId);
      } else {
        await svc.remove(user.id, id);
        await audit.record({ actorId: user.id, action: 'collection.delete', entity: 'Collection', entityId: id, ip: info.ip, userAgent: info.userAgent });
      }
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
