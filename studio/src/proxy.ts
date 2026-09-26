import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy with a per-request nonce (Priority 3). Next.js auto-applies the
 * nonce to its framework + page scripts, so `script-src` needs no 'unsafe-inline'.
 *
 * **Every page this policy covers must render dynamically.** Next can only stamp the
 * request's nonce into markup it generates per request; a statically prerendered page was
 * built before the nonce existed, so its inline bootstrap scripts carry none and this policy
 * refuses them — the page never hydrates. That broke `/signin`, `/forgot-password`,
 * `/reset-password`, `/verify-email` and `/accept-invite` in production: nobody could sign in
 * or reset a password. Those five are now server wrappers marked `force-dynamic`.
 *
 * Nothing in a build, lint or type check can see this, and the HTTP smokes authenticate
 * through the API rather than the form, so it took driving a real browser to find. If you add
 * a new client-rendered route, render it dynamically or it will fail the same way —
 * `scripts/smoke-http-hydration.ts` guards against exactly that.
 *
 * Documented tradeoff: the ported design renders inline `style` attributes on nearly every
 * element (baseline is frozen — removing them would be a redesign), so `style-src` must
 * allow 'unsafe-inline'.
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    // 'wasm-unsafe-eval' admits WebAssembly alone, not eval(): the Draco decoder that unpacks
    // compressed garment models is WebAssembly, and without this a compressed model never loads.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self' data:`,
    // blob: because a model's textures are unpacked from the file into blob URLs and fetched back.
    `connect-src 'self' blob:${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Run on HTML routes only; skip API, static assets, image optimizer, favicon, and
  // link prefetches (which don't render and don't need a nonce).
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
