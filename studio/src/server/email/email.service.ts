import type { EmailTransport } from './transport';
import {
  verifyEmailTemplate,
  welcomeTemplate,
  resetPasswordTemplate,
  inviteTemplate,
  buyerApprovedTemplate,
  quoteSharedTemplate,
  quoteReceivedTemplate,
  quoteStatusTemplate,
  noticeTemplate,
} from './templates';

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * High-level email operations (Priority 4). Builds branded messages from templates, embeds
 * link URLs, and dispatches through the active transport (Resend or the dev .eml writer).
 * Send failures are surfaced to callers, which decide whether they're fatal to the flow.
 */
export class EmailService {
  constructor(private readonly transport: EmailTransport) {}

  get transportName(): string {
    return this.transport.name;
  }

  sendVerification(to: string, name: string, rawToken: string) {
    return this.transport.send({ to, ...verifyEmailTemplate({ name, url: `${appUrl()}/verify-email?token=${rawToken}` }) });
  }

  sendWelcome(to: string, name: string) {
    return this.transport.send({ to, ...welcomeTemplate({ name }) });
  }

  sendPasswordReset(to: string, name: string, rawToken: string) {
    return this.transport.send({ to, ...resetPasswordTemplate({ name, url: `${appUrl()}/reset-password?token=${rawToken}` }) });
  }

  sendInvite(to: string, inviterName: string, role: string, rawToken: string) {
    return this.transport.send({ to, ...inviteTemplate({ inviterName, role, url: `${appUrl()}/accept-invite?token=${rawToken}` }) });
  }

  sendBuyerApproved(to: string, name: string) {
    return this.transport.send({ to, ...buyerApprovedTemplate({ name, url: `${appUrl()}/` }) });
  }

  sendQuoteShared(to: string, fromName: string, url: string, items: string[]) {
    return this.transport.send({ to, ...quoteSharedTemplate({ fromName, url, items }) });
  }

  sendQuoteReceived(to: string, name: string, subject: string) {
    return this.transport.send({ to, ...quoteReceivedTemplate({ name, subject }) });
  }

  sendQuoteStatus(to: string, name: string, subject: string, status: string) {
    return this.transport.send({ to, ...quoteStatusTemplate({ name, subject, status, url: `${appUrl()}/portal` }) });
  }

  sendStaffNotice(to: string, eyebrow: string, heading: string, paragraphs: string[], cta?: { label: string; url: string }) {
    return this.transport.send({ to, ...noticeTemplate({ eyebrow, heading, paragraphs, cta }) });
  }
}
