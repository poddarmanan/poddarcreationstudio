import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');

export function storageRoot() {
  return ROOT;
}

export async function saveBuffer(relPath: string, data: Buffer): Promise<string> {
  const abs = path.join(ROOT, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

/** Public URL for a file stored under STORAGE_DIR, served by the /api/media/[...path] route. */
export function mediaUrl(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  return `/api/media/${relPath.split(path.sep).join('/')}`;
}
