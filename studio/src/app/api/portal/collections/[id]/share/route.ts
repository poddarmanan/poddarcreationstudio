import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * Share links for a collection (Phase 3 M17). Creating one returns the raw token **once** —
 * only its hash is stored, so the link can never be read back out of the database.
 */
const CreateShare = z.object({
  title: z.string().max(200).nullish(),
  message: z.string().max(2000).nullish(),
  password: z.string().min(4).max(200).nullish(),
  expiresAt: z.string().datetime().nullish(),
  allowDownload: z.boolean().optional(),
});

export async function GET(req: Request, ctx: RouteContext<'/api/portal/collections/[id]/share'>) {
  return run(req, async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const shares = await getContainer().shareService.list(user.id, id);
    return NextResponse.json({ shares });
  });
}

export async function POST(req: Request, ctx: RouteContext<'/api/portal/collections/[id]/share'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const input = await parseJson(req, CreateShare);
      const { shareService, audit } = getContainer();

      const { share, url, token } = await shareService.create(user.id, id, {
        title: input.title,
        message: input.message,
        password: input.password,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        allowDownload: input.allowDownload,
      });

      const info = clientInfo(req);
      await audit.record({
        actorId: user.id,
        action: 'collection.share.create',
        entity: 'CollectionShare',
        entityId: share.id,
        ip: info.ip,
        userAgent: info.userAgent,
        // The token itself is never audited — an audit reader must not gain access.
        meta: { collectionId: id, password: !!input.password, expiresAt: input.expiresAt ?? null },
      });

      return NextResponse.json(
        {
          share: { id: share.id, title: share.title, allowDownload: share.allowDownload, expiresAt: share.expiresAt, hasPassword: !!input.password },
          url,
          token,
          qr: await shareService.qrDataUrl(url),
        },
        { status: 201 }
      );
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
