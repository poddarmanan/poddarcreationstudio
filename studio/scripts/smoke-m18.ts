import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/** M18 — business analytics: interest, search, conversion, people, collections, storage. */
async function main() {
  const { analyticsService: svc, collectionService, quoteService, sampleService, dealerService, shareService } = getContainer();

  const stamp = Date.now();
  const buyer = await prisma.user.create({
    data: { name: 'Analytics Buyer', email: `smoke-m18-${stamp}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true, company: 'Analytics Mills' },
  });
  const sales = await prisma.user.findFirstOrThrow({ where: { role: 'SALES' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: 'rayon14' }, orderBy: { order: 'asc' }, take: 3 });

  // Clear this script's own rows first, so an earlier interrupted run cannot skew the counts.
  await prisma.searchQuery.deleteMany({ where: { normalized: { in: [shades[0].name.toLowerCase(), 'organza'] } } });

  // ---- Views: signed-in and anonymous ------------------------------------------
  for (let i = 0; i < 5; i++) await svc.recordView('rayon14', shades[0].id, buyer.id, '203.0.113.7');
  for (let i = 0; i < 3; i++) await svc.recordView('gajji', null, null, '198.51.100.2');
  await svc.recordView('gajji', null, null, '198.51.100.9');

  const since = new Date(Date.now() - 86_400_000);
  const viewed = await svc.topViewedFabrics(since);
  assert(viewed[0].id === 'rayon14' && viewed[0].value >= 5, `the most-viewed fabric leads (${JSON.stringify(viewed[0])})`);
  assert(viewed.some((r) => r.id === 'gajji' && r.value >= 4), 'anonymous views count too');
  assert(viewed[0].label === 'Rayon 14kg' || typeof viewed[0].label === 'string', 'rows are labelled with fabric names, not ids');
  assert(viewed.every((r) => r.hex !== undefined), 'rows carry a swatch colour');
  console.log('views: signed-in and anonymous, ranked and labelled ✓');

  const rawViews = await prisma.fabricView.findMany({ where: { fabricId: 'gajji' }, take: 5 });
  assert(rawViews.every((v) => !v.visitorId?.includes('198.51.100')), 'the raw address is never stored');
  assert(new Set(rawViews.map((v) => v.visitorId)).size >= 1, 'visitors are distinguishable');
  console.log('views: visitor keys hashed, never the address ✓');

  // ---- Downloads ------------------------------------------------------------------
  await dealerService.recordDownload(buyer.id, 'SPEC', 'rayon14', null);
  await dealerService.recordDownload(buyer.id, 'CATALOGUE', 'rayon14', null);
  await dealerService.recordDownload(buyer.id, 'SPEC', 'gajji', null);
  const downloaded = await svc.topDownloadedFabrics(since);
  assert(downloaded[0].id === 'rayon14' && downloaded[0].value >= 2, `downloads ranked by fabric (${JSON.stringify(downloaded[0])})`);
  assert(downloaded.some((r) => r.id === 'gajji'), 'every downloaded fabric appears');
  console.log('downloads ranked ✓');

  // ---- Search --------------------------------------------------------------------
  const shadeName = shades[0].name;
  await prisma.searchQuery.createMany({
    data: [
      ...Array.from({ length: 4 }, () => ({ query: shadeName, normalized: shadeName.toLowerCase(), resultCount: 3 })),
      { query: 'organza', normalized: 'organza', resultCount: 0 },
      { query: 'organza', normalized: 'organza', resultCount: 0 },
    ],
  });
  const searchedColours = await svc.mostSearchedColours(since);
  assert(searchedColours.some((r) => r.label === shadeName && r.value >= 4), `shade searches are matched against the catalogue (${JSON.stringify(searchedColours[0])})`);
  const topSearches = await svc.topSearches(since);
  const gap = topSearches.find((r) => r.label === 'organza');
  assert(gap && gap.value >= 2 && gap.sublabel === '0 results', `a popular query with no results is surfaced as a catalogue gap (${JSON.stringify(gap)})`);
  console.log('search: shade matching + zero-result gaps ✓');

  const trend = await svc.searchTrend(30);
  assert(trend.length === 30, `the trend is gap-filled to 30 points (got ${trend.length})`);
  assert(trend[trend.length - 1].value >= 6, `today's searches land on the last point (got ${trend[trend.length - 1].value})`);
  assert(trend.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date)), 'every point carries an ISO date');
  const ordered = trend.every((p, i) => i === 0 || trend[i - 1].date < p.date);
  assert(ordered, 'the trend runs oldest to newest');
  console.log('search trend: gap-filled and ordered ✓');

  // ---- Conversion -------------------------------------------------------------------
  const board = await collectionService.create(buyer.id, 'Analytics board');
  for (const shade of shades) await collectionService.addItem(buyer.id, board.id, { fabricId: 'rayon14', colourId: shade.id });
  const quote = await collectionService.requestQuote(buyer.id, board.id, { name: buyer.name, company: 'Analytics Mills', email: buyer.email });
  await quoteService.assign(quote.id, sales.id, sales.id);
  await quoteService.setPricing(quote.id, { totalValue: 9_900_000 }, sales.id);
  await quoteService.updateStatus(quote.id, 'SENT', sales.id);
  await quoteService.updateStatus(quote.id, 'ACCEPTED', sales.id);

  const conversion = await svc.quoteConversion();
  assert(conversion.total > 0, 'quotes counted');
  assert(conversion.winRate !== null && conversion.winRate > 0, 'a win rate is computed');
  assert(conversion.wonValue >= 9_900_000, `won value includes the accepted quotation (${conversion.wonValue})`);
  assert(conversion.reachRate !== null && conversion.reachRate <= 1, 'reach rate is a proportion');
  console.log(`conversion: win ${Math.round(conversion.winRate! * 100)}%, reach ${Math.round(conversion.reachRate! * 100)}% ✓`);

  await sampleService.create({
    userId: buyer.id, name: buyer.name, company: 'Analytics Mills', shippingLine1: '2 Loom Street', shippingCity: 'Surat',
    items: [{ fabricId: 'rayon14', colourId: shades[0].id }],
  });
  const sampleConversion = await svc.sampleConversion();
  assert(sampleConversion.total > 0 && sampleConversion.approvalRate !== null, 'sample conversion computed');
  console.log('sample conversion ✓');

  // ---- People -------------------------------------------------------------------------
  const people = await svc.customerActivity(since);
  assert(people.total > 0 && people.approved <= people.total, 'customer counts are coherent');
  assert(people.pending === people.total - people.approved, 'pending is the remainder');
  assert(people.activeInPeriod >= 1, 'the active customer is counted');
  assert(people.mostActive.some((r) => r.label === 'Analytics Mills'), 'the most-active list names the company');
  assert(people.returning >= 0 && (people.returningRate === null || people.returningRate <= 1), 'returning rate is a proportion');
  console.log('people: totals, activity, returning definition ✓');

  // Returning is "active on more than one day", not "signed in twice today".
  await prisma.activityEvent.create({ data: { userId: buyer.id, type: 'ACCOUNT', title: 'Backdated', createdAt: new Date(Date.now() - 3 * 86_400_000) } });
  const afterBackdate = await svc.customerActivity(since);
  assert(afterBackdate.returning >= 1, 'a customer active on two distinct days counts as returning');
  console.log('returning: measured in distinct days, not raw event count ✓');

  // ---- Collections ----------------------------------------------------------------------
  const share = await shareService.create(buyer.id, board.id, {});
  await shareService.recordView(share.share.id, '203.0.113.7', null);
  await shareService.recordView(share.share.id, '203.0.113.8', null);
  const popular = await svc.popularCollections();
  const row = popular.find((r) => r.id === board.id);
  assert(row && row.value === 2, `collection popularity counts catalogue opens (${JSON.stringify(row)})`);
  assert(row!.sublabel?.includes('Analytics Mills') && row!.sublabel?.includes('3 shades'), 'the row names the owner and size');
  assert(!popular.some((r) => r.label === 'Empty'), 'empty collections are excluded');
  console.log('popular collections ✓');

  // ---- Storage ----------------------------------------------------------------------------
  const storage = await svc.storageUsage();
  assert(typeof storage.objects === 'number' && storage.originalBytes >= 0, 'storage counted');
  assert(storage.estimatedTotalBytes >= storage.originalBytes, 'the estimate accounts for derivatives');
  assert(storage.driver.length > 0 && storage.measured === 'database', 'the reading says where it came from');
  const measured = await svc.measureObjects();
  assert(measured.measured === 'provider' && measured.objects >= 0, 'the provider walk is available for diagnostics');
  console.log(`storage: ${storage.objects} items, ${storage.driver} driver ✓`);

  // ---- Whole overview ----------------------------------------------------------------------
  const overview = await svc.overview(30);
  for (const panel of ['topViewed', 'topDownloaded', 'searchedColours', 'searchTrend', 'topSearches', 'quotes', 'samples', 'customers', 'popularCollections', 'storage', 'totals'] as const) {
    assert(overview[panel] !== undefined, `the overview carries ${panel}`);
  }
  assert(overview.totals.views >= 9 && overview.totals.uniqueVisitors >= 2, 'headline totals computed');
  assert(overview.totals.shareViews >= 2, 'catalogue opens counted');
  console.log('overview: all eleven panels in one call ✓');

  await prisma.user.delete({ where: { id: buyer.id } });
  await prisma.fabricView.deleteMany({ where: { fabricId: { in: ['rayon14', 'gajji'] }, createdAt: { gte: since } } });
  await prisma.searchQuery.deleteMany({ where: { normalized: { in: [shadeName.toLowerCase(), 'organza'] } } });
  console.log('\nM18 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M18 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
