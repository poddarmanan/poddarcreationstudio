import 'dotenv/config';
import assert from 'node:assert';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

const OUTBOX = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage', 'outbox');
const outboxCount = async () => {
  try { return (await readdir(OUTBOX)).filter((f) => f.endsWith('.eml')).length; } catch { return 0; }
};

async function main() {
  const { quoteService } = getContainer();
  const buyer = await prisma.user.findUniqueOrThrow({ where: { email: 'buyer@example.com' } });
  const sales = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@poddarcreation.studio' } });
  const colour = await prisma.colour.findFirstOrThrow({ where: { fabricId: 'gajji' } });

  const before = await outboxCount();

  // Create with full inquiry fields.
  const quote = await quoteService.create({
    userId: buyer.id,
    name: 'Approved Buyer',
    company: 'Anand Garments',
    email: 'buyer@example.com',
    quantity: '1,200 m',
    subject: 'Gajji Silk · Rani · 20 kg',
    moq: '500 m',
    expectedQty: '1,200 m first order, 5,000 m yearly',
    country: 'India',
    shippingMethod: 'Road freight',
    timeline: 'Within 3 weeks',
    message: 'Need bridal-grade lustre; shade must match the swatch.',
    items: [{ fabricId: 'gajji', colourId: colour.id }],
  });
  assert(quote.status === 'NEW', 'created as NEW');
  console.log('create: NEW quote with inquiry fields ✓');

  // Buyer confirmation + 2 staff notices (admin + sales) = 3 emails.
  const afterCreate = await outboxCount();
  assert(afterCreate - before === 3, `create sends buyer + staff emails (got ${afterCreate - before})`);
  console.log('notifications on create: buyer confirmation + staff notices (3 emails) ✓');

  // Assign → ASSIGNED + event + status email.
  await quoteService.assign(quote.id, sales.id, sales.id);
  let detail = await quoteService.get(quote.id);
  assert(detail?.status === 'ASSIGNED' && detail.assignee?.id === sales.id, 'assigned');
  assert(detail.events.some((e) => e.type === 'ASSIGN'), 'ASSIGN event recorded');

  // Status → QUOTED with note.
  await quoteService.updateStatus(quote.id, 'QUOTED', sales.id, '₹212/m FOB Surat');
  detail = await quoteService.get(quote.id);
  assert(detail?.status === 'QUOTED', 'status QUOTED');
  const statusEvent = detail.events.find((e) => e.type === 'STATUS');
  assert(statusEvent?.fromStatus === 'ASSIGNED' && statusEvent?.toStatus === 'QUOTED', 'status transition recorded');

  // Note.
  await quoteService.addNote(quote.id, 'Buyer will confirm after Diwali.', sales.id);
  detail = await quoteService.get(quote.id);
  assert(detail!.events.filter((e) => e.type === 'NOTE').length === 1, 'note recorded');

  const timeline = detail!.events.map((e) => e.type).join(' → ');
  console.log('timeline:', timeline, '✓');
  assert(timeline === 'CREATED → ASSIGN → STATUS → NOTE', 'full ordered timeline');

  const afterAll = await outboxCount();
  assert(afterAll - afterCreate === 2, `assign + quoted status emails (got ${afterAll - afterCreate})`);
  console.log('status notifications: assigned + quoted emails ✓');

  // Filtered list.
  const quoted = await quoteService.list({ status: 'QUOTED' });
  assert(quoted.some((q) => q.id === quote.id), 'list filter by status');
  const mine = await quoteService.list({ assigneeId: sales.id });
  assert(mine.some((q) => q.id === quote.id), 'list filter by assignee');
  console.log('list filters: status + assignee ✓');

  // Cleanup.
  await prisma.quote.delete({ where: { id: quote.id } });
  console.log('\nM7 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M7 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
