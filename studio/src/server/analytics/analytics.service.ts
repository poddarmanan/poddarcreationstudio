import { createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import type { StorageProvider } from '../storage';

/** Ranked row shared by every "top N" panel. */
export interface RankedRow {
  id: string;
  label: string;
  sublabel?: string | null;
  value: number;
  /** Swatch colour where the row has one, so the bar can carry the shade it describes. */
  hex?: string | null;
}

export interface TrendPoint {
  date: string;
  value: number;
}

const DAY = 86_400_000;

/**
 * Business analytics (Phase 3 M18).
 *
 * Everything here is a database aggregate — `groupBy` or a single grouped raw query — never a
 * per-row loop. The rule for this file: **one query per panel, no N+1**, because this dashboard
 * is opened every morning and must stay fast as the catalogue and the log tables grow.
 */
export class AnalyticsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: StorageProvider
  ) {}

  /** The whole dashboard, every panel in parallel. */
  async overview(days = 30) {
    const since = new Date(Date.now() - days * DAY);

    const [
      topViewed,
      topDownloaded,
      searchedColours,
      searchTrend,
      topSearches,
      quotes,
      samples,
      customers,
      popularCollections,
      storage,
      totals,
    ] = await Promise.all([
      this.topViewedFabrics(since),
      this.topDownloadedFabrics(since),
      this.mostSearchedColours(since),
      this.searchTrend(days),
      this.topSearches(since),
      this.quoteConversion(),
      this.sampleConversion(),
      this.customerActivity(since),
      this.popularCollections(),
      this.storageUsage(),
      this.totals(since),
    ]);

    return { days, since, topViewed, topDownloaded, searchedColours, searchTrend, topSearches, quotes, samples, customers, popularCollections, storage, totals };
  }

  // ---- Catalogue interest ------------------------------------------------------
  async topViewedFabrics(since: Date, take = 8): Promise<RankedRow[]> {
    const rows = await this.db.fabricView.groupBy({
      by: ['fabricId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { fabricId: 'desc' } },
      take,
    });
    return this.labelFabrics(rows.map((r) => ({ id: r.fabricId, value: r._count._all })));
  }

  async topDownloadedFabrics(since: Date, take = 8): Promise<RankedRow[]> {
    const rows = await this.db.download.groupBy({
      by: ['fabricId'],
      where: { createdAt: { gte: since }, fabricId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { fabricId: 'desc' } },
      take,
    });
    return this.labelFabrics(rows.filter((r) => r.fabricId).map((r) => ({ id: r.fabricId as string, value: r._count._all })));
  }

  /** Resolve fabric ids to names in one query rather than one per row. */
  private async labelFabrics(rows: { id: string; value: number }[]): Promise<RankedRow[]> {
    if (rows.length === 0) return [];
    const fabrics = await this.db.fabric.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, name: true, family: true, colours: { where: { order: 0 }, select: { hex: true }, take: 1 } },
    });
    const byId = new Map(fabrics.map((f) => [f.id, f]));
    return rows.map((r) => {
      const fabric = byId.get(r.id);
      return { id: r.id, label: fabric?.name ?? r.id, sublabel: fabric?.family ?? null, value: r.value, hex: fabric?.colours[0]?.hex ?? null };
    });
  }

  // ---- Search -------------------------------------------------------------------
  /**
   * Which shades people search for by name. Joins the search log against the colour
   * catalogue in the database — pulling every query into Node and matching there would grow
   * linearly with the log.
   */
  async mostSearchedColours(since: Date, take = 8): Promise<RankedRow[]> {
    const rows = await this.db.$queryRaw<{ name: string; hex: string | null; searches: bigint }[]>`
      SELECT c."name", MIN(c."hex") AS hex, COUNT(*)::bigint AS searches
      FROM "SearchQuery" q
      JOIN "Colour" c ON lower(c."name") = q."normalized"
      WHERE q."createdAt" >= ${since}
      GROUP BY c."name"
      ORDER BY searches DESC
      LIMIT ${take}
    `;
    return rows.map((r) => ({ id: r.name, label: r.name, value: Number(r.searches), hex: r.hex }));
  }

  async topSearches(since: Date, take = 10): Promise<RankedRow[]> {
    const rows = await this.db.searchQuery.groupBy({
      by: ['normalized'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { resultCount: true },
      orderBy: { _count: { normalized: 'desc' } },
      take,
    });
    return rows.map((r) => ({
      id: r.normalized,
      label: r.normalized,
      // A popular query that returns nothing is the most actionable row on this dashboard.
      sublabel: `${Math.round(r._avg.resultCount ?? 0)} results`,
      value: r._count._all,
    }));
  }

  /** Daily search volume, gap-filled so the shape of a quiet week is visible. */
  async searchTrend(days: number): Promise<TrendPoint[]> {
    const since = new Date(Date.now() - days * DAY);
    const rows = await this.db.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "SearchQuery"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;
    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
    const out: TrendPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      out.push({ date, value: byDay.get(date) ?? 0 });
    }
    return out;
  }

  // ---- Conversion -----------------------------------------------------------------
  /**
   * Quote conversion. Two rates, because they answer different questions:
   *   • `winRate` — of the quotations that reached a decision, how many were accepted?
   *   • `reachRate` — of everything submitted, how much ever got priced and sent?
   * A single "conversion" number hides which half of the funnel is leaking.
   */
  async quoteConversion() {
    const [byStatus, valueByStatus] = await Promise.all([
      this.db.quote.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.quote.groupBy({ by: ['status'], _sum: { totalValue: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>;
    const values = Object.fromEntries(valueByStatus.map((r) => [r.status, r._sum.totalValue ?? 0])) as Record<string, number>;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const accepted = counts.ACCEPTED ?? 0;
    const decided = accepted + (counts.REJECTED ?? 0) + (counts.EXPIRED ?? 0);
    const reached = accepted + (counts.SENT ?? 0) + (counts.PRICED ?? 0) + (counts.REJECTED ?? 0) + (counts.EXPIRED ?? 0);

    return {
      counts,
      total,
      wonValue: values.ACCEPTED ?? 0,
      openValue: (values.SENT ?? 0) + (values.PRICED ?? 0) + (values.UNDER_REVIEW ?? 0),
      winRate: decided === 0 ? null : accepted / decided,
      reachRate: total === 0 ? null : reached / total,
    };
  }

  async sampleConversion() {
    const byStatus = await this.db.sampleRequest.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const delivered = counts.DELIVERED ?? 0;
    const decided = delivered + (counts.REJECTED ?? 0);
    return {
      counts,
      total,
      /** Of the requests we settled, how many actually reached the customer's hands? */
      fulfilmentRate: decided === 0 ? null : delivered / decided,
      approvalRate: total === 0 ? null : ((counts.APPROVED ?? 0) + (counts.DISPATCHED ?? 0) + delivered) / total,
    };
  }

  // ---- People ------------------------------------------------------------------------
  /**
   * Customer and dealer engagement. "Returning" is defined as **active on more than one
   * distinct day** — a definition that survives a customer who signs in five times in one
   * afternoon, which a naive login count would call loyal.
   */
  async customerActivity(since: Date) {
    const [totalCustomers, approved, newCustomers, activeRows, returningRows, topActive] = await Promise.all([
      this.db.user.count({ where: { role: { in: ['BUYER', 'VIEWER'] } } }),
      this.db.user.count({ where: { role: { in: ['BUYER', 'VIEWER'] }, approved: true } }),
      this.db.user.count({ where: { role: { in: ['BUYER', 'VIEWER'] }, createdAt: { gte: since } } }),
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "userId")::bigint AS count FROM "ActivityEvent" WHERE "createdAt" >= ${since}
      `,
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT "userId" FROM "ActivityEvent"
          GROUP BY "userId"
          HAVING COUNT(DISTINCT date_trunc('day', "createdAt")) > 1
        ) AS repeat_visitors
      `,
      this.db.$queryRaw<{ id: string; name: string; company: string | null; events: bigint }[]>`
        SELECT u."id", u."name", u."company", COUNT(a.*)::bigint AS events
        FROM "ActivityEvent" a
        JOIN "User" u ON u."id" = a."userId"
        WHERE a."createdAt" >= ${since}
        GROUP BY u."id", u."name", u."company"
        ORDER BY events DESC
        LIMIT 8
      `,
    ]);

    const active = Number(activeRows[0]?.count ?? 0);
    const returning = Number(returningRows[0]?.count ?? 0);

    return {
      total: totalCustomers,
      approved,
      pending: totalCustomers - approved,
      newInPeriod: newCustomers,
      activeInPeriod: active,
      returning,
      returningRate: totalCustomers === 0 ? null : returning / totalCustomers,
      mostActive: topActive.map((r) => ({ id: r.id, label: r.company ?? r.name, sublabel: r.company ? r.name : null, value: Number(r.events) })) satisfies RankedRow[],
    };
  }

  // ---- Collections --------------------------------------------------------------------
  /** Popularity = how often a board was actually opened by someone it was shared with. */
  async popularCollections(take = 8): Promise<RankedRow[]> {
    // Items and shares are counted in correlated subqueries, not two LEFT JOINs: joining both
    // fans the rows out and multiplies every view count by the number of shades on the board.
    const rows = await this.db.$queryRaw<{ id: string; name: string; owner: string | null; items: bigint; views: bigint }[]>`
      SELECT c."id", c."name", COALESCE(u."company", u."name") AS owner,
             (SELECT COUNT(*) FROM "CollectionItem" i WHERE i."collectionId" = c."id")::bigint AS items,
             (SELECT COALESCE(SUM(s."viewCount"), 0) FROM "CollectionShare" s WHERE s."collectionId" = c."id")::bigint AS views
      FROM "Collection" c
      JOIN "User" u ON u."id" = c."userId"
      WHERE EXISTS (SELECT 1 FROM "CollectionItem" i WHERE i."collectionId" = c."id")
      ORDER BY views DESC, items DESC
      LIMIT ${take}
    `;
    return rows.map((r) => ({ id: r.id, label: r.name, sublabel: `${r.owner ?? 'Someone'} · ${Number(r.items)} shades`, value: Number(r.views) }));
  }

  // ---- Storage ---------------------------------------------------------------------------
  /**
   * Storage usage. Counted from the media rows rather than by listing the bucket, so the
   * dashboard costs one query instead of a provider round trip per open. `measured` says which
   * you're looking at; `measureObjects()` does the real walk when you want the true figure.
   */
  async storageUsage() {
    const [aggregate, byStatus, videos] = await Promise.all([
      this.db.media.aggregate({ _sum: { originalSizeBytes: true }, _count: { _all: true }, where: { deletedAt: null } }),
      this.db.media.groupBy({ by: ['contentStatus'], _count: { _all: true }, _sum: { originalSizeBytes: true }, where: { deletedAt: null } }),
      this.db.media.count({ where: { type: 'VIDEO', deletedAt: null } }),
    ]);
    const deleted = await this.db.media.aggregate({ _sum: { originalSizeBytes: true }, _count: { _all: true }, where: { deletedAt: { not: null } } });

    return {
      driver: this.storage.name,
      objects: aggregate._count._all,
      originalBytes: aggregate._sum.originalSizeBytes ?? 0,
      /** Derivatives (WebP, AVIF, thumbnail) add roughly a third again on top of originals. */
      estimatedTotalBytes: Math.round((aggregate._sum.originalSizeBytes ?? 0) * 1.35),
      videos,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.contentStatus, { count: r._count._all, bytes: r._sum.originalSizeBytes ?? 0 }])),
      reclaimable: { objects: deleted._count._all, bytes: deleted._sum.originalSizeBytes ?? 0 },
      measured: 'database' as const,
    };
  }

  /** The true figure, by walking the storage provider. Used by the M20 diagnostics, not the dashboard. */
  async measureObjects(prefix = 'fabrics') {
    const objects = await this.storage.list(prefix);
    return { driver: this.storage.name, objects: objects.length, bytes: objects.reduce((sum, o) => sum + o.size, 0), measured: 'provider' as const };
  }

  // ---- Headline totals ----------------------------------------------------------------------
  private async totals(since: Date) {
    const [views, uniqueVisitors, searches, downloads, shares, shareViews, collections] = await Promise.all([
      this.db.fabricView.count({ where: { createdAt: { gte: since } } }),
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT COALESCE("visitorId", "userId"))::bigint AS count
        FROM "FabricView" WHERE "createdAt" >= ${since}
      `,
      this.db.searchQuery.count({ where: { createdAt: { gte: since } } }),
      this.db.download.count({ where: { createdAt: { gte: since } } }),
      this.db.collectionShare.count({ where: { revokedAt: null } }),
      this.db.shareView.count({ where: { createdAt: { gte: since } } }),
      this.db.collection.count(),
    ]);
    return { views, uniqueVisitors: Number(uniqueVisitors[0]?.count ?? 0), searches, downloads, activeShares: shares, shareViews, collections };
  }

  // ---- Recording -------------------------------------------------------------------------------
  /**
   * Record a fabric view. Anonymous by default: browsing needs no account, so most views have
   * no user, and the visitor key is hashed and truncated before it is stored.
   */
  async recordView(fabricId: string, colourId: string | null, userId: string | null, visitorKey: string | null): Promise<void> {
    try {
      await this.db.fabricView.create({
        data: {
          fabricId,
          colourId,
          userId,
          visitorId: visitorKey ? createHash('sha256').update(`fabricview:${visitorKey}`).digest('hex').slice(0, 16) : null,
        },
      });
    } catch {
      /* analytics must never break browsing */
    }
  }
}
