import { logger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './email-provider.js';

/** Development / fallback sink — logs only, never sends externally. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    logger.info('Email (console provider)', {
      to: message.to,
      subject: message.subject,
      text: message.text.slice(0, 500),
    });
  }
}
