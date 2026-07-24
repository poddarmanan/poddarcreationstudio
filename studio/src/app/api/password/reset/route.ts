import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

const Input = z.object({ token: z.string().min(10), password: z.string().min(8).max(200) });

/** POST /api/password/reset — consume a PASSWORD_RESET token and set a new password. */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { token, password } = await parseJson(req, Input);
      const { tokenService, audit } = getContainer();
      const consumed = await tokenService.consume('PASSWORD_RESET', token);

      const user = consumed.userId
        ? await prisma.user.findUnique({ where: { id: consumed.userId } })
        : await prisma.user.findUnique({ where: { email: consumed.email } });
      if (!user) throw AppError.validation('This link is no longer valid');

      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'user.password_reset', entity: 'User', entityId: user.id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ ok: true });
    },
    { csrf: true }
  );
}
