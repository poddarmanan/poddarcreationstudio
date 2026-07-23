# Poddar Creation Studio — Production-Readiness Plan (Phase 2)

**Status:** planning · baseline frozen · this phase *extends*, never redesigns.
**Author:** engineering · **Date:** 2026-07-23

---

## 0. Ground rules (non-negotiable)

- **No UI redesign.** Visual language, screens, motion, and copy stay exactly as the current baseline.
- **No rewrites of working systems.** Auth, upload pipeline, Prisma models, and the 8 screens are extended in place.
- **Additive migrations only.** Every schema change is backward-compatible; no destructive column drops on existing tables without a data-preserving path.
- **Deferred features stay deferred.** Three.js / R3F, fabric physics, AI vision / chat / search, ERP, inventory, CRM, order management are **not** built. We only reserve clean extension points.
- **Verification gate after every milestone:** `next build` passes → `prisma migrate` applies cleanly → existing functionality smoke-tested (home 200, `/api/fabrics` serves data, auth login, an upload round-trip). A milestone is not "done" until the gate is green.

---

## 1. Cross-cutting strategy: provider abstraction + dev fallback

Several priorities depend on external SaaS (Cloudflare R2, Resend, Sentry, PostHog, Meilisearch). This environment has **no credentials** for them, and egress probes to `api.resend.com`, Sentry, and PostHog return `403` (reachable, but auth-gated). Docker **is** available, so Meilisearch can be run and verified locally.

Therefore every external integration ships as **three layers**:

1. **An interface** (`StorageProvider`, `EmailTransport`, `SearchEngine`, `Telemetry`, `Cdn`) — the only thing app code imports.
2. **A zero-dependency dev driver** that keeps the app fully runnable with no creds (local disk storage, console/`.eml` email, Postgres-backed search, no-op telemetry).
3. **A real provider driver** activated by env config (`STORAGE_DRIVER=r2`, `EMAIL_DRIVER=resend`, `SEARCH_DRIVER=meili`, `SENTRY_DSN=…`, `POSTHOG_KEY=…`).

This satisfies the explicit "local development compatibility" and "config abstraction" requirements, keeps CI/build green without secrets, and is the correct production pattern (swap R2 → S3/GCS/Azure by adding a driver, changing one env var). Real drivers are written and type-checked here; they are exercised against live services only once credentials exist. Meilisearch is the exception — verified locally via Docker.

---

## 2. Architecture baseline (threads through all milestones — Priority 13)

Introduced in M0 and followed by all new code; existing code refactored **only where a milestone already touches it** (no big-bang rewrite).

```
src/
  server/
    <feature>/           # feature-sliced: storage, search, email, colour,
      *.repository.ts     #   dealer, inquiry, sample, media, audit, telemetry
      *.service.ts        # business logic (framework-agnostic, unit-testable)
      *.schema.ts         # zod contracts (input + response)
      *.types.ts
    container.ts          # tiny composition root (DI seam; picks drivers from env)
  lib/                    # existing pure utils (fabric-generator, oklch, style…)
  app/                    # routes stay thin: parse → zod → service → typed response
```

Principles: SOLID, repository pattern over Prisma, services depend on interfaces (constructor injection via the container), feature-based folders, strict typing, zero duplicated logic. Route handlers become thin controllers.

---

## 3. Milestone map (priority → milestone)

| # | Milestone | Priorities | External dep | Verifiable here |
|---|-----------|-----------|--------------|-----------------|
| **M0** | Architecture foundation + DI seam + zod baseline + telemetry seams | P13, P5(seams) | none | ✅ full |
| **M1** | Production security hardening | P3 | none | ✅ full |
| **M2** | Storage layer (R2 + local) & CDN/responsive media | P1, P2 | R2 (opt) | ✅ local; ⚠️ R2 needs creds |
| **M3** | Colour intelligence (metrics + relationships) | P9 | none | ✅ full |
| **M4** | Search abstraction (Meilisearch + Postgres fallback) | P10 | Meili | ✅ via Docker |
| **M5** | Email system (Resend + dev transport) & templates | P4 | Resend (opt) | ✅ dev; ⚠️ Resend needs key |
| **M6** | Dealer portal (dashboard, favourites, collections, profile) | P6 | uses M5 | ✅ full |
| **M7** | Inquiry / quote workflow (MOQ, assignment, status) | P7 | uses M5 | ✅ full |
| **M8** | Sample request workflow (courier, approval, tracking) | P8 | uses M5 | ✅ full |
| **M9** | Admin improvements (bulk, versioning, draft/publish, CSV, analytics) | P11 | uses M2/M4 | ✅ full |
| **M10** | Performance (indexes, pagination, caching, Suspense, streaming) | P12 | none | ✅ full |
| **M11** | Monitoring integration (Sentry + PostHog wiring) | P5 | Sentry/PostHog (opt) | ✅ dev no-op; ⚠️ real needs DSN/key |

