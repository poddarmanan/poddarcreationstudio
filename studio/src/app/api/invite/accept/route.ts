import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

const Input = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

/** POST /api/invite/accept — consume an INVITE token and create the account (pre-verified). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { token, name, password } = await parseJson(req, Input);
      const { tokenService, audit } = getContainer();
      const consumed = await tokenService.consume('INVITE', token);

      if (await prisma.user.findUnique({ where: { email: consumed.email } })) {
        throw AppError.conflict('An account with this email already exists');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          name,
          email: consumed.email,
          passwordHash,
          role: consumed.role ?? 'VIEWER',
          approved: true,
          emailVerifiedAt: new Date(),
        },
      });

      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'user.invite_accept', entity: 'User', entityId: user.id, ip: info.ip, userAgent: info.userAgent, meta: { role: user.role } });
      return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
    },
    { csrf: true }
  );
}
