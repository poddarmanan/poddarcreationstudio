import type { PrismaClient } from '@/generated/prisma/client';
import type { SampleStatus } from '@/generated/prisma/enums';
import type { EmailService } from '../email/email.service';
import type { Telemetry } from '../core/telemetry';
import { AppError } from '../core/errors';

export interface CreateSampleInput {
  userId: string | null;
  name: string;
  company: string;
  email?: string | null;
  phone?: string | null;
  shippingLine1: string;
  shippingCity: string;
  shippingState?: string | null;
  shippingPincode?: string | null;
  shippingCountry?: string | null;
  message?: string | null;
  items: { fabricId: string; colourId: string }[];
}

const APP_URL = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Allowed status transitions — approval must precede dispatch, dispatch precedes delivery. */
const TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['DISPATCHED', 'REJECTED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
};

/**
 * Sample request workflow (Priority 8): request → approval → dispatch (courier + tracking)
 * → delivery, with an immutable event history and buyer notifications. Mirrors the quote
 * workflow's shape so the two desks feel identical to staff.
 */
export class SampleService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly telemetry: Telemetry
  ) {}

  async create(input: CreateSampleInput) {
    if (input.items.length === 0) throw AppError.validation('Select at least one shade to sample');
    if (input.items.length > 20) throw AppError.validation('A sample request can hold up to 20 shades');

    const sample = await this.db.sampleRequest.create({
      data: {
        userId: input.userId,
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        shippingLine1: input.shippingLine1,
        shippingCity: input.shippingCity,
        shippingState: input.shippingState,
        shippingPincode: input.shippingPincode,
        shippingCountry: input.shippingCountry ?? 'India',
        message: input.message,
        items: { create: input.items },
        events: { create: { type: 'CREATED', toStatus: 'REQUESTED', actorId: input.userId } },
      },
      include: { items: true },
    });

    try {
      const staff = await this.db.user.findMany({ where: { role: { in: ['SALES', 'MANAGER', 'ADMIN'] } }, select: { email: true } });
      const summary = [
        `<strong>${input.company}</strong> (${input.name}) requested ${input.items.length} sample${input.items.length === 1 ? '' : 's'}.`,
        `Ship to: ${input.shippingLine1}, ${input.shippingCity}${input.shippingPincode ? ` ${input.shippingPincode}` : ''}`,
      ];
      await Promise.allSettled(staff.map((s) => this.email.sendStaffNotice(s.email, 'Samples', 'New sample request', summary, { label: 'Open the sample desk', url: `${APP_URL()}/admin/samples` })));
    } catch (err) {
      this.telemetry.error(err, { where: 'sample.notifyOnCreate' });
    }

    this.telemetry.capture({ name: 'sample.created', actorId: input.userId ?? undefined, props: { items: input.items.length } });
    return sample;
  }

  list(filters: { status?: SampleStatus; userId?: string; take?: number } = {}) {
    return this.db.sampleRequest.findMany({
      where: { status: filters.status, userId: filters.userId },
      orderBy: { createdAt: 'desc' },
      take: filters.take ?? 100,
      include: {
        assignee: { select: { id: true, name: true } },
        items: { include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } } },
      },
    });
  }

  get(id: string) {
    return this.db.sampleRequest.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true } },
        items: { include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private async requireSample(id: string) {
    const s = await this.db.sampleRequest.findUnique({ where: { id } });
    if (!s) throw AppError.notFound('Sample request not found');
    return s;
  }

  /** Status change with transition validation; DISPATCHED carries courier + tracking. */
  async updateStatus(id: string, status: SampleStatus, actorId: string, opts: { courier?: string; trackingNumber?: string; note?: string } = {}) {
    const sample = await this.requireSample(id);
    if (!TRANSITIONS[sample.status].includes(status)) {
      throw AppError.validation(`Cannot move a ${sample.status.toLowerCase()} request to ${status.toLowerCase()}`);
    }
    if (status === 'DISPATCHED' && !opts.courier) throw AppError.validation('Courier is required to dispatch');

    const updated = await this.db.sampleRequest.update({
      where: { id },
      data: {
        status,
        assigneeId: sample.assigneeId ?? actorId,
        courier: opts.courier ?? sample.courier,
        trackingNumber: opts.trackingNumber ?? sample.trackingNumber,
        events: {
          create: {
            type: status === 'DISPATCHED' ? 'COURIER' : 'STATUS',
            fromStatus: sample.status,
            toStatus: status,
            note: status === 'DISPATCHED' ? `${opts.courier}${opts.trackingNumber ? ` · ${opts.trackingNumber}` : ''}` : opts.note,
            actorId,
          },
        },
      },
    });

    try {
      const to = updated.email ?? (updated.userId ? (await this.db.user.findUnique({ where: { id: updated.userId } }))?.email : null);
      if (to) await this.email.sendSampleStatus(to, updated.name, status, updated.courier, updated.trackingNumber);
    } catch (err) {
      this.telemetry.error(err, { where: 'sample.notifyStatus' });
    }

    this.telemetry.capture({ name: 'sample.status', actorId, props: { status } });
    return updated;
  }

  async addNote(id: string, note: string, actorId: string) {
    await this.requireSample(id);
    return this.db.sampleEvent.create({ data: { sampleId: id, type: 'NOTE', note, actorId } });
  }
}
