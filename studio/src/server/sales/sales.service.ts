import type { PrismaClient } from '@/generated/prisma/client';
import type { QuoteStatus, SampleStatus } from '@/generated/prisma/enums';
import { AppError } from '../core/errors';
import type { Telemetry } from '../core/telemetry';
import { relativeFuture, isOverdue } from '../dashboard/format';

/** Pipeline columns, in the order the desk works them. Terminal states sit outside the board. */
export const PIPELINE_STAGES: QuoteStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT'];
const CLOSED_STAGES: QuoteStatus[] = ['ACCEPTED', 'REJECTED', 'EXPIRED'];

export interface FollowUpInput {
  userId: string;
  subject: string;
  note?: string | null;
  dueAt: Date;
  assigneeId?: string | null;
  visibleToCustomer?: boolean;
}

/**
 * The sales workspace (Phase 3 M16). Everything the team needs to work a customer:
 * the pipeline, one customer's whole story, notes, assignment and follow-up reminders.
 *
 * This is a *reading* surface over data the customer flows already produce — it deliberately
 * does not become a CRM. Every mutation it offers (note, follow-up, assignment) is a sales
 * annotation, never a change to the customer's own records.
 */
export class SalesService {
  constructor(
    private readonly db: PrismaClient,
    private readonly telemetry: Telemetry
  ) {}