Dependency spine: **M0 → M1 → M2 → {M3, M4, M5} → {M6, M7, M8} → M9 → M10 → M11**. M3/M4/M5 are parallelizable after M2; the customer workflows M6–M8 depend on email (M5) for notifications.

---

## 4. Milestone detail

### M0 — Architecture foundation (P13; seams for P5)
- Add `src/server/` feature slices, `container.ts` composition root, repository interfaces over Prisma.
- `Result`/typed-error helpers; central `AppError` taxonomy; API response envelope (`{ ok, data }` / `{ ok:false, error }`).
- zod at the boundary: shared `parse()` helper; migrate existing routes' inputs to zod (behaviour-preserving).
- Insert telemetry + audit **seams** (no-op now) so later milestones don't touch every route again.
- **Schema:** none. **Risk:** low (additive). **Gate:** build + existing routes behave identically.

### M1 — Production security (P3)
- Security headers + CSP via `proxy.ts` (Next 16 renamed middleware→proxy) / `next.config` headers: HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors.
- **CSP note (risk):** the ported design uses heavy inline styles. Script-src will be strict (nonce-based); **style-src will allow `'unsafe-inline'`** because removing inline styles = redesign, which is out of scope. Documented tradeoff.
- Secure cookies (SameSite=Lax, `__Secure-`/`__Host-` prefixes in prod, secure flag), CSRF protection for state-changing non-NextAuth routes (double-submit / origin check; NextAuth already covers its own).
- Rate limiting (token-bucket; in-memory dev driver, extension point for Redis/Upstash).
- Upload hardening: MIME sniffing (magic-byte verification, not just extension), size caps, filename sanitization, re-encode images through sharp to strip metadata/exploits, allowlist types.
- Request logging + **AuditLog** model (actor, action, entity, ip, ua, timestamp) written on privileged actions.
- Error boundaries (`error.tsx`, `global-error.tsx`), safe API errors (no stack/PII leakage).
- **Schema:** `+ AuditLog`. **Risk:** medium (CSP can break UI → verify every screen renders). **Gate:** build + all 8 screens render + upload still works.

### M2 — Storage & CDN (P1, P2)
- `StorageProvider` interface: `putObject`, `getSignedUploadUrl`, `getSignedDownloadUrl`, `delete`, `list`, versioned keys, metadata.
- Drivers: **LocalDriver** (current disk, default in dev) + **R2Driver** (`@aws-sdk/client-s3` + presigner; R2 is S3-compatible → same driver serves S3/GCS/Azure-S3 with different endpoint/creds).
- Folder org (`fabrics/{id}/{colourId}/{version}/…`), versioning, metadata, automatic cleanup of superseded/orphaned objects.
- `Cdn` abstraction: optimized URL builder, responsive `srcset` widths, long-cache immutable headers on hashed assets, cache-control on media route; `next/image` remotePatterns config.
- Rewire upload pipeline + `/api/media` through the storage/CDN layer (no behaviour change in dev).
- **Schema:** `Media += version, storageKey, etag, checksum, metadata Json`. **Risk:** medium (touches working pipeline → careful round-trip test). **Gate:** upload → compress → WebP/AVIF/thumb → QR → served URL still works locally.

### M3 — Colour intelligence (P9)
- On every colour/upload, compute + store: HEX, RGB, OKLCH (already have), CIELAB, brightness, saturation, temperature (warm/cool), contrast (WCAG vs ink/cream), dominant palette (sharp `stats`/quantization for uploaded media).
- Similar-colour generation + **ColourRelationship** table (nearest in CIELAB/OKLCH, complementary, analogous) — reuses existing `nearestColourName` math.
- Explicit extension point (`colourVector`) reserved for future AI/vector search (not implemented).
- **Schema:** `Colour += hex, lab*, brightness, saturation, temperature, contrast`; `Media += dominantPalette Json`; `+ ColourRelationship`. **Risk:** low. **Gate:** build + backfill migration over 264 existing colours succeeds.

### M4 — Search (P10)
- `SearchEngine` interface: index/upsert/delete/search with filters, ranking, typo tolerance, suggestions.
- **MeiliDriver** (verified via local Docker) + **PostgresDriver** fallback (trigram/ILIKE + ranking) so search works with zero external deps.
- Index hooks on fabric/colour/media mutations; instant search, suggestions, similar colours, related fabrics, filtering/ranking.
- **SearchQuery** log → powers "recent" (per-user) and "popular" (aggregate) searches.
- Wire existing Entrance search bar to the service (keeps current UI/behaviour, adds typo-tolerance + suggestions).
- **Schema:** `+ SearchQuery`. **Risk:** medium (keep the existing assistant/search UX identical). **Gate:** build + search returns seeded fabrics/colours with a typo (`raayon`).

### M5 — Email (P4)
- `EmailTransport` interface + **ResendDriver** + **DevTransport** (logs + writes `.eml` to `storage/outbox/`).
- Reusable templates (typed props, shared layout matching brand): email verification, password reset, user invite, buyer approval, quote shared, welcome.
- Token models for verification/reset/invite with expiry + single-use.
- Hook into existing register/approval flows.
- **Schema:** `+ VerificationToken (or extend), + Invite`. **Risk:** low. **Gate:** build + dev-transport emits `.eml` for a registration.

