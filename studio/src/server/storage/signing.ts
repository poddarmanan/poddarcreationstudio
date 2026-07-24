import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC signing for the LocalDriver's signed download URLs, so the "signed URL" abstraction
 * behaves consistently in local dev (R2 uses real presigned URLs). Keyed off AUTH_SECRET.
 */
function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-insecure-secret';
}

export function signKey(key: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`${key}:${expiresAt}`).digest('base64url');
}

export function verifyKeySignature(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signKey(key, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
