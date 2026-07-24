import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailMessage, EmailTransport } from './transport';

/**
 * Dev transport: writes each message as an .eml file under STORAGE_DIR/outbox and logs a
 * line. Keeps every email flow verifiable locally without a provider account.
 */
export class DevEmailTransport implements EmailTransport {
  readonly name = 'dev';
  private readonly from: string;
  private readonly outbox: string;
  /** Disambiguates messages sent inside the same millisecond, which would otherwise
   *  collide on filename and silently overwrite each other. */
  private sequence = 0;

  constructor() {
    this.from = process.env.EMAIL_FROM ?? 'Poddar Creation Studio <studio@poddarcreation.local>';
    this.outbox = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage', 'outbox');
  }

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.outbox, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTo = message.to.replace(/[^\w.@-]+/g, '_');
    const seq = String((this.sequence += 1)).padStart(4, '0');
    const file = path.join(this.outbox, `${stamp}_${seq}_${safeTo}.eml`);
    const eml = [
      `From: ${this.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      message.replyTo ? `Reply-To: ${message.replyTo}` : '',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      message.html,
    ]
      .filter(Boolean)
      .join('\r\n');
    await writeFile(file, eml);
    console.info(`[email:dev] "${message.subject}" → ${message.to} (${path.relative(process.cwd(), file)})`);
  }
}
