import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { QUOTE_TRANSITIONS, normalizeQuoteStatus } from '../src/server/quote/quote.service';

/** M15 — quote tracking: the eight-state lifecycle, pricing, customer decisions, expiry. */
async function main() {
  const { quoteService: svc } = getContainer();

  const buyer = await prisma.user.create({
    data: { name: 'Quote Buyer', email: `smoke-m15-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true },
  });
  const sales = await prisma.user.findFirstOrThrow({ where: { role: 'SALES' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: 'gajji' }, orderBy: { order: 'asc' }, take: 2 });

  const newQuote = () =>
    svc.create({
      userId: buyer.id, name: buyer.name, company: 'Quote Co', email: buyer.email,
      quantity: '600 m', subject: 'Lifecycle test',
      items: shades.map((c) => ({ fabricId: 'gajji', colourId: c.id })),
    });

  // ---- Creation + migration vocabulary --------------------------------------
  const quote = await newQuote();
  assert(quote.status === 'SUBMITTED', `a new request is SUBMITTED (got ${quote.status})`);
  const created = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(created.submittedAt, 'submittedAt stamped on creation');
  assert(created.currency === 'INR' && created.totalValue === null, 'unpriced by default');
  console.log('create: SUBMITTED, stamped, unpriced ✓');

  // Legacy names still resolve, so an older client keeps working.
  assert(normalizeQuoteStatus('NEW') === 'SUBMITTED', 'NEW → SUBMITTED');
  assert(normalizeQuoteStatus('ASSIGNED') === 'UNDER_REVIEW', 'ASSIGNED → UNDER_REVIEW');
  assert(normalizeQuoteStatus('QUOTED') === 'PRICED', 'QUOTED → PRICED');
  assert(normalizeQuoteStatus('WON') === 'ACCEPTED', 'WON → ACCEPTED');
  assert(normalizeQuoteStatus('LOST') === 'REJECTED', 'LOST → REJECTED');
  assert(normalizeQuoteStatus('SENT') === 'SENT', 'a current name passes through untouched');
  console.log('legacy status aliases still resolve ✓');

  // Historical rows were migrated, not dropped.
  const legacyLeftovers = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM "Quote" WHERE "status"::text IN ('NEW','ASSIGNED','QUOTED','WON','LOST')`
  );
  assert(Number(legacyLeftovers[0].count) === 0, 'no row was left on a Phase 2 status');
  console.log('migration: every historical row carries a Phase 3 status ✓');

  // ---- The state machine is enforced -----------------------------------------
  await assert.rejects(() => svc.updateStatus(quote.id, 'ACCEPTED', sales.id), /cannot move/i, 'a submitted quote cannot jump straight to accepted');
  await assert.rejects(() => svc.updateStatus(quote.id, 'SENT', sales.id), /cannot move/i, 'a submitted quote cannot jump straight to sent');
  console.log('lifecycle: out-of-order transitions refused ✓');

  // Assignment moves it into review.
  await svc.assign(quote.id, sales.id, sales.id);
  assert((await svc.get(quote.id))!.status === 'UNDER_REVIEW', 'assignment moves SUBMITTED → UNDER_REVIEW');

  // Cannot be sent before it is priced.
  await assert.rejects(() => svc.updateStatus(quote.id, 'PRICED', sales.id).then(() => svc.updateStatus(quote.id, 'SENT', sales.id)), /Add pricing/i, 'an unpriced quote cannot be sent');
  console.log('lifecycle: pricing is required before sending ✓');

  // ---- Pricing ---------------------------------------------------------------
  const items = (await svc.get(quote.id))!.items;
  await svc.setPricing(quote.id, { items: [{ id: items[0].id, quantity: 400, unitPrice: 21_200 }, { id: items[1].id, quantity: 200, unitPrice: 19_500 }] }, sales.id);
  const priced = await svc.get(quote.id);
  // 400 × ₹212.00 + 200 × ₹195.00 = ₹123,800.00 → 12,380,000 paise
  assert(priced!.totalValue === 400 * 21_200 + 200 * 19_500, `total computed from the lines (got ${priced!.totalValue})`);
  assert(priced!.status === 'PRICED', 'pricing a quote under review advances it to PRICED');
  assert(priced!.events.some((e) => e.type === 'PRICE'), 'pricing is recorded on the timeline');
  console.log('pricing: per-line prices roll up into an exact integer total ✓');

  await assert.rejects(() => svc.setPricing(quote.id, { items: [{ id: 'not-this-quote', unitPrice: 100 }] }, sales.id), /not part of this quotation/i, 'a foreign line cannot be priced');

  const validUntil = new Date(Date.now() + 7 * 86_400_000);
  await svc.setPricing(quote.id, { totalValue: 12_000_000, priceNote: 'FOB Surat', validUntil }, sales.id);
  const overridden = await svc.get(quote.id);
  assert(overridden!.totalValue === 12_000_000 && overridden!.priceNote === 'FOB Surat', 'an explicit total overrides the computed one');
  console.log('pricing: explicit total, terms and validity ✓');

  // ---- Sending + customer decision -------------------------------------------
  await assert.rejects(() => svc.decide(quote.id, buyer.id, 'ACCEPTED'), /only respond once/i, 'a customer cannot accept before it is sent');
  await svc.updateStatus(quote.id, 'SENT', sales.id);
  const sent = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(sent.sentAt, 'sentAt stamped');

  const other = await prisma.user.create({
    data: { name: 'Other', email: `smoke-m15-other-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  await assert.rejects(() => svc.decide(quote.id, other.id, 'ACCEPTED'), /not found/i, "a customer cannot decide another customer's quotation");
  await assert.rejects(() => svc.forCustomer(quote.id, other.id), /not found/i, "a customer cannot read another customer's quotation");

  await svc.decide(quote.id, buyer.id, 'ACCEPTED', 'Please proceed');
  const accepted = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(accepted.status === 'ACCEPTED' && accepted.decidedAt, 'accepted and stamped');
  await assert.rejects(() => svc.updateStatus(quote.id, 'SENT', sales.id), /cannot move/i, 'an accepted quote is terminal');
  console.log('decision: only the owner, only once sent, terminal afterwards ✓');

  // ---- Customer progress view -------------------------------------------------
  await svc.addNote(quote.id, 'Internal: margin is thin on the Rani', sales.id);
  const view = await svc.forCustomer(quote.id, buyer.id);
  assert(!view.events.some((e) => e.type === 'NOTE'), 'internal notes never reach the customer view');
  assert(view.events.some((e) => e.type === 'PRICE'), 'pricing history does reach the customer');
  assert(view.progress.length === 6 && view.progress.every((p) => p.done), 'an accepted quote shows every step complete');
  assert(view.progress.find((p) => p.current)?.step === 'ACCEPTED', 'the current step is marked');
  assert(!view.canDecide && !view.closed, 'an accepted quote is neither open for decision nor "closed" in the rejected sense');
  console.log('customer view: progress, timeline, internal notes withheld ✓');

  // ---- Expiry -----------------------------------------------------------------
  const stale = await newQuote();
  await svc.assign(stale.id, sales.id, sales.id);
  await svc.setPricing(stale.id, { totalValue: 500_000, validUntil: new Date(Date.now() - 86_400_000) }, sales.id);
  await svc.updateStatus(stale.id, 'SENT', sales.id);

  const fresh = await newQuote();
  await svc.assign(fresh.id, sales.id, sales.id);
  await svc.setPricing(fresh.id, { totalValue: 500_000, validUntil: new Date(Date.now() + 86_400_000) }, sales.id);
  await svc.updateStatus(fresh.id, 'SENT', sales.id);

  const expired = await svc.expireStale();
  assert(expired >= 1, 'the past-validity quote expired');
  assert((await svc.get(stale.id))!.status === 'EXPIRED', 'stale quote is EXPIRED');
  assert((await svc.get(fresh.id))!.status === 'SENT', 'an in-date quote is left alone');

  // An expired quote can be revived for a re-quote.
  await svc.updateStatus(stale.id, 'UNDER_REVIEW', sales.id, 'Customer asked us to requote');
  assert((await svc.get(stale.id))!.status === 'UNDER_REVIEW', 'an expired quote can be revived');
  console.log('expiry: past-validity quotes expire, in-date ones do not, expired can be revived ✓');

  // ---- The machine is total ---------------------------------------------------
  for (const [from, targets] of Object.entries(QUOTE_TRANSITIONS)) {
    for (const to of targets) {
      assert(QUOTE_TRANSITIONS[to] !== undefined, `${from} → ${to} lands on a state the machine knows`);
    }
  }
  assert(QUOTE_TRANSITIONS.ACCEPTED.length === 0 && QUOTE_TRANSITIONS.REJECTED.length === 0, 'ACCEPTED and REJECTED are terminal');
  console.log('lifecycle map is total and terminal states are terminal ✓');

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  await prisma.quote.deleteMany({ where: { id: { in: [quote.id, stale.id, fresh.id] } } });
  console.log('\nM15 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M15 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
