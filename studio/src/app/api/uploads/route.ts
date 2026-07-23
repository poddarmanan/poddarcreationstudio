import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processUpload } from '@/lib/upload-pipeline';
import { mediaUrl } from '@/lib/storage';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function canManage(role?: string) {
  return !!role && ['ADMIN', 'MANAGER'].includes(role);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!canManage(session?.user?.role)) {
    return NextResponse.json({ error: 'Admin or manager role required' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });

  const file = form.get('file');
  const fabricId = form.get('fabricId');
  const colourId = form.get('colourId');
  if (!(file instanceof File) || typeof fabricId !== 'string') {
    return NextResponse.json({ error: 'file and fabricId are required' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 });
  }

  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || 'unknown'}` }, { status: 415 });
  }

  const fabric = await prisma.fabric.findUnique({ where: { id: fabricId } });
  if (!fabric) return NextResponse.json({ error: 'Unknown fabric' }, { status: 404 });

  let resolvedColourId: string | null = null;
  if (typeof colourId === 'string' && colourId) {
    const colour = await prisma.colour.findFirst({ where: { id: colourId, fabricId } });
    if (!colour) return NextResponse.json({ error: 'Unknown colour for fabric' }, { status: 404 });
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
}

export async function GET() {
  const session = await auth();
  if (!canManage(session?.user?.role) && session?.user?.role !== 'SALES') {
    return NextResponse.json({ error: 'Staff role required' }, { status: 403 });
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
}
