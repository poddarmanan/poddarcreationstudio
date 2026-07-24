import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const Input = z.object({ email: z.string().email().max(320) });

/** POST /api/password/forgot — issue a reset token + email. Always 200 (no account enumeration). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { email } = await parseJson(req, Input);
      const normalized = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalized } });
      if (user) {
        const { tokenService, emailService, telemetry } = getContainer();
        try {
          const raw = await tokenService.issue({ type: 'PASSWORD_RESET', email: normalized, userId: user.id, ttlMs: 60 * 60 * 1000 });
          await emailService.sendPasswordReset(normalized, user.name, raw);
        } catch (err) {
          telemetry.error(err, { where: 'password.forgot' });
        }
      }
      // Uniform response regardless of whether the account exists.
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.register }
  );
}
