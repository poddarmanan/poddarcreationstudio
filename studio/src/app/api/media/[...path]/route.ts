import { NextResponse } from 'next/server';
import { getContainer } from '@/server/container';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { verifyKeySignature } from '@/server/storage/signing';

const MIME: Record<string, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/**
 * Serves stored objects through the active storage provider (driver-agnostic). Public
 * assets under fabrics/ are served openly with a long immutable cache; anything under
 * private/ requires a valid signed URL (exp + HMAC sig), matching the R2 private-bucket model.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/media/[...path]'>) {
  return run(req, async () => {
    const { path: segments } = await ctx.params;
    const key = segments.map((s) => decodeURIComponent(s)).join('/');
    if (key.includes('..')) throw AppError.validation('Invalid path');

    if (key.startsWith('private/')) {
      const url = new URL(req.url);
      const exp = Number(url.searchParams.get('exp'));
      const sig = url.searchParams.get('sig') ?? '';
      if (!verifyKeySignature(key, exp, sig)) throw AppError.forbidden('This link has expired or is invalid');
    }

    const obj = await getContainer().storage.get(key);
    if (!obj) throw AppError.notFound();

    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    return new NextResponse(new Uint8Array(obj.body), {
      headers: {
        'Content-Type': obj.contentType ?? MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  });
}
