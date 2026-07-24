import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';
import type { Telemetry } from '../core/telemetry';
import type { QuoteService } from '../quote/quote.service';
import type { ActivityService } from '../activity/activity.service';

export interface CollectionInput {
  name?: string;
  description?: string | null;
  coverItemId?: string | null;
}

export interface ItemInput {
  fabricId: string;
  colourId: string;
  note?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface ItemPatch {
  note?: string | null;
  quantity?: number | null;
  unit?: string | null;
  position?: number;
}

/** Shade projection shared by every collection read — enough to render a swatch. */
const swatch = {
  select: {
    id: true,
    name: true,
    hex: true,
    order: true,
    temperature: true,
    fabric: { select: { id: true, name: true, family: true, weight: true, width: true, comp: true } },
  },
};

const withItems = {
  items: {
    include: { colour: swatch, fabric: { select: { id: true, name: true, weight: true, width: true } } },
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

/**
 * Saved collections (Phase 3 M13). A collection behaves like a pinboard: ordered shades,
 * each with a note and an indicative quantity, that a customer can duplicate, share (M17)
 * or turn into a quotation request in one action.
 *
 * Every read and write is scoped by owner id. Staff reach collections through the sales
 * workspace (M16), which passes the owner explicitly rather than bypassing the check.
 */
export class CollectionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly quotes: QuoteService,
    private readonly telemetry: Telemetry,
    private readonly activity: ActivityService
  ) {}

  // ---- Reads -----------------------------------------------------------------
  list(userId: string) {
    return this.db.collection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: withItems,
    });
  }

  /** Summary rows for dashboards: counts only, no item payload. */
  async summaries(userId: string, take = 12) {
    const rows = await this.db.collection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take,
      include: { items: { select: { id: true, colour: { select: { hex: true } } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: 6 }, _count: { select: { items: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      updatedAt: c.updatedAt,
      itemCount: c._count.items,
      swatches: c.items.map((i) => i.colour.hex),
    }));
  }

  async get(userId: string, id: string) {
    const collection = await this.db.collection.findUnique({ where: { id }, include: withItems });
    if (!collection || collection.userId !== userId) throw AppError.notFound('Collection not found');
    return collection;
  }

  /** Owner-agnostic read for staff and share links; the caller has already authorised. */
  async getById(id: string) {
    const collection = await this.db.collection.findUnique({
      where: { id },
      include: { ...withItems, user: { select: { id: true, name: true, company: true, email: true } } },
    });
    if (!collection) throw AppError.notFound('Collection not found');
    return collection;
  }

  // ---- Board lifecycle -------------------------------------------------------
  async create(userId: string, name: string, description?: string | null) {
    const collection = await this.db.collection.create({ data: { userId, name: name.trim(), description: description ?? null } });
    await this.activity.record({ userId, type: 'COLLECTION', title: `Started “${collection.name}”`, entity: 'Collection', entityId: collection.id });
    this.telemetry.capture({ name: 'collection.created', actorId: userId });
    return collection;
  }

  async update(userId: string, id: string, input: CollectionInput) {
    await this.requireOwned(userId, id);
    if (input.coverItemId) {
      const item = await this.db.collectionItem.findUnique({ where: { id: input.coverItemId } });
      if (!item || item.collectionId !== id) throw AppError.validation('That cover is not part of this collection');
    }
    return this.db.collection.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.coverItemId !== undefined ? { coverItemId: input.coverItemId } : {}),
      },
      include: withItems,
    });
  }

  async remove(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.db.collection.delete({ where: { id } });
  }

  /** Copy a board — the usual way a customer starts a seasonal variant of last year's. */
  async duplicate(userId: string, id: string, name?: string) {
    const source = await this.get(userId, id);
    const copy = await this.db.collection.create({
      data: {
        userId,
        name: (name?.trim() || `${source.name} (copy)`).slice(0, 120),
        description: source.description,
        items: {
          create: source.items.map((i, index) => ({
            fabricId: i.fabricId,
            colourId: i.colourId,
            note: i.note,
            quantity: i.quantity,
            unit: i.unit,
            position: index,
          })),
        },
      },
      include: withItems,
    });
    this.telemetry.capture({ name: 'collection.duplicated', actorId: userId, props: { items: source.items.length } });
    return copy;
  }

  /** Snapshot the user's current swatch book into a new collection. */
  async fromSwatchBook(userId: string, name: string) {
    const pins = await this.db.swatchBookItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return this.db.collection.create({
      data: {
        userId,
        name: name.trim(),
        items: { create: pins.map((p, index) => ({ fabricId: p.fabricId, colourId: p.colourId, position: index })) },
      },
      include: withItems,
    });
  }

  // ---- Items -----------------------------------------------------------------
  async addItem(userId: string, collectionId: string, input: ItemInput) {
    await this.requireOwned(userId, collectionId);
    const existing = await this.db.collectionItem.findFirst({ where: { collectionId, fabricId: input.fabricId, colourId: input.colourId } });
    if (existing) return existing;

    const last = await this.db.collectionItem.findFirst({ where: { collectionId }, orderBy: { position: 'desc' }, select: { position: true } });
    const item = await this.db.collectionItem.create({
      data: {
        collectionId,
        fabricId: input.fabricId,
        colourId: input.colourId,
        note: input.note ?? null,
        quantity: input.quantity ?? null,
        unit: input.unit ?? 'm',
        position: (last?.position ?? -1) + 1,
      },
    });
    await this.touch(collectionId);
    this.telemetry.capture({ name: 'collection.item.added', actorId: userId });
    return item;
  }

  async updateItem(userId: string, collectionId: string, itemId: string, patch: ItemPatch) {
    await this.requireOwned(userId, collectionId);
    const item = await this.db.collectionItem.findUnique({ where: { id: itemId } });
    if (!item || item.collectionId !== collectionId) throw AppError.notFound('Item not found');
    const updated = await this.db.collectionItem.update({
      where: { id: itemId },
      data: {
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
      },
    });
    await this.touch(collectionId);
    return updated;
  }

  async removeItem(userId: string, collectionId: string, itemId: string) {
    await this.requireOwned(userId, collectionId);
    const item = await this.db.collectionItem.findUnique({ where: { id: itemId } });
    if (!item || item.collectionId !== collectionId) throw AppError.notFound('Item not found');
    await this.db.collectionItem.delete({ where: { id: itemId } });
    // A deleted cover must not leave a dangling reference.
    await this.db.collection.updateMany({ where: { id: collectionId, coverItemId: itemId }, data: { coverItemId: null } });
    await this.touch(collectionId);
  }

  /** Persist a drag-reorder: ids in their new order, positions rewritten in one transaction. */
  async reorder(userId: string, collectionId: string, itemIds: string[]) {
    await this.requireOwned(userId, collectionId);
    const owned = await this.db.collectionItem.findMany({ where: { collectionId }, select: { id: true } });
    const ownedIds = new Set(owned.map((i) => i.id));
    if (itemIds.length !== ownedIds.size || itemIds.some((id) => !ownedIds.has(id))) {
      throw AppError.validation('The reorder must list every item in this collection exactly once');
    }
    await this.db.$transaction(itemIds.map((id, index) => this.db.collectionItem.update({ where: { id }, data: { position: index } })));
    await this.touch(collectionId);
  }

  // ---- Send to sales ---------------------------------------------------------
  /**
   * Turn a board into a quotation request. Quantities and notes travel with it, so the
   * sales team receives the customer's intent rather than a bare list of shades.
   */
  async requestQuote(userId: string, collectionId: string, input: { name: string; company: string; email?: string | null; message?: string | null; timeline?: string | null; country?: string | null }) {
    const collection = await this.get(userId, collectionId);
    if (collection.items.length === 0) throw AppError.validation('Add at least one shade before requesting a quotation');

    const lines = collection.items.map((i) => {
      const qty = i.quantity ? `${i.quantity}${i.unit ?? 'm'}` : 'qty TBC';
      return `${i.colour.name} (${i.colour.fabric.name}) — ${qty}${i.note ? ` · ${i.note}` : ''}`;
    });
    const totalQuantity = collection.items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

    const quote = await this.quotes.create({
      userId,
      name: input.name,
      company: input.company,
      email: input.email ?? null,
      quantity: totalQuantity > 0 ? `${totalQuantity}${collection.items[0].unit ?? 'm'}` : 'To be confirmed',
      subject: `Collection: ${collection.name}`,
      expectedQty: totalQuantity > 0 ? String(totalQuantity) : null,
      country: input.country ?? null,
      timeline: input.timeline ?? null,
      message: [input.message?.trim(), collection.description?.trim(), lines.join('\n')].filter(Boolean).join('\n\n'),
      items: collection.items.map((i) => ({ fabricId: i.fabricId, colourId: i.colourId })),
    });

    await this.activity.record({
      userId,
      type: 'COLLECTION',
      title: `Sent “${collection.name}” to sales`,
      detail: `${collection.items.length} shade${collection.items.length === 1 ? '' : 's'}`,
      entity: 'Collection',
      entityId: collection.id,
    });
    this.telemetry.capture({ name: 'collection.quote.requested', actorId: userId, props: { items: collection.items.length, collectionId } });
    return quote;
  }

  // ---- Internals -------------------------------------------------------------
  private async requireOwned(userId: string, id: string) {
    const collection = await this.db.collection.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!collection || collection.userId !== userId) throw AppError.notFound('Collection not found');
    return collection;
  }

  /** Bump updatedAt so "recently worked on" ordering reflects item edits, not just renames. */
  private touch(collectionId: string) {
    return this.db.collection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } });
  }
}
