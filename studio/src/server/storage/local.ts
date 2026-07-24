import { mkdir, writeFile, readFile, unlink, rm, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { StorageProvider, PutObjectInput, StoredObject, SignedUpload } from './provider';
import { signKey } from './signing';

/**
 * Local-disk storage driver (default in dev; keeps the app fully runnable with no cloud
 * credentials, per Priority 1's "local development compatibility"). Objects live under
 * STORAGE_DIR; public URLs and signed URLs are served by the app's /api/media route.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;
  private readonly base: string;

  constructor() {
    this.root = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');
    // Public origin for building absolute-ish media URLs; relative works for same-origin.
    this.base = process.env.MEDIA_PUBLIC_BASE ?? '';
  }

  private abs(key: string): string {
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('Storage key escapes root');
    }
    return resolved;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const abs = this.abs(input.key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, input.body);
    const etag = createHash('md5').update(input.body).digest('hex');
    return { key: input.key, size: input.body.byteLength, etag, contentType: input.contentType };
  }

  async get(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
    try {
      const body = await readFile(this.abs(key));
      return { body };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.abs(key));
    } catch {
      /* already gone */
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    try {
      await rm(this.abs(prefix), { recursive: true, force: true });
    } catch {
      /* nothing to remove */
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const dir = this.abs(prefix);
    const out: StoredObject[] = [];
    const walk = async (rel: string) => {
      let entries;
      try {
        entries = await readdir(path.join(this.root, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const childRel = path.join(rel, e.name);
        if (e.isDirectory()) await walk(childRel);
        else {
          const s = await stat(path.join(this.root, childRel));
          out.push({ key: childRel.split(path.sep).join('/'), size: s.size });
        }
      }
    };
    await walk(path.relative(this.root, dir) || '');
    return out;
  }

  publicUrl(key: string): string {
    return `${this.base}/api/media/${key.split(path.sep).join('/')}`;
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const exp = Date.now() + expiresInSeconds * 1000;
    const sig = signKey(key, exp);
    const enc = key.split('/').map(encodeURIComponent).join('/');
    return `${this.base}/api/media/${enc}?exp=${exp}&sig=${sig}`;
  }

  async getSignedUploadUrl(): Promise<SignedUpload> {
    // Local dev has no presigned PUT target; the app's multipart /api/uploads endpoint
    // handles the write directly. Flagged `direct` so callers use the normal upload flow.
    return { url: '/api/uploads', method: 'POST', direct: true };
  }
}
