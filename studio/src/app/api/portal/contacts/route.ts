import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/server/container';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { requireUser } from '@/server/core/session';
import { RATE_LIMITS } from '@/server/core/rate-limit';

/** Named contact people at the customer's company (Phase 3 M12). */
const ContactInput = z.object({
  name: z.string().min(1).max(200),
  designation: z.string().max(120).nullish(),
  email: z.string().email().max(320).nullish().or(z.literal('')),
  phone: z.string().max(40).nullish(),
  whatsapp: z.string().max(40).nullish(),
  isPrimary: z.boolean().optional(),
});

export async function GET(req: Request) {
  return run(req, async () => {
    const user = await requireUser();
    const contacts = await getContainer().customerService.listContacts(user.id);
    return NextResponse.json({ contacts });
  });
}

export async function POST(req: Request) {
  return run(
    req,
    async () => {
      const user = await requireUser();
      const input = await parseJson(req, ContactInput);
      const { customerService, audit } = getContainer();
      const contact = await customerService.addContact(user.id, { ...input, email: input.email || null });
      const info = clientInfo(req);
      await audit.record({ actorId: user.id, action: 'customer.contact.create', entity: 'ContactPerson', entityId: contact.id, ip: info.ip, userAgent: info.userAgent });
      return NextResponse.json({ contact }, { status: 201 });
    },
    { csrf: true, rateLimit: RATE_LIMITS.write }
  );
}
