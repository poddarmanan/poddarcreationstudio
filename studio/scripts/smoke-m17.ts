import 'dotenv/config';
import assert from 'node:assert';
import { writeFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { issueShareTicket, shareCookieName, verifyShareTicket } from '../src/server/share/share-cookie';

/** M17 — catalogue sharing: links, passphrases, expiry, revocation, QR, PDF, print, email. */
async function main() {
  const { shareService: svc, collectionService } = getContainer();

  const buyer = await prisma.user.create({
    data: { name: 'Share Buyer', email: `smoke-m17-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true },
  });
  const other = await prisma.user.create({
    data: { name: 'Other', email: `smoke-m17-other-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  const shades = await prisma.colour.findMany({ where: { fabricId: 'gajji' }, orderBy: { order: 'asc' }, take: 7 });

  const board = await collectionService.create(buyer.id, 'Wedding collection', 'Reds and golds for the October book');
  for (const [index, shade] of shades.entries()) {
    await collectionService.addItem(buyer.id, board.id, { fabricId: 'gajji', colourId: shade.id, quantity: 120 + index * 10, note: index === 0 ? 'lehenga base' : null });
  }

  // ---- An open link ------------------------------------------------------------
  const open = await svc.create(buyer.id, board.id, { title: 'Autumn book', message: 'For the Ahmedabad buyer' });
  assert(open.url.includes('/c/'), 'the link points at the public catalogue route');
  assert(open.token.length >= 40, 'the token carries real entropy');

  const stored = await prisma.collectionShare.findUniqueOrThrow({ where: { id: open.share.id } });
  assert(stored.tokenHash !== open.token, 'the raw token is never stored');
  assert(!JSON.stringify(stored).includes(open.token), 'no column holds the raw token');
  console.log('create: link issued, only its hash stored ✓');

  const resolved = await svc.resolve(open.token);
  assert(resolved.ok, 'an open link resolves');
  if (!resolved.ok) return;
  assert(resolved.share.items.length === 7, 'every shade travels with the catalogue');
  assert(resolved.share.items[0].note === 'lehenga base', 'notes travel');
  assert(resolved.share.items[0].quantity === 120, 'quantities travel');
  assert(resolved.share.title === 'Autumn book', 'the share title overrides the board name');

  // The public payload must not carry anything private.
  const payload = JSON.stringify(resolved.share);
  assert(!payload.includes(buyer.email) && !payload.includes(buyer.name), 'the public payload carries no owner identity');
  assert(!payload.includes('userId'), 'the public payload carries no user ids');
  console.log('resolve: shades, notes and quantities only — no owner identity ✓');

  assert(!(await svc.resolve('not-a-real-token')).ok, 'a wrong token does not resolve');
  console.log('resolve: unknown token refused ✓');

  // ---- Ownership -----------------------------------------------------------------
  await assert.rejects(() => svc.create(other.id, board.id), /not found/i, "another customer cannot share this collection");
  await assert.rejects(() => svc.list(other.id, board.id), /not found/i, "another customer cannot list this collection's links");
  await assert.rejects(() => svc.revoke(other.id, open.share.id), /not found/i, 'another customer cannot revoke this link');
  console.log('ownership: only the owner can share, list or revoke ✓');

  // ---- Passphrase ------------------------------------------------------------------
  const locked = await svc.create(buyer.id, board.id, { password: 'open-sesame', allowDownload: false });
  const noPassword = await svc.resolve(locked.token);
  assert(!noPassword.ok && noPassword.reason === 'PASSWORD_REQUIRED', 'a protected link asks for the passphrase');
  const wrongPassword = await svc.resolve(locked.token, 'guess');
  assert(!wrongPassword.ok && wrongPassword.reason === 'PASSWORD_REQUIRED', 'a wrong passphrase is refused, and reports nothing else');
  const rightPassword = await svc.resolve(locked.token, 'open-sesame');
  assert(rightPassword.ok, 'the right passphrase opens it');
  assert(rightPassword.ok && !rightPassword.share.allowDownload, 'allowDownload=false travels with the share');

  const lockedRow = await prisma.collectionShare.findUniqueOrThrow({ where: { id: locked.share.id } });
  assert(lockedRow.passwordHash && !lockedRow.passwordHash.includes('open-sesame'), 'the passphrase is stored hashed');
  console.log('passphrase: required, verified, stored hashed ✓');

  // The unlock ticket lets a visitor through without re-entering the passphrase, and only them.
  const ticket = issueShareTicket(locked.share.id);
  assert(verifyShareTicket(locked.share.id, ticket), 'a fresh ticket verifies');
  assert(!verifyShareTicket(open.share.id, ticket), "a ticket for one share does not open another");
  assert(!verifyShareTicket(locked.share.id, ticket.replace(/.$/, 'x')), 'a tampered ticket is refused');
  assert(!verifyShareTicket(locked.share.id, `${Date.now() - 1000}.abc`), 'an expired ticket is refused');

  const viaTicket = await svc.resolveWithTicket(locked.token, [{ name: shareCookieName(locked.share.id), value: ticket }]);
  assert(viaTicket, 'a held ticket opens the catalogue');
  assert(!(await svc.resolveWithTicket(locked.token, [{ name: shareCookieName(locked.share.id), value: 'forged' }])), 'a forged ticket does not');
  assert(!(await svc.resolveWithTicket(locked.token, [])), 'no ticket, no entry');
  console.log('unlock ticket: scoped to one share, tamper-proof, expiring ✓');

  // ---- Expiry + revocation ------------------------------------------------------------
  await assert.rejects(() => svc.create(buyer.id, board.id, { expiresAt: new Date(Date.now() - 1000) }), /in the future/i, 'an expiry in the past is refused');

  const expiring = await svc.create(buyer.id, board.id, { expiresAt: new Date(Date.now() + 60_000) });
  assert((await svc.resolve(expiring.token)).ok, 'an in-date link works');
  await prisma.collectionShare.update({ where: { id: expiring.share.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await svc.resolve(expiring.token);
  assert(!expired.ok && expired.reason === 'EXPIRED', 'a past-date link reports EXPIRED');

  await svc.revoke(buyer.id, open.share.id);
  const revoked = await svc.resolve(open.token);
  assert(!revoked.ok && revoked.reason === 'REVOKED', 'a revoked link reports REVOKED');
  console.log('expiry + revocation ✓');

  // ---- View tracking ---------------------------------------------------------------------
  await svc.recordView(locked.share.id, '203.0.113.9', 'https://example.com/mail');
  await svc.recordView(locked.share.id, '203.0.113.9', null);
  await svc.recordView(locked.share.id, '198.51.100.4', null);
  const counted = await prisma.collectionShare.findUniqueOrThrow({ where: { id: locked.share.id }, include: { views: true } });
  assert(counted.viewCount === 3 && counted.views.length === 3, 'views counted and logged');
  assert(counted.lastViewedAt, 'lastViewedAt stamped');
  const visitors = new Set(counted.views.map((v) => v.visitorId));
  assert(visitors.size === 2, 'repeat visits from one address share a visitor id');
  assert(![...visitors].some((v) => v?.includes('203.0.113')), 'the raw address is never stored');
  console.log('views: counted, deduplicated by hashed visitor, no address retained ✓');

  // ---- QR ------------------------------------------------------------------------------
  const qr = await svc.qrDataUrl(open.url);
  assert(qr.startsWith('data:image/png;base64,') && qr.length > 500, 'QR code generated');
  console.log('QR code ✓');

  // ---- PDF -------------------------------------------------------------------------------
  const pdf = svc.pdf(rightPassword.ok ? rightPassword.share : resolved.share, 'The Ahmedabad Buyer');
  const head = pdf.subarray(0, 8).toString('latin1');
  const tail = pdf.subarray(-32).toString('latin1');
  assert(head.startsWith('%PDF-1.4'), 'PDF header');
  assert(tail.includes('%%EOF'), 'PDF trailer');

  const text = pdf.toString('latin1');
  assert(/\/Type\s*\/Catalog/.test(text), 'catalog object present');
  assert(/\/Type\s*\/Pages/.test(text), 'pages tree present');
  assert(/\/Type\s*\/Page[^s]/.test(text), 'at least one page object');
  assert(text.includes('PODDAR'), 'brand mark rendered');
  assert(text.includes(shades[0].name), 'shade names rendered');
  assert(text.includes('Prepared for The Ahmedabad Buyer'), 'prepared-for line rendered');

  // The cross-reference table has to agree with the object count, or readers reject the file.
  const objectCount = (text.match(/^\d+ 0 obj$/gm) ?? []).length;
  const sizeMatch = /\/Size (\d+)/.exec(text);
  assert(sizeMatch && Number(sizeMatch[1]) === objectCount + 1, `xref /Size matches the object count (objects=${objectCount}, size=${sizeMatch?.[1]})`);
  const xrefEntries = (text.match(/^\d{10} \d{5} [nf] $/gm) ?? []).length;
  assert(xrefEntries === objectCount + 1, `xref lists every object (entries=${xrefEntries}, objects=${objectCount})`);

  // startxref must point at the actual "xref" keyword, else the file will not open.
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  assert(Number.isFinite(startxref) && text.slice(startxref, startxref + 4) === 'xref', 'startxref points at the xref table');
  console.log(`PDF: valid 1.4 structure, ${objectCount} objects, xref consistent (${pdf.length} bytes) ✓`);

  // A long catalogue paginates.
  const many = svc.pdf({ ...resolved.share, items: Array.from({ length: 40 }, (_, i) => ({ ...resolved.share.items[0], id: `x${i}`, colourName: `Shade ${i}` })) });
  const manyText = many.toString('latin1');
  assert((manyText.match(/\/Type\s*\/Page[^s]/g) ?? []).length >= 2, 'a long catalogue runs to several pages');
  assert(manyText.includes('Shade 39'), 'the last shade of a long catalogue is rendered, not truncated');
  console.log('PDF: paginates ✓');

  await writeFile('/tmp/m17-catalogue.pdf', pdf);
  console.log('PDF written to /tmp/m17-catalogue.pdf for inspection');

  // ---- Email ---------------------------------------------------------------------------
  const emailed = await svc.emailCatalogue(buyer.id, locked.share.id, locked.token, ['buyer1@example.com', 'buyer2@example.com'], buyer.name);
  assert(emailed.sent === 2, `catalogue emailed to both recipients (sent ${emailed.sent})`);
  await assert.rejects(() => svc.emailCatalogue(buyer.id, locked.share.id, 'wrong-token', ['x@example.com'], buyer.name), /does not belong/i, 'a token from another share is refused');
  await assert.rejects(() => svc.emailCatalogue(other.id, locked.share.id, locked.token, ['x@example.com'], 'Other'), /not found/i, 'another customer cannot email this catalogue');
  await assert.rejects(() => svc.emailCatalogue(buyer.id, locked.share.id, locked.token, [], buyer.name), /between one and ten/i, 'an empty recipient list is refused');
  console.log('email: owner only, token-bound, bounded recipients ✓');

  // ---- Owner's list ----------------------------------------------------------------------
  const list = await svc.list(buyer.id, board.id);
  assert(list.length === 3, `every link is listed (got ${list.length})`);
  assert(list.some((s) => s.hasPassword), 'the list flags protected links');
  assert(!JSON.stringify(list).includes('tokenHash'), 'the list never exposes token hashes');
  console.log("owner's link list ✓");

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  console.log('\nM17 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M17 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
