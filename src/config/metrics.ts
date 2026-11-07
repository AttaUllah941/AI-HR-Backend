import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Dedicated registry (not the global one) so tests and hot reloads never double-register. */
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ service: 'zenith-hr-api' });
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Requests currently being handled',
  registers: [metricsRegistry],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Prisma query duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const dbSlowQueries = new Counter({
  name: 'db_slow_queries_total',
  help: 'Queries slower than DB_SLOW_QUERY_MS',
  registers: [metricsRegistry],
});

export const requestTimeouts = new Counter({
  name: 'http_request_timeouts_total',
  help: 'Requests answered with 503 because they exceeded the request timeout',
  registers: [metricsRegistry],
});

/** Registers pool gauges that read live values when scraped. */
export function registerPoolMetrics(pool: { totalCount: number; idleCount: number; waitingCount: number }): void {
  const gauge = (name: string, help: string, read: () => number) =>
    new Gauge({
      name,
      help,
      registers: [metricsRegistry],
      collect() {
        this.set(read());
      },
    });

  gauge('db_pool_total_connections', 'Open connections in the pg pool', () => pool.totalCount);
  gauge('db_pool_idle_connections', 'Idle connections in the pg pool', () => pool.idleCount);
  gauge('db_pool_waiting_requests', 'Queries waiting for a pool connection', () => pool.waitingCount);
}
