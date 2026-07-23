import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { storageRoot } from '@/lib/storage';
import { run } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export async function GET(req: Request, ctx: RouteContext<'/api/media/[...path]'>) {
  return run(req, async () => {
    const { path: segments } = await ctx.params;
    const root = storageRoot();
    const abs = path.resolve(root, ...segments);
    if (!abs.startsWith(root + path.sep)) throw AppError.validation('Invalid path');
    let data: Buffer;
    try {
      data = await readFile(abs);
    } catch {
      throw AppError.notFound();
    }
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  });
}
