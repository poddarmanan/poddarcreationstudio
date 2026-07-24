import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';
import type { Telemetry } from '../core/telemetry';
import type { EmailService } from '../email/email.service';
import type { ActivityService } from '../activity/activity.service';
import type { NotificationService } from '../notification/notification.service';
import { renderCataloguePdf, type CatalogueItem } from '../pdf/catalogue-pdf';
import { shareCookieName, verifyShareTicket } from './share-cookie';

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

const appUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface CreateShareInput {
  title?: string | null;
  message?: string | null;
  /** Optional passphrase. Stored bcrypt-hashed, never in plaintext. */
  password?: string | null;
  expiresAt?: Date | null;
  allowDownload?: boolean;
}

export type ShareRejection = 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'PASSWORD_REQUIRED';

/**
 * Digital catalogue sharing (Phase 3 M17).
 *
 * A share is a capability: whoever holds the link can see the catalogue. That makes the link
 * itself the secret, so it is generated from 32 random bytes and **only its SHA-256 hash is
 * stored** — a database read cannot reconstruct a working link. Optional passphrase, optional
 * expiry, and revocation give the owner a way to take it back.
 *
 * The public payload is deliberately narrow: shades, notes and quantities. No customer name,
 * no email, no pricing, no internal anything.
 */
