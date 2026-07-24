/**
 * Email transport abstraction (Priority 4). App code sends through this interface; the
 * composition root picks Resend (when RESEND_API_KEY is set) or a dev transport that writes
 * .eml files to disk, so email flows are fully testable with no credentials.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
