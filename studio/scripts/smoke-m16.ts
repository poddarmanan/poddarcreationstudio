import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { PIPELINE_STAGES } from '../src/server/sales/sales.service';

/** M16 — sales workspace: pipeline, customer profile, notes, follow-ups, assignment. */
async function main() {
  const { salesService: svc, quoteService, collectionService, sampleService, dashboardService } = getContainer();

  const stamp = Date.now();
  const buyer = await prisma.user.create({
    data: { name: 'Pipeline Buyer', email: `smoke-m16-${stamp}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true, company: 'Pipeline Textiles' },
  });
  const sales = await prisma.user.findFirstOrThrow({ where: { role: 'SALES' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: 'cambric' }, orderBy: { order: 'asc' }, take: 2 });

  // Build a real history for this customer: a board, a quotation, a sample request.
  const board = await collectionService.create(buyer.id, 'Autumn book', 'Muted cottons');
  for (const shade of shades) await collectionService.addItem(buyer.id, board.id, { fabricId: 'cambric', colourId: shade.id, quantity: 300 });
  const quote = await collectionService.requestQuote(buyer.id, board.id, { name: buyer.name, company: 'Pipeline Textiles', email: buyer.email });
  await sampleService.create({
    userId: buyer.id, name: buyer.name, company: 'Pipeline Textiles', shippingLine1: '4 Mill Lane', shippingCity: 'Surat',
    items: [{ fabricId: 'cambric', colourId: shades[0].id }],
  });

  // ---- Pipeline ---------------------------------------------------------------
  const board1 = await svc.pipeline();
  assert(board1.stages.map((s) => s.stage).join() === PIPELINE_STAGES.join(), 'the board carries every working stage in order');
  assert(!board1.stages.some((s) => ['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(s.stage)), 'terminal states are not columns');
  const submitted = board1.stages.find((s) => s.stage === 'SUBMITTED')!;
  assert(submitted.quotes.some((q) => q.id === quote.id), 'the new quotation appears in SUBMITTED');
  assert(board1.samples.some((s) => s.company === 'Pipeline Textiles'), 'the sample request is waiting on the team');
  console.log('pipeline: stages, quotes, waiting samples ✓');

  // Value rolls up only from priced quotes.
  await quoteService.assign(quote.id, sales.id, sales.id);
  await quoteService.setPricing(quote.id, { totalValue: 4_500_000 }, sales.id);
  const board2 = await svc.pipeline();
  const priced = board2.stages.find((s) => s.stage === 'PRICED')!;
  assert(priced.quotes.some((q) => q.id === quote.id), 'pricing moved it into the PRICED column');
  assert(priced.value >= 4_500_000, `column value rolls up (got ${priced.value})`);
  console.log('pipeline: value rolls up from priced quotes ✓');

  // Filtering by assignee gives a salesperson their own board.
  const mine = await svc.pipeline({ assigneeId: sales.id });
  assert(mine.stages.flatMap((s) => s.quotes).every((q) => q.assignee?.id === sales.id), 'the "mine" board only shows my quotes');
  console.log('pipeline: per-salesperson filter ✓');

  // ---- Customer list -----------------------------------------------------------
  const found = await svc.customers({ search: 'Pipeline Text' });
  assert(found.some((c) => c.id === buyer.id), 'search matches on company');
  assert((await svc.customers({ search: buyer.email })).some((c) => c.id === buyer.id), 'search matches on email');
  assert((await svc.customers({ search: 'Pipeline Buyer' })).some((c) => c.id === buyer.id), 'search matches on name');
  const row = found.find((c) => c.id === buyer.id)!;
  assert(row.counts.openQuotes === 1 && row.counts.collections === 1 && row.counts.sampleRequests === 1, `engagement counts are right (${JSON.stringify(row.counts)})`);
  assert(!(await svc.customers({ search: 'sales@poddarcreation.studio' })).length, 'staff never appear in the customer list');
  console.log('customers: search by company, email and name; staff excluded ✓');

  // ---- One customer -------------------------------------------------------------
  const detail = await svc.customer(buyer.id);
  assert(detail.user.id === buyer.id, 'profile loads');
  assert(detail.collections.length === 1 && detail.quotes.length === 1 && detail.samples.length === 1, 'collections, quotes and samples all present');
  assert(detail.summary.openQuotes === 1 && detail.summary.quotedValue === 4_500_000, 'summary totals');
  assert(detail.communication.length > 0, 'communication history assembled');
  assert(detail.communication.some((c) => c.channel === 'QUOTE'), 'quote events feed the history');
  assert(detail.communication.some((c) => c.channel === 'SAMPLE'), 'sample events feed the history');
  const times = detail.communication.map((c) => new Date(c.at).getTime());
  assert(times.every((t, i) => i === 0 || times[i - 1] >= t), 'communication history is newest-first');
  console.log('customer profile: full story, merged communication history ✓');

  await assert.rejects(() => svc.customer('not-a-customer'), /not found/i, 'an unknown customer 404s');

  // ---- Sales notes ---------------------------------------------------------------
  const note = await svc.addNote(buyer.id, sales.id, '  Pays on 30 days, always asks for FOB.  ', true);
  assert(note.body === 'Pays on 30 days, always asks for FOB.' && note.pinned, 'note stored, trimmed and pinned');
  const withNote = await svc.customer(buyer.id);
  assert(withNote.notes[0].id === note.id, 'pinned notes lead');
  assert(withNote.communication.some((c) => c.channel === 'NOTE'), 'notes join the communication history');
  await svc.updateNote(note.id, { pinned: false });
  assert(!(await prisma.customerNote.findUniqueOrThrow({ where: { id: note.id } })).pinned, 'unpin works');
  console.log('sales notes: add, pin, unpin ✓');

  // A sales note must never reach the customer's own surfaces.
  const customerDash = await dashboardService.forUser(buyer.id);
  const dashText = JSON.stringify(customerDash);
  assert(!dashText.includes('Pays on 30 days'), 'sales notes never appear on the customer dashboard');
  console.log('sales notes stay internal ✓');

  // ---- Follow-ups ------------------------------------------------------------------
  const internal = await svc.scheduleFollowUp({ userId: buyer.id, subject: 'Check margin', dueAt: new Date(Date.now() + 86_400_000) }, sales.id);
  assert(!internal.visibleToCustomer, 'follow-ups default to internal');
  const shared = await svc.scheduleFollowUp(
    { userId: buyer.id, subject: 'Call about the autumn book', dueAt: new Date(Date.now() + 2 * 86_400_000), visibleToCustomer: true },
    sales.id
  );
  assert(shared.assigneeId === sales.id, 'unassigned follow-ups fall to their creator');

  const visible = await dashboardService.upcomingFollowUps(buyer.id);
  assert(visible.length === 1 && visible[0].id === shared.id, 'only the shared follow-up reaches the customer');
  console.log('follow-ups: internal by default, shared only when chosen ✓');

  const queue = await svc.myFollowUps(sales.id);
  assert(queue.some((f) => f.id === internal.id) && queue.some((f) => f.id === shared.id), 'both land in the salesperson\'s queue');
  await svc.closeFollowUp(internal.id, 'DONE');
  await assert.rejects(() => svc.closeFollowUp(internal.id, 'CANCELLED'), /already closed/i, 'a closed follow-up cannot be closed twice');
  assert(!(await svc.myFollowUps(sales.id)).some((f) => f.id === internal.id), 'a completed follow-up leaves the queue');
  console.log('follow-ups: queue, completion, idempotence ✓');

  // Overdue reminders surface on the board.
  await prisma.followUp.create({ data: { userId: buyer.id, assigneeId: sales.id, subject: 'Overdue call', dueAt: new Date(Date.now() - 86_400_000) } });
  const board3 = await svc.pipeline();
  assert(board3.overdue.some((f) => f.subject === 'Overdue call'), 'overdue follow-ups surface on the pipeline');
  console.log('pipeline: overdue reminders surface ✓');

  // ---- Assignment --------------------------------------------------------------------
  const sample = await prisma.sampleRequest.findFirstOrThrow({ where: { userId: buyer.id } });
  await svc.assignSample(sample.id, sales.id);
  assert((await prisma.sampleRequest.findUniqueOrThrow({ where: { id: sample.id } })).assigneeId === sales.id, 'sample assigned');
  await assert.rejects(() => svc.assignSample(sample.id, buyer.id), /only be assigned to staff/i, 'a sample cannot be assigned to a customer');
  console.log('assignment: staff only ✓');

  await prisma.user.delete({ where: { id: buyer.id } });
  console.log('\nM16 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M16 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
