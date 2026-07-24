# Deploying Poddar Creation Studio

Getting a live URL you can keep checking. Two paths — a hosted deployment, or running it on
your own machine against the same database.

**The one thing that trips up every host:** the Next.js app lives in **`studio/`**, not at the
repository root (the root holds the original design bundle). Set the project's *root directory*
to `studio` or nothing will build.

---

## 0. A database first (both paths need it)

Any Postgres 15/16 works. Free, no card, ~2 minutes:

- **Neon** — <https://neon.tech> → new project → copy the connection string
- **Supabase** — <https://supabase.com> → new project → Settings → Database → URI
- **Prisma Postgres** — <https://console.prisma.io>

You want a URL shaped like:

```
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Keep it — the same string works for the hosted deploy *and* for running locally, so you never
have to install Postgres on Windows.

### Create the schema and the catalogue

From `C:\Users\teena\poddarcreationstudio\studio` in PowerShell:

```powershell
npm install
$env:DATABASE_URL = "postgresql://…your string…"
npm run db:deploy      # applies all 20 migrations
npm run db:seed        # 11 fabrics, 264 shades, demo accounts
```

`db:seed` is not optional for a demo — without it the catalogue is empty and the app has
nothing to show. The health check will tell you so (`Connected, but the catalogue is empty`).

---

## 1. Hosted — Vercel (recommended)

Next.js's own host; no config file needed.

1. <https://vercel.com/new> → import `poddarmanan/poddarcreationstudio`
2. **Root Directory → `studio`** ← the step everyone misses
3. Framework preset: Next.js (auto-detected)
4. Add environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | your Postgres URL from step 0 |
| `AUTH_SECRET` | generate one: `openssl rand -base64 48`, or any 48+ random chars |
| `APP_URL` | `https://<your-project>.vercel.app` |
| `NEXTAUTH_URL` | same as `APP_URL` |

5. Deploy.

`prisma generate` runs automatically via the `postinstall` script. Migrations do **not** run on
deploy by design — run `npm run db:deploy` yourself when a release contains new ones, so a
migration never races two concurrent builds.

After the first deploy, set `APP_URL`/`NEXTAUTH_URL` to the real URL and redeploy — emailed
links and share links are built from it.

### Sign in

Demo accounts, password `poddar123`:

| Email | Sees |
|---|---|
| `admin@poddarcreation.studio` | Everything — workspace, analytics, diagnostics |
| `sales@poddarcreation.studio` | Sales workspace, quote and sample desks |
| `buyer@example.com` | Customer portal, collections, quote tracking |

**Change these before showing anyone outside the business.** They are public knowledge — they
are in this repository.

---

## 2. Local — run it on your Windows machine

Fastest way to iterate, and it uses the same hosted database, so there is nothing to install
beyond Node.

```powershell
cd C:\Users\teena\poddarcreationstudio\studio
npm install

# create studio\.env with:
#   DATABASE_URL="postgresql://…"
#   AUTH_SECRET="…48+ random characters…"
#   APP_URL="http://localhost:3000"
#   NEXTAUTH_URL="http://localhost:3000"

npm run dev
```

Open <http://localhost:3000>.

---

## 3. Check it actually works

```powershell
npm run preflight https://your-project.vercel.app
```

It reports on the environment, every dependency, the security headers over the wire, and both
probes. Or hit them directly:

```
https://your-project.vercel.app/api/health          → liveness
https://your-project.vercel.app/api/health/ready    → readiness (503 if a dependency is down)
```

Signed in as admin, `/admin/diagnostics` shows the same checks with full detail.

---

## 4. Known limits of a minimal deploy

None of these stop you browsing, quoting, sharing or tracking — but know them before showing a
customer:

| Limit | Effect | Fix |
|---|---|---|
| **Storage is local disk** | Uploads vanish on redeploy; on Vercel the filesystem is read-only, so admin uploads fail outright | Set `STORAGE_DRIVER=r2` + `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| **Email is the dev transport** | Nothing is actually sent — messages are written to disk. The notification centre still records everything in-app | Set `RESEND_API_KEY` + `EMAIL_FROM` |
| **No error tracking** | Failures are invisible after the fact | Set `SENTRY_DSN` (and `POSTHOG_KEY` for product analytics) |
| **Search is the Postgres driver** | Works, slightly less typo-tolerant than Meilisearch | Set `SEARCH_DRIVER=meili` + `MEILI_HOST` |

`npm run preflight` names each of these as a warning or failure with the exact variable to set,
so you never have to guess which one bit you.

Every one of these is a driver swap behind an interface — no application code changes.

---

## 5. Backups

Once there is real data:

```powershell
$env:DATABASE_URL = "postgresql://…"
npm run verify:backup
```

Takes a real `pg_dump`, restores it into a scratch database, compares row counts table by
table, and drops the scratch database. A backup nobody has restored is a hope, not a backup.
