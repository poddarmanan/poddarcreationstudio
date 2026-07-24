import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

const ContactPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  designation: z.string().max(120).nullish(),
  email: z.string().email().max(320).nullish().or(z.literal('')),
  phone: z.string().max(40).nullish(),
  whatsapp: z.string().max(40).nullish(),
  isPrimary: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<'/api/portal/contacts/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const patch = await parseJson(req, ContactPatch);
      const { customerService, audit } = getContainer();
      const contact = await customerService.updateContact(user.id, id, { ...patch, ...(patch.email !== undefined ? { email: patch.email || null } : {}) });
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'customer.contact.update', entity: 'ContactPerson', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ contact });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/portal/contacts/[id]'>) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const { id } = await ctx.params;
      const { customerService, audit } = getContainer();
      await customerService.removeContact(user.id, id);
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'customer.contact.delete', entity: 'ContactPerson', entityId: id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ ok: true });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
