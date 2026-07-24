import 'dotenv/config';
import assert from 'node:assert';
import { BASE, Session, signIn, expectJson } from './http-client';

/**
 * The customer journey, end to end over live HTTP (Phase 3).
 *
 *   browse → save → build a collection → annotate → reorder → request a quotation
 *
 * Every step goes through the real session, CSRF, zod and RBAC layers. Run against a
 * started server: `npx tsx scripts/smoke-http-journey.ts [baseUrl]`.
 */

interface Fabric { id: string; name: string; colours: { id: string; name: string }[] }
interface Collection { id: string; name: string; description: string | null; items: { id: string; note: string | null; quantity: number | null; unit: string | null }[] }

async function main() {
  console.log('base:', BASE);
  const buyer = await signIn('buyer@example.com', 'poddar123');

  // ---- Browse ---------------------------------------------------------------
  const { fabrics } = await buyer.json<{ fabrics: Fabric[] }>('/api/fabrics');
  assert(fabrics.length > 0 && fabrics[0].colours.length > 1, 'catalogue serves fabrics with shades');
  const fabric = fabrics[0];
  console.log(`browse: ${fabrics.length} fabrics ✓`);

  // ---- Save a favourite ------------------------------------------------------
  const fav = await expectJson<{ favourite: { id: string } }>(
    await buyer.send('/api/portal/favourites', 'POST', { fabricId: fabric.id, colourId: fabric.colours[0].id }),
    201,
    'save favourite'
  );
  console.log('save: favourite stored ✓');

  // ---- Build a collection ----------------------------------------------------
  const { collection } = await expectJson<{ collection: Collection }>(
    await buyer.send('/api/portal/collections', 'POST', { name: 'Journey collection', description: 'Built by the journey smoke' }),
    201,
    'create collection'
  );

  for (const colour of fabric.colours.slice(0, 3)) {
    await expectJson(await buyer.send(`/api/portal/collections/${collection.id}`, 'POST', { fabricId: fabric.id, colourId: colour.id }), 201, 'add item');
  }
  let board = (await buyer.json<{ collection: Collection }>(`/api/portal/collections/${collection.id}`)).collection;
  assert(board.items.length === 3, `board holds 3 shades (got ${board.items.length})`);
  console.log('build: collection with 3 shades ✓');

  // ---- Annotate --------------------------------------------------------------
  await expectJson(
    await buyer.send(`/api/portal/collections/${collection.id}/items/${board.items[0].id}`, 'PATCH', { note: 'kurti base', quantity: 180, unit: 'm' }),
    200,
    'annotate item'
  );
  board = (await buyer.json<{ collection: Collection }>(`/api/portal/collections/${collection.id}`)).collection;
  assert(board.items[0].note === 'kurti base' && board.items[0].quantity === 180, 'note + quantity persisted');
  console.log('annotate: note + quantity ✓');

  // ---- Reorder ---------------------------------------------------------------
  const reversed = [...board.items].reverse().map((i) => i.id);
  await expectJson(await buyer.send(`/api/portal/collections/${collection.id}`, 'PATCH', { order: reversed }), 200, 'reorder');
  board = (await buyer.json<{ collection: Collection }>(`/api/portal/collections/${collection.id}`)).collection;
  assert(board.items.map((i) => i.id).join() === reversed.join(), 'reorder persisted');
  console.log('reorder ✓');

  // ---- The board renders -----------------------------------------------------
  const pageRes = await buyer.fetch(`/portal/collections/${collection.id}`);
  assert(pageRes.status === 200, `board page → 200 (got ${pageRes.status})`);
  const html = await pageRes.text();
  assert(html.includes('Journey collection'), 'board page renders the collection name');
  assert(html.includes('kurti base'), 'board page renders the item note');
  console.log('board page renders ✓');

  // ---- Isolation -------------------------------------------------------------
  const staff = await signIn('sales@poddarcreation.studio', 'poddar123');
  assert((await staff.fetch(`/api/portal/collections/${collection.id}`)).status === 404, "another account cannot read the customer's board");
  // `redirect()` from a server component may answer 3xx or a 200 carrying a redirect
  // instruction, so assert the property that matters: the board's content never leaks.
  const anonRes = await new Session().fetch(`/portal/collections/${collection.id}`);
  const anonHtml = anonRes.status === 200 ? await anonRes.text() : '';
  assert(!anonHtml.includes('Journey collection') && !anonHtml.includes('kurti base'), 'anonymous never sees the board content');
  console.log('isolation: board is private to its owner ✓');

  // ---- Request a quotation ---------------------------------------------------
  const { quote } = await expectJson<{ quote: { id: string; subject: string } }>(
    await buyer.send(`/api/portal/collections/${collection.id}/quote`, 'POST', { message: 'Please quote for October', timeline: 'October' }),
    201,
    'request quotation'
  );
  assert(quote.subject === 'Journey collection'.replace(/^/, 'Collection: '), `quote names the collection (got "${quote.subject}")`);

  const { quotes } = await buyer.json<{ quotes: { id: string; status: string }[] }>('/api/portal/quotes');
  assert(quotes.some((q) => q.id === quote.id), 'the quotation appears in the customer\'s own list');
  console.log('request quotation: collection → quote, visible to the customer ✓');

  // ---- Cleanup ---------------------------------------------------------------
  await buyer.send(`/api/portal/collections/${collection.id}`, 'DELETE');
  await buyer.send(`/api/portal/favourites/${fav.favourite.id}`, 'DELETE');
  console.log('\nHTTP JOURNEY SMOKE PASSED');
}

main().catch((e) => {
  console.error('HTTP JOURNEY SMOKE FAILED:', e);
  process.exit(1);
});
