import type { Telemetry, TelemetryEvent } from './telemetry';

/**
 * Sentry driver (Priority 5) over the documented envelope HTTP API — dependency-free and
 * server-side only, so it cannot disturb the frozen client bundle or CSP. Captures errors
 * (M0's seam already routes all 5xx + caught exceptions here) and slow-request breadcrumbs.
 * Swappable for the full @sentry/nextjs SDK later without touching call sites.
 */
export class SentryTelemetry implements Telemetry {
  private readonly ingestUrl: string;
  private readonly authHeader: string;
  private readonly environment: string;

  constructor(dsn: string) {
    // DSN: https://<key>@<host>/<projectId>
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\//g, '');
    this.ingestUrl = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
    this.authHeader = `Sentry sentry_version=7, sentry_client=poddar-studio/1.0, sentry_key=${u.username}`;
    this.environment = process.env.NODE_ENV ?? 'development';
  }

  capture(): void {
    // Product analytics belong to PostHog; Sentry receives errors + performance only.
  }

  error(err: unknown, context?: Record<string, unknown>): void {
    const e = err instanceof Error ? err : new Error(String(err));
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'node',
      environment: this.environment,
      exception: {
        values: [
          {
            type: e.name,
            value: e.message,
            stacktrace: e.stack
              ? { frames: e.stack.split('\n').slice(1, 21).reverse().map((line) => ({ function: line.trim() })) }
              : undefined,
          },
        ],
      },
      extra: context,
    };
    this.send(event.event_id, 'event', event);
  }

  timing(name: string, ms: number, props?: Record<string, unknown>): void {
    // Only report genuinely slow work — a transaction per request would flood the quota.
    if (ms < 1000) return;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    this.send(eventId, 'event', {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'node',
      environment: this.environment,
      level: 'warning',
      message: { formatted: `slow: ${name} took ${ms.toFixed(0)}ms` },
      extra: props,
    });
  }

  private send(eventId: string, type: string, payload: unknown): void {
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      '\n' +
      JSON.stringify({ type }) +
      '\n' +
      JSON.stringify(payload) +
      '\n';
    // Fire-and-forget: telemetry must never slow or fail a request.
    fetch(this.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': this.authHeader },
      body: envelope,
    }).catch(() => {});
  }
}
