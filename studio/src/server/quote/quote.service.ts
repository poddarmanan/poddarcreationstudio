import type { PrismaClient } from '@/generated/prisma/client';
import type { QuoteStatus } from '@/generated/prisma/enums';
import type { EmailService } from '../email/email.service';
import type { Telemetry } from '../core/telemetry';
import type { ActivityService } from '../activity/activity.service';
import type { NotificationService } from '../notification/notification.service';
import { AppError } from '../core/errors';

export interface CreateQuoteInput {
  userId: string | null;
  name: string;
  company: string;
  email?: string | null;
  whatsapp?: string | null;
  quantity: string;
  subject: string;
  moq?: string | null;
  expectedQty?: string | null;
  country?: string | null;
  shippingMethod?: string | null;
  timeline?: string | null;
  message?: string | null;
  items: { fabricId: string; colourId: string }[];
}

const APP_URL = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * The quotation lifecycle (Phase 3 M15). Every allowed move, and nothing else — an
 * out-of-order transition is a validation error, not a silently accepted state.
 *
 *   DRAFT → SUBMITTED → UNDER_REVIEW → PRICED → SENT → ACCEPTED
 *                                                    ↘ REJECTED
 *   anything open can be REJECTED or EXPIRED; EXPIRED can be revived for a re-quote.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'EXPIRED'],
  UNDER_REVIEW: ['PRICED', 'REJECTED', 'EXPIRED'],
  // Back to UNDER_REVIEW covers re-pricing before anything reaches the customer.
  PRICED: ['SENT', 'UNDER_REVIEW', 'REJECTED', 'EXPIRED'],
  // Back to UNDER_REVIEW covers a renegotiation after the customer has seen the price.
  SENT: ['ACCEPTED', 'REJECTED', 'UNDER_REVIEW', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: ['UNDER_REVIEW'],
};

/** Progress order used by the customer-facing tracker. Terminal states sit outside it. */
export const QUOTE_PROGRESS: QuoteStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT', 'ACCEPTED'];

/**
 * Phase 2 status names, still accepted at the API boundary so an older client (or a
 * bookmarked filter URL) keeps working after the M15 rename.
 */
const LEGACY_STATUS: Record<string, QuoteStatus> = {
  NEW: 'SUBMITTED',
  ASSIGNED: 'UNDER_REVIEW',
  QUOTED: 'PRICED',
  WON: 'ACCEPTED',
  LOST: 'REJECTED',
};

export function normalizeQuoteStatus(value: string): QuoteStatus {
  return (LEGACY_STATUS[value] ?? value) as QuoteStatus;
}

/** Statuses a customer may set on their own quote, and from where. */
const CUSTOMER_TRANSITIONS: Record<string, QuoteStatus[]> = {
  SENT: ['ACCEPTED', 'REJECTED'],
  DRAFT: ['SUBMITTED'],
};

/**
 * Inquiry / quote workflow (Priority 7). Owns quote creation, sales assignment, status
 * transitions, the immutable event timeline, and buyer + staff email notifications. Email
 * dispatch is best-effort so a transport hiccup never blocks the workflow.
 */
