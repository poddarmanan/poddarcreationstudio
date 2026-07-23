import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processUpload } from '@/lib/upload-pipeline';
import { mediaUrl } from '@/lib/storage';
import { run, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { getContainer } from '@/server/container';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function canManage(role?: string) {
  return !!role && ['ADMIN', 'MANAGER'].includes(role);
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
    if (file.size > MAX_FILE_BYTES) throw AppError.payloadTooLarge('File exceeds 50 MB limit');

    const isImage = IMAGE_TYPES.has(file.type);
    const isVideo = VIDEO_TYPES.has(file.type);
    if (!isImage && !isVideo) throw AppError.unsupportedMediaType(`Unsupported file type: ${file.type || 'unknown'}`);

    const fabric = await prisma.fabric.findUnique({ where: { id: fabricId } });
    if (!fabric) throw AppError.notFound('Unknown fabric');

    let resolvedColourId: string | null = null;
    if (typeof colourId === 'string' && colourId) {
      const colour = await prisma.colour.findFirst({ where: { id: colourId, fabricId } });
      if (!colour) throw AppError.notFound('Unknown colour for fabric');
      resolvedColourId = colour.id;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const media = await processUpload({
      fabricId,
      colourId: resolvedColourId,
      originalName: file.name,
      mimeType: file.type,
      buffer,
      type: isVideo ? 'VIDEO' : 'IMAGE',
    });

    const info = clientInfo(req);
    const { audit, telemetry } = getContainer();
    await audit.record({ actorId: session?.user?.id, action: 'media.upload', entity: 'Media', entityId: media.id, ip: info.ip, userAgent: info.userAgent, meta: { fabricId, type: media.type, bytes: buffer.byteLength } });
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
  });
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
