import { type Telemetry, ConsoleTelemetry, NoopTelemetry, CompositeTelemetry } from './telemetry';
import { SentryTelemetry } from './telemetry-sentry';
import { PostHogTelemetry } from './telemetry-posthog';

/**
 * Driver selection for the telemetry seam (Priority 5) — the same env-driven shape as
 * `createStorage()` / `createSearchEngine()` / the email transport. Every sink is optional:
 * with no credentials the app runs exactly as before (console in dev, silent in prod), so
 * monitoring is a deployment concern rather than a code dependency.
 *
 *   SENTRY_DSN    → errors + slow-request warnings
 *   POSTHOG_KEY   → product events (+ POSTHOG_HOST for self-hosted)
 *   TELEMETRY_VERBOSE → keep console logging in production too
 */
export function createTelemetry(): Telemetry {
  const sinks: Telemetry[] = [];

  if (process.env.NODE_ENV !== 'production' || process.env.TELEMETRY_VERBOSE) {
    sinks.push(new ConsoleTelemetry());
  }
  if (process.env.SENTRY_DSN) {
    sinks.push(new SentryTelemetry(process.env.SENTRY_DSN));
  }
  if (process.env.POSTHOG_KEY) {
    sinks.push(new PostHogTelemetry(process.env.POSTHOG_KEY, process.env.POSTHOG_HOST));
  }

  if (sinks.length === 0) return new NoopTelemetry();
  if (sinks.length === 1) return sinks[0]!;
  return new CompositeTelemetry(sinks);
}
