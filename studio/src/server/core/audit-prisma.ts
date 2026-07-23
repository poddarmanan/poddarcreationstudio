import type { PrismaClient } from '@/generated/prisma/client';
import type { Audit, AuditEntry } from './audit';

/**
 * Persists audit entries to the AuditLog table. Audit writes must never break the request
 * that triggered them, so failures are swallowed and logged rather than thrown.
 */
export class PrismaAudit implements Audit {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          ip: entry.ip,
          userAgent: entry.userAgent,
          meta: entry.meta === undefined ? undefined : (entry.meta as object),
        },
      });
    } catch (err) {
      console.error('[audit] failed to persist', entry.action, err);
    }
  }
}