export class QuoteService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly telemetry: Telemetry,
    private readonly activity: ActivityService,
    /** Set by the container after construction — notifications depend on email, which
     *  depends on nothing here, so this breaks the constructor cycle without a locator. */
    private notifications?: NotificationService
  ) {}

  /** Wired by the composition root once both services exist. */
  attachNotifications(notifications: NotificationService): void {
    this.notifications = notifications;
  }

  async create(input: CreateQuoteInput) {
    const quote = await this.db.quote.create({
      data: {
        userId: input.userId,
        name: input.name,
        company: input.company,
        email: input.email,
        whatsapp: input.whatsapp,
        quantity: input.quantity,
        subject: input.subject,
        moq: input.moq,
        expectedQty: input.expectedQty,
        country: input.country,
        shippingMethod: input.shippingMethod,
        timeline: input.timeline,
        message: input.message,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        items: { create: input.items },
        events: { create: { type: 'CREATED', toStatus: 'SUBMITTED', actorId: input.userId } },
      },
      include: { items: true },
    });

    if (input.userId) {
      await this.activity.record({
        userId: input.userId,
        type: 'QUOTE',
        title: 'Quotation requested',
        detail: input.subject,
        entity: 'Quote',
        entityId: quote.id,
      });
    }

    await this.notifyOnCreate(quote.id, input);
    await this.notifications?.notifyStaff({
      type: 'QUOTE',
      title: 'New quotation request',
      body: `${input.company} — ${input.subject}`,
      link: '/admin/quotes',
      entity: 'Quote',
      entityId: quote.id,
    });
    this.telemetry.capture({ name: 'quote.created', actorId: input.userId ?? undefined, props: { items: input.items.length, country: input.country ?? undefined } });
    return quote;
  }

  private async notifyOnCreate(quoteId: string, input: CreateQuoteInput) {
    try {
      if (input.email) await this.email.sendQuoteReceived(input.email, input.name, input.subject);
      const staff = await this.db.user.findMany({ where: { role: { in: ['SALES', 'MANAGER', 'ADMIN'] } }, select: { email: true } });
      const summary = [
        `<strong>${input.company}</strong> (${input.name}) requested a quotation.`,
        `Subject: ${input.subject}`,
        `Quantity: ${input.quantity}${input.moq ? ` · MOQ: ${input.moq}` : ''}${input.country ? ` · ${input.country}` : ''}`,
      ];
      await Promise.allSettled(
        staff.map((s) => this.email.sendStaffNotice(s.email, 'New inquiry', 'New quotation request', summary, { label: 'Open in the desk', url: `${APP_URL()}/admin/quotes` }))
      );
    } catch (err) {
      this.telemetry.error(err, { where: 'quote.notifyOnCreate' });
    }
  }

  list(filters: { status?: QuoteStatus; assigneeId?: string; take?: number } = {}) {
    return this.db.quote.findMany({
      where: { status: filters.status, assigneeId: filters.assigneeId },
      orderBy: { createdAt: 'desc' },
      take: filters.take ?? 100,
      include: {
        assignee: { select: { id: true, name: true } },
        items: { include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } } },
      },
    });
  }

  get(id: string) {
    return this.db.quote.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true } },
        items: { include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private async requireQuote(id: string) {
    const q = await this.db.quote.findUnique({ where: { id } });
    if (!q) throw AppError.notFound('Quote not found');
    return q;
  }

  async assign(id: string, assigneeId: string, actorId: string) {
    const quote = await this.requireQuote(id);
    const assignee = await this.db.user.findUnique({ where: { id: assigneeId } });
    if (!assignee) throw AppError.validation('Unknown assignee');

    // Picking up an untriaged quote moves it into review; anything further along stays put.
    const nextStatus: QuoteStatus = quote.status === 'SUBMITTED' ? 'UNDER_REVIEW' : quote.status;
    const updated = await this.db.quote.update({
      where: { id },
      data: {
        assigneeId,
        status: nextStatus,
        events: { create: { type: 'ASSIGN', fromStatus: quote.status, toStatus: nextStatus, note: `Assigned to ${assignee.name}`, actorId } },
      },
    });
    if (updated.userId && nextStatus !== quote.status) {
      await this.notifications?.quoteUpdated(updated.userId, updated.id, updated.subject, nextStatus);
    }
    return updated;
  }

  async updateStatus(id: string, status: QuoteStatus, actorId: string, note?: string) {
    const quote = await this.requireQuote(id);
    if (quote.status === status) return quote;
    if (!QUOTE_TRANSITIONS[quote.status].includes(status)) {
      throw AppError.validation(`A ${label(quote.status)} quotation cannot move to ${label(status)}`);
    }
    if (status === 'SENT' && quote.totalValue === null) {
      throw AppError.validation('Add pricing before sending this quotation to the customer');
    }

    const now = new Date();
    const updated = await this.db.quote.update({
      where: { id },
      data: {
        status,
        ...(status === 'SUBMITTED' ? { submittedAt: quote.submittedAt ?? now } : {}),
        ...(status === 'SENT' ? { sentAt: now } : {}),
        ...(status === 'ACCEPTED' || status === 'REJECTED' ? { decidedAt: now } : {}),
        events: { create: { type: 'STATUS', fromStatus: quote.status, toStatus: status, note, actorId } },
      },
    });
    if (updated.userId) {
      await this.activity.record({
        userId: updated.userId,
        type: 'QUOTE',
        title: `Quotation ${status.toLowerCase().replace(/_/g, ' ')}`,
        detail: updated.subject,
        entity: 'Quote',
        entityId: updated.id,
      });
    }
    if (updated.userId) await this.notifications?.quoteUpdated(updated.userId, updated.id, updated.subject, status);
    this.telemetry.capture({ name: 'quote.status', actorId, props: { status } });
    return updated;
  }


  // ---- Pricing ---------------------------------------------------------------
  /**
   * Fill in pricing. Money arrives in minor units (paise/cents) as integers so totals never
   * drift; when the caller does not supply a total, it is computed from the priced lines.
   */
  async setPricing(
    id: string,
    input: { currency?: string; totalValue?: number | null; priceNote?: string | null; validUntil?: Date | null; items?: { id: string; quantity?: number | null; unit?: string | null; unitPrice?: number | null; note?: string | null }[] },
    actorId: string
  ) {
    const quote = await this.requireQuote(id);
    if (quote.status === 'ACCEPTED' || quote.status === 'REJECTED') {
      throw AppError.validation('This quotation is closed — reopen it before repricing');
    }

    if (input.items?.length) {
      const owned = await this.db.quoteItem.findMany({ where: { quoteId: id }, select: { id: true } });
      const ownedIds = new Set(owned.map((i) => i.id));
      for (const item of input.items) {
        if (!ownedIds.has(item.id)) throw AppError.validation('That line is not part of this quotation');
      }
      await this.db.$transaction(
        input.items.map((item) =>
          this.db.quoteItem.update({
            where: { id: item.id },
            data: {
              ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
              ...(item.unit !== undefined ? { unit: item.unit } : {}),
              ...(item.unitPrice !== undefined ? { unitPrice: item.unitPrice } : {}),
              ...(item.note !== undefined ? { note: item.note } : {}),
            },
          })
        )
      );
    }

    const total = input.totalValue !== undefined ? input.totalValue : await this.lineTotal(id);
    const updated = await this.db.quote.update({
      where: { id },
      data: {
        ...(input.currency ? { currency: input.currency } : {}),
        totalValue: total,
        ...(input.priceNote !== undefined ? { priceNote: input.priceNote } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        events: { create: { type: 'PRICE', note: total === null ? 'Pricing cleared' : `Priced at ${formatMoney(total, input.currency ?? quote.currency)}`, actorId } },
      },
    });

    // Pricing a quote under review moves it along; the customer is told only at SENT.
    if (updated.status === 'UNDER_REVIEW' && updated.totalValue !== null) {
      return this.updateStatus(id, 'PRICED', actorId, 'Pricing added');
    }
    return updated;
  }

  /** Sum of the priced lines, in minor units. Null when nothing is priced yet. */
  private async lineTotal(quoteId: string): Promise<number | null> {
    const items = await this.db.quoteItem.findMany({ where: { quoteId }, select: { quantity: true, unitPrice: true } });
    const priced = items.filter((i) => i.unitPrice !== null);
    if (priced.length === 0) return null;
    return priced.reduce((sum, i) => sum + Math.round((i.unitPrice ?? 0) * (i.quantity ?? 1)), 0);
  }

  // ---- Customer-side decisions -----------------------------------------------
  /**
   * A customer accepting or rejecting their own quotation. Deliberately a separate entry
   * point from `updateStatus`: it re-checks ownership and only permits the moves a customer
   * is allowed to make, so a staff-only transition can never be reached from the portal.
   */
  async decide(id: string, userId: string, decision: 'ACCEPTED' | 'REJECTED', note?: string) {
    const quote = await this.requireQuote(id);
    if (quote.userId !== userId) throw AppError.notFound('Quote not found');
    const allowed = CUSTOMER_TRANSITIONS[quote.status] ?? [];
    if (!allowed.includes(decision)) {
      throw AppError.validation(`You can only respond once the quotation has been sent to you (this one is ${label(quote.status)})`);
    }
    return this.updateStatus(id, decision, userId, note);
  }

  /** Submit a draft the customer started. */
  async submit(id: string, userId: string) {
    const quote = await this.requireQuote(id);
    if (quote.userId !== userId) throw AppError.notFound('Quote not found');
    if (quote.status !== 'DRAFT') throw AppError.validation('This quotation has already been submitted');
    return this.updateStatus(id, 'SUBMITTED', userId);
  }

  // ---- Expiry ----------------------------------------------------------------
  /**
   * Move sent-but-undecided quotations past their validity date to EXPIRED. Explicit rather
   * than computed on read, so the timeline records when it happened and the customer is
   * notified. Called by the M20 maintenance endpoint.
   */
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.db.quote.findMany({
      where: { validUntil: { lt: now }, status: { in: ['SENT', 'PRICED'] } },
      select: { id: true },
    });
    for (const quote of stale) {
      await this.updateStatus(quote.id, 'EXPIRED', 'system', 'Passed its validity date');
    }
    if (stale.length) this.telemetry.capture({ name: 'quote.expired', props: { count: stale.length } });
    return stale.length;
  }

  // ---- Customer progress view -------------------------------------------------
  /**
   * One quotation as its owner sees it: the full timeline plus the position in the pipeline.
   * Internal notes are withheld — the customer sees status changes, not the sales desk's
   * private working.
   */
  async forCustomer(id: string, userId: string) {
    const quote = await this.db.quote.findUnique({
      where: { id },
      include: {
        assignee: { select: { name: true } },
        items: { include: { fabric: { select: { id: true, name: true, weight: true, width: true } }, colour: { select: { id: true, name: true, hex: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!quote || quote.userId !== userId) throw AppError.notFound('Quote not found');

    const reachedIndex = QUOTE_PROGRESS.indexOf(quote.status);
    return {
      ...quote,
      events: quote.events.filter((e) => e.type !== 'NOTE'),
      progress: QUOTE_PROGRESS.map((step, index) => ({
        step,
        label: label(step),
        // A terminal state that is not on the progress line (REJECTED/EXPIRED) leaves every
        // step unreached rather than pretending the quote is still advancing.
        done: reachedIndex >= 0 && index <= reachedIndex,
        current: step === quote.status,
      })),
      closed: quote.status === 'REJECTED' || quote.status === 'EXPIRED',
      canDecide: quote.status === 'SENT',
    };
  }

  async addNote(id: string, note: string, actorId: string) {
    await this.requireQuote(id);
    return this.db.quoteEvent.create({ data: { quoteId: id, type: 'NOTE', note, actorId } });
  }

}

/** "under review" reads better than "UNDER_REVIEW" in a message aimed at a person. */
export function label(status: QuoteStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/** Minor units → a display string. Kept here so service messages and emails agree. */
export function formatMoney(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
