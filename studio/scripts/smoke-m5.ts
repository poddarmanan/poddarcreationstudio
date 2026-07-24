import 'dotenv/config';
import assert from 'node:assert';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

const OUTBOX = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage', 'outbox');

async function outboxCount(): Promise<number> {
  try {
    return (await readdir(OUTBOX)).filter((f) => f.endsWith('.eml')).length;
  } catch {
    return 0;
  }
}

async function main() {
  const { emailService, tokenService } = getContainer();
  console.log('email transport:', emailService.transportName);

  const email = `smoke+${Date.now()}@example.com`;

  // Token single-use + expiry + hash-only storage.
  const raw = await tokenService.issue({ type: 'EMAIL_VERIFICATION', email, ttlMs: 60_000 });
  const stored = await prisma.token.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
  assert(stored && stored.tokenHash !== raw, 'token stored as hash, not raw');

  const consumed = await tokenService.consume('EMAIL_VERIFICATION', raw);
  assert(consumed.email === email, 'consume returns the email');
  await assert.rejects(() => tokenService.consume('EMAIL_VERIFICATION', raw), /already been used/, 'single-use enforced');

  const expiredRaw = await tokenService.issue({ type: 'PASSWORD_RESET', email, ttlMs: -1000 });
  await assert.rejects(() => tokenService.consume('PASSWORD_RESET', expiredRaw), /expired/, 'expiry enforced');

  const wrongType = await tokenService.issue({ type: 'INVITE', email, role: 'SALES', ttlMs: 60_000 });
  await assert.rejects(() => tokenService.consume('PASSWORD_RESET', wrongType), /invalid/, 'type mismatch rejected');
  console.log('token security: hash-only ✓ / single-use ✓ / expiry ✓ / type-checked ✓');

  // All six templates dispatch through the transport.
  const before = await outboxCount();
  await emailService.sendVerification(email, 'Smoke Tester', 'tok-verify');
  await emailService.sendWelcome(email, 'Smoke Tester');
  await emailService.sendPasswordReset(email, 'Smoke Tester', 'tok-reset');
  await emailService.sendInvite(email, 'Studio Admin', 'SALES', 'tok-invite');
  await emailService.sendBuyerApproved(email, 'Smoke Tester');
  await emailService.sendQuoteShared(email, 'A Designer', 'https://poddarcreation.studio/book', ['Rani (Gajji Silk)', 'Neel (Rayon)']);
  const after = await outboxCount();
  assert(after - before === 6, `6 emails written (got ${after - before})`);
  console.log('templates: 6 emails written to outbox ✓');

  // Cleanup test tokens.
  await prisma.token.deleteMany({ where: { email } });
  console.log('\nM5 SMOKE PASSED');
}

main()
  .catch((e) => {
    console.error('M5 SMOKE FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
