import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Saved collections (Phase 3 M13). `fromSwatchBook` keeps the Phase 2 shortcut working. */
const Input = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  fromSwatchBook: z.boolean().optional(),
  /** Copy an existing board instead of starting empty. */
  duplicateOf: z.string().max(64).optional(),
});

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const collections = await getContainer().collectionService.list(user.id);
    return NextResponse.json({ collections });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { name, description, fromSwatchBook, duplicateOf } = await parseJson(req, Input);
      const { collectionService: svc, audit } = getContainer();

      const collection = duplicateOf
        ? await svc.duplicate(user.id, duplicateOf, name)
        : fromSwatchBook
          ? await svc.fromSwatchBook(user.id, name)
          : await svc.create(user.id, name, description);

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'collection.create', entity: 'Collection', entityId: collection.id, ip: info.ip, userAgent: info.userAgent, meta: { fromSwatchBook: !!fromSwatchBook, duplicateOf } });
      return NextResponse.json({ collection }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
