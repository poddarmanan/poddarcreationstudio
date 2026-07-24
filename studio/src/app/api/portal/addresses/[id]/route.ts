import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const AddressPatch = z.object({
  label: z.string().max(80).optional(),
  contactName: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  line1: z.string().min(1).max(300).optional(),
  line2: z.string().max(300).nullish(),
  city: z.string().min(1).max(120).optional(),
  state: z.string().max(120).nullish(),
  pincode: z.string().max(20).nullish(),
  country: z.string().max(120).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<'/api/portal/addresses/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const patch = await parseJson(req, AddressPatch);
      const { customerService, audit } = getContainer();
      const address = await customerService.updateAddress(user.id, id, patch);
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'customer.address.update', entity: 'ShippingAddress', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ address });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/addresses/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const { customerService, audit } = getContainer();
      await customerService.removeAddress(user.id, id);
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'customer.address.delete', entity: 'ShippingAddress', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
