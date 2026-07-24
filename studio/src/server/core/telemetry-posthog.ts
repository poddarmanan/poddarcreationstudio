import type { Telemetry, TelemetryEvent } from './telemetry';

/**
 * PostHog driver (Priority 5) over the /capture HTTP API — dependency-free, server-side.
 * Receives product events (search usage, uploads, quotes, samples, downloads, journeys);
 * errors surface as PostHog's $exception convention so failure funnels are queryable too.
 */
export class PostHogTelemetry implements Telemetry {
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(apiKey: string, host = 'https://app.posthog.com') {
    this.apiKey = apiKey;
    this.endpoint = `${host.replace(/\/$/, '')}/capture/`;
  }

  capture(event: TelemetryEvent): void {
    this.send(event.name, event.actorId ?? 'anonymous', event.props);
  }

  error(err: unknown, context?: Record<string, unknown>): void {
    const e = err instanceof Error ? err : new Error(String(err));
    this.send('$exception', 'server', { $exception_type: e.name, $exception_message: e.message, ...context });
  }

  timing(name: string, ms: number, props?: Record<string, unknown>): void {
    // Sampled: only slow requests are interesting as product signals.
    if (ms < 1000) return;
    this.send('slow_request', 'server', { name, ms: Math.round(ms), ...props });
  }

  private send(event: string, distinctId: string, properties?: Record<string, unknown>): void {
    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, source: 'poddar-studio-server' },
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }
}
