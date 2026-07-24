import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';

const Input = z.object({ token: z.string().min(10) });

/** POST /api/verify-email — consume an EMAIL_VERIFICATION token and mark the email verified. */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { token } = await parseJson(req, Input);
      const { tokenService } = getContainer();
      const consumed = await tokenService.consume('EMAIL_VERIFICATION', token);
      if (consumed.userId) {
        await prisma.user.update({ where: { id: consumed.userId }, data: { emailVerifiedAt: new Date() } });
      } else {
        await prisma.user.updateMany({ where: { email: consumed.email }, data: { emailVerifiedAt: new Date() } });
      }
      return NextResponse.json({ ok: true, email: consumed.email });
    },
    { csrf: true }
  );
}
