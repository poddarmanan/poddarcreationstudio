import { Resend } from 'resend';
import type { EmailMessage, EmailTransport } from './transport';

/** Resend transport (Priority 4), enabled when RESEND_API_KEY is set. */
export class ResendEmailTransport implements EmailTransport {
  readonly name = 'resend';
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (error) throw new Error(`Resend send failed: ${error.message}`);
  }
}
