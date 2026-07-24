/**
 * Telemetry seam (Priority 5). App code depends only on this interface; drivers are
 * chosen in the composition root. M0 ships a console driver (dev) and a no-op (prod
 * without a backend). M11 adds Sentry (errors/perf) + PostHog (product events) drivers
 * implementing the same interface — no call sites change.
 */

export interface TelemetryEvent {
  name: string;
  props?: Record<string, unknown>;
  /** Distinct user/session id when known, for product analytics. */
  actorId?: string;
}

export interface Telemetry {
  /** Product/behaviour event: search, download, quote, upload, journey step. */
  capture(event: TelemetryEvent): void;
  /** Exception with optional context — becomes a Sentry event in M11. */
  error(err: unknown, context?: Record<string, unknown>): void;
  /** Duration measurement in ms for a named span. */
  timing(name: string, ms: number, props?: Record<string, unknown>): void;
}

export class NoopTelemetry implements Telemetry {
  capture(): void {}
  error(): void {}
  timing(): void {}
}

/** Fans out to several sinks (e.g. console + Sentry + PostHog); each sink stays isolated. */
export class CompositeTelemetry implements Telemetry {
  constructor(private readonly sinks: Telemetry[]) {}
  capture(event: TelemetryEvent): void {
    for (const s of this.sinks) {
      try { s.capture(event); } catch { /* one sink must not break the rest */ }
    }
  }
  error(err: unknown, context?: Record<string, unknown>): void {
    for (const s of this.sinks) {
      try { s.error(err, context); } catch { /* isolated */ }
    }
  }
  timing(name: string, ms: number, props?: Record<string, unknown>): void {
    for (const s of this.sinks) {
      try { s.timing(name, ms, props); } catch { /* isolated */ }
    }
  }
}

export class ConsoleTelemetry implements Telemetry {
  capture(event: TelemetryEvent): void {
    console.info('[telemetry] event', event.name, event.props ?? {}, event.actorId ? `actor=${event.actorId}` : '');
  }
  error(err: unknown, context?: Record<string, unknown>): void {
    console.error('[telemetry] error', err instanceof Error ? `${err.name}: ${err.message}` : err, context ?? {});
  }
  timing(name: string, ms: number, props?: Record<string, unknown>): void {
    console.info('[telemetry] timing', name, `${ms.toFixed(1)}ms`, props ?? {});
  }
}
