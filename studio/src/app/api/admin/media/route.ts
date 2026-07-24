import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { mediaUrl } from '@/lib/storage';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireRole } from '@/server/core/session';
import type { ContentStatus } from '@/generated/prisma/enums';

const STAFF = ['ADMIN', 'MANAGER'];

const BulkInput = z.object({
  action: z.enum(['edit', 'delete', 'restore', 'purge']),
  ids: z.array(z.string()).min(1).max(500),
  contentStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  colourId: z.string().nullish(),
});

export async function GET(req: Request) {
  return run(req, async () => {
    await requireRole([...STAFF, 'SALES']);
    const url = new URL(req.url);
    const { adminService } = getContainer();
    const { media, nextCursor } = await adminService.listMedia({
      fabricId: url.searchParams.get('fabricId') || undefined,
      contentStatus: (url.searchParams.get('status') as ContentStatus | null) || undefined,
      includeDeleted: url.searchParams.get('deleted') === '1',
      cursor: url.searchParams.get('cursor') || undefined,
      take: Number(url.searchParams.get('take')) || undefined,
    });
    return NextResponse.json({
      media: media.map((m) => ({ ...m, thumbUrl: mediaUrl(m.thumbPath) })),
      nextCursor,
    });
  });
}

/** POST performs a bulk action over the selected media ids (Priority 11). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireRole(STAFF);
      const body = await parseJson(req, BulkInput);
      const { adminService, audit } = getContainer();

      let count = 0;
      if (body.action === 'edit') count = await adminService.bulkEditMedia(body.ids, { contentStatus: body.contentStatus, colourId: body.colourId === undefined ? undefined : body.colourId });
      else if (body.action === 'delete') count = await adminService.bulkDeleteMedia(body.ids);
      else if (body.action === 'restore') count = await adminService.bulkRestoreMedia(body.ids);
      else count = await adminService.purgeMedia(body.ids);

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: `media.bulk_${body.action}`, entity: 'Media', ip: info.ip, userAgent: info.userAgent, meta: { count, status: body.contentStatus } });
      return NextResponse.json({ ok: true, count });
    },
    { csrf: true }
  );
}
