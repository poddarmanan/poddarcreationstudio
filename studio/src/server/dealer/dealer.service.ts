import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';

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

const swatch = { select: { id: true, name: true, hex: true, order: true, fabric: { select: { id: true, name: true } } } };

/**
 * Dealer portal domain (Priority 6): profile, favourites, collections, recently-viewed,
 * downloads, and saved quotes. Every mutation is scoped to the acting user id, so a dealer
 * can only ever touch their own records.
 */
export class DealerService {
  constructor(private readonly db: PrismaClient) {}

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
    return this.db.favourite.create({ data: { userId, fabricId, colourId } });
  }

  async removeFavourite(userId: string, id: string) {
    const fav = await this.db.favourite.findUnique({ where: { id } });
    if (!fav || fav.userId !== userId) throw AppError.notFound();
    await this.db.favourite.delete({ where: { id } });
  }

  // ---- Collections -----------------------------------------------------------
  listCollections(userId: string) {
    return this.db.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { colour: swatch }, orderBy: { createdAt: 'asc' } } },
    });
  }

  createCollection(userId: string, name: string) {
    return this.db.collection.create({ data: { userId, name } });
  }

  async deleteCollection(userId: string, id: string) {
    const col = await this.db.collection.findUnique({ where: { id } });
    if (!col || col.userId !== userId) throw AppError.notFound();
    await this.db.collection.delete({ where: { id } });
  }

  private async ownCollection(userId: string, collectionId: string) {
    const col = await this.db.collection.findUnique({ where: { id: collectionId } });
    if (!col || col.userId !== userId) throw AppError.notFound('Collection not found');
    return col;
  }

  async addToCollection(userId: string, collectionId: string, fabricId: string, colourId: string, note?: string | null) {
    await this.ownCollection(userId, collectionId);
    const existing = await this.db.collectionItem.findFirst({ where: { collectionId, fabricId, colourId } });
    if (existing) return existing;
    return this.db.collectionItem.create({ data: { collectionId, fabricId, colourId, note } });
  }

  /** Snapshot the user's current swatch book into a new collection. */
  async collectionFromSwatchBook(userId: string, name: string) {
    const pins = await this.db.swatchBookItem.findMany({ where: { userId } });
    const collection = await this.db.collection.create({ data: { userId, name } });
    if (pins.length) {
      await this.db.collectionItem.createMany({
        data: pins.map((p) => ({ collectionId: collection.id, fabricId: p.fabricId, colourId: p.colourId })),
        skipDuplicates: true,
      });
    }
    return collection;
  }

  async removeCollectionItem(userId: string, collectionId: string, itemId: string) {
    await this.ownCollection(userId, collectionId);
    const item = await this.db.collectionItem.findUnique({ where: { id: itemId } });
    if (!item || item.collectionId !== collectionId) throw AppError.notFound();
    await this.db.collectionItem.delete({ where: { id: itemId } });
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
  recordDownload(userId: string, kind: string, fabricId: string | null, colourId: string | null) {
    return this.db.download.create({ data: { userId, kind, fabricId, colourId } });
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
