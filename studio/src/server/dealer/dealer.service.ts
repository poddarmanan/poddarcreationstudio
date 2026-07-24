import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';
import type { ActivityService } from '../activity/activity.service';

export interface ProfileInput {
  company?: string | null;
  contactPhone?: string | null;
  whatsapp?: string | null;
  gstNumber?: string | null;
  vatNumber?: string | null;
  website?: string | null;
  shippingLine1?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
  shippingCountry?: string | null;
  prefEmail?: boolean;
  prefWhatsapp?: boolean;
  prefPhone?: boolean;
}

// `family` feeds the dashboard's family-affinity recommendations (M14).
const swatch = { select: { id: true, name: true, hex: true, order: true, fabric: { select: { id: true, name: true, family: true } } } };

/**
 * Dealer portal domain (Priority 6): profile, favourites, recently-viewed, downloads, and
 * saved quotes. Every mutation is scoped to the acting user id, so a dealer can only ever
 * touch their own records.
 *
 * Collections moved to `CollectionService` in Phase 3 M13 when boards grew notes,
 * quantities, ordering and quote hand-off; only the dashboard count remains here.
 */
export class DealerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly activity: ActivityService
  ) {}

  // ---- Profile ---------------------------------------------------------------
  getProfile(userId: string) {
    return this.db.dealerProfile.findUnique({ where: { userId } });
  }

  upsertProfile(userId: string, data: ProfileInput) {
    return this.db.dealerProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  // ---- Favourites ------------------------------------------------------------
  listFavourites(userId: string) {
    return this.db.favourite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { fabric: { select: { id: true, name: true, weight: true, width: true } }, colour: swatch },
    });
  }

  async addFavourite(userId: string, fabricId: string, colourId: string | null) {
    const existing = await this.db.favourite.findFirst({ where: { userId, fabricId, colourId } });
    if (existing) return existing;
    const favourite = await this.db.favourite.create({
      data: { userId, fabricId, colourId },
      include: { fabric: { select: { name: true } }, colour: { select: { name: true } } },
    });
    await this.activity.record({
      userId,
      type: 'FAVOURITE',
      title: `Saved ${favourite.colour?.name ?? favourite.fabric.name}`,
      detail: favourite.colour ? favourite.fabric.name : null,
      entity: 'Favourite',
      entityId: favourite.id,
    });
    return favourite;
  }

  async removeFavourite(userId: string, id: string) {
    const fav = await this.db.favourite.findUnique({ where: { id } });
    if (!fav || fav.userId !== userId) throw AppError.notFound();
    await this.db.favourite.delete({ where: { id } });
  }

  // ---- Recently viewed -------------------------------------------------------
  async recordView(userId: string, fabricId: string, colourId: string | null) {
    const existing = await this.db.recentlyViewed.findFirst({ where: { userId, fabricId, colourId } });
    if (existing) {
      await this.db.recentlyViewed.update({ where: { id: existing.id }, data: { viewedAt: new Date() } });
    } else {
      await this.db.recentlyViewed.create({ data: { userId, fabricId, colourId } });
    }
    // Keep only the 30 most recent per user.
    const stale = await this.db.recentlyViewed.findMany({ where: { userId }, orderBy: { viewedAt: 'desc' }, skip: 30, select: { id: true } });
    if (stale.length) await this.db.recentlyViewed.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  listRecent(userId: string, limit = 12) {
    return this.db.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      include: { fabric: { select: { id: true, name: true } }, colour: swatch },
    });
  }

  // ---- Downloads -------------------------------------------------------------
  async recordDownload(userId: string, kind: string, fabricId: string | null, colourId: string | null) {
    const download = await this.db.download.create({
      data: { userId, kind, fabricId, colourId },
      include: { fabric: { select: { name: true } } },
    });
    await this.activity.record({
      userId,
      type: 'DOWNLOAD',
      title: kind === 'SPEC' ? 'Downloaded a spec sheet' : 'Downloaded a colour catalogue',
      detail: download.fabric?.name ?? null,
      entity: 'Download',
      entityId: download.id,
    });
    return download;
  }

  listDownloads(userId: string, limit = 20) {
    return this.db.download.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { fabric: { select: { id: true, name: true } } },
    });
  }

  // ---- Saved quotes ----------------------------------------------------------
  listQuotes(userId: string) {
    return this.db.quote.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { fabric: { select: { name: true } }, colour: { select: { name: true, hex: true } } } } },
    });
  }

  // ---- Dashboard aggregate ---------------------------------------------------
  async dashboard(userId: string) {
    const [favourites, collections, quotes, downloads, recent] = await Promise.all([
      this.db.favourite.count({ where: { userId } }),
      this.db.collection.count({ where: { userId } }),
      this.db.quote.count({ where: { userId } }),
      this.db.download.count({ where: { userId } }),
      this.db.recentlyViewed.count({ where: { userId } }),
    ]);
    return { favourites, collections, quotes, downloads, recent };
  }
}
