import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';
import type { EmailService } from '../email/email.service';
import type { Telemetry } from '../core/telemetry';
import { STAFF_ROLES } from '../core/rbac';

export const NOTIFICATION_TYPES = ['QUOTE', 'SAMPLE', 'SHARE', 'ACCOUNT', 'SYSTEM'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  entity?: string;
  entityId?: string;
  /** Also send an email, built from the generic notice layout. Subject to preferences. */
  email?: { eyebrow: string; heading: string; paragraphs: string[]; cta?: { label: string; url: string } };
  /**
   * Send a purpose-built template instead of the generic notice — the quote and sample flows
   * have better copy than a generic one could be. Still runs behind the same preference check
   * and the same delivery log, so there is exactly one email path per event.
   */
  emailWith?: (to: string, name: string) => Promise<void>;
}

/** Which profile switch governs which category. Categories without a switch always mail. */
const PREFERENCE_FOR: Partial<Record<NotificationType, 'notifyQuotes' | 'notifySamples' | 'notifyShares'>> = {
  QUOTE: 'notifyQuotes',
  SAMPLE: 'notifySamples',
  SHARE: 'notifyShares',
};

/**
 * The notification centre (Phase 3 M19). One fan-out for everything the platform needs to tell
 * someone, customer or staff.
 *
 * The split that matters: **the in-app notification is always written; email is a channel on
 * top of it.** So a customer who turns off quote emails still has a complete record when they
 * open the portal — muting a channel never loses the message. Email dispatch is best-effort
 * and never blocks the business transaction that triggered it.
 */
export class NotificationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly telemetry: Telemetry
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.db.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          entity: input.entity,
          entityId: input.entityId,
        },
      });
      this.telemetry.capture({ name: 'notification.created', actorId: input.userId, props: { type: input.type } });
    } catch (err) {
      this.telemetry.error(err, { where: 'notification.create' });
      return; // if we could not even record it, do not send mail about it
    }

    if (!input.email && !input.emailWith) return;
    try {
      const user = await this.db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true, dealerProfile: { select: { notifyQuotes: true, notifySamples: true, notifyShares: true, prefEmail: true } } },
      });
      if (!user) return;
      if (!this.wantsEmail(input.type, user.dealerProfile)) return;

      if (input.emailWith) await input.emailWith(user.email, user.name);
      else if (input.email) await this.email.sendStaffNotice(user.email, input.email.eyebrow, input.email.heading, input.email.paragraphs, input.email.cta);
    } catch (err) {
      // A transport hiccup must not undo the business action — the in-app record already exists.
      this.telemetry.error(err, { where: 'notification.email' });
    }
  }

  private wantsEmail(
    type: NotificationType,
    profile: { notifyQuotes: boolean; notifySamples: boolean; notifyShares: boolean; prefEmail: boolean } | null
  ): boolean {
    if (!profile) return true; // no profile yet → the account's default is "tell me"
    if (!profile.prefEmail) return false;
    const key = PREFERENCE_FOR[type];
    return key ? profile[key] : true;
  }

  /** Tell the staff. Used for new inquiries, new sample requests, and system notices. */
  async notifyStaff(input: Omit<NotifyInput, 'userId'>, roles: readonly string[] = STAFF_ROLES): Promise<number> {
    const staff = await this.db.user.findMany({ where: { role: { in: roles as ('ADMIN' | 'MANAGER' | 'SALES' | 'VIEWER' | 'BUYER')[] } }, select: { id: true } });
    await Promise.allSettled(staff.map((s) => this.notify({ ...input, userId: s.id })));
    return staff.length;
  }

  // ---- Reading -------------------------------------------------------------------
  list(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
    return this.db.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.take ?? 30, 100),
    });
  }

  unreadCount(userId: string) {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  /** Mark specific notifications read, or all of them. Scoped to the owner either way. */
  async markRead(userId: string, ids?: string[]): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.db.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!row || row.userId !== userId) throw AppError.notFound('Notification not found');
    await this.db.notification.delete({ where: { id } });
  }

  // ---- Preferences ------------------------------------------------------------------
  async preferences(userId: string) {
    const profile = await this.db.dealerProfile.findUnique({
      where: { userId },
      select: { prefEmail: true, notifyQuotes: true, notifySamples: true, notifyShares: true },
    });
    return profile ?? { prefEmail: true, notifyQuotes: true, notifySamples: true, notifyShares: true };
  }

  setPreferences(userId: string, prefs: { prefEmail?: boolean; notifyQuotes?: boolean; notifySamples?: boolean; notifyShares?: boolean }) {
    return this.db.dealerProfile.upsert({ where: { userId }, create: { userId, ...prefs }, update: prefs });
  }

  // ---- Delivery log --------------------------------------------------------------------
  /** Emails sent to one account — the email half of the sales workspace's history. */
  emailsFor(userId: string, take = 30) {
    return this.db.emailLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take });
  }

  /** Recent failures, for the M20 diagnostics. */
  recentFailures(take = 20) {
    return this.db.emailLog.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take });
  }

  // ---- Convenience builders for the flows that use this most ---------------------------
  /**
   * A quote moved. Only the states a customer benefits from hearing about are emailed —
   * internal triage and pricing stay silent, and they hear at SENT.
   */
  quoteUpdated(userId: string, quoteId: string, subject: string, status: string) {
    const nice = status.toLowerCase().replace(/_/g, ' ');
    const worthAnEmail = status === 'UNDER_REVIEW' || status === 'SENT' || status === 'ACCEPTED' || status === 'EXPIRED';
    return this.notify({
      userId,
      type: 'QUOTE',
      title: `Quotation ${nice}`,
      body: subject,
      link: `/portal/quotes/${quoteId}`,
      entity: 'Quote',
      entityId: quoteId,
      emailWith: worthAnEmail ? (to, name) => this.email.sendQuoteStatus(to, name, subject, status) : undefined,
    });
  }

  sampleUpdated(userId: string, sampleId: string, status: string, courier?: string | null, trackingNumber?: string | null) {
    const nice = status.toLowerCase();
    const detail = trackingNumber ? `${courier ?? 'Courier'} · ${trackingNumber}` : (courier ?? null);
    return this.notify({
      userId,
      type: 'SAMPLE',
      title: `Sample request ${nice}`,
      body: detail,
      link: '/portal',
      entity: 'SampleRequest',
      entityId: sampleId,
      emailWith: (to, name) => this.email.sendSampleStatus(to, name, status, courier, trackingNumber),
    });
  }

  /** The owner of a shared catalogue, when someone opens it for the first time. */
  catalogueOpened(userId: string, shareId: string, collectionName: string) {
    return this.notify({
      userId,
      type: 'SHARE',
      title: `“${collectionName}” was opened`,
      body: 'Someone you shared this catalogue with has viewed it.',
      link: '/portal',
      entity: 'CollectionShare',
      entityId: shareId,
    });
  }
}
