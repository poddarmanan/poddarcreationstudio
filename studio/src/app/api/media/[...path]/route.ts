import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { storageRoot } from '@/lib/storage';

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

export async function GET(_req: Request, ctx: RouteContext<'/api/media/[...path]'>) {
  const { path: segments } = await ctx.params;
  const root = storageRoot();
  const abs = path.resolve(root, ...segments);
  if (!abs.startsWith(root + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  try {
    const data = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
