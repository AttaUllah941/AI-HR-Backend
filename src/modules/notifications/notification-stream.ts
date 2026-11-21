import type { Request, Response } from 'express';
import { notificationHub, type NotificationEvent } from './notification-hub.js';

/** Comment frames keep proxies from closing an idle connection (most idle limits are 30-60 s). */
export const HEARTBEAT_MS = 20_000;
/**
 * A stream ends after this long and the client reconnects with a fresh token, so a session that
 * was revoked or expired cannot keep receiving events indefinitely.
 */
export const MAX_STREAM_LIFETIME_MS = 10 * 60_000;

export function formatEvent(event: NotificationEvent): string {
  return `event: notification\ndata: ${JSON.stringify(event)}\n\n`;
}

/** GET /notifications/stream: Server-Sent Events for the signed-in user (auth runs before this). */
export function notificationStream(req: Request, res: Response): void {
  const userId = req.user!.id;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  // no-transform stops the compression middleware from buffering the stream.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 5000\n: connected\n\n');

  let closed = false;
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unsubscribe();
  };

  const unsubscribe = notificationHub.subscribe(userId, {
    send: (event) => {
      if (!closed) res.write(formatEvent(event));
    },
    close: () => {
      cleanup();
      res.end();
    },
  });

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  const lifetime = setTimeout(() => {
    cleanup();
    res.end();
  }, MAX_STREAM_LIFETIME_MS);
  heartbeat.unref();
  lifetime.unref();

  req.on('close', cleanup);
  res.on('error', cleanup);
}
