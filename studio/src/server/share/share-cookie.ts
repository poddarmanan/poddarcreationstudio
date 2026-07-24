import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Password-gate cookie for a shared catalogue (Phase 3 M17).
 *
 * Once a visitor enters the right passphrase we must not ask again on every navigation, and we
 * must not keep the passphrase anywhere. So we hand out a short-lived HMAC over the share id:
 * unforgeable without AUTH_SECRET, stateless, and it expires on its own. Same construction the
 * storage layer already uses for signed URLs.
 */

const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-insecure-secret';
}

export const shareCookieName = (shareId: string) => `pc_share_${shareId.slice(0, 12)}`;

export function issueShareTicket(shareId: string, now = Date.now()): string {
  const expiresAt = now + TTL_MS;
  const signature = createHmac('sha256', secret()).update(`${shareId}:${expiresAt}`).digest('base64url');
  return `${expiresAt}.${signature}`;
}

export function verifyShareTicket(shareId: string, ticket: string | undefined, now = Date.now()): boolean {
  if (!ticket) return false;
  const [expiresRaw, signature] = ticket.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !signature) return false;
  const expected = createHmac('sha256', secret()).update(`${shareId}:${expiresAt}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const SHARE_TICKET_MAX_AGE_SECONDS = TTL_MS / 1000;
