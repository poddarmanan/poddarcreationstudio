import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/** M14 — customer dashboard: activity feed, recommendations, follow-ups, one aggregate read. */
async function main() {
  const { dashboardService, activityService, dealerService, collectionService, sampleService } = getContainer();

  const buyer = await prisma.user.create({
    data: { name: 'Dash Buyer', email: `smoke-m14-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true },
  });
  const staff = await prisma.user.findFirstOrThrow({ where: { role: 'SALES' } });
  const fabric = await prisma.fabric.findFirstOrThrow({ where: { id: 'rayon14' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: fabric.id }, orderBy: { order: 'asc' }, take: 3 });

  // ---- Empty account --------------------------------------------------------
  const fresh = await dashboardService.forUser(buyer.id);
  assert(fresh.activity.length === 0 && fresh.favourites.length === 0, 'a new account has an empty dashboard');
  assert(fresh.followUps.length === 0, 'no follow-ups yet');
  assert(fresh.recommendations.length === 1 && fresh.recommendations[0].reason === 'A place to start', 'a new account still gets a starting point');
  assert(fresh.recommendations[0].shades.length > 0, 'the fallback recommendation carries shades');
  console.log('empty account: every panel renders, recommendations fall back ✓');

  // ---- Activity is recorded by the real business actions --------------------
  await dealerService.addFavourite(buyer.id, fabric.id, shades[0].id);
  const board = await collectionService.create(buyer.id, 'Dashboard board');
  await collectionService.addItem(buyer.id, board.id, { fabricId: fabric.id, colourId: shades[1].id });
  await dealerService.recordDownload(buyer.id, 'SPEC', fabric.id, null);
  await sampleService.create({
    userId: buyer.id, name: buyer.name, company: 'Dash Co', shippingLine1: '1 Test Road', shippingCity: 'Surat',
    items: [{ fabricId: fabric.id, colourId: shades[0].id }],
  });

  const feed = await activityService.list(buyer.id);
  const titles = feed.map((e) => e.title);
  assert(feed.length === 4, `four journey events recorded (got ${feed.length}: ${titles.join(' | ')})`);
  assert(feed[0].createdAt >= feed[feed.length - 1].createdAt, 'feed is newest-first');
  assert(titles.some((t) => t.startsWith('Saved ')), 'favourite recorded');
  assert(titles.some((t) => t.includes('Dashboard board')), 'collection recorded');
  assert(titles.some((t) => t.includes('spec sheet')), 'download recorded');
  assert(titles.some((t) => t.includes('Sample request sent')), 'sample recorded');
  assert(feed.every((e) => e.userId === buyer.id), 'the feed only ever holds this account');
  console.log('activity: favourites, collections, downloads and samples all land in the feed ✓');

  // Quote status changes reach the customer's feed too.
  const quote = await collectionService.requestQuote(buyer.id, board.id, { name: buyer.name, company: 'Dash Co', email: buyer.email });
  await getContainer().quoteService.updateStatus(quote.id, 'QUOTED', staff.id);
  const withQuote = await activityService.list(buyer.id);
  assert(withQuote.some((e) => e.title === 'Quotation requested'), 'quote request recorded');
  assert(withQuote.some((e) => e.title.startsWith('Quotation quoted')), 'quote status change recorded');
  console.log('activity: quote lifecycle reaches the customer ✓');

  // ---- Recommendations ------------------------------------------------------
  const withHistory = await dashboardService.forUser(buyer.id);
  assert(withHistory.recommendations.length >= 1, 'recommendations produced from history');
  const saved = new Set([shades[0].id, shades[1].id]);
  for (const group of withHistory.recommendations) {
    for (const shade of group.shades) {
      assert(!saved.has(shade.id), `recommendations never repeat something already saved (${shade.name})`);
    }
  }
  assert(withHistory.recommendations.some((g) => g.reason.startsWith('Close to') || g.reason.startsWith('More in')), 'recommendations are explained');
  console.log('recommendations: rule-based, explained, never repeat saved shades ✓');

  // ---- Follow-ups: internal reminders stay internal --------------------------
  await prisma.followUp.createMany({
    data: [
      { userId: buyer.id, assigneeId: staff.id, subject: 'Call about the wedding book', dueAt: new Date(Date.now() + 2 * 86_400_000), visibleToCustomer: true },
      { userId: buyer.id, assigneeId: staff.id, subject: 'Internal: check margin', dueAt: new Date(Date.now() + 86_400_000), visibleToCustomer: false },
      { userId: buyer.id, assigneeId: staff.id, subject: 'Already done', dueAt: new Date(Date.now() + 86_400_000), status: 'DONE', visibleToCustomer: true },
    ],
  });
  const followUps = await dashboardService.upcomingFollowUps(buyer.id);
  assert(followUps.length === 1, `only open, customer-visible follow-ups surface (got ${followUps.length})`);
  assert(followUps[0].subject === 'Call about the wedding book', 'the internal reminder never reaches the customer');
  console.log('follow-ups: internal reminders stay internal, completed ones drop off ✓');

  // ---- Aggregate ------------------------------------------------------------
  const full = await dashboardService.forUser(buyer.id);
  for (const panel of ['stats', 'favourites', 'collections', 'recent', 'downloads', 'quotes', 'samples', 'activity', 'followUps', 'recommendations'] as const) {
    assert(full[panel] !== undefined, `dashboard carries the ${panel} panel`);
  }
  assert(full.stats.favourites === 1 && full.stats.collections === 1 && full.stats.quotes === 1 && full.stats.downloads === 1, 'stat tiles count correctly');
  assert(full.samples.length === 1 && full.quotes.length === 1, 'quotes and samples panels populated');
  console.log('aggregate: all ten panels in one read ✓');

  // ---- Isolation ------------------------------------------------------------
  const other = await prisma.user.create({
    data: { name: 'Other', email: `smoke-m14-other-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  const otherDash = await dashboardService.forUser(other.id);
  assert(otherDash.activity.length === 0 && otherDash.collections.length === 0 && otherDash.followUps.length === 0, "another account sees none of this customer's data");
  console.log('isolation ✓');

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  console.log('\nM14 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M14 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
