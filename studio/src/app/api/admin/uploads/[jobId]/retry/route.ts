import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { processUpload } from '@/lib/upload-pipeline';
import { run, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { requireRole } from '@/server/core/session';
import { sniffMediaType, categoryOf } from '@/server/media/sniff';

/** POST /api/admin/uploads/[jobId]/retry — re-run a FAILED upload from its retained original. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/uploads/[jobId]/retry'>) {
  return run(
    req,
    async () => {
      const user = await requireRole(['ADMIN', 'MANAGER']);
      const { jobId } = await ctx.params;

      const job = await prisma.uploadJob.findUnique({ where: { id: jobId } });
      if (!job) throw AppError.notFound('Upload job not found');
      if (job.status !== 'FAILED') throw AppError.validation('Only failed jobs can be retried');

      const { storage, audit } = getContainer();
      const original = await storage.get(job.originalKey);
      if (!original) throw AppError.notFound('The original file for this job is no longer available');

      const sniffed = sniffMediaType(original.body);
      if (!sniffed) throw AppError.unsupportedMediaType('Retained file is unreadable');

      await prisma.uploadJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', attempts: { increment: 1 }, error: null } });
      try {
        const media = await processUpload({
          fabricId: job.fabricId,
          colourId: job.colourId,
          originalName: job.fileName,
          mimeType: sniffed,
          buffer: original.body,
          type: categoryOf(sniffed),
        });
        await prisma.uploadJob.update({ where: { id: jobId }, data: { status: 'DONE', mediaId: media.id } });
        const info = clientInfo(req);
        await audit.record({ actorId: user.id, action: 'media.upload_retry', entity: 'Media', entityId: media.id, ip: info.ip, userAgent: info.userAgent, meta: { jobId } });
        return NextResponse.json({ ok: true, mediaId: media.id });
      } catch (err) {
        await prisma.uploadJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 500) : 'Processing failed' },
        });
        throw AppError.internal('Retry failed — the job remains queued');
      }
    },
    { csrf: true }
  );
}
