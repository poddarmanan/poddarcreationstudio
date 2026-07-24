import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';
import { assertOwned } from '../core/rbac';
import type { EmailService } from '../email/email.service';
import type { TokenService } from '../email/token.service';
import type { Telemetry } from '../core/telemetry';

export interface AddressInput {
  label?: string;
  contactName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  pincode?: string | null;
  country?: string;
  isDefault?: boolean;
}

export interface ContactInput {
  name: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  isPrimary?: boolean;
}

/**
 * Customer account domain (Phase 3 M12): shipping address book, contact people, and account
 * security (password change, verification resend). Every method is scoped by `userId` — the
 * service has no notion of "any user", so a customer physically cannot reach another's rows.
 */
export class CustomerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly tokens: TokenService,
    private readonly telemetry: Telemetry
  ) {}

  // ---- Shipping addresses ----------------------------------------------------
  listAddresses(userId: string) {
    return this.db.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** The address sample/quote flows should pre-fill with. */
  defaultAddress(userId: string) {
    return this.db.shippingAddress.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  }

  async addAddress(userId: string, input: AddressInput) {
    const count = await this.db.shippingAddress.count({ where: { userId } });
    // The first address a customer saves is always their default — otherwise nothing would
    // pre-fill until they explicitly picked one.
    const isDefault = input.isDefault ?? count === 0;
    if (isDefault) await this.clearDefault(userId);
    const address = await this.db.shippingAddress.create({
      data: {
        userId,
        label: input.label?.trim() || 'Delivery address',
        contactName: input.contactName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        country: input.country || 'India',
        isDefault,
      },
    });
    this.telemetry.capture({ name: 'customer.address.added', actorId: userId });
    return address;
  }

  async updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
    const existing = await this.db.shippingAddress.findUnique({ where: { id } });
    assertOwned(existing, userId, 'Address not found');
    if (input.isDefault) await this.clearDefault(userId);
    return this.db.shippingAddress.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label?.trim() || 'Delivery address' } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.line2 !== undefined ? { line2: input.line2 } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
        ...(input.country !== undefined ? { country: input.country || 'India' } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
  }

  async removeAddress(userId: string, id: string) {
    const existing = await this.db.shippingAddress.findUnique({ where: { id } });
    assertOwned(existing, userId, 'Address not found');
    await this.db.shippingAddress.delete({ where: { id } });
    // Never leave a customer without a default: promote the oldest survivor.
    if (existing!.isDefault) {
      const next = await this.db.shippingAddress.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      if (next) await this.db.shippingAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  private clearDefault(userId: string) {
    return this.db.shippingAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  // ---- Contact people --------------------------------------------------------
  listContacts(userId: string) {
    return this.db.contactPerson.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addContact(userId: string, input: ContactInput) {
    const count = await this.db.contactPerson.count({ where: { userId } });
    const isPrimary = input.isPrimary ?? count === 0;
    if (isPrimary) await this.clearPrimary(userId);
    const contact = await this.db.contactPerson.create({
      data: {
        userId,
        name: input.name,
        designation: input.designation,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone,
        whatsapp: input.whatsapp,
        isPrimary,
      },
    });
    this.telemetry.capture({ name: 'customer.contact.added', actorId: userId });
    return contact;
  }

  async updateContact(userId: string, id: string, input: Partial<ContactInput>) {
    const existing = await this.db.contactPerson.findUnique({ where: { id } });
    assertOwned(existing, userId, 'Contact not found');
    if (input.isPrimary) await this.clearPrimary(userId);
    return this.db.contactPerson.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.designation !== undefined ? { designation: input.designation } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim().toLowerCase() || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    });
  }

  async removeContact(userId: string, id: string) {
    const existing = await this.db.contactPerson.findUnique({ where: { id } });
    assertOwned(existing, userId, 'Contact not found');
    await this.db.contactPerson.delete({ where: { id } });
  }

  private clearPrimary(userId: string) {
    return this.db.contactPerson.updateMany({ where: { userId, isPrimary: true }, data: { isPrimary: false } });
  }

  // ---- Account security ------------------------------------------------------
  /** Change password with the current one as proof of possession; invalidates nothing else. */
  async changePassword(userId: string, currentPassword: string, nextPassword: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('Account not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw AppError.validation('Your current password is incorrect');
    if (currentPassword === nextPassword) throw AppError.validation('Choose a password you have not used here before');
    await this.db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(nextPassword, 10) } });
    this.telemetry.capture({ name: 'customer.password.changed', actorId: userId });
  }

  /** Re-send email verification. No-op (silently successful) when already verified. */
  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('Account not found');
    if (user.emailVerifiedAt) return { sent: false };
    const raw = await this.tokens.issue({ type: 'EMAIL_VERIFICATION', email: user.email, userId: user.id, ttlMs: 24 * 60 * 60 * 1000 });
    await this.email.sendVerification(user.email, user.name, raw);
    return { sent: true };
  }

  /** Everything the account panel needs, in one round trip. */
  async account(userId: string) {
    const [user, profile, addresses, contacts] = await Promise.all([
      this.db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, company: true, role: true, approved: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true },
      }),
      this.db.dealerProfile.findUnique({ where: { userId } }),
      this.listAddresses(userId),
      this.listContacts(userId),
    ]);
    if (!user) throw AppError.notFound('Account not found');
    return { user, profile, addresses, contacts };
  }

  /** Records a successful sign-in. Best-effort: never blocks authentication. */
  async recordLogin(userId: string) {
    await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }).catch(() => {});
  }
}
