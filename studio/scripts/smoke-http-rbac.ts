import 'dotenv/config';
import assert from 'node:assert';

/**
 * Live HTTP check of the customer/staff boundary (Phase 3 M12). Signs in through the real
 * NextAuth credentials flow, then proves a customer session is refused by every staff API
 * and page while its own portal endpoints stay reachable.
 *
 * Usage: `npx tsx scripts/smoke-http-rbac.ts [baseUrl]` against a running server.
 */
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';

/** Strings that only ever appear on the staff workspace screens. */
const WORKSPACE_MARKERS = ['PODDAR WORKSPACE', 'Staff hub', 'SALES WORKSPACE', 'INQUIRY DESK', 'Catalogue Ops'];

const STAFF_ENDPOINTS = [
  '/api/admin/activity',
  '/api/admin/media',
  '/api/admin/staff',
  '/api/admin/csv',
  '/api/admin/sales/pipeline',
  '/api/admin/sales/customers',
  '/api/admin/analytics',
  '/api/quotes',
];

class Jar {
  private cookies = new Map<string, string>();

  absorb(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  get header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers ?? {}), cookie: this.header },
    });
    this.absorb(res);
    return res;
  }
}

async function signIn(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await jar.fetch('/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/portal`, json: 'true' });
  const res = await jar.fetch('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body,
  });
  assert(res.status < 400, `sign-in for ${email} returned ${res.status}`);
  const session = (await (await jar.fetch('/api/auth/session')).json()) as { user?: { email?: string; role?: string } };
  assert(session.user?.email === email, `session established for ${email}`);
  return jar;
}

async function main() {
  console.log('base:', BASE);

  // ---- Customer session -----------------------------------------------------
  const buyer = await signIn('buyer@example.com', 'poddar123');
  console.log('signed in as buyer@example.com ✓');

  for (const path of STAFF_ENDPOINTS) {
    const res = await buyer.fetch(path);
    assert(res.status === 403, `${path} → expected 403 for a customer, got ${res.status}`);
  }
  console.log(`staff APIs refuse a customer session (${STAFF_ENDPOINTS.length} endpoints, all 403) ✓`);

  // Server components bounce customers with `redirect('/')`. Next may answer either with a
  // 3xx or with a 200 carrying a redirect instruction, so assert the property that actually
  // matters: no workspace content ever reaches a customer.
  for (const page of ['/admin', '/admin/quotes', '/admin/samples', '/admin/catalogue', '/admin/sales', '/admin/analytics']) {
    const res = await buyer.fetch(page);
    if (res.status >= 300 && res.status < 400) {
      assert(res.headers.get('location')?.endsWith('/'), `${page} → redirected away from the workspace`);
      continue;
    }
    assert(res.status === 200, `${page} → unexpected status ${res.status}`);
    const html = await res.text();
    for (const marker of WORKSPACE_MARKERS) {
      assert(!html.includes(marker), `${page} → leaked workspace content ("${marker}") to a customer`);
    }
  }
  console.log('staff pages never render workspace content for a customer ✓');

  // The customer's own surfaces still work.
  for (const path of ['/api/portal/addresses', '/api/portal/contacts', '/api/portal/account', '/api/portal/collections', '/api/portal/favourites']) {
    const res = await buyer.fetch(path);
    assert(res.status === 200, `${path} → expected 200 for its owner, got ${res.status}`);
  }
  assert((await buyer.fetch('/portal')).status === 200, 'portal renders for a customer');
  console.log('customer keeps full access to their own portal ✓');

  // Write path end-to-end through the HTTP boundary (CSRF + zod + audit).
  const created = await buyer.fetch('/api/portal/addresses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ label: 'HTTP smoke', line1: '1 Test Lane', city: 'Surat' }),
  });
  assert(created.status === 201, `address create → 201 (got ${created.status})`);
  const { address } = (await created.json()) as { address: { id: string } };
  const removed = await buyer.fetch(`/api/portal/addresses/${address.id}`, { method: 'DELETE', headers: { origin: BASE } });
  assert(removed.status === 200, 'address delete → 200');
  console.log('customer address write round-trip ✓');

  // Cross-origin write is rejected (CSRF defence still on the new routes).
  const crossOrigin = await buyer.fetch('/api/portal/addresses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ line1: 'x', city: 'y' }),
  });
  assert(crossOrigin.status === 403, `cross-origin write → 403 (got ${crossOrigin.status})`);
  console.log('cross-origin write rejected ✓');

  // ---- Staff session --------------------------------------------------------
  const sales = await signIn('sales@poddarcreation.studio', 'poddar123');
  const analytics = await sales.fetch('/api/admin/analytics');
  assert(analytics.status === 200, `staff analytics → 200 (got ${analytics.status})`);
  const adminOnly = await sales.fetch('/api/admin/activity');
  assert(adminOnly.status === 403, `sales is refused the admin-only activity feed (got ${adminOnly.status})`);
  const hub = await (await sales.fetch('/admin')).text();
  assert(WORKSPACE_MARKERS.some((m) => hub.includes(m)), 'staff genuinely see the workspace (so the marker check above is meaningful)');
  console.log('staff session: sales reaches its desk, admin-only stays admin-only ✓');

  // ---- Anonymous ------------------------------------------------------------
  const anon = new Jar();
  assert((await anon.fetch('/api/admin/analytics')).status === 401, 'anonymous → 401 on staff API');
  assert((await anon.fetch('/api/portal/addresses')).status === 401, 'anonymous → 401 on portal API');
  assert((await anon.fetch('/api/fabrics')).status === 200, 'public catalogue stays public');
  console.log('anonymous access boundary ✓');

  console.log('\nHTTP RBAC SMOKE PASSED');
}

main().catch((e) => {
  console.error('HTTP RBAC SMOKE FAILED:', e);
  process.exit(1);
});
