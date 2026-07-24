import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getContainer } from '@/server/container';
import { run, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';

/** POST /api/admin/users/[id]/approve — approve a buyer (unlocks pricing) + notify them. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/users/[id]/approve'>) {
  return run(
    req,
    async () => {
      const session = await auth();
      if (!session?.user || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
        throw AppError.forbidden('Admin or manager role required');
      }
      const { id } = await ctx.params;
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw AppError.notFound('User not found');

      if (!user.approved) {
        await prisma.user.update({ where: { id }, data: { approved: true } });
        const { emailService, audit, telemetry } = getContainer();
        try {
          await emailService.sendBuyerApproved(user.email, user.name);
        } catch (err) {
          telemetry.error(err, { where: 'approve.email' });
        }
        const info = clientInfo(req);
        await audit.record({ actorId: session.user.id, action: 'user.approve', entity: 'User', entityId: id, ip: info.ip, userAgent: info.userAgent });
      }
      return NextResponse.json({ ok: true });
    },
    { csrf: true }
  );
}
