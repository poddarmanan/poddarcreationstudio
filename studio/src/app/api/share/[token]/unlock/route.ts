import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import { issueShareTicket, shareCookieName, SHARE_TICKET_MAX_AGE_SECONDS } from '@/server/share/share-cookie';

const Input = z.object({ password: z.string().min(1).max(200) });

/**
 * Exchange a passphrase for a short-lived ticket cookie (Phase 3 M17), so a visitor is asked
 * once rather than on every navigation — and the passphrase is never stored anywhere.
 * Rate-limited with the auth policy, since this is a password check on a public endpoint.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/share/[token]/unlock'>) {
  return run(
    req,
    async () => {
      const { token } = await ctx.params;
      const { password } = await parseJson(req, Input);
      const result = await getContainer().shareService.resolve(token, password);

      if (!result.ok) {
        // One message for every failure: a wrong password must not reveal whether the link
        // exists, has expired, or was revoked.
        throw AppError.validation('That passphrase does not open this catalogue');
      }

      const res = NextResponse.json({ ok: true });
      res.cookies.set(shareCookieName(result.share.id), issueShareTicket(result.share.id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SHARE_TICKET_MAX_AGE_SECONDS,
      });
      return res;
    },
    { csrf: true, rateLimit: RATE_LIMITS.auth }
  );
}
