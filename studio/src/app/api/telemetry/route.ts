import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { run, enforceRateLimit } from '@/server/core/http';
import { CLIENT_EVENTS } from '@/lib/telemetry-client';

/**
 * POST /api/telemetry — the browser's channel into the existing telemetry pipeline (M21).
 *
 * Deliberately the narrowest useful thing: an allow-listed event name and a small, flat bag of
 * scalars. Without the allow-list this becomes an unauthenticated write endpoint that anyone
 * can fill with arbitrary records, which is a log-poisoning and cost problem rather than a
 * feature. Properties are capped in count, key length and value length for the same reason.
 *
 * It answers 204 whatever happens. Telemetry that reports its own failures to the page is
 * noise a customer can see, and a beacon cannot read the response anyway.
 */

const MAX_PROPS = 12;

const schema = z.object({
  name: z.enum(CLIENT_EVENTS),
  props: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .optional()
    .refine((p) => !p || Object.keys(p).length <= MAX_PROPS, `at most ${MAX_PROPS} properties`),
});

export async function POST(req: Request) {
  return run(req, async () => {
    // Generous enough for a page that opens several fabrics, tight enough that a loop cannot
    // turn the endpoint into a write amplifier.
    enforceRateLimit(req, { name: 'telemetry', limit: 40, windowMs: 60_000 });

    let parsed;
    try {
      parsed = schema.parse(await req.json());
    } catch {
      // A malformed beacon is a bug in a build we no longer control, not a client to punish.
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth();
    getContainer().telemetry.capture({
      name: parsed.name,
      props: { ...parsed.props, source: 'client' },
      actorId: session?.user?.id,
    });

    return new NextResponse(null, { status: 204 });
  }, { csrf: true });
}
