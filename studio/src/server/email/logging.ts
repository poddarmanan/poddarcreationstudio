import type { PrismaClient } from '@/generated/prisma/client';
import type { EmailMessage, EmailTransport } from './transport';

/**
 * Transport decorator that records every message the platform sends (Phase 3 M19).
 *
 * Written as a decorator rather than a call in `EmailService` for one reason: **every** email
 * gets logged, including the six Phase 2 flows and anything added later, without a single call
 * site knowing it exists. That's the abstraction from Phase 2 paying rent.
 *
 * Failures are logged too — a `FAILED` row with the error is far more useful during an incident
 * than an email that silently never arrived.
 */
export class LoggingEmailTransport implements EmailTransport {
  readonly name: string;

  constructor(
    private readonly inner: EmailTransport,
    private readonly db: PrismaClient
  ) {
    this.name = `${inner.name}+log`;
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.inner.send(message);
      await this.record(message, 'SENT');
    } catch (err) {
      await this.record(message, 'FAILED', err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500));
      throw err;
    }
  }

  /** Resolves the recipient to an account where one exists, so the log joins the customer. */
  private async record(message: EmailMessage, status: 'SENT' | 'FAILED', error?: string): Promise<void> {
    try {
      const to = message.to.trim().toLowerCase();
      const user = await this.db.user.findUnique({ where: { email: to }, select: { id: true } });
      await this.db.emailLog.create({
        data: { to, subject: message.subject.slice(0, 300), userId: user?.id ?? null, status, error: error ?? null },
      });
    } catch {
      /* the delivery log must never break delivery */
    }
  }
}
