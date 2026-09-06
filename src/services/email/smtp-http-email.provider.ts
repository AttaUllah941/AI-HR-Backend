import { logger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './email-provider.js';

/**
 * SMTP-compatible HTTP bridge placeholder.
 * When EMAIL_SMTP_URL is set, posts JSON to that endpoint (e.g. a relay microservice).
 * Without a working relay, fails closed with a clear error for the dispatcher to log.
 */
export class SmtpHttpEmailProvider implements EmailProvider {
  readonly name = 'smtp';

  constructor(
    private readonly endpoint: string,
    private readonly from: string,
    private readonly apiKey?: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          from: this.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SMTP relay error (${response.status}): ${text.slice(0, 200)}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SMTP relay timed out');
      }
      logger.error('SMTP email send failed', {
        to: message.to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
