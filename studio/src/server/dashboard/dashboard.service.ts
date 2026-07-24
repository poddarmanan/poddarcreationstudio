import type { PrismaClient } from '@/generated/prisma/client';
import type { ActivityService } from '../activity/activity.service';
import type { CollectionService } from '../collection/collection.service';
import type { DealerService } from '../dealer/dealer.service';
import type { SampleService } from '../sample/sample.service';
import type { NotificationService } from '../notification/notification.service';
import { relativePast, relativeFuture, isOverdue } from './format';

/** Shade projection used across every dashboard panel. */
const swatch = {
  select: { id: true, name: true, hex: true, order: true, fabric: { select: { id: true, name: true, family: true } } },
};

export interface Recommendation {
  /** Why this group is being shown — rendered as the group's caption. */
  reason: string;
  shades: { id: string; name: string; hex: string | null; fabricId: string; fabricName: string }[];
}

/**
 * The customer dashboard (Phase 3 M14). One aggregate read that assembles every panel in
 * parallel, so the page is a single round trip to the database rather than a waterfall.
 *
 * Recommendations are deterministic and rule-based — nearest shades from the precomputed
 * `ColourRelationship` table (Phase 2 M3) plus family affinity from what the customer has
 * already saved. No model, no inference: the "AI search / vision" line stays uncrossed, and
 * `ActivityEvent` + these rules are the seam a future recommender would replace.
 */
export class DashboardService {
  constructor(
    private readonly db: PrismaClient,
    private readonly dealers: DealerService,
    private readonly collections: CollectionService,
    private readonly samples: SampleService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationService
  ) {}

  async forUser(userId: string) {
    const [stats, favourites, boards, recent, downloads, quotes, samples, events, followUps, notifications, unread, notificationPreferences] = await Promise.all([
      this.dealers.dashboard(userId),
      this.dealers.listFavourites(userId),
      this.collections.list(userId),
      this.dealers.listRecent(userId),
      this.dealers.listDownloads(userId),
      this.dealers.listQuotes(userId),
      this.samples.list({ userId }),
      this.activity.list(userId, 12),
      this.upcomingFollowUps(userId),
      this.notifications.list(userId, { take: 12 }),
      this.notifications.unreadCount(userId),
      this.notifications.preferences(userId),
    ]);

    // Derived from data already in hand — no extra queries.
    const recommendations = await this.recommend(userId, favourites, recent);

    // Relative labels are resolved here, against one `now`, so the client never reads the
    // clock during render (impure, and a hydration mismatch waiting to happen).
    const now = new Date();
    return {
      stats,
      favourites,
      collections: boards,
      recent,
      downloads,
      quotes,
      samples,
      activity: events.map((e) => ({ ...e, whenLabel: relativePast(e.createdAt, now) })),
      followUps: followUps.map((f) => ({ ...f, dueLabel: relativeFuture(f.dueAt, now), overdue: isOverdue(f.dueAt, now) })),
      notifications: notifications.map((n) => ({ ...n, whenLabel: relativePast(n.createdAt, now) })),
      unread,
      notificationPreferences,
      recommendations,
    };
  }

  /** Touchpoints the customer is meant to know about — internal reminders stay internal. */
  upcomingFollowUps(userId: string, take = 5) {
    return this.db.followUp.findMany({
      where: { userId, status: 'OPEN', visibleToCustomer: true },
      orderBy: { dueAt: 'asc' },
      take,
      include: { assignee: { select: { name: true } } },
    });
  }

  /**
   * Two rules, in priority order:
   *   1. **Close to what you saved** — nearest shades of a favourite, from the precomputed
   *      CIELAB relationships, excluding anything already saved.
   *   2. **More in <family>** — other shades from the quality the customer looks at most.
   * Falls back to a curated spread of the catalogue for a brand-new account, so the panel is
   * never empty on first visit.
   */
  private async recommend(
    userId: string,
    favourites: { colourId: string | null; fabricId: string; colour: { name: string; fabric: { family: string } } | null }[],
    recent: { fabricId: string; colourId: string | null }[]
  ): Promise<Recommendation[]> {
    const savedColourIds = new Set(favourites.map((f) => f.colourId).filter((id): id is string => !!id));
    const inBoards = await this.db.collectionItem.findMany({ where: { collection: { userId } }, select: { colourId: true } });
    for (const item of inBoards) savedColourIds.add(item.colourId);

    const out: Recommendation[] = [];

    // Rule 1 — nearest shades to the most recent favourite.
    const seed = favourites.find((f) => f.colourId);
    if (seed?.colourId) {
      const near = await this.db.colourRelationship.findMany({
        where: { fromColourId: seed.colourId, kind: 'SIMILAR', toColourId: { notIn: [...savedColourIds] } },
        orderBy: { rank: 'asc' },
        take: 6,
        include: { toColour: swatch },
      });
      if (near.length) {
        out.push({
          reason: `Close to ${seed.colour?.name ?? 'a shade you saved'}`,
          shades: near.map((r) => ({ id: r.toColour.id, name: r.toColour.name, hex: r.toColour.hex, fabricId: r.toColour.fabric.id, fabricName: r.toColour.fabric.name })),
        });
      }
    }

    // Rule 2 — more from the quality the customer engages with most.
    const familyCounts = new Map<string, number>();
    for (const f of favourites) if (f.colour) familyCounts.set(f.colour.fabric.family, (familyCounts.get(f.colour.fabric.family) ?? 0) + 1);
    const topFamily = [...familyCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const anchorFabricId = topFamily ? undefined : (recent[0]?.fabricId ?? favourites[0]?.fabricId);

    if (topFamily || anchorFabricId) {
      const more = await this.db.colour.findMany({
        where: {
          id: { notIn: [...savedColourIds] },
          fabric: topFamily ? { family: topFamily } : { id: anchorFabricId },
        },
        orderBy: [{ fabricId: 'asc' }, { order: 'asc' }],
        take: 6,
        select: swatch.select,
      });
      if (more.length) {
        out.push({
          reason: topFamily ? `More in ${topFamily}` : `More from ${more[0].fabric.name}`,
          shades: more.map((c) => ({ id: c.id, name: c.name, hex: c.hex, fabricId: c.fabric.id, fabricName: c.fabric.name })),
        });
      }
    }

    // Fallback — a spread across the catalogue for an account with no history yet.
    if (out.length === 0) {
      const spread = await this.db.colour.findMany({ where: { order: 0 }, orderBy: { fabricId: 'asc' }, take: 6, select: swatch.select });
      if (spread.length) {
        out.push({
          reason: 'A place to start',
          shades: spread.map((c) => ({ id: c.id, name: c.name, hex: c.hex, fabricId: c.fabric.id, fabricName: c.fabric.name })),
        });
      }
    }

    return out;
  }
}
