import 'dotenv/config';
import assert from 'node:assert';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

async function main() {
  const svc = getContainer().dealerService;

  const buyer = await prisma.user.findUniqueOrThrow({ where: { email: 'buyer@example.com' } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@poddarcreation.studio' } });
  const fabric = await prisma.fabric.findUniqueOrThrow({ where: { id: 'rayon14' } });
  const colours = await prisma.colour.findMany({ where: { fabricId: 'rayon14' }, orderBy: { order: 'asc' }, take: 3 });

  // Clean slate for the buyer.
  await prisma.$transaction([
    prisma.favourite.deleteMany({ where: { userId: buyer.id } }),
    prisma.collection.deleteMany({ where: { userId: buyer.id } }),
    prisma.recentlyViewed.deleteMany({ where: { userId: buyer.id } }),
    prisma.download.deleteMany({ where: { userId: buyer.id } }),
    prisma.swatchBookItem.deleteMany({ where: { userId: buyer.id } }),
  ]);

  // Profile upsert (create then update).
  await svc.upsertProfile(buyer.id, { company: 'Anand Garments', gstNumber: '27AABCU9603R1ZM', shippingCity: 'Mumbai', prefWhatsapp: true });
  let profile = await svc.getProfile(buyer.id);
  assert(profile?.gstNumber === '27AABCU9603R1ZM', 'profile created');
  await svc.upsertProfile(buyer.id, { shippingState: 'Maharashtra' });
  profile = await svc.getProfile(buyer.id);
  assert(profile?.shippingState === 'Maharashtra' && profile?.company === 'Anand Garments', 'profile updated, preserved');
  console.log('profile: create + update ✓');

  // Favourites: a colour + a whole fabric, with dedupe.
  await svc.addFavourite(buyer.id, fabric.id, colours[0].id);
  await svc.addFavourite(buyer.id, fabric.id, colours[0].id); // dup
  await svc.addFavourite(buyer.id, fabric.id, null); // fabric-level
  const favs = await svc.listFavourites(buyer.id);
  assert(favs.length === 2, `2 favourites after dedupe (got ${favs.length})`);
  assert(favs.some((f) => f.colour?.hex), 'favourite carries colour hex');
  console.log('favourites: add + dedupe + fabric-level ✓');

  // Ownership: admin cannot remove buyer's favourite.
  await assert.rejects(() => svc.removeFavourite(admin.id, favs[0].id), /Not found/, 'ownership enforced on favourites');

  // Collections: manual + snapshot from swatch book.
  await prisma.swatchBookItem.createMany({ data: colours.map((c) => ({ userId: buyer.id, fabricId: fabric.id, colourId: c.id })) });
  const manual = await svc.createCollection(buyer.id, 'Summer palette');
  await svc.addToCollection(buyer.id, manual.id, fabric.id, colours[1].id, 'for kurtis');
  const snap = await svc.collectionFromSwatchBook(buyer.id, 'From my book');
  let cols = await svc.listCollections(buyer.id);
  const snapCol = cols.find((c) => c.id === snap.id)!;
  assert(cols.length === 2, '2 collections');
  assert(snapCol.items.length === 3, `snapshot captured 3 swatch-book items (got ${snapCol.items.length})`);
  console.log('collections: manual + add-item + swatch-book snapshot ✓');

  // Ownership: admin cannot delete buyer's collection.
  await assert.rejects(() => svc.deleteCollection(admin.id, manual.id), /Not found/, 'ownership enforced on collections');
  await svc.removeCollectionItem(buyer.id, manual.id, (await svc.listCollections(buyer.id)).find((c) => c.id === manual.id)!.items[0].id);
  cols = await svc.listCollections(buyer.id);
  assert(cols.find((c) => c.id === manual.id)!.items.length === 0, 'collection item removed');

  // Recently viewed: bump semantics (re-view updates, no dup).
  await svc.recordView(buyer.id, fabric.id, colours[0].id);
  await svc.recordView(buyer.id, fabric.id, colours[1].id);
  await svc.recordView(buyer.id, fabric.id, colours[0].id); // re-view
  const recent = await svc.listRecent(buyer.id);
  assert(recent.length === 2, `2 recent entries after re-view (got ${recent.length})`);
  assert(recent[0].colourId === colours[0].id, 're-viewed item bubbles to top');
  console.log('recently viewed: dedupe + bump ✓');

  // Downloads.
  await svc.recordDownload(buyer.id, 'SPEC', fabric.id, colours[0].id);
  await svc.recordDownload(buyer.id, 'CATALOGUE', fabric.id, null);
  const dls = await svc.listDownloads(buyer.id);
  assert(dls.length === 2, '2 downloads logged');
  console.log('downloads: logged ✓');

  const dash = await svc.dashboard(buyer.id);
  assert(dash.favourites === 2 && dash.collections === 2 && dash.downloads === 2, 'dashboard aggregates');
  console.log('dashboard aggregate:', JSON.stringify(dash), '✓');

  console.log('\nM6 SMOKE PASSED');
}

main()
  .catch((e) => {
    console.error('M6 SMOKE FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
