import type { PrismaClient } from '@/generated/prisma/client';
import type { QuoteStatus } from '@/generated/prisma/enums';
import type { EmailService } from '../email/email.service';
import type { Telemetry } from '../core/telemetry';
import type { ActivityService } from '../activity/activity.service';
import { AppError } from '../core/errors';

export interface CreateQuoteInput {
  userId: string | null;
  name: string;
  company: string;
  email?: string | null;
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
 * Inquiry / quote workflow (Priority 7). Owns quote creation, sales assignment, status
 * transitions, the immutable event timeline, and buyer + staff email notifications. Email
 * dispatch is best-effort so a transport hiccup never blocks the workflow.
 */
export class QuoteService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly telemetry: Telemetry,
    private readonly activity: ActivityService
  ) {}

  async create(input: CreateQuoteInput) {
    const quote = await this.db.quote.create({
      data: {
        userId: input.userId,
        name: input.name,
        company: input.company,
        email: input.email,
        quantity: input.quantity,
        subject: input.subject,
        moq: input.moq,
        expectedQty: input.expectedQty,
        country: input.country,
        shippingMethod: input.shippingMethod,
        timeline: input.timeline,
        message: input.message,
        status: 'NEW',
        items: { create: input.items },
        events: { create: { type: 'CREATED', toStatus: 'NEW', actorId: input.userId } },
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

    const nextStatus: QuoteStatus = quote.status === 'NEW' ? 'ASSIGNED' : quote.status;
    const updated = await this.db.quote.update({
      where: { id },
      data: {
        assigneeId,
        status: nextStatus,
        events: { create: { type: 'ASSIGN', fromStatus: quote.status, toStatus: nextStatus, note: `Assigned to ${assignee.name}`, actorId } },
      },
    });
    await this.notifyStatus(updated.id);
    return updated;
  }

  async updateStatus(id: string, status: QuoteStatus, actorId: string, note?: string) {
    const quote = await this.requireQuote(id);
    const updated = await this.db.quote.update({
      where: { id },
      data: { status, events: { create: { type: 'STATUS', fromStatus: quote.status, toStatus: status, note, actorId } } },
    });
    await this.notifyStatus(updated.id);
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
    this.telemetry.capture({ name: 'quote.status', actorId, props: { status } });
    return updated;
  }

  async addNote(id: string, note: string, actorId: string) {
    await this.requireQuote(id);
    return this.db.quoteEvent.create({ data: { quoteId: id, type: 'NOTE', note, actorId } });
  }

  private async notifyStatus(id: string) {
    try {
      const quote = await this.db.quote.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } } } });
      if (!quote) return;
      const to = quote.email ?? quote.user?.email;
      if (to && (quote.status === 'ASSIGNED' || quote.status === 'QUOTED' || quote.status === 'WON')) {
        await this.email.sendQuoteStatus(to, quote.name, quote.subject, quote.status);
      }
    } catch (err) {
      this.telemetry.error(err, { where: 'quote.notifyStatus' });
    }
  }
}
