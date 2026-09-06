import { logger } from '../../config/logger.js';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  platform?: string;
}

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<void>;
}

/** Architecture stub — logs intended push payloads until FCM/APNs is wired. */
export class MockPushProvider implements PushProvider {
  readonly name = 'mock';

  async send(message: PushMessage): Promise<void> {
    logger.info('Push (mock provider)', {
      token: `${message.token.slice(0, 12)}…`,
      title: message.title,
      body: message.body.slice(0, 200),
      platform: message.platform ?? 'WEB',
    });
  }
}

export const pushProvider: PushProvider = new MockPushProvider();
