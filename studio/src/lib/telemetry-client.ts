/**
 * Client-side telemetry (Phase 4 M21).
 *
 * The 3D work raises questions only a real device can answer: what tier do our customers'
 * phones actually get, how often does the GL context go away, which renderers fall back. None
 * of that is visible from the server, so a small, deliberately narrow channel carries it to
 * the same telemetry pipeline everything else uses.
 *
 * Narrow on purpose: the endpoint accepts an allow-listed set of event names and nothing else,
 * so this cannot become a way for a page to write arbitrary records.
 */

/** Every event this app is allowed to report from the browser. */
export const CLIENT_EVENTS = ['three.ready', 'three.fallback', 'three.slow'] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** One report per event name per page load — this is a health signal, not an activity log. */
const sent = new Set<string>();

export function reportClientEvent(name: ClientEvent, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  // `three.fallback` is keyed by reason so a device that loses its context and later fails to
  // compile a shader reports both, but a scene that flaps does not report a hundred times.
  const key = `${name}:${String(props.reason ?? '')}`;
  if (sent.has(key)) return;
  sent.add(key);

  const body = JSON.stringify({ name, props });
  try {
    // A beacon survives the page being closed, which is exactly when a fallback caused by a
    // crash would otherwise be lost.
    if (navigator.sendBeacon?.('/api/telemetry', new Blob([body], { type: 'application/json' }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch('/api/telemetry', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

/** Test seam: lets a smoke script make the same event report twice. */
export function __resetClientEvents(): void {
  sent.clear();
}
