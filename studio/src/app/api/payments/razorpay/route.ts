import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Whether Razorpay is set up here, and the public key id Checkout needs. */
export async function GET(req: Request) {
  return run(req, async () => {
    const { paymentService } = getContainer();
    return NextResponse.json({ ready: paymentService.ready, keyId: paymentService.ready ? paymentService.publicKey : null });
  });
}

const StartInput = z.object({
  lines: z.array(z.object({ fabricId: z.string().min(1), colourId: z.string().min(1), metres: z.number().positive().max(1_000_000) })).min(1).max(300),
});

/** Opens a Razorpay order for a signed-in buyer's fabric order, priced on the server. */
export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { lines } = await parseJson(req, StartInput);
      const order = await getContainer().paymentService.start(user.id, lines);
      return NextResponse.json(order, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.quote }
  );
}
