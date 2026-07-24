import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const Input = z.object({ fabricId: z.string().max(64), colourId: z.string().max(64).nullish() });

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const recent = await getContainer().dealerService.listRecent(user.id);
    return NextResponse.json({ recent });
  });
}

/**
 * Records a fabric/colour view (fire-and-forget from the studio).
 *
 * Two records, deliberately: a signed-in customer's "recently viewed" strip, capped at 30, and
 * — since Phase 3 M18 — the analytics view log, which also counts **anonymous** visitors. They
 * are most of the traffic, because browsing needs no account, so an analytics record that only
 * saw signed-in users would describe a different business than the one we run.
 *
 * The analytics row stores a truncated salted hash of the client address, never the address.
 */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const { fabricId, colourId } = await parseJson(req, Input);
      const session = await auth();
      const { dealerService, analyticsService } = getContainer();

      if (session?.user?.id) {
        await dealerService.recordView(session.user.id, fabricId, colourId ?? null);
      }
      await analyticsService.recordView(fabricId, colourId ?? null, session?.user?.id ?? null, clientInfo(req).ip ?? null);

      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.upload }
  );
}
