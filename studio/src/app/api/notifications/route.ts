import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/**
 * The notification centre (Phase 3 M19). One endpoint for everyone — customers and staff read
 * their own notifications through the same route, always scoped to the acting user.
 */
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('markRead'), ids: z.array(z.string().max(64)).max(200).optional() }),
  z.object({
    action: z.literal('preferences'),
    prefEmail: z.boolean().optional(),
    notifyQuotes: z.boolean().optional(),
    notifySamples: z.boolean().optional(),
    notifyShares: z.boolean().optional(),
  }),
]);

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const svc = getContainer().notificationService;

    const [notifications, unread, preferences] = await Promise.all([
      svc.list(user.id, { unreadOnly: url.searchParams.get('unread') === '1', take: Number(url.searchParams.get('take')) || 30 }),
      svc.unreadCount(user.id),
      svc.preferences(user.id),
    ]);

    return NextResponse.json({ notifications, unread, preferences });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const body = await parseJson(req, Action);
      const svc = getContainer().notificationService;

      if (body.action === 'markRead') {
        const count = await svc.markRead(user.id, body.ids);
        return NextResponse.json({ ok: true, marked: count, unread: await svc.unreadCount(user.id) });
      }

      await svc.setPreferences(user.id, {
        prefEmail: body.prefEmail,
        notifyQuotes: body.notifyQuotes,
        notifySamples: body.notifySamples,
        notifyShares: body.notifyShares,
      });
      return NextResponse.json({ ok: true, preferences: await svc.preferences(user.id) });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
