import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson } from '@/server/core/http';
import { requireUser } from '@/server/core/session';

const ProfileInput = z.object({
  company: z.string().max(200).nullish(),
  contactPhone: z.string().max(40).nullish(),
  whatsapp: z.string().max(40).nullish(),
  gstNumber: z.string().max(30).nullish(),
  vatNumber: z.string().max(30).nullish(),
  website: z.string().max(200).nullish(),
  shippingLine1: z.string().max(300).nullish(),
  shippingCity: z.string().max(120).nullish(),
  shippingState: z.string().max(120).nullish(),
  shippingPincode: z.string().max(20).nullish(),
  shippingCountry: z.string().max(120).nullish(),
  prefEmail: z.boolean().optional(),
  prefWhatsapp: z.boolean().optional(),
  prefPhone: z.boolean().optional(),
});

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const profile = await getContainer().dealerService.getProfile(user.id);
    return NextResponse.json({ profile });
  });
}

export async function PUT(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const data = await parseJson(req, ProfileInput);
      const { dealerService, audit } = getContainer();
      const profile = await dealerService.upsertProfile(user.id, data);
      await audit.record({ actorId: user.id, action: 'customer.profile.update', entity: 'DealerProfile', entityId: profile.id });
      return NextResponse.json({ profile });
    },
    { csrf: true }
  );
}
