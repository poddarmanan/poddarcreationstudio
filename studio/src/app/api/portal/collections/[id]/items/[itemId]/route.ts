import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Per-item edits inside a collection (Phase 3 M13): note, indicative quantity, position. */
const Patch = z.object({
  note: z.string().max(500).nullish(),
  quantity: z.number().min(0).max(1_000_000).nullish(),
  unit: z.string().max(12).nullish(),
  position: z.number().int().min(0).max(10_000).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<'/api/portal/collections/[id]/items/[itemId]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id, itemId } = await ctx.params;
      const patch = await parseJson(req, Patch);
      const item = await getContainer().collectionService.updateItem(user.id, id, itemId, patch);
      return NextResponse.json({ item });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/collections/[id]/items/[itemId]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id, itemId } = await ctx.params;
      await getContainer().collectionService.removeItem(user.id, id, itemId);
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
