import type { PrismaClient } from '@/generated/prisma/client';

/**
 * The customer's own journey log (Phase 3 M14).
 *
 * This is *not* the audit log. `AuditLog` answers "who did what to this system" for staff and
 * security review; `ActivityEvent` answers "what has happened on my account" for the customer,
 * in their language, on their dashboard. Keeping them separate means neither has to compromise:
 * the audit log stays complete and machine-shaped, this one stays readable and prunable.
 *
 * Recording is always best-effort — a dashboard nicety must never fail a business action.
 */

export const ACTIVITY_TYPES = {
  FAVOURITE: 'FAVOURITE',
  COLLECTION: 'COLLECTION',
  QUOTE: 'QUOTE',
  SAMPLE: 'SAMPLE',
  DOWNLOAD: 'DOWNLOAD',
  SHARE: 'SHARE',
  ACCOUNT: 'ACCOUNT',
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export interface ActivityInput {
  userId: string;
  type: ActivityType;
  title: string;
  detail?: string | null;
  entity?: string;
  entityId?: string;
}

/** Keep a customer's feed bounded; older entries have no dashboard value. */
const KEEP_PER_USER = 200;

export class ActivityService {
  constructor(private readonly db: PrismaClient) {}

  async record(input: ActivityInput): Promise<void> {
    try {
      await this.db.activityEvent.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          detail: input.detail ?? null,
          entity: input.entity,
          entityId: input.entityId,
        },
      });
      // Trim occasionally rather than on every write.
      if (Math.floor(Math.random() * 20) === 0) await this.trim(input.userId);
    } catch {
      /* the journey log is a convenience — never let it break the action that caused it */
    }
  }

  list(userId: string, take = 20) {
    return this.db.activityEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take });
  }

  private async trim(userId: string): Promise<void> {
    const stale = await this.db.activityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_PER_USER,
      select: { id: true },
    });
    if (stale.length) await this.db.activityEvent.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}
