import type { EmailTransport } from './transport';
import { DevEmailTransport } from './dev';
import { ResendEmailTransport } from './resend';

export type { EmailTransport, EmailMessage } from './transport';

/**
 * Selects the email transport: Resend when RESEND_API_KEY (+ EMAIL_FROM) is set, else the
 * dev transport that writes .eml files to disk — so every email flow works with no account.
 */
export function createEmailTransport(): EmailTransport {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) return new ResendEmailTransport(apiKey, from);
  return new DevEmailTransport();
}
