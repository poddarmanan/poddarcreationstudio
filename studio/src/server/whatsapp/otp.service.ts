import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';

/** How long a code lasts, how many wrong tries it allows, and how many may be sent to one number. */
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MS = 10 * 60_000;

/**
 * A WhatsApp number as digits with its country code: spaces, dashes, brackets and a leading + are
 * dropped, and a bare ten-digit Indian mobile number gains its 91. Null when it cannot be a number.
 */
export function normalizeWhatsapp(input: string): string | null {
  let digits = input.replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** A number as people write it: +91 98290 11223. */
export function formatWhatsapp(digits: string): string {
  if (digits.startsWith('91') && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

const hash = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}`).digest('hex');

export interface WhatsAppSender {
  /** True when a real WhatsApp provider is configured. */
  readonly live: boolean;
  sendCode(phone: string, code: string): Promise<void>;
}

/**
 * Sends one-time codes through the WhatsApp Business Cloud API, with an approved authentication
 * template (its body takes the code, and its copy-code button takes it again).
 *
 *   WHATSAPP_TOKEN            a system-user access token
 *   WHATSAPP_PHONE_NUMBER_ID  the sending number's id
 *   WHATSAPP_OTP_TEMPLATE     the template's name (default "login_code"), language WHATSAPP_OTP_LANG (default "en")
 *
 * Without them, codes are written to the server log instead, which is enough to develop against;
 * the API then refuses to start a sign-in in production.
 */
export class CloudApiSender implements WhatsAppSender {
  readonly live = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  async sendCode(phone: string, code: string) {
    if (!this.live) {
      console.info(`[whatsapp] sign-in code for +${phone}: ${code} (no WhatsApp provider configured)`);
      return;
    }
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_OTP_TEMPLATE || 'login_code',
          language: { code: process.env.WHATSAPP_OTP_LANG || 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    if (!res.ok) {
      console.error('[whatsapp] send failed', res.status, await res.text().catch(() => ''));
      throw AppError.unavailable('We could not send the code on WhatsApp just now. Please try again.');
    }
  }
}

/** Issues and checks the one-time codes that sign a buyer in with their WhatsApp number. */
export class OtpService {
  constructor(
    private readonly db: PrismaClient,
    readonly sender: WhatsAppSender,
  ) {}

  /** Whether codes can be sent: a provider is live, or this is development (codes go to the log). */
  get ready() {
    return this.sender.live || process.env.NODE_ENV !== 'production' || !!process.env.WHATSAPP_DEV_CODES;
  }

  /** Sends a fresh code to the number. Returns the code itself only when no provider is live and this is not production. */
  async start(phone: string): Promise<{ devCode?: string }> {
    if (!this.ready) {
      throw AppError.unavailable('WhatsApp sign-in is not set up yet. Please sign in with email.');
    }
    const recent = await this.db.otpCode.count({ where: { phone, createdAt: { gt: new Date(Date.now() - SEND_WINDOW_MS) } } });
    if (recent >= SENDS_PER_WINDOW) throw AppError.rateLimited('Too many codes sent to this number. Please wait a few minutes.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // A new code replaces any still waiting.
    await this.db.otpCode.updateMany({ where: { phone, usedAt: null }, data: { usedAt: new Date() } });
    await this.db.otpCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + TTL_MS) } });
    await this.sender.sendCode(phone, code);
    return this.sender.live ? {} : { devCode: code };
  }

  /** Whether the code is the number's current one. A wrong code uses up a try; `consume` spends a right one. */
  async check(phone: string, code: string, consume: boolean): Promise<boolean> {
    const otp = await this.db.otpCode.findFirst({ where: { phone, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp || otp.attempts >= MAX_ATTEMPTS || !/^\d{6}$/.test(code)) return false;
    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(hash(phone, code), 'hex');
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      await this.db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    if (consume) await this.db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    return true;
  }

  /** The account a number belongs to: on the user itself, or (for accounts made before M46) on their profile. */
  async findUser(phone: string) {
    const direct = await this.db.user.findUnique({ where: { whatsapp: phone } });
    if (direct) return direct;
    const rows = await this.db.$queryRaw<{ userId: string }[]>`
      SELECT "userId" FROM "DealerProfile" WHERE regexp_replace(coalesce("whatsapp", ''), '[^0-9]', '', 'g') IN (${phone}, ${phone.replace(/^91/, '')}) LIMIT 1`;
    if (!rows.length) return null;
    const user = await this.db.user.findUnique({ where: { id: rows[0].userId } });
    // Claim the number for the account, so the next sign-in finds it directly.
    if (user && !user.whatsapp) await this.db.user.update({ where: { id: user.id }, data: { whatsapp: phone } }).catch(() => undefined);
    return user;
  }
}
