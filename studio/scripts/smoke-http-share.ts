import 'dotenv/config';
import assert from 'node:assert';
import { BASE, Session, signIn, expectJson } from './http-client';

/**
 * Catalogue sharing over live HTTP (Phase 3 M17): create a link, open it anonymously, hit the
 * password gate, unlock it, pull the PDF, and prove revocation actually closes the door.
 *
 * Run against a started server: `npx tsx scripts/smoke-http-share.ts [baseUrl]`.
 */

interface Fabric { id: string; colours: { id: string }[] }

async function main() {
  console.log('base:', BASE);
  const buyer = await signIn('buyer@example.com', 'poddar123');
  const anon = new Session();

  const { fabrics } = await buyer.json<{ fabrics: Fabric[] }>('/api/fabrics');
  const fabric = fabrics[0];

  const { collection } = await expectJson<{ collection: { id: string } }>(
    await buyer.send('/api/portal/collections', 'POST', { name: 'Share smoke board', description: 'For the HTTP share smoke' }),
    201,
    'create collection'
  );
  for (const colour of fabric.colours.slice(0, 4)) {
    await buyer.send(`/api/portal/collections/${collection.id}`, 'POST', { fabricId: fabric.id, colourId: colour.id, quantity: 150 });
  }

  // ---- An open link ------------------------------------------------------------
  const open = await expectJson<{ url: string; token: string; qr: string }>(
    await buyer.send(`/api/portal/collections/${collection.id}/share`, 'POST', { title: 'HTTP catalogue', message: 'Hello from the smoke' }),
    201,
    'create share'
  );
  assert(open.qr.startsWith('data:image/png;base64,'), 'the response carries a QR code');

  const path = new URL(open.url).pathname;
  const page = await anon.fetch(path);
  assert(page.status === 200, `an anonymous visitor can open the link (got ${page.status})`);
  const html = await page.text();
  assert(html.includes('HTTP catalogue'), 'the catalogue renders its title');
  assert(html.includes('Hello from the smoke'), 'the catalogue renders its message');
  assert(!html.includes('buyer@example.com'), "the public page never shows the owner's identity");
  assert(html.includes('Download PDF') && html.includes('Print catalogue'), 'download and print are offered');
  console.log('open link: anonymous visitor sees the catalogue, not the owner ✓');

  const pdf = await anon.fetch(`/api/share/${open.token}/pdf`);
  assert(pdf.status === 200, `PDF downloads (got ${pdf.status})`);
  assert(pdf.headers.get('content-type') === 'application/pdf', 'served as a PDF');
  assert(/attachment; filename=/.test(pdf.headers.get('content-disposition') ?? ''), 'served as a download');
  assert((pdf.headers.get('cache-control') ?? '').includes('no-store'), 'never held in a shared cache');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert(bytes.subarray(0, 8).toString('latin1') === '%PDF-1.4', 'the bytes really are a PDF');
  assert(bytes.length > 1000, `the PDF has content (${bytes.length} bytes)`);
  console.log(`PDF over HTTP: ${bytes.length} bytes ✓`);

  // ---- A protected link ----------------------------------------------------------
  const locked = await expectJson<{ url: string; token: string }>(
    await buyer.send(`/api/portal/collections/${collection.id}/share`, 'POST', { password: 'cloth-and-thread', allowDownload: false }),
    201,
    'create protected share'
  );
  const lockedPath = new URL(locked.url).pathname;
  const gate = new Session();
  const gateHtml = await (await gate.fetch(lockedPath)).text();
  assert(gateHtml.includes('Enter the passphrase'), 'a protected link shows the passphrase gate');
  assert(!gateHtml.includes('Share smoke board'), 'the gate reveals nothing about the collection');

  const wrong = await gate.send(`/api/share/${locked.token}/unlock`, 'POST', { password: 'wrong' });
  assert(wrong.status === 400, `a wrong passphrase is refused (got ${wrong.status})`);
  const wrongBody = (await wrong.json()) as { error: string };
  assert(!/expired|revoked|not found/i.test(wrongBody.error), 'the refusal reveals nothing about the link');

  assert((await gate.send(`/api/share/${locked.token}/unlock`, 'POST', { password: 'cloth-and-thread' })).status === 200, 'the right passphrase unlocks');
  const unlockedHtml = await (await gate.fetch(lockedPath)).text();
  assert(unlockedHtml.includes('Share smoke board'), 'after unlocking, the catalogue renders');
  assert(!unlockedHtml.includes('Download PDF'), 'a no-download share does not offer the PDF');
  console.log('protected link: gate, wrong passphrase refused, ticket carries the visitor through ✓');

  // The ticket belongs to that visitor only.
  const eavesdropper = new Session();
  const stillGated = await (await eavesdropper.fetch(lockedPath)).text();
  assert(stillGated.includes('Enter the passphrase'), 'another visitor still meets the gate');
  assert((await eavesdropper.fetch(`/api/share/${locked.token}/pdf`)).status === 404, 'and cannot pull the PDF');

  // allowDownload=false is enforced server-side, not just hidden in the UI.
  assert((await gate.fetch(`/api/share/${locked.token}/pdf`)).status === 403, 'downloads are refused even with a valid ticket when the owner turned them off');
  console.log('protection is server-side: no ticket, no entry; no download flag, no PDF ✓');

  // ---- Revocation -------------------------------------------------------------------
  const { shares } = await buyer.json<{ shares: { id: string; revokedAt: string | null }[] }>(`/api/portal/collections/${collection.id}/share`);
  assert(shares.length === 2, `both links are listed (got ${shares.length})`);
  for (const share of shares) await buyer.send(`/api/portal/shares/${share.id}`, 'DELETE');

  const afterRevoke = await (await new Session().fetch(path)).text();
  assert(afterRevoke.includes('withdrawn'), 'a revoked link says so');
  assert(!afterRevoke.includes('HTTP catalogue'), 'and shows none of the catalogue');
  assert((await new Session().fetch(`/api/share/${open.token}/pdf`)).status === 404, 'the PDF closes with the link');
  console.log('revocation closes the page and the PDF ✓');

  // ---- Cleanup ---------------------------------------------------------------------
  await buyer.send(`/api/portal/collections/${collection.id}`, 'DELETE');
  console.log('\nHTTP SHARE SMOKE PASSED');
}

main().catch((e) => {
  console.error('HTTP SHARE SMOKE FAILED:', e);
  process.exit(1);
});
