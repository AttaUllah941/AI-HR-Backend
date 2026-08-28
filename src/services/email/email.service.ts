import { logger } from '../../config/logger.js';
import { env, isDevelopment } from '../../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Provider-independent email abstraction.
 * Phase 13 will plug in a real provider; Phase 2 logs messages in development.
 */
export class EmailService {
  async send(message: EmailMessage): Promise<void> {
    if (isDevelopment) {
      logger.info('Email (dev sink)', {
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return;
    }

    logger.warn('Email provider not configured — message skipped', {
      to: message.to,
      subject: message.subject,
    });
  }

  buildAppLink(path: string): string {
    const base = env.APP_URL.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

export const emailService = new EmailService();