export class ShareService {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailService,
    private readonly telemetry: Telemetry,
    private readonly activity: ActivityService,
    private notifications?: NotificationService
  ) {}

  /** Wired by the composition root once both services exist. */
  attachNotifications(notifications: NotificationService): void {
    this.notifications = notifications;
  }

  // ---- Owner side --------------------------------------------------------------
  async create(userId: string, collectionId: string, input: CreateShareInput = {}) {
    const collection = await this.db.collection.findUnique({ where: { id: collectionId }, select: { id: true, userId: true, name: true } });
    if (!collection || collection.userId !== userId) throw AppError.notFound('Collection not found');
    if (input.expiresAt && input.expiresAt.getTime() < Date.now()) throw AppError.validation('An expiry date has to be in the future');

    const raw = randomBytes(32).toString('base64url');
    const share = await this.db.collectionShare.create({
      data: {
        collectionId,
        createdById: userId,
        tokenHash: hashToken(raw),
        title: input.title ?? null,
        message: input.message ?? null,
        passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
        expiresAt: input.expiresAt ?? null,
        allowDownload: input.allowDownload ?? true,
      },
    });

    await this.activity.record({
      userId,
      type: 'SHARE',
      title: `Shared “${collection.name}”`,
      detail: input.password ? 'Password protected' : null,
      entity: 'CollectionShare',
      entityId: share.id,
    });
    this.telemetry.capture({ name: 'collection.shared', actorId: userId, props: { password: !!input.password, expires: !!input.expiresAt } });

    // The raw token is returned exactly once — it is never readable again.
    return { share, url: this.urlFor(raw), token: raw };
  }

  urlFor(rawToken: string): string {
    return `${appUrl()}/c/${rawToken}`;
  }

  /** A QR code for the link, as a data URL for the UI and a PNG buffer for the PDF/print sheet. */
  qrDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320, color: { dark: '#1C1917', light: '#FAF8F5' } });
  }

  async list(userId: string, collectionId: string) {
    const collection = await this.db.collection.findUnique({ where: { id: collectionId }, select: { userId: true } });
    if (!collection || collection.userId !== userId) throw AppError.notFound('Collection not found');
    return this.db.collectionShare.findMany({
      where: { collectionId },
      orderBy: { createdAt: 'desc' },
      // tokenHash is never selected — there is nothing useful a client could do with it.
      select: { id: true, title: true, message: true, expiresAt: true, allowDownload: true, revokedAt: true, viewCount: true, lastViewedAt: true, createdAt: true, passwordHash: true },
    }).then((rows) => rows.map(({ passwordHash, ...row }) => ({ ...row, hasPassword: !!passwordHash })));
  }

  async revoke(userId: string, shareId: string) {
    const share = await this.db.collectionShare.findUnique({ where: { id: shareId }, include: { collection: { select: { userId: true } } } });
    if (!share || share.collection.userId !== userId) throw AppError.notFound('Share not found');
    return this.db.collectionShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
  }

  // ---- Public side ---------------------------------------------------------------
  /**
   * Resolve a raw token. Returns a typed rejection instead of throwing, so the public page can
   * tell "wrong link" from "expired" from "needs a password" without leaking which collection
   * a token points at.
   */
  resolve(rawToken: string, password?: string): Promise<{ ok: true; share: ResolvedShare } | { ok: false; reason: ShareRejection }> {
    return this.load(rawToken, { password, trustedTicket: false });
  }

  /**
   * Resolve for a visitor who already proved the passphrase on the page and is carrying the
   * ticket cookie. Kept separate from `resolve` so there is no "skip the password" flag on the
   * public API that a future caller could pass by accident.
   */
  async resolveWithTicket(rawToken: string, cookieJar: { name: string; value: string }[]): Promise<ResolvedShare | null> {
    const opened = await this.load(rawToken, { trustedTicket: true });
    if (!opened.ok) return null;
    const cookie = cookieJar.find((c) => c.name === shareCookieName(opened.share.id));
    return verifyShareTicket(opened.share.id, cookie?.value) ? opened.share : null;
  }

  private async load(rawToken: string, opts: { password?: string; trustedTicket: boolean }): Promise<{ ok: true; share: ResolvedShare } | { ok: false; reason: ShareRejection }> {
    const password = opts.password;
    if (!rawToken) return { ok: false, reason: 'NOT_FOUND' };
    const share = await this.db.collectionShare.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        collection: {
          include: {
            items: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              include: { colour: { select: { id: true, name: true, hex: true } }, fabric: { select: { id: true, name: true, weight: true, width: true, comp: true } } },
            },
          },
        },
      },
    });
    if (!share) return { ok: false, reason: 'NOT_FOUND' };
    if (share.revokedAt) return { ok: false, reason: 'REVOKED' };
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'EXPIRED' };
    // `trustedTicket` callers verify the HMAC ticket themselves, on the share id this lookup
    // produces — they never skip the check, they perform a different one.
    if (share.passwordHash && !opts.trustedTicket) {
      if (!password) return { ok: false, reason: 'PASSWORD_REQUIRED' };
      if (!(await bcrypt.compare(password, share.passwordHash))) return { ok: false, reason: 'PASSWORD_REQUIRED' };
    }

    return {
      ok: true,
      share: {
        id: share.id,
        title: share.title ?? share.collection.name,
        message: share.message,
        allowDownload: share.allowDownload,
        expiresAt: share.expiresAt,
        collectionName: share.collection.name,
        description: share.collection.description,
        items: share.collection.items.map((item) => ({
          id: item.id,
          colourName: item.colour.name,
          hex: item.colour.hex,
          fabricName: item.fabric.name,
          fabricSpec: [item.fabric.weight, item.fabric.width].filter(Boolean).join(' · '),
          composition: item.fabric.comp,
          note: item.note,
          quantity: item.quantity,
          unit: item.unit,
        })),
      },
    };
  }

  /**
   * Record an anonymous open. `visitorKey` is hashed and truncated before storage — enough to
   * tell repeat visits apart, not enough to identify anyone.
   */
  async recordView(shareId: string, visitorKey?: string | null, referer?: string | null) {
    const visitorId = visitorKey ? createHash('sha256').update(`${shareId}:${visitorKey}`).digest('hex').slice(0, 16) : null;
    const [updated] = await this.db.$transaction([
      this.db.collectionShare.update({
        where: { id: shareId },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
        include: { collection: { select: { userId: true, name: true } } },
      }),
      this.db.shareView.create({ data: { shareId, visitorId, referer: referer?.slice(0, 300) ?? null } }),
    ]);
    // Only the first open notifies. "Your catalogue was viewed" is useful once; on every
    // refresh it is noise, and noisy notifications get muted wholesale.
    if (updated.viewCount === 1) {
      await this.notifications?.catalogueOpened(updated.collection.userId, shareId, updated.collection.name);
    }
    this.telemetry.capture({ name: 'share.viewed', props: { shareId } });
  }

  // ---- Rendering -------------------------------------------------------------------
  pdf(share: ResolvedShare, preparedFor?: string | null): Buffer {
    const items: CatalogueItem[] = share.items.map((item) => ({
      colourName: item.colourName,
      hex: item.hex,
      fabricName: item.fabricName,
      fabricSpec: item.fabricSpec,
      note: item.note,
      quantity: item.quantity,
      unit: item.unit,
    }));
    return renderCataloguePdf({
      title: share.title,
      subtitle: share.collectionName !== share.title ? share.collectionName : null,
      description: share.message ?? share.description,
      preparedFor,
      items,
      reference: `${items.length} shade${items.length === 1 ? '' : 's'}`,
    });
  }

  /** Email the catalogue link. Owner-initiated, so it carries their name. */
  async emailCatalogue(userId: string, shareId: string, rawToken: string, to: string[], fromName: string) {
    const share = await this.db.collectionShare.findUnique({ where: { id: shareId }, include: { collection: { select: { userId: true, name: true, items: { select: { colour: { select: { name: true } }, fabric: { select: { name: true } } }, take: 8 } } } } });
    if (!share || share.collection.userId !== userId) throw AppError.notFound('Share not found');
    if (share.revokedAt) throw AppError.validation('This link has been revoked');
    if (hashToken(rawToken) !== share.tokenHash) throw AppError.validation('That link does not belong to this share');
    if (to.length === 0 || to.length > 10) throw AppError.validation('Send the catalogue to between one and ten addresses');

    const lines = share.collection.items.map((i) => `${i.colour.name} (${i.fabric.name})`);
    const url = this.urlFor(rawToken);
    const results = await Promise.allSettled(to.map((address) => this.email.sendQuoteShared(address, fromName, url, lines)));
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    this.telemetry.capture({ name: 'share.emailed', actorId: userId, props: { recipients: to.length, sent } });
    return { sent, failed: to.length - sent };
  }
}

export interface ResolvedShare {
  id: string;
  title: string;
  message: string | null;
  allowDownload: boolean;
  expiresAt: Date | null;
  collectionName: string;
  description: string | null;
  items: {
    id: string;
    colourName: string;
    hex: string | null;
    fabricName: string;
    fabricSpec: string;
    composition: string;
    note: string | null;
    quantity: number | null;
    unit: string | null;
  }[];
}
