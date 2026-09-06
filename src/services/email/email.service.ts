import { env, isDevelopment } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ConsoleEmailProvider } from './console-email.provider.js';
import type { EmailMessage, EmailProvider } from './email-provider.js';
import { SmtpHttpEmailProvider } from './smtp-http-email.provider.js';

function createEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === 'smtp' && env.EMAIL_SMTP_URL) {
    return new SmtpHttpEmailProvider(env.EMAIL_SMTP_URL, env.EMAIL_FROM, env.EMAIL_API_KEY || undefined);
  }
  return new ConsoleEmailProvider();
}

/**
 * Provider-independent email abstraction.
 * Default: console sink (safe for local/CI). Set EMAIL_PROVIDER=smtp + EMAIL_SMTP_URL for relay.
 */
export class EmailService {
  constructor(private readonly provider: EmailProvider = createEmailProvider()) {}

  get providerName(): string {
    return this.provider.name;
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.provider.send(message);
    } catch (error) {
      if (isDevelopment && this.provider.name !== 'console') {
        logger.warn('Email send failed in development — falling back to console log', {
          to: message.to,
          subject: message.subject,
          error: error instanceof Error ? error.message : String(error),
        });
        await new ConsoleEmailProvider().send(message);
        return;
      }
      throw error;
    }
  }

  buildAppLink(path: string): string {
    const base = env.APP_URL.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

export const emailService = new EmailService();
