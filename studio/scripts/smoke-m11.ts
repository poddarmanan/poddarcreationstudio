import 'dotenv/config';
import assert from 'node:assert';
import { NoopTelemetry, ConsoleTelemetry, CompositeTelemetry, type Telemetry } from '../src/server/core/telemetry';
import { SentryTelemetry } from '../src/server/core/telemetry-sentry';
import { PostHogTelemetry } from '../src/server/core/telemetry-posthog';

/**
 * M11 verification: telemetry drivers must (a) be selected purely from env, (b) stay silent
 * when unconfigured, (c) never throw into a request path, and (d) send correctly-shaped
 * payloads to Sentry/PostHog. We intercept global fetch rather than hitting real SaaS.
 */

type Sent = { url: string; body: string; headers: Record<string, string> };
const sent: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  sent.push({
    url: String(input),
    body: String(init?.body ?? ''),
    headers: (init?.headers ?? {}) as Record<string, string>,
  });
  return new Response('ok', { status: 200 });
}) as typeof fetch;

/** Freshly evaluate the factory under a given env. */
async function selectWith(env: Record<string, string | undefined>): Promise<Telemetry> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // Bypass the module cache so NODE_ENV/DSN changes are actually re-read.
  const mod = await import(`../src/server/core/telemetry-factory?t=${Math.random()}`);
  const t = mod.createTelemetry() as Telemetry;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return t;
}

async function main() {
  // 1. Unconfigured production → no-op, and emitting must be silent + non-throwing.
  const bare = await selectWith({ NODE_ENV: 'production', TELEMETRY_VERBOSE: undefined, SENTRY_DSN: undefined, POSTHOG_KEY: undefined });
  assert(bare instanceof NoopTelemetry, 'unconfigured production selects NoopTelemetry');
  sent.length = 0;
  const bareSeam: Telemetry = bare; // exercise it through the interface, not the narrowed class
  bareSeam.capture({ name: 'x' });
  bareSeam.error(new Error('x'));
  bareSeam.timing('x', 5000);
  assert.equal(sent.length, 0, 'no-op sink performs zero network calls');
  console.log('unconfigured prod → NoopTelemetry, silent ✓');

  // 2. Development default → console only, still no network.
  const dev = await selectWith({ NODE_ENV: 'development', SENTRY_DSN: undefined, POSTHOG_KEY: undefined });
  assert(dev instanceof ConsoleTelemetry, 'dev selects ConsoleTelemetry');
  console.log('dev → ConsoleTelemetry ✓');

  // 3. Both credentials present → composite fan-out.
  const both = await selectWith({
    NODE_ENV: 'production',
    SENTRY_DSN: 'https://pubkey@o123.ingest.sentry.io/456',
    POSTHOG_KEY: 'phc_test',
    POSTHOG_HOST: 'https://eu.posthog.com',
  });
  assert(both instanceof CompositeTelemetry, 'both credentials select CompositeTelemetry');
  sent.length = 0;
  both.error(new Error('boom'), { route: '/api/quotes' });
  assert.equal(sent.length, 2, 'error fans out to both sinks');
  const sentry = sent.find((s) => s.url.includes('sentry.io'))!;
  const posthog = sent.find((s) => s.url.includes('posthog.com'))!;
  assert.equal(sentry.url, 'https://o123.ingest.sentry.io/api/456/envelope/', 'DSN parsed into envelope endpoint');
  assert(sentry.headers['X-Sentry-Auth'].includes('sentry_key=pubkey'), 'auth header carries the public key');
  const envelopeLines = sentry.body.trim().split('\n');
  assert.equal(envelopeLines.length, 3, 'envelope is header/item-header/payload');
  const sentryEvent = JSON.parse(envelopeLines[2]);
  assert.equal(sentryEvent.exception.values[0].value, 'boom', 'exception message forwarded');
  assert.equal(sentryEvent.extra.route, '/api/quotes', 'context forwarded');
  assert.equal(posthog.url, 'https://eu.posthog.com/capture/', 'POSTHOG_HOST honoured');
  const phEvent = JSON.parse(posthog.body);
  assert.equal(phEvent.event, '$exception', 'PostHog uses the $exception convention');
  assert.equal(phEvent.api_key, 'phc_test', 'api key forwarded');
  console.log('composite fan-out: sentry envelope ✓ / posthog capture ✓');

  // 4. Product events go to PostHog only — Sentry must not receive analytics.
  sent.length = 0;
  both.capture({ name: 'search_performed', actorId: 'user_1', props: { q: 'ivory' } });
  assert.equal(sent.length, 1, 'capture reaches exactly one sink');
  assert(sent[0].url.includes('posthog'), 'analytics routed to PostHog');
  assert.equal(JSON.parse(sent[0].body).distinct_id, 'user_1', 'actor becomes distinct_id');
  console.log('capture → PostHog only ✓');

  // 5. Timing is sampled: fast requests are dropped, slow ones reported to both.
  sent.length = 0;
  both.timing('http.request', 12);
  assert.equal(sent.length, 0, 'fast requests are not reported');
  both.timing('http.request', 2400, { path: '/catalogue' });
  assert.equal(sent.length, 2, 'slow requests reach both sinks');
  console.log('timing sampled at 1000ms ✓');

  // 6. A failing sink must not break the others or the caller.
  const exploding: Telemetry = {
    capture() { throw new Error('sink down'); },
    error() { throw new Error('sink down'); },
    timing() { throw new Error('sink down'); },
  };
  const guarded = new CompositeTelemetry([exploding, new PostHogTelemetry('phc_x')]);
  sent.length = 0;
  guarded.capture({ name: 'still_delivered' });
  assert.equal(sent.length, 1, 'healthy sink still delivers when a sibling throws');
  console.log('sink isolation ✓');

  // 7. The container resolves telemetry through the factory (no direct driver coupling).
  const { getContainer } = await import('../src/server/container');
  const t = getContainer().telemetry;
  assert(typeof t.capture === 'function' && typeof t.error === 'function' && typeof t.timing === 'function', 'container exposes the seam');
  assert(!(t instanceof SentryTelemetry), 'no Sentry sink without a DSN in this env');
  console.log('container wiring ✓');

  globalThis.fetch = realFetch;
  console.log('\nM11 SMOKE PASSED');
}

main().catch((e) => {
  globalThis.fetch = realFetch;
  console.error('M11 SMOKE FAILED:', e);
  process.exit(1);
});
