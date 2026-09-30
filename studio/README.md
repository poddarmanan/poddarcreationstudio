# Poddar Creation Studio

A digital showroom for a wholesale dyed-fabric mill — the production implementation of the
Claude Design prototype in `../project/Poddar Creation Studio.dc.html` (read `../chats/chat1.md`
for the design history).

## What's inside

**Experience (faithful to the approved design):**
- **Entrance** — cinematic hero with moving cloth waves, drifting gold particles, search with a
  keyword "Studio Assistant" and simulated search-by-image matching
- **Showroom** — four walkable rooms (Fabric Hall → Cotton Gallery → Rayon Room → dark Silk
  Gallery); clicking a roll unfurls its fabric full-screen with the quality's story line
- **Fabric Lab** — the hero feature: garment/lighting/wind controls, stretch/shine/water/rotate
  physics tests per fabric family, 100×/200×/500× microscope, 9 generated scenes, spec sheet,
  QR share, quote/WhatsApp/pin actions
- **Colour Closet** — a wardrobe to each quality, its full range of shades (824 in all, 56 to 96 a quality) hanging on rods as slips that slide like hangers
- **Compare** — up to four fabrics side-by-side with live-drape animation
- **Swatch Book** — pinned shades grouped by quality; quote the whole book, print/PDF, WhatsApp
- **Admin (Catalogue Studio)** — Linear-style workspace with a real upload pipeline
- Signature brand elements throughout: gold hairline rules and ornaments, pinked swatch edges,
  cloth-lay screen transitions, thread loader, EN/हिंदी toggle

**Customer platform (Phase 3):**
- **Accounts** — registration, verification, password reset, company profile with GST *and* VAT,
  a shipping address book, and named contact people
- **Collections** — Pinterest-style boards: ordered shades with per-item notes and quantities,
  duplication, and "send to sales" which becomes a quotation request carrying the customer's intent
- **Dashboard** — activity feed, recommendations (rule-based, from the CIELAB colour
  relationships — no model), upcoming follow-ups, quotes, samples, downloads, favourites
- **Quote tracking** — the eight-state lifecycle (`DRAFT → SUBMITTED → UNDER_REVIEW → PRICED →
  SENT → ACCEPTED/REJECTED/EXPIRED`) with pricing in minor units, a customer-facing progress
  tracker, and accept/decline
- **Sales workspace** — pipeline board, customer profiles, one merged communication history,
  internal notes and follow-up reminders
- **Catalogue sharing** — tokenised public links with optional passphrase and expiry, QR codes,
  a dependency-free PDF export, a print stylesheet, and email delivery
- **Analytics** — top viewed/downloaded fabrics, catalogue gaps from zero-result searches,
  quote and sample conversion, returning customers, popular collections, storage usage
- **Notifications** — unified in-app + email with per-category preferences and a delivery log
- **Operations** — health probes, environment validation, diagnostics, preflight, and backup
  verification that actually restores

**Backend (real, not mocked):**
- PostgreSQL + Prisma 7 (`Fabric`, `Colour`, `Media`, `Quote`, `SwatchBookItem`, `User`)
- NextAuth v5 credentials auth with roles (ADMIN / MANAGER / SALES / VIEWER / BUYER) and an
  `approved` flag gating wholesale pricing; self-serve buyer registration (unapproved by default)
- Quote requests and swatch books persist server-side (swatch book syncs for signed-in users)
- Upload pipeline: files land on disk (`storage/`), sharp compresses to WebP + AVIF, generates a
  320px thumbnail, the colour is named (Claude vision when `ANTHROPIC_API_KEY` is set, otherwise
  a deterministic dominant-pixel → nearest-named-OKLCH match), and a QR deep link is generated —
  every step writes real bytes

## Running locally

```bash
# 1. Postgres (any 15/16 instance) — create role + db, e.g.:
#    CREATE ROLE poddar WITH LOGIN PASSWORD 'poddar' CREATEDB;
#    CREATE DATABASE poddar OWNER poddar;

# 2. Configure
#    edit .env: DATABASE_URL, AUTH_SECRET, optional ANTHROPIC_API_KEY

# 3. Install, migrate, seed
npm install
npx prisma migrate dev
npx prisma db seed

# 4. Run
npm run dev          # http://localhost:3000
```

### Verifying a deployment

```bash
npm run lint && npm run typecheck && npm run build   # static gates
npm run smoke                                         # every milestone smoke (~35s)
npm run smoke -- --http                               # + live HTTP smokes against a running server
npm run preflight                                     # environment, dependencies, headers, probes
npm run verify:backup                                 # dump → restore → row-by-row comparison
```

Probes for an orchestrator:

```bash
curl -fsS $APP_URL/api/health          # liveness — touches no dependency
curl -fsS $APP_URL/api/health/ready    # readiness — 503 when a dependency is down
```

### Demo accounts (password `poddar123`)

| Email | Role |
| --- | --- |
| admin@poddarcreation.studio | ADMIN — full admin workspace + uploads |
| sales@poddarcreation.studio | SALES — sees quotes list |
| buyer@example.com | BUYER (approved) — sees wholesale pricing |

## Notes / deferred items

- Real Three.js cloth simulation, walkable 3D, and HLS video encoding were explicitly deferred
  in the design phase (they need Blender/GLB assets); the Lab keeps the approved CSS/SVG
  simulation and the layout reserves space for the future viewers.
- The upload pipeline runs synchronously in the request; move it to a queue for production scale.
- The entrance "search by image" modal is the designed simulation; the admin pipeline's colour
  naming is the real implementation of the same capability.
