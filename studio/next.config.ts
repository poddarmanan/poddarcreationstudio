import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Static security headers applied to every response (Priority 3). CSP is set separately,
 * per-request with a nonce, in `src/proxy.ts`. HSTS is only emitted in production (it must
 * never be sent over plain-HTTP local dev).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** Allow next/image to optimize media served from a configured CDN / public storage base. */
function remoteImagePatterns() {
  const bases = [process.env.CDN_IMAGE_BASE, process.env.R2_PUBLIC_BASE, process.env.MEDIA_PUBLIC_BASE].filter(
    (b): b is string => !!b
  );
  return bases.map((b) => {
    const u = new URL(b);
    return { protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname };
  });
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: remoteImagePatterns(),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
