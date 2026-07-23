import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { AppError, isAppError } from './errors';
import type { RateLimitPolicy } from './rate-limit';
import { getContainer } from '../container';

/**
 * HTTP boundary helpers. Route handlers stay thin: parse → validate → call a service →
 * return. `run()` gives every route uniform error mapping, safe error bodies (no stack
 * or internal message leakage on 5xx), telemetry, and opt-in CSRF + rate-limit guards —
 * without changing the success body shape existing clients already depend on.
 */

export interface RunOptions {
  /** Reject cross-origin state-changing requests (CSRF defense). Set on mutations. */
  csrf?: boolean;
  /** Apply a rate-limit policy keyed by client IP. */
  rateLimit?: RateLimitPolicy;
}

/**
 * Runs a route handler's body with uniform error mapping + timing telemetry, while leaving
 * the exported route function's native signature intact (Next 16 type-checks route exports
 * strictly, so we wrap the body, not the export).
 *
 *   export async function POST(req: Request) {
 *     return run(req, async () => NextResponse.json({ ... }), { csrf: true, rateLimit: RATE_LIMITS.write });
 *   }
 */
export async function run(req: Request, fn: () => Promise<Response>, opts: RunOptions = {}): Promise<Response> {
  const started = performance.now();
  try {
    if (opts.csrf) assertSameOrigin(req);
    if (opts.rateLimit) enforceRateLimit(req, opts.rateLimit);
    const res = await fn();
    getContainer().telemetry.timing('http.request', performance.now() - started, {
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err, req);
  }
}

/**
 * CSRF defense for JSON/multipart APIs: a cross-site form/script can send a same-site
 * cookie, but cannot forge the Origin header. Combined with SameSite=Lax cookies this
 * blocks classic CSRF. Same-origin and server-to-server (no Origin) requests pass.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser / same-origin navigations don't always send Origin
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw AppError.forbidden('Invalid origin');
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host && originHost !== host) {
    throw AppError.forbidden('Cross-origin request rejected');
  }
}

export function enforceRateLimit(req: Request, policy: RateLimitPolicy): void {
  const { rateLimiter } = getContainer();
  const ip = clientInfo(req).ip ?? 'unknown';
  const result = rateLimiter.check(`${policy.name}:${ip}`, policy.limit, policy.windowMs);
  if (!result.allowed) {
    throw AppError.rateLimited('Too many requests — please slow down and try again shortly');
  }
}

export function toErrorResponse(err: unknown, req?: Request): NextResponse {
  const { telemetry } = getContainer();

  if (isAppError(err)) {
    // 4xx are expected control flow — surface the message; log 5xx-ish ones only.
    if (err.status >= 500) telemetry.error(err, { path: req && new URL(req.url).pathname });
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }

  telemetry.error(err, { path: req && new URL(req.url).pathname });
  // Never leak internal error detail to the client.
  return NextResponse.json({ error: 'Something went wrong', code: 'INTERNAL' }, { status: 500 });
}

/** Parse + validate a JSON body, throwing a typed AppError on malformed/invalid input. */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => {
    throw AppError.validation('Request body must be valid JSON');
  });
  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.validation('Invalid request', { issues: result.error.issues });
  }
  return result.data;
}

/** Validate already-parsed data (e.g. from multipart form fields). */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw AppError.validation('Invalid request', { issues: result.error.issues });
  return result.data;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export function clientInfo(req: Request): ClientInfo {
  const h = req.headers;
  const fwd = h.get('x-forwarded-for');
  return {
    ip: (fwd ? fwd.split(',')[0].trim() : undefined) || h.get('x-real-ip') || undefined,
    userAgent: h.get('user-agent') || undefined,
  };
}

/** Standard success envelope for NEW endpoints. Existing endpoints keep their bespoke shapes. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}
