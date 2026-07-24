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
  const { sampleService } = getContainer();
  const buyer = await prisma.user.findUniqueOrThrow({ where: { email: 'buyer@example.com' } });
  const sales = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@poddarcreation.studio' } });
  const colours = await prisma.colour.findMany({ where: { fabricId: 'roman' }, take: 3, orderBy: { order: 'asc' } });

  const before = await outboxCount();

  // Create.
  const sample = await sampleService.create({
    userId: buyer.id,
    name: 'Approved Buyer',
    company: 'Anand Garments',
    email: 'buyer@example.com',
    phone: '+91 98000 00000',
    shippingLine1: '14 Ring Road, Textile Market',
    shippingCity: 'Surat',
    shippingState: 'Gujarat',
    shippingPincode: '395002',
    message: 'Need hand-feel before the festive order.',
    items: colours.map((c) => ({ fabricId: 'roman', colourId: c.id })),
  });
  assert(sample.status === 'REQUESTED', 'created REQUESTED');
  const afterCreate = await outboxCount();
  assert(afterCreate - before === 2, `staff notices on create (got ${afterCreate - before})`);
  console.log('create: REQUESTED + staff notices ✓');

  // Empty items rejected.
  await assert.rejects(
    () => sampleService.create({ userId: null, name: 'X', company: 'Y', shippingLine1: 'a', shippingCity: 'b', items: [] }),
    /at least one shade/,
    'empty items rejected'
  );

  // Invalid transition: REQUESTED → DELIVERED must fail.
  await assert.rejects(
    () => sampleService.updateStatus(sample.id, 'DELIVERED', sales.id),
    /Cannot move/,
    'transition guard'
  );
  console.log('transition guard: REQUESTED→DELIVERED blocked ✓');

  // Approve → dispatch (courier required) → deliver.
  await sampleService.updateStatus(sample.id, 'APPROVED', sales.id);
  await assert.rejects(() => sampleService.updateStatus(sample.id, 'DISPATCHED', sales.id, {}), /Courier is required/, 'courier required');
  await sampleService.updateStatus(sample.id, 'DISPATCHED', sales.id, { courier: 'Delhivery', trackingNumber: 'DLV123456789' });
  await sampleService.updateStatus(sample.id, 'DELIVERED', sales.id);
  await sampleService.addNote(sample.id, 'Buyer confirmed the hand-feel.', sales.id);

  const detail = await sampleService.get(sample.id);
  assert(detail?.status === 'DELIVERED', 'DELIVERED');
  assert(detail.courier === 'Delhivery' && detail.trackingNumber === 'DLV123456789', 'courier + tracking stored');
  assert(detail.assigneeId === sales.id, 'auto-assigned to acting staff');
  const timeline = detail.events.map((e) => e.type).join(' → ');
  console.log('timeline:', timeline);
  assert(timeline === 'CREATED → STATUS → COURIER → STATUS → NOTE', 'ordered history');
  console.log('approve → dispatch(courier+tracking) → deliver + note ✓');

  const afterAll = await outboxCount();
  assert(afterAll - afterCreate === 3, `buyer status emails for approve/dispatch/deliver (got ${afterAll - afterCreate})`);
  console.log('buyer notifications: approved + dispatched + delivered ✓');

  // Buyer-scoped list vs staff list.
  const mine = await sampleService.list({ userId: buyer.id });
  assert(mine.some((s) => s.id === sample.id), 'buyer list');
  const delivered = await sampleService.list({ status: 'DELIVERED' });
  assert(delivered.some((s) => s.id === sample.id), 'status filter');
  console.log('list filters ✓');

  await prisma.sampleRequest.delete({ where: { id: sample.id } });
  console.log('\nM8 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M8 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
