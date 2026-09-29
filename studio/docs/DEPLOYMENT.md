# Deployment

Three supported targets. All three run the same artefact and the same checks; they differ only
in who runs the migration and where uploads land.

Before any of them: **`npm run startup:check`**. It validates every environment variable, proves
the database is reachable, confirms migrations are applied and round-trips a file through
storage. Its exit code is the contract:

| Code | Meaning |
|---|---|
| `0` | ready to serve |
| `1` | misconfigured — do not start; the release will fail where users can see it |
| `2` | dependencies unreachable — retry, Postgres or storage may still be coming up |

That distinction matters in a container: a cold `docker compose up` routinely has the app ready a
second before the database is, and that is a reason to wait rather than to fail a deploy.

---

## 1. Vercel

The default. Vercel does its own module tracing, so `BUILD_STANDALONE` stays unset.

```
Framework      Next.js (detected)
Root directory studio
Build command  npm run build
Install        npm install          # postinstall runs `prisma generate`
```

Environment variables — set every one of these before the first deploy:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled connection string. Serverless functions open a connection per invocation; an unpooled URL will exhaust Postgres under any real traffic. |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL`, `NEXTAUTH_URL` | Your https origin. Not optional: cookies and every email link derive from it. |
| `STORAGE_DRIVER=s3` + `S3_*` | **Required on Vercel.** The filesystem is ephemeral — `local` means uploads vanish on the next deploy. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Without a key the dev transport writes `.eml` files to a disk that does not persist. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Sign-in with WhatsApp (M46). Send codes through the WhatsApp Business Cloud API. You need a Meta Business account, a WhatsApp sender number, and an approved **authentication** template whose body takes the code and whose copy-code button takes it again. Name the template in `WHATSAPP_OTP_TEMPLATE` (default `login_code`) and its language in `WHATSAPP_OTP_LANG` (default `en`). Without these, production refuses to start a WhatsApp sign-in and the page says it is being set up. `WHATSAPP_DEV_CODES=1` returns the code to the page instead; use it only on a test deployment. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Online payment for fabric orders (M48), from the Razorpay Dashboard → Account & Settings → API Keys. Use the `rzp_test_…` pair to try it, then the live pair. The key id is given to the browser for Checkout; the secret stays on the server, which prices every order from the catalogue, opens the Razorpay order, and verifies Checkout's signature and amount before the order is recorded as paid. Without the pair, "Pay online" shows as being set up and buyers choose UPI, bank transfer or credit terms. The site's CSP admits Razorpay's Checkout frame and API (`src/proxy.ts`). |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | "Continue with Google". Create an OAuth client (type: web application) in Google Cloud, with the redirect URI `https://<your origin>/api/auth/callback/google`. Without them, the button says Google sign-in is being set up. |
| `SENTRY_DSN`, `POSTHOG_KEY` | Optional; see OPERATIONS.md. |

Migrations do **not** run on Vercel's build. Run them from CI or a machine that can reach the
database:

```bash
npx prisma migrate deploy
```

## 2. Docker

```bash
cp .env.example .env.production          # then edit
echo 'POSTGRES_PASSWORD=…' >> .env.production
docker compose up -d
```

Compose brings up Postgres, waits for it to be **healthy** rather than merely started, runs
`prisma migrate deploy` as a one-shot service, seeds if `SEED_ON_DEPLOY=1`, and only then starts
the app.

Migrations are a separate service on purpose. Putting them in the app's entrypoint means every
replica races to apply the same migration on every deploy.

The image is multi-stage: the runtime carries a Node runtime, the traced standalone server and
the Prisma engine — not the toolchain, not the sources. It runs as an unprivileged user, because
a container running as root turns a code-execution bug into a host problem.

> The Dockerfile and compose file were authored against this codebase but could not be built in
> the environment that produced them — no Docker daemon was available. Treat your first
> `docker compose up` as their first real test.

## 3. Self-hosted Node

```bash
npm ci
npm run build
npx prisma migrate deploy
npm run startup:check          # exit 0 before you route traffic
npm run start                  # behind nginx/Caddy for TLS
```

Run it under a supervisor that restarts on failure (systemd, pm2). Terminate TLS at the proxy
and forward `X-Forwarded-Proto`, or the app cannot tell it is on https and will emit insecure
cookies.

---

## HTTPS is enforced, not suggested

- HSTS (`max-age=63072000; includeSubDomains; preload`) is emitted **only** when
  `NODE_ENV=production`, so local development over plain HTTP is not poisoned for months.
- `startup:check` refuses to start in production when `APP_URL` is not `https://`.
- Session cookies are `Secure` in production; over plain HTTP they will simply not be set, and
  sign-in will appear to succeed and then do nothing.

## Health endpoints

| Endpoint | For | Behaviour |
|---|---|---|
| `/api/health` | Liveness | 200 while the process is alive. Never touches the database — a liveness probe that fails on a slow query gets your healthy app killed during an incident. |
| `/api/health/ready` | Readiness | 200 healthy, 503 unhealthy. Names failing checks only, never their detail. |
| `/admin/diagnostics` | Humans | Full detail, admin-only, because that detail is exactly the reconnaissance an attacker wants. |

Point the load balancer at `/api/health/ready` and the orchestrator's liveness probe at
`/api/health`.

## Zero-downtime migrations

Postgres takes an `ACCESS EXCLUSIVE` lock for most `ALTER TABLE`s. On a table with traffic, one
careless migration stalls every query behind it.

**Expand, migrate, contract** — three deploys, never one:

1. **Expand.** Add the new column nullable, or the new table. Deploy code that writes to both
   old and new and reads from old. Safe to roll back.
2. **Migrate.** Backfill in batches (`UPDATE … WHERE id IN (SELECT … LIMIT 1000)`), never a
   single statement over the whole table. Deploy code that reads new, still writes both.
3. **Contract.** Only once nothing reads the old column: drop it.

Rules that keep this true:

- **Never rename.** A rename is a drop and an add, and the old code dies the moment it lands.
  Add the new name, migrate, drop the old.
- **Never add `NOT NULL` without a default** to a populated table. Add nullable, backfill, then
  add the constraint `NOT VALID` and `VALIDATE` it separately — validation takes only a `SHARE
  UPDATE EXCLUSIVE` lock.
- **Create indexes `CONCURRENTLY`.** A plain `CREATE INDEX` blocks writes for its whole duration.
- **Set a lock timeout** so a migration that cannot get its lock fails fast instead of queueing
  every query behind it: `SET lock_timeout = '3s';` at the top of the migration.

## Rollback

**Code rolls back. Schema does not.** That asymmetry is the whole reason for expand/migrate/
contract — a schema that is one step ahead of the code is survivable; one that is a step behind
is an outage.

When a release is bad:

1. **Redeploy the previous build.** Vercel: promote the prior deployment. Docker: `docker compose
   up -d --no-deps app` on the previous tag. This is the first move in every case; do it before
   diagnosing.
2. **Leave the schema alone.** If you followed expand/migrate/contract, the previous code runs
   against the new schema. If you did not, you are choosing between data loss and downtime —
   take downtime.
3. **Check `/api/health/ready`** and `/admin/diagnostics` before declaring recovery.
4. **Only then** work out what happened. `SENTRY_DSN` and the audit log are where to look.

Restoring from backup is a **last resort**, not a rollback: it discards every write since the
snapshot. See BACKUP_RECOVERY.md.

## After every deploy

```bash
npm run startup:check
npx tsx scripts/preflight.ts https://your-domain
```

Preflight additionally checks security headers over the wire, the public/private boundary, and
that the showroom is still reachable anonymously.
