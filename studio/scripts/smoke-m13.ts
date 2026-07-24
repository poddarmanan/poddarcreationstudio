import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/** M13 — saved collections: boards, notes, quantities, ordering, duplication, send-to-sales. */
async function main() {
  const { collectionService: svc } = getContainer();

  const buyer = await prisma.user.create({
    data: { name: 'Board Buyer', email: `smoke-m13-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true },
  });
  const fabric = await prisma.fabric.findFirstOrThrow({ where: { id: 'gajji' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: fabric.id }, orderBy: { order: 'asc' }, take: 4 });

  // ---- Board lifecycle ------------------------------------------------------
  const board = await svc.create(buyer.id, '  Wedding collection  ', 'Reds and golds for the October book');
  assert(board.name === 'Wedding collection', 'name is trimmed');
  assert(board.description?.startsWith('Reds'), 'description stored');

  // ---- Items: ordering, notes, quantities -----------------------------------
  for (const shade of shades) await svc.addItem(buyer.id, board.id, { fabricId: fabric.id, colourId: shade.id });
  const duplicateAdd = await svc.addItem(buyer.id, board.id, { fabricId: fabric.id, colourId: shades[0].id });
  const loaded = await svc.get(buyer.id, board.id);
  assert(loaded.items.length === 4, `adding the same shade twice is a no-op (got ${loaded.items.length})`);
  assert(duplicateAdd.id === loaded.items[0].id, 'the duplicate add returns the existing item');
  assert(loaded.items.map((i) => i.position).join(',') === '0,1,2,3', 'items get sequential positions');
  console.log('board: create, add items, dedupe, positions ✓');

  await svc.updateItem(buyer.id, board.id, loaded.items[0].id, { note: 'lehenga base', quantity: 240, unit: 'm' });
  const annotated = await svc.get(buyer.id, board.id);
  assert(annotated.items[0].note === 'lehenga base' && annotated.items[0].quantity === 240, 'note + quantity persisted');
  assert(annotated.items[1].unit === 'm', 'unit defaults to metres');
  console.log('items: notes + quantities ✓');

  // ---- Reorder --------------------------------------------------------------
  const reversed = [...annotated.items].reverse().map((i) => i.id);
  await svc.reorder(buyer.id, board.id, reversed);
  const reordered = await svc.get(buyer.id, board.id);
  assert(reordered.items.map((i) => i.id).join(',') === reversed.join(','), 'reorder persisted');
  await assert.rejects(() => svc.reorder(buyer.id, board.id, reversed.slice(1)), /every item/i, 'a partial reorder is refused');
  await assert.rejects(() => svc.reorder(buyer.id, board.id, [...reversed.slice(1), 'not-an-item']), /every item/i, 'a foreign id in a reorder is refused');
  console.log('reorder: persisted, partial and foreign ids refused ✓');

  // ---- Cover ----------------------------------------------------------------
  const coverId = reordered.items[1].id;
  await svc.update(buyer.id, board.id, { coverItemId: coverId });
  assert((await svc.get(buyer.id, board.id)).coverItemId === coverId, 'cover set');
  await svc.removeItem(buyer.id, board.id, coverId);
  const afterCoverDelete = await svc.get(buyer.id, board.id);
  assert(afterCoverDelete.coverItemId === null, 'deleting the cover item clears the reference');
  assert(afterCoverDelete.items.length === 3, 'item removed');
  console.log('cover: set, and cleared when its item is deleted ✓');

  // ---- Duplication ----------------------------------------------------------
  const copy = await svc.duplicate(buyer.id, board.id);
  assert(copy.name === 'Wedding collection (copy)', 'copy is named');
  assert(copy.items.length === 3, 'copy carries every item');
  assert(copy.items.some((i) => i.note === 'lehenga base' && i.quantity === 240), 'copy carries notes and quantities');
  assert(copy.id !== board.id && copy.items[0].id !== afterCoverDelete.items[0].id, 'copy is independent');
  console.log('duplicate ✓');

  // ---- Ownership ------------------------------------------------------------
  const other = await prisma.user.create({
    data: { name: 'Other', email: `smoke-m13-other-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  await assert.rejects(() => svc.get(other.id, board.id), /not found/i, 'another customer cannot read the board');
  await assert.rejects(() => svc.addItem(other.id, board.id, { fabricId: fabric.id, colourId: shades[0].id }), /not found/i, 'another customer cannot add to the board');
  await assert.rejects(() => svc.remove(other.id, board.id), /not found/i, 'another customer cannot delete the board');
  console.log('ownership: cross-customer access refused ✓');

  // ---- Send to sales --------------------------------------------------------
  const quote = await svc.requestQuote(buyer.id, board.id, { name: buyer.name, company: 'Smoke Textiles', email: buyer.email, message: 'Need hand feel confirmed', timeline: 'October' });
  const stored = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id }, include: { items: true, events: true } });
  assert(stored.subject === 'Collection: Wedding collection', 'quote subject names the collection');
  assert(stored.items.length === 3, 'every shade travels into the quote');
  assert(stored.message?.includes('lehenga base'), 'item notes travel with the request');
  assert(stored.message?.includes('240m'), 'quantities travel with the request');
  assert(stored.userId === buyer.id, 'quote is attributed to the customer');
  assert(stored.events.length >= 1, 'quote timeline opened');
  console.log('send to sales: collection → quotation request ✓');

  const empty = await svc.create(buyer.id, 'Empty board');
  await assert.rejects(() => svc.requestQuote(buyer.id, empty.id, { name: 'x', company: 'y' }), /at least one shade/i, 'an empty board cannot be quoted');
  console.log('send to sales: empty board refused ✓');

  // ---- Summaries + updatedAt ordering ---------------------------------------
  const summaries = await svc.summaries(buyer.id);
  assert(summaries.length === 3, `3 boards summarised (got ${summaries.length})`);
  assert(summaries[0].id === empty.id, 'most recently touched board sorts first');
  assert(summaries.find((s) => s.id === board.id)!.itemCount === 3, 'summary counts items');
  console.log('summaries + recency ordering ✓');

  // ---- Swatch-book snapshot --------------------------------------------------
  await prisma.swatchBookItem.createMany({ data: shades.slice(0, 2).map((c) => ({ userId: buyer.id, fabricId: fabric.id, colourId: c.id })) });
  const snapshot = await svc.fromSwatchBook(buyer.id, 'From my book');
  assert(snapshot.items.length === 2, 'swatch-book snapshot captured the pins');
  console.log('swatch-book snapshot ✓');

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  console.log('\nM13 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M13 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
