/**
 * In-process fan-out of "this user has a new notification" events to open SSE streams.
 *
 * Scope: one API instance. If the API is ever scaled to several instances, publish through a shared
 * channel (e.g. Postgres LISTEN/NOTIFY or Redis) instead; clients already fall back to polling and
 * refetch on every reconnect, so a missed event is corrected within a minute.
 *
 * Events carry only a small summary (never the notification body), and are delivered only to the
 * stream opened by the notification's own user, so nothing crosses users or tenants.
 */
export interface NotificationEvent {
  id: string;
  category: string;
  title: string;
}

export interface HubSubscriber {
  send(event: NotificationEvent): void;
  /** Called when the hub drops this subscriber (e.g. the per-user connection cap). */
  close(): void;
}

/** A user rarely needs more than a few tabs; the oldest stream is closed beyond this. */
export const MAX_STREAMS_PER_USER = 5;

export class NotificationHub {
  private readonly subscribers = new Map<string, Set<HubSubscriber>>();

  subscribe(userId: string, subscriber: HubSubscriber): () => void {
    let set = this.subscribers.get(userId);
    if (!set) {
      set = new Set();
      this.subscribers.set(userId, set);
    }
    set.add(subscriber);
    while (set.size > MAX_STREAMS_PER_USER) {
      const oldest = set.values().next().value as HubSubscriber;
      set.delete(oldest);
      oldest.close();
    }
    return () => {
      const current = this.subscribers.get(userId);
      current?.delete(subscriber);
      if (current && current.size === 0) {
        this.subscribers.delete(userId);
      }
    };
  }

  publish(userId: string, event: NotificationEvent): void {
    for (const subscriber of [...(this.subscribers.get(userId) ?? [])]) {
      try {
        subscriber.send(event);
      } catch {
        // A broken socket must never affect the caller (which is a business operation).
      }
    }
  }

  /** Open streams, for tests and metrics. */
  connectionCount(userId?: string): number {
    if (userId) return this.subscribers.get(userId)?.size ?? 0;
    let total = 0;
    for (const set of this.subscribers.values()) total += set.size;
    return total;
  }
}

export const notificationHub = new NotificationHub();
