import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processUpload } from '@/lib/upload-pipeline';
import { mediaUrl } from '@/lib/storage';
import { run, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import { sniffMediaType, categoryOf } from '@/server/media/sniff';
import { getContainer } from '@/server/container';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

function canManage(role?: string) {
  return !!role && ['ADMIN', 'MANAGER'].includes(role);
}

/** Strip path components and unsafe chars from a client-supplied filename for safe storage/display. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'file';
}

export async function POST(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!canManage(session?.user?.role)) throw AppError.forbidden('Admin or manager role required');

    const form = await req.formData().catch(() => null);
    if (!form) throw AppError.validation('multipart/form-data required');

    const file = form.get('file');
    const fabricId = form.get('fabricId');
    const colourId = form.get('colourId');
    if (!(file instanceof File) || typeof fabricId !== 'string') {
      throw AppError.validation('file and fabricId are required');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Trust the file's real bytes, never the client-declared MIME type.
    const sniffed = sniffMediaType(buffer);
    if (!sniffed) throw AppError.unsupportedMediaType('Unsupported or unrecognized file type');
    const category = categoryOf(sniffed);

    const maxBytes = category === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (buffer.byteLength > maxBytes) {
      throw AppError.payloadTooLarge(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit for ${category.toLowerCase()}s`);
    }

    const fabric = await prisma.fabric.findUnique({ where: { id: fabricId } });
    if (!fabric) throw AppError.notFound('Unknown fabric');

    let resolvedColourId: string | null = null;
    if (typeof colourId === 'string' && colourId) {
      const colour = await prisma.colour.findFirst({ where: { id: colourId, fabricId } });
      if (!colour) throw AppError.notFound('Unknown colour for fabric');
      resolvedColourId = colour.id;
    }

    // Queue-backed processing (Priority 11): the original is retained under the job before
    // the pipeline runs, so a FAILED job can be retried without re-uploading the file.
    const { audit, telemetry, storage } = getContainer();
    const safeName = sanitizeFilename(file.name);
    const ext = (safeName.split('.').pop() || 'bin').toLowerCase();
    const job = await prisma.uploadJob.create({
      data: { fabricId, colourId: resolvedColourId, fileName: safeName, mimeType: sniffed, sizeBytes: buffer.byteLength, originalKey: '', status: 'PROCESSING', attempts: 1, actorId: session?.user?.id },
    });
    const originalKey = `uploads/jobs/${job.id}/original.${ext}`;
    await storage.put({ key: originalKey, body: buffer, contentType: sniffed });
    await prisma.uploadJob.update({ where: { id: job.id }, data: { originalKey } });

    let media;
    try {
      media = await processUpload({
        fabricId,
        colourId: resolvedColourId,
        originalName: safeName,
        mimeType: sniffed,
        buffer,
        type: category,
      });
    } catch (err) {
      await prisma.uploadJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 500) : 'Processing failed' },
      });
      telemetry.error(err, { where: 'upload.pipeline', jobId: job.id });
      throw AppError.internal('Upload processing failed — it has been queued for retry');
    }
    await prisma.uploadJob.update({ where: { id: job.id }, data: { status: 'DONE', mediaId: media.id } });

    const info = clientInfo(req);
    await audit.record({ actorId: session?.user?.id, action: 'media.upload', entity: 'Media', entityId: media.id, ip: info.ip, userAgent: info.userAgent, meta: { fabricId, type: media.type, bytes: buffer.byteLength, jobId: job.id } });
    telemetry.capture({ name: 'media.uploaded', actorId: session?.user?.id, props: { fabricId, type: media.type } });

    return NextResponse.json(
      {
        media: {
          ...media,
          thumbUrl: mediaUrl(media.thumbPath),
          webpUrl: mediaUrl(media.webpPath),
          avifUrl: mediaUrl(media.avifPath),
          originalUrl: mediaUrl(media.storagePath),
        },
      },
      { status: 201 }
    );
  }, { csrf: true, rateLimit: RATE_LIMITS.upload });
}

export async function GET(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!canManage(session?.user?.role) && session?.user?.role !== 'SALES') {
      throw AppError.forbidden('Staff role required');
    }
    const [media, colourCount, mediaCount, quoteCount, fabricCount] = await Promise.all([
      prisma.media.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { fabric: true, colour: true },
      }),
      prisma.colour.count(),
      prisma.media.count(),
      prisma.quote.count(),
      prisma.fabric.count(),
    ]);
    return NextResponse.json({
      stats: { colours: colourCount, media: mediaCount, quotes: quoteCount, fabrics: fabricCount },
      media: media.map((m) => ({
        ...m,
        thumbUrl: mediaUrl(m.thumbPath),
        webpUrl: mediaUrl(m.webpPath),
        avifUrl: mediaUrl(m.avifPath),
        originalUrl: mediaUrl(m.storagePath),
      })),
    });
  });
}
