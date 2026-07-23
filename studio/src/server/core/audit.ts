/**
 * Audit seam (Priority 3). Records privileged/state-changing actions. M0 ships a console
 * driver so call sites can be added now; M1 introduces the `AuditLog` table and a Prisma
 * driver implementing the same interface, swapped in the composition root.
 */

export interface AuditEntry {
  /** User id of the actor, if authenticated. */
  actorId?: string | null;
  /** Verb-noun action, e.g. 'media.upload', 'quote.create', 'user.approve'. */
  action: string;
  /** Target entity type, e.g. 'Media', 'Quote'. */
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

export interface Audit {
  record(entry: AuditEntry): Promise<void>;
}

export class ConsoleAudit implements Audit {
  async record(entry: AuditEntry): Promise<void> {
    console.info('[audit]', entry.action, {
      actor: entry.actorId ?? 'anon',
      entity: entry.entity,
      entityId: entry.entityId,
      ip: entry.ip,
      ...(entry.meta ?? {}),
    });
  }
}
