import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';

/** M19 — notification centre: in-app + email fan-out, preferences, delivery log. */
async function main() {
  const { notificationService: svc, quoteService, sampleService, shareService, collectionService, emailService, dashboardService } = getContainer();

  const stamp = Date.now();
  const buyer = await prisma.user.create({
    data: { name: 'Notify Buyer', email: `smoke-m19-${stamp}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER', approved: true, company: 'Notify Mills' },
  });
  const other = await prisma.user.create({
    data: { name: 'Other', email: `smoke-m19-other-${stamp}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  const sales = await prisma.user.findFirstOrThrow({ where: { role: 'SALES' } });
  const shades = await prisma.colour.findMany({ where: { fabricId: 'cambric' }, orderBy: { order: 'asc' }, take: 2 });

  // ---- Every email is logged, without a call site knowing ------------------------
  const emailsBefore = await prisma.emailLog.count();
  await emailService.sendWelcome(buyer.email, buyer.name);
  const logged = await prisma.emailLog.findFirst({ where: { to: buyer.email }, orderBy: { createdAt: 'desc' } });
  assert((await prisma.emailLog.count()) === emailsBefore + 1, 'the transport decorator logged the message');
  assert(logged?.status === 'SENT' && logged.subject.includes('Welcome'), 'the log carries subject and status');
  assert(logged?.userId === buyer.id, 'the log resolves the recipient to their account');
  console.log('delivery log: every email captured by the transport decorator ✓');

  // ---- In-app notification -------------------------------------------------------
  await svc.notify({ userId: buyer.id, type: 'ACCOUNT', title: 'Welcome aboard', body: 'Your account is ready', link: '/portal' });
  const list = await svc.list(buyer.id);
  assert(list.length === 1 && list[0].title === 'Welcome aboard', 'the notification is stored');
  assert(list[0].readAt === null, 'it starts unread');
  assert((await svc.unreadCount(buyer.id)) === 1, 'unread counted');
  console.log('in-app: stored, unread ✓');

  // ---- Quote lifecycle notifies the customer --------------------------------------
  const board = await collectionService.create(buyer.id, 'Notify board');
  for (const shade of shades) await collectionService.addItem(buyer.id, board.id, { fabricId: 'cambric', colourId: shade.id });
  const quote = await collectionService.requestQuote(buyer.id, board.id, { name: buyer.name, company: 'Notify Mills', email: buyer.email });

  await quoteService.assign(quote.id, sales.id, sales.id);
  await quoteService.setPricing(quote.id, { totalValue: 1_500_000 }, sales.id);
  await quoteService.updateStatus(quote.id, 'SENT', sales.id);

  // Exactly one email per event: before M19 the quote service mailed the customer *and* the
  // notification centre would have mailed again. There is now a single path.
  const sentEmails = await prisma.emailLog.findMany({ where: { userId: buyer.id }, orderBy: { createdAt: 'asc' } });
  const statusEmails = sentEmails.filter((e) => e.subject.startsWith('Update on your quotation'));
  assert(statusEmails.length === 2, `one email per notified status change, not two (got ${statusEmails.length}: ${statusEmails.map((e) => e.subject).join(' | ')})`);

  const quoteNotes = (await svc.list(buyer.id)).filter((n) => n.type === 'QUOTE');
  assert(quoteNotes.length >= 2, `each status change notifies the customer (got ${quoteNotes.length})`);
  assert(quoteNotes.some((n) => n.title === 'Quotation sent'), 'the SENT transition notifies');
  assert(quoteNotes.every((n) => n.link?.startsWith('/portal/quotes/')), 'quote notifications link to the tracker');
  console.log('quote lifecycle → customer notifications ✓');

  // ---- Staff notifications ----------------------------------------------------------
  const staffNotes = await svc.list(sales.id);
  assert(staffNotes.some((n) => n.title === 'New quotation request'), 'the desk is told about a new inquiry');
  assert(staffNotes.some((n) => n.link === '/admin/quotes'), 'staff notifications link to the desk');
  console.log('staff notifications ✓');

  // ---- Sample lifecycle ----------------------------------------------------------------
  const sample = await sampleService.create({
    userId: buyer.id, name: buyer.name, company: 'Notify Mills', shippingLine1: '5 Dye Lane', shippingCity: 'Surat',
    items: [{ fabricId: 'cambric', colourId: shades[0].id }],
  });
  await sampleService.updateStatus(sample.id, 'APPROVED', sales.id);
  await sampleService.updateStatus(sample.id, 'DISPATCHED', sales.id, { courier: 'Bluedart', trackingNumber: 'BD123' });

  const sampleNotes = (await svc.list(buyer.id)).filter((n) => n.type === 'SAMPLE');
  assert(sampleNotes.some((n) => n.title === 'Sample request dispatched'), 'dispatch notifies the customer');
  assert(sampleNotes.some((n) => n.body?.includes('BD123')), 'the tracking number travels with it');
  assert((await svc.list(sales.id)).some((n) => n.title === 'New sample request'), 'the desk is told about a new sample request');
  console.log('sample lifecycle → customer + staff ✓');

  // ---- Catalogue opens ------------------------------------------------------------------
  const share = await shareService.create(buyer.id, board.id, {});
  await shareService.recordView(share.share.id, '203.0.113.5', null);
  const shareNotes = (await svc.list(buyer.id)).filter((n) => n.type === 'SHARE');
  assert(shareNotes.length === 1 && shareNotes[0].title.includes('Notify board'), 'the owner is told their catalogue was opened');

  // Only the first open notifies — otherwise a refreshing buyer buries the feed.
  await shareService.recordView(share.share.id, '203.0.113.6', null);
  await shareService.recordView(share.share.id, '203.0.113.7', null);
  assert((await svc.list(buyer.id)).filter((n) => n.type === 'SHARE').length === 1, 'later opens do not notify again');
  console.log('catalogue opens: notified once, not on every refresh ✓');

  // ---- Preferences: muting email never loses the message -----------------------------------
  await svc.setPreferences(buyer.id, { notifyQuotes: false });
  const prefs = await svc.preferences(buyer.id);
  assert(prefs.notifyQuotes === false && prefs.notifySamples === true, 'preferences saved per category');

  const emailsBeforeMuted = await prisma.emailLog.count({ where: { userId: buyer.id } });
  const beforeMuted = (await svc.list(buyer.id)).length;
  await svc.notify({
    userId: buyer.id,
    type: 'QUOTE',
    title: 'Muted category',
    email: { eyebrow: 'Quotation', heading: 'You should not receive this by email', paragraphs: ['Muted.'] },
  });
  assert((await svc.list(buyer.id)).length === beforeMuted + 1, 'the in-app record is still written when email is muted');
  assert((await prisma.emailLog.count({ where: { userId: buyer.id } })) === emailsBeforeMuted, 'no email is sent for a muted category');

  // An unmuted category still mails.
  await svc.notify({
    userId: buyer.id,
    type: 'SAMPLE',
    title: 'Unmuted category',
    email: { eyebrow: 'Samples', heading: 'This one does send', paragraphs: ['Sent.'] },
  });
  assert((await prisma.emailLog.count({ where: { userId: buyer.id } })) === emailsBeforeMuted + 1, 'an unmuted category still mails');

  // The master switch beats every category.
  await svc.setPreferences(buyer.id, { prefEmail: false });
  const beforeMaster = await prisma.emailLog.count({ where: { userId: buyer.id } });
  await svc.notify({ userId: buyer.id, type: 'SAMPLE', title: 'Master off', email: { eyebrow: 'Samples', heading: 'Nope', paragraphs: ['No.'] } });
  assert((await prisma.emailLog.count({ where: { userId: buyer.id } })) === beforeMaster, 'the master email switch overrides categories');
  console.log('preferences: muting a channel never loses the message ✓');

  // ---- Read state + ownership -------------------------------------------------------------
  const unreadBefore = await svc.unreadCount(buyer.id);
  assert(unreadBefore > 0, 'there is something unread');
  const marked = await svc.markRead(buyer.id);
  assert(marked === unreadBefore && (await svc.unreadCount(buyer.id)) === 0, 'mark-all-read clears the count');

  await svc.notify({ userId: other.id, type: 'SYSTEM', title: "Someone else's notification" });
  const theirs = await svc.list(other.id);
  assert((await svc.markRead(buyer.id, [theirs[0].id])) === 0, "one customer cannot mark another's notification read");
  await assert.rejects(() => svc.remove(buyer.id, theirs[0].id), /not found/i, "one customer cannot delete another's notification");
  assert((await svc.list(buyer.id)).every((n) => n.userId === buyer.id), 'the list only ever holds this account');
  console.log('read state + ownership ✓');

  // ---- The dashboard carries them ------------------------------------------------------------
  const dash = await dashboardService.forUser(buyer.id);
  assert(Array.isArray(dash.notifications) && dash.notifications.length > 0, 'the dashboard carries notifications');
  assert(typeof dash.unread === 'number' && dash.notificationPreferences.notifyQuotes === false, 'the dashboard carries the unread count and preferences');
  assert(dash.notifications.every((n) => typeof n.whenLabel === 'string'), 'relative labels are computed on the server');
  console.log('dashboard integration ✓');

  // ---- Failure logging ---------------------------------------------------------------------
  const failures = await svc.recentFailures();
  assert(Array.isArray(failures), 'the failure view is available to diagnostics');
  const forCustomer = await svc.emailsFor(buyer.id);
  assert(forCustomer.length > 0 && forCustomer[0].to === buyer.email, 'emails are retrievable per customer for the sales history');
  console.log('delivery log: per-customer history + failure view ✓');

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  await prisma.emailLog.deleteMany({ where: { to: { contains: 'smoke-m19-' } } });
  console.log('\nM19 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M19 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
