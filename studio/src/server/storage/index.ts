import type { StorageProvider } from './provider';
import { LocalStorageProvider } from './local';
import { R2StorageProvider } from './r2';
import { type Cdn, PassthroughCdn, CloudflareImagesCdn } from './cdn';

export type { StorageProvider, PutObjectInput, StoredObject, SignedUpload } from './provider';
export type { Cdn, ImageTransform } from './cdn';
export { RESPONSIVE_WIDTHS } from './cdn';

/**
 * Selects the storage driver from `STORAGE_DRIVER` (default: local). R2 requires its
 * credentials; if they're missing we fail loudly rather than silently falling back, so a
 * misconfigured production deploy is caught immediately.
 */
export function createStorage(): StorageProvider {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'r2' || driver === 's3') {
    const accountId = process.env.R2_ACCOUNT_ID ?? '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
    const bucket = process.env.R2_BUCKET ?? '';
    if (!accessKeyId || !secretAccessKey || !bucket || (!accountId && !process.env.R2_ENDPOINT)) {
      throw new Error(
        'STORAGE_DRIVER=r2 requires R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_ACCOUNT_ID (or R2_ENDPOINT)'
      );
    }
    return new R2StorageProvider({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint: process.env.R2_ENDPOINT,
      publicBase: process.env.R2_PUBLIC_BASE,
    });
  }
  return new LocalStorageProvider();
}

/** Selects the CDN strategy. Cloudflare Images when CDN_IMAGE_BASE is set, else passthrough. */
export function createCdn(storage: StorageProvider): Cdn {
  const base = process.env.CDN_IMAGE_BASE;
  if (base) return new CloudflareImagesCdn(base);
  return new PassthroughCdn(storage);
}
