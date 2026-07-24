import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * Account security actions (Phase 3 M12): password change and verification resend. Kept off
 * the profile route so the sensitive operations carry their own tighter rate limit.
 */
const Action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('changePassword'),
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  }),
  z.object({ action: z.literal('resendVerification') }),
]);

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const account = await getContainer().customerService.account(user.id);
    return NextResponse.json(account);
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const body = await parseJson(req, Action);
      const { customerService, audit } = getContainer();
      const info = clientInfo(req);

      if (body.action === 'changePassword') {
        await customerService.changePassword(user.id, body.currentPassword, body.newPassword);
        await audit.record({ actorId: user.id, action: 'customer.password.change', entity: 'User', entityId: user.id, ip: info.ip, userAgent: info.userAgent });
        return NextResponse.json({ ok: true, message: 'Password updated' });
      }

      const { sent } = await customerService.resendVerification(user.id);
      if (!sent) throw AppError.validation('This email address is already verified');
      await audit.record({ actorId: user.id, action: 'customer.verification.resend', entity: 'User', entityId: user.id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ ok: true, message: 'Verification email sent' });
    },
    { csrf: true, rateLimit: RATE_LIMITS.auth }
  );
}