  // ---- Pipeline ---------------------------------------------------------------
  /**
   * The quote board: one column per working stage with its rows, count and value, plus the
   * sample requests waiting on the team and anything overdue.
   */
  async pipeline(opts: { assigneeId?: string } = {}) {
    const where = { status: { in: PIPELINE_STAGES }, ...(opts.assigneeId ? { assigneeId: opts.assigneeId } : {}) };

    const [open, closedCounts, samples, overdueFollowUps] = await Promise.all([
      this.db.quote.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 300,
        include: {
          assignee: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, company: true } },
          items: { select: { id: true, colour: { select: { hex: true, name: true } } } },
        },
      }),
      this.db.quote.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalValue: true }, where: { status: { in: CLOSED_STAGES } } }),
      this.db.sampleRequest.findMany({
        where: { status: { in: ['REQUESTED', 'APPROVED'] } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { assignee: { select: { id: true, name: true } }, items: { select: { id: true } } },
      }),
      this.db.followUp.findMany({
        where: { status: 'OPEN', dueAt: { lt: new Date() }, ...(opts.assigneeId ? { assigneeId: opts.assigneeId } : {}) },
        orderBy: { dueAt: 'asc' },
        take: 50,
        include: { user: { select: { id: true, name: true, company: true } }, assignee: { select: { name: true } } },
      }),
    ]);

    const stages = PIPELINE_STAGES.map((stage) => {
      const quotes = open.filter((q) => q.status === stage);
      return {
        stage,
        label: stage.toLowerCase().replace(/_/g, ' '),
        count: quotes.length,
        /** Sum of quoted value in minor units; unpriced quotes contribute nothing. */
        value: quotes.reduce((sum, q) => sum + (q.totalValue ?? 0), 0),
        quotes,
      };
    });

    const now = new Date();
    return {
      stages,
      closed: Object.fromEntries(closedCounts.map((c) => [c.status, { count: c._count._all, value: c._sum.totalValue ?? 0 }])),
      samples,
      overdue: overdueFollowUps.map((f) => ({ ...f, dueLabel: relativeFuture(f.dueAt, now) })),
    };
  }

  // ---- Customer list -----------------------------------------------------------
  /**
   * Customers ranked by engagement. `search` matches name, email or company so the desk can
   * find someone from a half-remembered detail on a phone call.
   */
  async customers(opts: { search?: string; take?: number } = {}) {
    const search = opts.search?.trim();
    const rows = await this.db.user.findMany({
      where: {
        role: { in: ['BUYER', 'VIEWER'] },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                { company: { contains: search, mode: 'insensitive' as const } },
                { dealerProfile: { company: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: Math.min(opts.take ?? 50, 200),
      include: {
        dealerProfile: { select: { company: true, contactPhone: true } },
        _count: { select: { quotes: true, collections: true, sampleRequests: true, favourites: true } },
      },
    });

    // One grouped query rather than a per-customer count — this list is a hot path.
    const openQuotes = await this.db.quote.groupBy({
      by: ['userId'],
      where: { status: { in: PIPELINE_STAGES }, userId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const openByUser = new Map(openQuotes.map((q) => [q.userId, q._count._all]));

    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      company: u.dealerProfile?.company ?? u.company,
      phone: u.dealerProfile?.contactPhone ?? null,
      approved: u.approved,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      counts: { ...u._count, openQuotes: openByUser.get(u.id) ?? 0 },
    }));
  }

  // ---- One customer -------------------------------------------------------------
  /** Everything about one customer, in a single parallel read. */
  async customer(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { dealerProfile: true, addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }, contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!user) throw AppError.notFound('Customer not found');

    const [collections, quotes, samples, activity, notes, followUps, downloads, emails] = await Promise.all([
      this.db.collection.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { items: { select: { id: true, colour: { select: { name: true, hex: true } } }, take: 8 }, _count: { select: { items: true } } },
      }),
      this.db.quote.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { assignee: { select: { id: true, name: true } }, items: { select: { id: true } }, events: { orderBy: { createdAt: 'desc' } } },
      }),
      this.db.sampleRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { items: { select: { id: true } }, events: { orderBy: { createdAt: 'desc' } } },
      }),
      this.db.activityEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
      this.db.customerNote.findMany({ where: { userId }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], include: { author: { select: { name: true } } } }),
      this.db.followUp.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], include: { assignee: { select: { id: true, name: true } } } }),
      this.db.download.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, include: { fabric: { select: { name: true } } } }),
      // M19's delivery log completes the communication history: what we actually sent them.
      this.db.emailLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 }),
    ]);

    const now = new Date();
    return {
      user,
      collections,
      quotes,
      samples,
      activity,
      notes,
      followUps: followUps.map((f) => ({ ...f, dueLabel: relativeFuture(f.dueAt, now), overdue: f.status === 'OPEN' && isOverdue(f.dueAt, now) })),
      downloads,
      communication: this.communicationHistory(quotes, samples, notes, followUps, emails),
      summary: {
        openQuotes: quotes.filter((q) => PIPELINE_STAGES.includes(q.status)).length,
        wonValue: quotes.filter((q) => q.status === 'ACCEPTED').reduce((sum, q) => sum + (q.totalValue ?? 0), 0),
        quotedValue: quotes.reduce((sum, q) => sum + (q.totalValue ?? 0), 0),
        lastActivityAt: activity[0]?.createdAt ?? null,
      },
    };
  }

  /**
   * One merged timeline of every touch with this customer — quote transitions, sample
   * updates, notes and scheduled follow-ups — newest first. M19's email log joins the same
   * merge, so "what have we actually said to them?" has one answer, not four tabs.
   */
  private communicationHistory(
    quotes: { id: string; subject: string; events: { id: string; type: string; note: string | null; fromStatus: QuoteStatus | null; toStatus: QuoteStatus | null; createdAt: Date }[] }[],
    samples: { id: string; events: { id: string; type: string; note: string | null; toStatus: SampleStatus | null; createdAt: Date }[] }[],
    notes: { id: string; body: string; createdAt: Date; author: { name: string } | null }[],
    followUps: { id: string; subject: string; dueAt: Date; status: string; createdAt: Date }[],
    emails: { id: string; subject: string; status: string; createdAt: Date }[]
  ) {
    const entries: { id: string; at: Date; channel: string; summary: string; ref?: string }[] = [];

    for (const quote of quotes) {
      for (const e of quote.events) {
        entries.push({
          id: `q-${e.id}`,
          at: e.createdAt,
          channel: 'QUOTE',
          summary:
            e.type === 'CREATED'
              ? `Quotation requested — ${quote.subject}`
              : e.type === 'STATUS'
                ? `Quotation ${(e.toStatus ?? '').toLowerCase().replace(/_/g, ' ')}${e.note ? ` — ${e.note}` : ''}`
                : e.type === 'PRICE'
                  ? (e.note ?? 'Pricing updated')
                  : (e.note ?? e.type),
          ref: quote.id,
        });
      }
    }
    for (const sample of samples) {
      for (const e of sample.events) {
        entries.push({
          id: `s-${e.id}`,
          at: e.createdAt,
          channel: 'SAMPLE',
          summary: e.type === 'CREATED' ? 'Sample request received' : `Sample ${(e.toStatus ?? '').toLowerCase()}${e.note ? ` — ${e.note}` : ''}`,
          ref: sample.id,
        });
      }
    }
    for (const note of notes) {
      entries.push({ id: `n-${note.id}`, at: note.createdAt, channel: 'NOTE', summary: `${note.author?.name ?? 'Someone'}: ${note.body}` });
    }
    for (const f of followUps) {
      entries.push({ id: `f-${f.id}`, at: f.createdAt, channel: 'FOLLOW_UP', summary: `Follow-up ${f.status.toLowerCase()} — ${f.subject} (due ${f.dueAt.toISOString().slice(0, 10)})` });
    }

    for (const mail of emails) {
      entries.push({
        id: `e-${mail.id}`,
        at: mail.createdAt,
        channel: 'EMAIL',
        summary: mail.status === 'FAILED' ? `Email failed: ${mail.subject}` : `Emailed: ${mail.subject}`,
      });
    }

    return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 60);
  }

  // ---- Sales notes ---------------------------------------------------------------
  async addNote(userId: string, authorId: string, body: string, pinned = false) {
    const customer = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!customer) throw AppError.notFound('Customer not found');
    const note = await this.db.customerNote.create({ data: { userId, authorId, body: body.trim(), pinned } });
    this.telemetry.capture({ name: 'sales.note.added', actorId: authorId });
    return note;
  }

  async updateNote(noteId: string, patch: { body?: string; pinned?: boolean }) {
    const note = await this.db.customerNote.findUnique({ where: { id: noteId } });
    if (!note) throw AppError.notFound('Note not found');
    return this.db.customerNote.update({
      where: { id: noteId },
      data: { ...(patch.body !== undefined ? { body: patch.body.trim() } : {}), ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}) },
    });
  }

  async removeNote(noteId: string) {
    const note = await this.db.customerNote.findUnique({ where: { id: noteId } });
    if (!note) throw AppError.notFound('Note not found');
    await this.db.customerNote.delete({ where: { id: noteId } });
  }

  // ---- Follow-ups -----------------------------------------------------------------
  async scheduleFollowUp(input: FollowUpInput, createdById: string) {
    const customer = await this.db.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!customer) throw AppError.notFound('Customer not found');
    if (Number.isNaN(input.dueAt.getTime())) throw AppError.validation('A follow-up needs a valid due date');

    const followUp = await this.db.followUp.create({
      data: {
        userId: input.userId,
        assigneeId: input.assigneeId ?? createdById,
        createdById,
        subject: input.subject.trim(),
        note: input.note ?? null,
        dueAt: input.dueAt,
        // Default to internal: a reminder only reaches the customer's dashboard when the
        // salesperson deliberately says it should.
        visibleToCustomer: input.visibleToCustomer ?? false,
      },
    });
    this.telemetry.capture({ name: 'sales.followup.scheduled', actorId: createdById });
    return followUp;
  }

  async closeFollowUp(id: string, status: 'DONE' | 'CANCELLED') {
    const followUp = await this.db.followUp.findUnique({ where: { id } });
    if (!followUp) throw AppError.notFound('Follow-up not found');
    if (followUp.status !== 'OPEN') throw AppError.validation('This follow-up is already closed');
    return this.db.followUp.update({ where: { id }, data: { status, completedAt: new Date() } });
  }

  /** A salesperson's own queue: what is due, oldest first. */
  myFollowUps(assigneeId: string, take = 50) {
    return this.db.followUp.findMany({
      where: { assigneeId, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take,
      include: { user: { select: { id: true, name: true, company: true } } },
    });
  }

  // ---- Assignment ------------------------------------------------------------------
  /** Assign a sample request; quotes are assigned through `QuoteService.assign`. */
  async assignSample(sampleId: string, assigneeId: string) {
    const assignee = await this.db.user.findUnique({ where: { id: assigneeId }, select: { id: true, role: true } });
    if (!assignee || !['ADMIN', 'MANAGER', 'SALES'].includes(assignee.role)) throw AppError.validation('Samples can only be assigned to staff');
    const sample = await this.db.sampleRequest.findUnique({ where: { id: sampleId } });
    if (!sample) throw AppError.notFound('Sample request not found');
    return this.db.sampleRequest.update({ where: { id: sampleId }, data: { assigneeId } });
  }
}
