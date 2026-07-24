import 'dotenv/config';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { getContainer } from '../src/server/container';
import { prisma } from '../src/lib/prisma';
import { isStaff, isAdmin, isCustomer, STAFF_ROLES } from '../src/server/core/rbac';

/** M12 — customer accounts: address book, contact people, account security, role boundary. */
async function main() {
  const { customerService } = getContainer();

  const email = `smoke-m12-${Date.now()}@example.com`;
  const buyer = await prisma.user.create({
    data: { name: 'Smoke Buyer', email, passwordHash: await bcrypt.hash('initial-password', 10), role: 'BUYER', approved: false },
  });

  // ---- Address book ---------------------------------------------------------
  const first = await customerService.addAddress(buyer.id, { line1: '12 Mill Road', city: 'Surat', state: 'Gujarat', pincode: '395003' });
  assert(first.isDefault, 'the first address becomes the default automatically');

  const second = await customerService.addAddress(buyer.id, { label: 'Warehouse', line1: '9 Ring Road', city: 'Surat' });
  assert(!second.isDefault, 'a later address does not steal the default');

  await customerService.updateAddress(buyer.id, second.id, { isDefault: true });
  const afterPromote = await customerService.listAddresses(buyer.id);
  assert(afterPromote.filter((a) => a.isDefault).length === 1, 'exactly one default at a time');
  assert(afterPromote[0].id === second.id, 'the default sorts first');
  assert((await customerService.defaultAddress(buyer.id))!.id === second.id, 'defaultAddress resolves the promoted row');
  console.log('address book: create, default handling, promotion ✓');

  await customerService.removeAddress(buyer.id, second.id);
  const afterDelete = await customerService.listAddresses(buyer.id);
  assert(afterDelete.length === 1 && afterDelete[0].isDefault, 'deleting the default promotes the survivor');
  console.log('address book: delete promotes a survivor ✓');

  // ---- Contact people -------------------------------------------------------
  const primary = await customerService.addContact(buyer.id, { name: 'Asha Mehta', designation: 'Merchandiser', email: 'ASHA@Example.com ' });
  assert(primary.isPrimary, 'the first contact becomes primary');
  assert(primary.email === 'asha@example.com', 'contact email is normalised');
  const secondary = await customerService.addContact(buyer.id, { name: 'Ravi Shah', designation: 'Accounts' });
  await customerService.updateContact(buyer.id, secondary.id, { isPrimary: true });
  const contacts = await customerService.listContacts(buyer.id);
  assert(contacts.filter((c) => c.isPrimary).length === 1, 'exactly one primary contact');
  console.log('contact people: create, normalise, single primary ✓');

  // ---- Ownership boundary ---------------------------------------------------
  const other = await prisma.user.create({
    data: { name: 'Other Buyer', email: `smoke-m12-other-${Date.now()}@example.com`, passwordHash: await bcrypt.hash('x'.repeat(12), 10), role: 'BUYER' },
  });
  await assert.rejects(() => customerService.updateAddress(other.id, first.id, { city: 'Hijack' }), /not found/i, 'another customer cannot edit this address');
  await assert.rejects(() => customerService.removeContact(other.id, primary.id), /not found/i, 'another customer cannot delete this contact');
  console.log('ownership: cross-customer access refused ✓');

  // ---- Account security -----------------------------------------------------
  await assert.rejects(() => customerService.changePassword(buyer.id, 'wrong-password', 'a-new-password'), /current password/i, 'wrong current password refused');
  await customerService.changePassword(buyer.id, 'initial-password', 'a-new-password');
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
  assert(await bcrypt.compare('a-new-password', updated.passwordHash), 'password actually changed');

  const resend = await customerService.resendVerification(buyer.id);
  assert(resend.sent, 'verification resent for an unverified account');
  await prisma.user.update({ where: { id: buyer.id }, data: { emailVerifiedAt: new Date() } });
  assert(!(await customerService.resendVerification(buyer.id)).sent, 'no resend once verified');
  console.log('account security: password change + verification resend ✓');

  // ---- Login stamp ----------------------------------------------------------
  await customerService.recordLogin(buyer.id);
  assert((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).lastLoginAt, 'lastLoginAt stamped');

  // ---- Account aggregate ----------------------------------------------------
  const account = await customerService.account(buyer.id);
  assert(account.addresses.length === 1 && account.contacts.length === 2, 'account aggregate carries the address book and contacts');
  assert(account.user.email === email, 'account aggregate carries the identity');
  console.log('account aggregate ✓');

  // ---- Role policy ----------------------------------------------------------
  assert(isStaff('SALES') && isStaff('ADMIN') && isStaff('MANAGER'), 'staff roles recognised');
  assert(!isStaff('BUYER') && !isStaff('VIEWER') && !isStaff(undefined), 'customers are never staff');
  assert(isAdmin('MANAGER') && !isAdmin('SALES'), 'admin tier excludes sales');
  assert(isCustomer('BUYER') && !isCustomer('ADMIN'), 'customer tier excludes staff');
  assert(!STAFF_ROLES.includes('BUYER'), 'BUYER is not in the staff role set');
  console.log('role policy ✓');

  // ---- Address backfill (migration) ------------------------------------------
  const profiled = await prisma.dealerProfile.findFirst({ where: { shippingLine1: { not: null } } });
  if (profiled) {
    const backfilled = await prisma.shippingAddress.findFirst({ where: { userId: profiled.userId } });
    assert(backfilled, 'profile addresses were backfilled into the address book');
    console.log('migration backfill ✓');
  }

  await prisma.user.deleteMany({ where: { id: { in: [buyer.id, other.id] } } });
  console.log('\nM12 SMOKE PASSED');
}

main()
  .catch((e) => { console.error('M12 SMOKE FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
