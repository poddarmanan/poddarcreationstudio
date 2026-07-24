# Poddar Creation Studio — Phase 3: Business Experience & Customer Platform

**Status:** ✅ complete (M12–M20) · baseline frozen · this phase *extends*, never redesigns.
**Per-milestone detail:** see `M12_…` through `M20_…` in this folder.
**Depends on:** Phase 2 (M0–M11) — DI container, repository pattern, storage/email/search/
telemetry abstractions, audit log, RBAC, monitoring.

---

## 0. Ground rules (carried over from Phase 2, still non-negotiable)

- **No UI redesign.** Typography, spacing, colour system, layout, animation and branding are
  frozen. New surfaces reuse the existing visual language (cream `#F5F2ED` / ink `#1C1917` /
  gold `#8A6D45`, display serif headings, selvage divider, pinked swatch edges, chip buttons).
- **Additive migrations.** No destructive drops; data-preserving backfills where a column's
  meaning changes (see M15's quote-status transition).
- **Everything integrates with the existing architecture:** composition root (`server/container.ts`),
  feature-sliced services, repository pattern over Prisma, `run()` HTTP boundary with zod +
  CSRF + rate limits, `Audit` on every privileged mutation, `Telemetry` on every business event.
- **Deferred stays deferred:** no Three.js/R3F, physics, AI chat/search/vision, ERP, inventory,
  order management, CRM, or payment gateway. Clean extension points only.
- **Verification gate per milestone:** `next build` → `eslint` → `tsc --noEmit` →
  `prisma migrate deploy` → milestone smoke script → existing-functionality smoke. Commit only
  when green.

---

## 1. The customer journey this phase builds

```
Visitor → browse fabrics → save fabrics → build collection → share collection
        → request quotation → sales review → quote generated → customer tracks progress
        → order discussion
```

Each arrow maps to a milestone:

| Journey step | Milestone |
|---|---|
| Account, profile, addresses, contacts | **M12** |
| Save fabrics, build collections | **M13** |
| See everything in one place | **M14** |
| Request quotation → track progress | **M15** |
| Sales review, pricing, follow-up | **M16** |
| Share collection / catalogue | **M17** |
| Understand the business | **M18** |
| Be told when something changes | **M19** |
| Ship it safely | **M20** |

---

## 2. Milestone map

| # | Milestone | New models | Key surfaces |
|---|-----------|-----------|--------------|
| **M12** | Customer accounts | `ShippingAddress`, `ContactPerson` | `/portal` account panels, `server/core/rbac.ts` |
| **M13** | Saved collections | `Collection` extensions | `/portal/collections/[id]` |
| **M14** | Customer dashboard | `ActivityEvent`, `FollowUp` | `/portal` |
| **M15** | Quote tracking | `QuoteStatus` v2, `Quote` pricing fields | `/portal/quotes/[id]`, `/admin/quotes` |
| **M16** | Sales workspace | `CustomerNote` | `/admin/sales`, `/admin/sales/[id]` |
| **M17** | Catalog sharing | `CollectionShare`, `ShareView` | `/c/[token]`, PDF + print |
| **M18** | Business analytics | `FabricView` | `/admin/analytics` |
| **M19** | Notification center | `Notification`, `EmailLog` | `/api/notifications`, portal + admin bell |
| **M20** | Deployment readiness | — | `/api/health`, `/admin/diagnostics`, `scripts/preflight.ts` |

Dependency spine: **M12 → M13 → M14 → M15 → M16 → M17 → M18 → M19 → M20**.
M19 back-fills notifications into M15/M16/M17 events; M18 reads counters written by M13/M14/M17.

---

## 3. Milestone detail

### M12 — Customer accounts
Registration, login, email verification and password reset already exist (Phase 2 M5). This
milestone completes the *account*: multiple shipping addresses, named contact persons,
GST **and** VAT identifiers, and a hardened role boundary.

- **Schema:** `+ ShippingAddress`, `+ ContactPerson`; `DealerProfile += vatNumber, website`;
  `User += lastLoginAt`.
- **RBAC:** one `server/core/rbac.ts` policy module (`STAFF_ROLES`, `ADMIN_ROLES`, `isStaff`,
  `requireStaff`, `requireAdmin`, `requireSelfOrStaff`). Every admin route and page goes
  through it — customers (BUYER/VIEWER) can never reach staff functionality, and a customer
  can only ever address their own rows.
- **Gate:** buyer can add/edit/delete addresses + contacts, change password, resend
  verification; a BUYER session gets 403 from every `/api/admin/*` route.

### M13 — Saved collections
Collections behave like boards: name, description, cover, ordered items, per-item note and
quantity, plus "send to sales" which converts a board into a quotation request.

- **Schema:** `Collection += description, coverColourId, updatedAt`;
  `CollectionItem += quantity, unit, position`.
- **Gate:** create → add fabrics → note + quantity → reorder → request quote from collection.

### M14 — Customer dashboard
One dashboard: recent activity, collections, quotes, sample requests, downloads, favourites,
recommended collections, recently viewed, upcoming follow-ups.

- **Schema:** `+ ActivityEvent` (per-user, human-readable journey log, distinct from `AuditLog`
  which is a security record).
- **Gate:** every panel renders with seeded data and with an empty account.

### M15 — Quote tracking
`QuoteStatus` becomes the eight-state business lifecycle:
`DRAFT → SUBMITTED → UNDER_REVIEW → PRICED → SENT → ACCEPTED | REJECTED | EXPIRED`.

- **Migration:** data-preserving map of the Phase 2 values —
  `NEW→SUBMITTED`, `ASSIGNED→UNDER_REVIEW`, `QUOTED→PRICED`, `WON→ACCEPTED`, `LOST→REJECTED`.
  Legacy names stay accepted at the API boundary as aliases, so no client breaks.
- **Schema:** `Quote += unitPrice, currency, totalValue, validUntil, priceNote, submittedAt,
  sentAt, decidedAt`; `QuoteItem += quantity, unit, unitPrice`.
- **Gate:** customer sees an accurate progress timeline; sales advances status; every
  transition lands in `QuoteEvent` + `AuditLog`.

### M16 — Sales workspace
Internal tools at `/admin/sales`: pipeline by status, customer profile with communication and
collection history, quotes, sample requests, quick actions, notes, assignment, follow-ups.

- **Schema:** `+ CustomerNote`, `+ FollowUp`.
- **Gate:** salesperson opens a customer, adds a note, assigns themselves, schedules a
  follow-up, and it appears on the customer's dashboard as an upcoming touchpoint.

### M17 — Digital catalog sharing
Share a collection as a public catalogue: tokenised link, optional password, optional expiry,
QR code, PDF download, print stylesheet, and email delivery.

- **Schema:** `+ CollectionShare`, `+ ShareView`.
- **PDF:** a dependency-free PDF 1.4 writer (`server/pdf/`) — swatch grid, notes, quantities,
  brand header. No headless browser, no new runtime dependency.
- **Gate:** create link → open anonymously → password gate → expiry → QR resolves → PDF opens
  in a reader → revoke returns 410.

### M18 — Business analytics
`/admin/analytics`: top viewed / downloaded fabrics, most searched colours, quote and sample
conversion, dealer + customer activity, popular collections, returning customers, storage
usage, search trends.

- **Schema:** `+ FabricView` (anonymous-safe view counter with a hashed visitor key).
- **Gate:** every metric computes on seeded data without N+1 queries.

### M19 — Notification center
One `NotificationService` fan-out: in-app rows + email, per-user preferences, staff vs
customer audiences, and a delivery log that doubles as M16's communication history.

- **Schema:** `+ Notification`, `+ EmailLog`; `DealerProfile += notifyQuotes, notifySamples,
  notifyShares`.
- **Gate:** a quote status change produces an in-app notification and an email log row;
  unread counts update; preferences suppress the right channels.

### M20 — Deployment readiness
`/api/health` (liveness), `/api/health/ready` (dependency readiness), environment validation at
boot, `/admin/diagnostics`, and `scripts/preflight.ts` covering database, storage, email,
monitoring, security headers, performance and backup verification.

- **Gate:** preflight passes locally; readiness reports degraded when a dependency is down.

---

## 4. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Quote status enum change touches live rows | High | Single migration: add new type, map every old value, swap column, drop old type. API accepts legacy aliases. |
| Public share links leak private catalogue data | High | Opaque 32-byte tokens, optional bcrypt password, expiry + revoke, no user PII in payload, view logging. |
| New surfaces looking "bolted on" | Medium | Every new page reuses the existing tokens and components; no new colours, fonts, or spacing scales. |
| Portal growing into an admin surface | Medium | `rbac.ts` is the single authority; portal routes call `requireUser`, staff routes `requireStaff`. |
| PDF generation cost | Medium | Hand-rolled PDF writer — pure Buffer output, no browser, no dependency. |
| Notification volume | Low | Preferences per category, best-effort dispatch, never blocks the business transaction. |

## 5. Extension points reserved (still NOT implemented)

- `Quote` pricing fields are the seam for a future **order management / ERP** hand-off.
- `ActivityEvent` + `FabricView` are the event substrate a future **recommendation engine**
  would consume (today's "recommended" is deterministic colour/family affinity, not AI).
- `CollectionShare` is where a future **payment or checkout** flow would attach.
- `NotificationService` has channel seams for WhatsApp/SMS drivers.


---

## 6. Outcome

All nine milestones shipped, each as its own commit, each gated on build + lint + typecheck +
migration + smoke + regression before it was committed.

| Milestone | Migration | Smoke |
|---|---|---|
| M12 Customer accounts | `20260724210345`, `20260724210500` | `smoke-m12.ts`, `smoke-http-rbac.ts` |
| M13 Saved collections | `20260724212104` | `smoke-m13.ts`, `smoke-http-journey.ts` |
| M14 Customer dashboard | `20260724213229` | `smoke-m14.ts` |
| M15 Quote tracking | `20260724215500` | `smoke-m15.ts` |
| M16 Sales workspace | `20260724221500` | `smoke-m16.ts` |
| M17 Catalogue sharing | `20260724224500` | `smoke-m17.ts`, `smoke-http-share.ts` |
| M18 Business analytics | `20260724231500` | `smoke-m18.ts` |
| M19 Notification centre | `20260724234000` | `smoke-m19.ts` |
| M20 Deployment readiness | — | `smoke-m20.ts`, `preflight.ts`, `verify-backup.ts` |

`npm run smoke -- --http` runs all twenty scripts in ~40s.

### Deviations from the plan above

- **`FollowUp` landed in M14, not M16.** The customer-facing "upcoming follow-ups" panel is
  part of the dashboard, so the model had to exist by then; M16 built the sales tooling on it.
- **M18 added `FabricView`** rather than reusing `RecentlyViewed`, which is signed-in only and
  capped at 30 rows — see that milestone's note.
- **M19 wrote the delivery log as a transport decorator**, which captured the Phase 2 email
  flows too, at no call-site cost.

### Bugs found and fixed on the way

| Where | What |
|---|---|
| `server/core/errors.ts` | `isAppError` used `instanceof`; duplicate module copies in a production bundle made **every service-thrown 4xx a 500** |
| `server/email/dev.ts` | Two emails sent in the same millisecond overwrote each other |
| `analytics.popularCollections` | Joining items and shares fanned rows out, multiplying view counts |
| `quote.service` + notifications | Briefly sent **two emails** per status change; unified to one path |
| `/admin/sales` loading shell | Streamed its title to a customer before the staff check resolved |
| `Entrance.tsx` | A stale search response could render against a newer query |
| 6 React lint errors | `set-state-in-effect` across the auth pages, `Entrance` and `state.ts` |
| `prisma/seed.ts` | Seeded privileged accounts were never marked email-verified |
| `smoke-m2`, `smoke-m9` | Pinned to one database; could not run on a fresh environment |

### Deferred features — still not built, by design

Three.js / React Three Fiber, cloth physics, AI chat, AI search, AI vision, ERP, inventory
management, order management, CRM, and payment gateways. The extension points reserved for
them are listed in section 5 above and remain unused.
