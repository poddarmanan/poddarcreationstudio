import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const Input = z.object({ fabricId: z.string(), colourId: z.string().nullish() });

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const recent = await getContainer().dealerService.listRecent(user.id);
    return NextResponse.json({ recent });
  });
}

/** Records a fabric/colour view. No-ops silently for anonymous visitors (fire-and-forget). */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const session = await auth();
      if (!session?.user?.id) return NextResponse.json({ ok: true });
      const { fabricId, colourId } = await parseJson(req, Input);
      await getContainer().dealerService.recordView(session.user.id, fabricId, colourId ?? null);
      return NextResponse.json({ ok: true });
    },
    { csrf: true }
  );
}
