import { getContainer } from '@/server/container';

/**
 * Public URL for a stored object key, resolved through the active storage/CDN provider
 * (local media route, R2 public base, or CDN). Returns null for absent keys. Kept as a
 * small helper because the uploads route builds several of these per response.
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return getContainer().storage.publicUrl(key);
}
