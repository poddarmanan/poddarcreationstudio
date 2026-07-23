import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const RegisterInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = RegisterInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Name, email and a password of at least 8 characters are required' }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  // New buyers start unapproved: they can sign in but pricing stays gated until the
  // sales team approves them — mirrors the "Prices behind login (approved buyers)" flow.
  const user = await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash, company: parsed.data.company, role: 'BUYER', approved: false },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
}
