import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Revoke a share link, or email the catalogue to a few addresses (Phase 3 M17). */
const EmailInput = z.object({
  action: z.literal('email'),
  /** The raw token, supplied by the client that created the link — the server cannot recover it. */
  token: z.string().min(10).max(200),
  to: z.array(z.string().email().max(320)).min(1).max(10),
});

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/shares/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const { shareService, audit } = getContainer();
      await shareService.revoke(user.id, id);
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'collection.share.revoke', entity: 'CollectionShare', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

export async function POST(req: Request, ctx: RouteContext<'/api/portal/shares/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const body = await parseJson(req, EmailInput);
      const { shareService, audit } = getContainer();

      const result = await shareService.emailCatalogue(user.id, id, body.token, body.to, user.name ?? 'A Poddar customer');
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'collection.share.email', entity: 'CollectionShare', entityId: id, ip: info.ip, userAgent: info.userAgent, meta: { recipients: body.to.length, sent: result.sent } });
      return NextResponse.json(result);
    },
    { csrf: true, rateLimit: RATE_LIMITS.quote }
  );
}
