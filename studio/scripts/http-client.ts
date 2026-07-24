import assert from 'node:assert';

/**
 * Minimal cookie-aware HTTP client for the live smoke scripts. Signs in through the real
 * NextAuth credentials flow so the scripts exercise the same session, CSRF and RBAC path a
 * browser does — no test-only back doors.
 */
export const BASE = process.env.SMOKE_BASE_URL ?? process.argv[2] ?? 'http://localhost:3000';

export class Session {
  private cookies = new Map<string, string>();

  private absorb(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  get cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers ?? {}), cookie: this.cookieHeader },
    });
    this.absorb(res);
    return res;
  }

  /** JSON mutation with the same-origin header the CSRF guard expects. */
  send(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<Response> {
    return this.fetch(path, {
      method,
      headers: { 'content-type': 'application/json', origin: BASE },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetch(path, init);
    assert(res.ok, `GET ${path} → ${res.status}`);
    return (await res.json()) as T;
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const session = new Session();
  const { csrfToken } = await session.json<{ csrfToken: string }>('/api/auth/csrf');
  const res = await session.fetch('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/portal`, json: 'true' }),
  });
  assert(res.status < 400, `sign-in for ${email} returned ${res.status}`);
  const me = await session.json<{ user?: { email?: string } }>('/api/auth/session');
  assert(me.user?.email === email, `session established for ${email}`);
  return session;
}

/** Reads a JSON body, asserting the expected status first so failures name the endpoint. */
export async function expectJson<T>(res: Response, status: number, what: string): Promise<T> {
  assert(res.status === status, `${what} → expected ${status}, got ${res.status}`);
  return (await res.json()) as T;
}
