import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

const Input = z.object({
  email: z.string().email().max(320),
  role: z.enum(['MANAGER', 'SALES', 'VIEWER', 'BUYER']),
});

/** POST /api/invite — admin issues a workspace invite (INVITE token + email). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const session = await auth();
      if (session?.user?.role !== 'ADMIN') throw AppError.forbidden('Admin role required');

      const { email, role } = await parseJson(req, Input);
      const normalized = email.trim().toLowerCase();
      if (await prisma.user.findUnique({ where: { email: normalized } })) {
        throw AppError.conflict('An account with this email already exists');
      }

      const { tokenService, emailService, audit, telemetry } = getContainer();
      const raw = await tokenService.issue({ type: 'INVITE', email: normalized, role, invitedByName: session.user.name ?? 'The team', ttlMs: 7 * 24 * 60 * 60 * 1000 });
      try {
        await emailService.sendInvite(normalized, session.user.name ?? 'The team', role, raw);
      } catch (err) {
        telemetry.error(err, { where: 'invite.email' });
      }

      const info = clientInfo(req);
      await audit.record({ actorId: session.user.id, action: 'user.invite', entity: 'User', ip: info.ip, userAgent: info.userAgent, meta: { email: normalized, role } });
      return NextResponse.json({ ok: true }, { status: 201 });
    },
    { csrf: true }
  );
}
