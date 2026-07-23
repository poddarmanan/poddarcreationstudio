import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { run, parseJson, clientInfo } from '@/server/core/http';
import { AppError } from '@/server/core/errors';
import { getContainer } from '@/server/container';

const RegisterInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  return run(req, async () => {
    const data = await parseJson(req, RegisterInput);
    const email = data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw AppError.conflict('An account with this email already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);
    // New buyers start unapproved: they can sign in but pricing stays gated until the
    // sales team approves them — mirrors the "Prices behind login (approved buyers)" flow.
    const user = await prisma.user.create({
      data: { name: data.name, email, passwordHash, company: data.company, role: 'BUYER', approved: false },
    });

    const info = clientInfo(req);
    const { audit, telemetry } = getContainer();
    await audit.record({ actorId: user.id, action: 'user.register', entity: 'User', entityId: user.id, ip: info.ip, userAgent: info.userAgent });
    telemetry.capture({ name: 'user.registered', actorId: user.id });

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  });
}