### M6 — Dealer portal (P6)
- New dealer area **in the existing visual language** (reuse Nav, brand, cards): dashboard, saved quotes, previous downloads, favourite colours/fabrics, collections, recently viewed, request-sample/quote entry points, profile (company, shipping address, GST, communication preferences).
- **Schema:** `+ Favourite, + Collection, + CollectionItem, + RecentlyViewed, + Download`; `User += profile fields / DealerProfile`. **Risk:** medium (new surface area — must not look bolted on). **Gate:** build + dealer login sees dashboard, can favourite + create a collection.

### M7 — Inquiry / quote workflow (P7)
- Extend existing `Quote`: MOQ, expected quantity, country, shipping method, timeline, message; sales assignment (assignee), status tracking (new→assigned→quoted→won/lost), email notification (M5), dealer + admin dashboards.
- **Schema:** `Quote += moq, quantity, country, shippingMethod, timeline, message, assigneeId, status(enum)`; `+ QuoteEvent` (status history). **Risk:** medium (Quote is live — additive columns, migrate existing rows with defaults). **Gate:** build + submit inquiry → appears assigned in admin, dealer sees status.

### M8 — Sample request workflow (P8)
- Sample request with shipping details, courier status, approval, tracking number, history; admin dashboard.
- **Schema:** `+ SampleRequest, + SampleEvent`. **Risk:** low-medium. **Gate:** build + request sample → admin approves → tracking visible to dealer.

### M9 — Admin improvements (P11)
- Bulk upload / edit / delete; version history (from M2 versioning); activity feed (from AuditLog); upload queue + failed-upload retry; publish/draft/archive/restore state machine; CSV import/export; analytics dashboard (from telemetry + DB aggregates).
- **Schema:** `Media/Fabric += status(DRAFT|PUBLISHED|ARCHIVED), publishedAt, deletedAt (soft delete)`; `+ UploadJob`. **Risk:** medium. **Gate:** build + bulk action + CSV export/import round-trip.

### M10 — Performance (P12)
- Indexes on hot query paths (fabricId, colour order, search fields, status, createdAt); cursor pagination for large lists; caching (`cacheLife`/`cacheTag`, request-level memo); image loading (responsive from M2), streaming + Suspense on heavy screens; Server Components where the baseline allows without changing UX; parallel routes for admin; edge-cache headers.
- **Schema:** indexes only. **Risk:** low-medium (Suspense/SSR must not alter visuals). **Gate:** build + p95 list query improves + screens visually unchanged.

### M11 — Monitoring (P5)
- Wire the M0 seams to **Sentry** (errors, performance) + **PostHog** (product analytics) drivers, no-op unless DSN/key set.
- Track: errors, performance, uploads, API failures, user journeys, search usage, downloads, quotes.
- **Schema:** none. **Risk:** low. **Gate:** build + events flow to dev logger; real backends when creds provided.

---

## 5. Top risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| CSP breaks inline-style-heavy UI | High | Strict script-src (nonce) but allow `style-src 'unsafe-inline'`; verify all 8 screens after M1. |
| Big-bang refactor destabilizes baseline | High | Additive patterns; refactor only files a milestone already edits; gate after each. |
| Migrations on live tables (Quote/Media/Colour/User) | High | Additive columns with defaults + backfill migrations; never drop; test migrate on seeded DB every milestone. |
| No external creds / uncertain egress | Medium | Provider abstractions + dev fallbacks keep everything runnable; real drivers behind env, verified when creds arrive. |
| Scope is ~12 milestones (multi-session) | Medium | Strict dependency ordering + per-milestone gate = safe stop/resume points. |
| Ephemeral container loses DB/uploads/commits | Medium | Push to a remote (needed); DB/uploads reproducible via migrate+seed. |
| next-auth v5 beta + CSRF nuances | Medium | Lean on NextAuth CSRF for its routes; origin/double-submit checks on custom mutations. |

## 6. Extension points reserved (deferred features — NOT implemented)
- `Colour.colourVector`, storage/search interfaces, and a clean service layer make **AI vision / vector search** a later drop-in.
- Storage `StorageProvider` + media versioning ready for **HLS/video pipeline** later.
- Quote/Sample state machines + repositories are the seam for future **CRM / order management / ERP**.
- No Three.js/R3F/physics — Fabric Lab stays the current CSS/SVG illusion; a `<FabricViewer>` boundary is left where 3D would mount.

## 7. Open decisions (need your call before/at kickoff)
1. **External services:** build abstractions + dev fallbacks now (recommended), or do you have R2 / Resend / Sentry / PostHog credentials to wire for real?
2. **Sequencing/scope:** run the full M0→M11 spine in order (recommended), or front-load a specific cluster (backend/security/storage M0–M4, or customer workflows M6–M8) first?
3. **Remote:** provide a GitHub remote so milestones can be pushed durably (this container is ephemeral).
