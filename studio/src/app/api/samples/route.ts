import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getContainer } from '@/server/container';
import { isStaff } from '@/server/core/rbac';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { RATE_LIMITS } from '@/server/core/rate-limit';
import type { SampleStatus } from '@/generated/prisma/enums';

const SampleInput = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(320).nullish(),
  phone: z.string().max(40).nullish(),
  shippingLine1: z.string().min(1).max(300),
  shippingCity: z.string().min(1).max(120),
  shippingState: z.string().max(120).nullish(),
  shippingPincode: z.string().max(20).nullish(),
  shippingCountry: z.string().max(120).nullish(),
  message: z.string().max(2000).nullish(),
  items: z.array(z.object({ fabricId: z.string(), colourId: z.string() })).min(1).max(20),
});

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const data = await parseJson(req, SampleInput);
      const session = await auth();
      const { sampleService, audit } = getContainer();

      const sample = await sampleService.create({
        userId: session?.user?.id ?? null,
        name: data.name,
        company: data.company,
        email: data.email ?? session?.user?.email ?? null,
        phone: data.phone,
        shippingLine1: data.shippingLine1,
        shippingCity: data.shippingCity,
        shippingState: data.shippingState,
        shippingPincode: data.shippingPincode,
        shippingCountry: data.shippingCountry,
        message: data.message,
        items: data.items,
      });

      const info = clientInfo(req);
      await audit.record({ actorId: session?.user?.id, action: 'sample.create', entity: 'SampleRequest', entityId: sample.id, ip: info.ip, userAgent: info.userAgent, meta: { items: data.items.length } });
      return NextResponse.json({ sample }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.quote }
  );
}

export async function GET(req: Request) {
  return run(req, async () => {
    const session = await auth();
    if (!session?.user) throw AppError.unauthorized();

    const url = new URL(req.url);
    const status = (url.searchParams.get('status') as SampleStatus | null) ?? undefined;
    const staff = isStaff(session.user.role);
    // Buyers see only their own requests; staff see everything.
    const samples = await getContainer().sampleService.list({ status, userId: staff ? undefined : session.user.id });
    return NextResponse.json({ samples });
  });
}
