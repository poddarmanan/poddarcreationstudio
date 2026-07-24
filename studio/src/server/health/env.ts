/**
 * Environment validation (Phase 3 M20).
 *
 * The point is to fail *loudly at boot* rather than quietly at 3am. Every rule below encodes a
 * misconfiguration that would otherwise surface as a confusing runtime error — an R2 driver
 * with no bucket, a production deploy still using the development auth secret, an email driver
 * selected without an API key.
 *
 * Pure and dependency-free so the preflight script, the diagnostics page and the boot check can
 * all share it.
 */

export type Severity = 'ok' | 'warn' | 'fail';

export interface EnvFinding {
  key: string;
  severity: Severity;
  message: string;
}

export interface EnvReport {
  environment: string;
  production: boolean;
  findings: EnvFinding[];
  ok: boolean;
  failures: number;
  warnings: number;
}

const DEV_SECRETS = ['dev-insecure-secret', 'changeme', 'secret', 'development'];

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const production = env.NODE_ENV === 'production';
  const findings: EnvFinding[] = [];
  const ok = (key: string, message: string) => findings.push({ key, severity: 'ok', message });
  const warn = (key: string, message: string) => findings.push({ key, severity: 'warn', message });
  const fail = (key: string, message: string) => findings.push({ key, severity: 'fail', message });

  // ---- Database ---------------------------------------------------------------
  const db = env.DATABASE_URL;
  if (!db) fail('DATABASE_URL', 'Not set — the application cannot start');
  else if (!/^postgres(ql)?:\/\//.test(db)) fail('DATABASE_URL', 'Must be a postgresql:// connection string');
  else if (production && /localhost|127\.0\.0\.1/.test(db)) warn('DATABASE_URL', 'Points at localhost in production — is that intended?');
  else if (production && !/sslmode=/.test(db)) warn('DATABASE_URL', 'No sslmode specified; most managed providers expect sslmode=require');
  else ok('DATABASE_URL', 'Set');

  // ---- Auth --------------------------------------------------------------------
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) fail('AUTH_SECRET', 'Not set — sessions and every signed URL depend on it');
  else if (DEV_SECRETS.some((weak) => secret.toLowerCase().includes(weak))) {
    // A development secret in production invalidates sessions *and* forges signed URLs.
    (production ? fail : warn)('AUTH_SECRET', 'Looks like a development placeholder');
  } else if (secret.length < 32) {
    (production ? fail : warn)('AUTH_SECRET', `Only ${secret.length} characters; use at least 32`);
  } else ok('AUTH_SECRET', 'Set and long enough');

  const appUrl = env.APP_URL || env.NEXTAUTH_URL;
  if (!appUrl) warn('APP_URL', 'Not set — emailed links will fall back to http://localhost:3000');
  else if (production && appUrl.startsWith('http://')) fail('APP_URL', 'Must be https:// in production — links and cookies depend on it');
  else ok('APP_URL', appUrl);

  // ---- Storage -------------------------------------------------------------------
  const storageDriver = env.STORAGE_DRIVER ?? 'local';
  if (storageDriver === 'r2') {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const) {
      if (!env[key]) fail(key, 'Required when STORAGE_DRIVER=r2');
    }
    if (env.R2_ACCOUNT_ID && env.R2_BUCKET) ok('STORAGE_DRIVER', 'r2, credentials present');
  } else {
    (production ? warn : ok)('STORAGE_DRIVER', production ? 'local disk in production — uploads will not survive a redeploy' : 'local disk (development default)');
  }

  // ---- Email ----------------------------------------------------------------------
  if (env.RESEND_API_KEY) {
    if (!env.EMAIL_FROM) fail('EMAIL_FROM', 'Required when RESEND_API_KEY is set, or Resend will reject every send');
    else ok('EMAIL_DRIVER', 'resend');
  } else {
    (production ? fail : ok)('EMAIL_DRIVER', production ? 'No RESEND_API_KEY — production would write .eml files to disk instead of sending' : 'dev transport (writes .eml files)');
  }

  // ---- Search ------------------------------------------------------------------------
  if (env.SEARCH_DRIVER === 'meili') {
    if (!env.MEILI_HOST) fail('MEILI_HOST', 'Required when SEARCH_DRIVER=meili');
    else ok('SEARCH_DRIVER', 'meilisearch');
    if (!env.MEILI_API_KEY) warn('MEILI_API_KEY', 'Not set — acceptable only for a trusted private network');
  } else ok('SEARCH_DRIVER', 'postgres (built-in fallback)');

  // ---- Monitoring ----------------------------------------------------------------------
  if (production && !env.SENTRY_DSN) warn('SENTRY_DSN', 'Not set — errors will not reach an error tracker');
  else if (env.SENTRY_DSN) ok('SENTRY_DSN', 'Set');
  if (production && !env.POSTHOG_KEY) warn('POSTHOG_KEY', 'Not set — product analytics will not be collected');
  else if (env.POSTHOG_KEY) ok('POSTHOG_KEY', 'Set');

  const failures = findings.filter((f) => f.severity === 'fail').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;

  return { environment: env.NODE_ENV ?? 'development', production, findings, ok: failures === 0, failures, warnings };
}
