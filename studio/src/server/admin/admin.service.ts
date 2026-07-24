import type { PrismaClient } from '@/generated/prisma/client';
import type { ContentStatus } from '@/generated/prisma/enums';
import type { StorageProvider } from '../storage';
import { AppError } from '../core/errors';
import { generateColours, FABRIC_DEFS, type FabricDef } from '@/lib/fabric-generator';
import { computeColourMetrics } from '@/lib/colour-science';

export interface MediaListFilters {
  fabricId?: string;
  contentStatus?: ContentStatus;
  includeDeleted?: boolean;
  cursor?: string;
  take?: number;
}

/**
 * Catalogue operations behind the admin surface (Priority 11): bulk edit/delete/restore,
 * publish/draft/archive, version history, activity feed, CSV import/export, analytics.
 * Bulk mutations are set-based (single UPDATE) so 500-item selections stay fast.
 */
export class AdminService {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: StorageProvider
  ) {}

  // ---- Media listing + bulk ops ---------------------------------------------
  async listMedia(filters: MediaListFilters = {}) {
    const take = Math.min(filters.take ?? 40, 100);
    const rows = await this.db.media.findMany({
      where: {
        fabricId: filters.fabricId,
        contentStatus: filters.contentStatus,
        deletedAt: filters.includeDeleted ? undefined : null,
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } },
    });
    const hasMore = rows.length > take;
    return { media: rows.slice(0, take), nextCursor: hasMore ? rows[take].id : null };
  }

  async bulkEditMedia(ids: string[], patch: { contentStatus?: ContentStatus; colourId?: string | null }) {
    if (ids.length === 0) throw AppError.validation('No media selected');
    const data: Record<string, unknown> = {};
    if (patch.contentStatus) {
      data.contentStatus = patch.contentStatus;
      if (patch.contentStatus === 'PUBLISHED') data.publishedAt = new Date();
    }
    if (patch.colourId !== undefined) data.colourId = patch.colourId;
    const res = await this.db.media.updateMany({ where: { id: { in: ids } }, data });
    return res.count;
  }

  /** Reversible soft delete: rows keep their objects; restore clears deletedAt. */
  async bulkDeleteMedia(ids: string[]) {
    if (ids.length === 0) throw AppError.validation('No media selected');
    const res = await this.db.media.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date(), contentStatus: 'ARCHIVED' },
    });
    return res.count;
  }

  async bulkRestoreMedia(ids: string[]) {
    if (ids.length === 0) throw AppError.validation('No media selected');
    const res = await this.db.media.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null, contentStatus: 'DRAFT' },
    });
    return res.count;
  }

  /** Permanent removal (storage objects included) — only for already soft-deleted rows. */
  async purgeMedia(ids: string[]) {
    const rows = await this.db.media.findMany({ where: { id: { in: ids }, deletedAt: { not: null } } });
    for (const m of rows) {
      if (m.storageKey) {
        const prefix = m.storageKey.split('/').slice(0, -1).join('/');
        await this.storage.deletePrefix(prefix);
      }
    }
    await this.db.media.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return rows.length;
  }

  /** Version history for a fabric/colour slot (Priority 11; versions from M2 keys). */
  versionHistory(fabricId: string, colourId: string | null) {
    return this.db.media.findMany({
      where: { fabricId, colourId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, version: true, originalName: true, createdAt: true, contentStatus: true, deletedAt: true, thumbPath: true, checksum: true },
    });
  }

  // ---- Activity feed (AuditLog) ---------------------------------------------
  async activity(take = 40, cursor?: string) {
    const rows = await this.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const actors = await this.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));
    return {
      events: rows.slice(0, take).map((r) => ({ ...r, actorName: r.actorId ? (nameOf.get(r.actorId) ?? 'Unknown') : 'Anonymous' })),
      nextCursor: hasMore ? rows[take].id : null,
    };
  }

  // ---- Upload queue ----------------------------------------------------------
  listUploadJobs(take = 30) {
    return this.db.uploadJob.findMany({ orderBy: { createdAt: 'desc' }, take });
  }

  // ---- Analytics -------------------------------------------------------------
  async analytics() {
    const [fabrics, colours, mediaTotal, mediaByStatus, quotesByStatus, samplesByStatus, users, searches, downloads, failedJobs] = await Promise.all([
      this.db.fabric.count(),
      this.db.colour.count(),
      this.db.media.count({ where: { deletedAt: null } }),
      this.db.media.groupBy({ by: ['contentStatus'], _count: { _all: true }, where: { deletedAt: null } }),
      this.db.quote.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.sampleRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.user.count(),
      this.db.searchQuery.count(),
      this.db.download.count(),
      this.db.uploadJob.count({ where: { status: 'FAILED' } }),
    ]);
    const toMap = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string) =>
      Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));
    return {
      fabrics,
      colours,
      media: { total: mediaTotal, byStatus: toMap(mediaByStatus, 'contentStatus') },
      quotes: toMap(quotesByStatus, 'status'),
      samples: toMap(samplesByStatus, 'status'),
      users,
      searches,
      downloads,
      failedUploads: failedJobs,
    };
  }

  // ---- CSV export / import ---------------------------------------------------
  async exportColoursCsv(): Promise<string> {
    const fabrics = await this.db.fabric.findMany({ include: { colours: { orderBy: { order: 'asc' } } }, orderBy: { id: 'asc' } });
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['fabricId,fabricName,colourOrder,colourName,l,c,h,hex,temperature'];
    for (const f of fabrics) {
      for (const c of f.colours) {
        lines.push([f.id, f.name, c.order, c.name, c.l, c.c, c.h, c.hex ?? '', c.temperature ?? ''].map(esc).join(','));
      }
    }
    return lines.join('\n');
  }

  /**
   * CSV import: upserts colour rows (fabricId, order, name, l, c, h). Derived metrics are
   * recomputed for touched rows. Returns per-row results; invalid rows are reported, not
   * silently dropped.
   */
  async importColoursCsv(csv: string): Promise<{ updated: number; created: number; errors: { line: number; error: string }[] }> {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw AppError.validation('CSV needs a header row and at least one data row');
    const header = lines[0].split(',').map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);
    for (const req of ['fabricId', 'colourOrder', 'colourName', 'l', 'c', 'h']) {
      if (idx(req) === -1) throw AppError.validation(`CSV is missing the "${req}" column`);
    }

    let updated = 0;
    let created = 0;
    const errors: { line: number; error: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      try {
        const fabricId = cols[idx('fabricId')]?.trim();
        const order = Number(cols[idx('colourOrder')]);
        const name = cols[idx('colourName')]?.trim();
        const l = Number(cols[idx('l')]);
        const c = Number(cols[idx('c')]);
        const h = Number(cols[idx('h')]);
        if (!fabricId || !name || !Number.isInteger(order)) throw new Error('fabricId, colourOrder and colourName are required');
        if (!(l >= 0 && l <= 1) || !(c >= 0 && c <= 0.5) || !(h >= 0 && h < 360)) throw new Error('l must be 0-1, c 0-0.5, h 0-359');
        const fabric = await this.db.fabric.findUnique({ where: { id: fabricId } });
        if (!fabric) throw new Error(`Unknown fabric "${fabricId}"`);

        const metrics = computeColourMetrics(l, c, h);
        const existing = await this.db.colour.findUnique({ where: { fabricId_order: { fabricId, order } } });
        await this.db.colour.upsert({
          where: { fabricId_order: { fabricId, order } },
          create: { fabricId, order, name, l, c, h, ...metrics },
          update: { name, l, c, h, ...metrics },
        });
        if (existing) updated += 1;
        else created += 1;
      } catch (e) {
        errors.push({ line: i + 1, error: e instanceof Error ? e.message : 'Invalid row' });
      }
    }
    return { updated, created, errors };
  }

  /** Restore the catalogue's colour definitions from the canonical generator (undo bad imports). */
  async resetColoursToCanonical(fabricId: string) {
    const def: FabricDef | undefined = FABRIC_DEFS.find((f) => f.id === fabricId);
    if (!def) throw AppError.notFound('Unknown fabric');
    for (const colour of generateColours(def)) {
      const metrics = computeColourMetrics(colour.l, colour.c, colour.h);
      await this.db.colour.upsert({
        where: { fabricId_order: { fabricId, order: colour.order } },
        create: { fabricId, order: colour.order, name: colour.name, l: colour.l, c: colour.c, h: colour.h, ...metrics },
        update: { name: colour.name, l: colour.l, c: colour.c, h: colour.h, ...metrics },
      });
    }
  }
}

/** Minimal CSV line parser honouring double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
