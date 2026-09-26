# M20 — Deployment readiness

**Phase 3 · milestone 9 of 9.** Everything needed to put this in front of real customers and
know, before and after, whether it's actually working.

## Surfaces

| What | Where | Who |
|---|---|---|
| Liveness probe | `GET /api/health` | Public — a probe cannot authenticate |
| Readiness probe | `GET /api/health/ready` (`?deep=1`) | Public summary, **staff-only detail** |
| Diagnostics page | `/admin/diagnostics` | Admin/manager only |
| Preflight | `npm run preflight` | CLI / CI |
| Backup verification | `npm run verify:backup` | CLI / scheduled |
| Whole smoke suite | `npm run smoke -- --http` | CLI / CI |
| Maintenance tasks | `POST /api/admin/maintenance` | Admin only, audited |

## Liveness vs readiness — and why they differ

**Liveness touches nothing.** It answers "is this process alive?" so an orchestrator never
restarts a perfectly healthy instance because the database blinked for a second.

**Readiness runs every dependency check** and answers **503** when unhealthy, so traffic stops
going to an instance that cannot serve it.

The readiness **summary is public** — a load balancer can't sign in — but the **detail is
staff-only**. An anonymous reader learning that `AUTH_SECRET looks like a development
placeholder` has been handed a map. The public body carries failing check *names* and nothing
else; the preflight asserts that it never leaks configuration text.

## The checks do real work

Configuration says what we intended; a round trip says what actually works. So:

- **storage** writes an object, reads it back, compares the bytes, deletes it, and confirms the
  delete took. The smoke asserts it left nothing behind.
- **database** runs a query and counts the catalogue — an empty catalogue is a `warn`, because
  the app "works" while having nothing to sell.
- **migrations** reads `_prisma_migrations` and fails on anything pending or rolled back.
- **email** reports the live driver and counts failures in the last 24 hours; the dev transport
  in production is a hard **fail** (mail would be written to disk, not sent).
- **search** puts a probe query through the live engine.
- **security** checks secret strength, HTTPS, and whether any privileged account has never
  verified its email.
- **performance** times three hot query paths and warns past a second.
- **backup** sizes the database and points at the verification script.

Every check is individually timed and individually fault-tolerant: one broken dependency yields
**one failing row carrying the reason**, not an exception page. The smoke proves this by
injecting a database client that throws.

## Environment validation

`server/health/env.ts` encodes the misconfigurations that would otherwise surface at 3am:
a missing or wrong-dialect `DATABASE_URL`, a development `AUTH_SECRET`, plaintext `APP_URL` in
production, `STORAGE_DRIVER=r2` without a bucket, Resend without a from-address, Meilisearch
without a host, local disk in production, absent error tracking.

**Severity scales with the environment.** A development placeholder secret is a *warning* on a
laptop and a *failure* in production — the same rule, read differently where it matters. The
smoke asserts eight distinct misconfigurations are each caught on the right key, and that a
complete production configuration is entirely clean.

## Backup verification — actually restored, not assumed

A backup you have never restored is a hope. `scripts/verify-backup.ts`:

1. takes a real `pg_dump -Fc`,
2. creates a scratch database and `pg_restore`s into it,
3. compares row counts **table by table** across 23 business tables,
4. checks the enum types came back (rows without a schema is not a restore),
5. drops the scratch database whether it passed or failed.

Verified here against the live database:

```
Rows: 1082 live · 1082 restored     Enum types restored: 10
BACKUP VERIFICATION PASSED — the dump restores to an identical database
```

## Preflight

`npm run preflight [baseUrl]` runs the environment report, every dependency check, and the
checks that can only be made **over the wire**:

- CSP with `default-src 'self'` and `frame-ancestors 'none'` (`script-src` nonce-based plus `'wasm-unsafe-eval'` for the garment models' Draco decoder; `connect-src` admits `blob:` for their textures), `nosniff`, `X-Frame-Options`;
- both probe endpoints;
- that the public readiness body leaks nothing;
- that three staff/portal APIs answer **401** to an anonymous caller;
- that `/api/fabrics` stays **200**, because the showroom must remain open.

Non-zero exit on any failure, so CI can gate on it.

## Verified both ways

The checks are only worth having if they can fail. Both directions were confirmed:

- Against a production-mode server still holding development credentials, readiness correctly
  returned **503** naming `email`, `security` and `environment`.
- Against the same server with a strong secret, HTTPS app URL, Resend and monitoring
  configured, it returned **200 healthy** on every dependency, leaving two honest warnings
  (localhost database, local-disk storage) that are true of this machine.

The security check also earned its place immediately: it flagged that seeded admin accounts had
never verified their email — a real finding, since a privileged account that can sign in
without a verified address is a phishing foothold. The seed now marks accounts it creates
itself as verified (they were not self-registered), so a freshly seeded deployment doesn't
report itself unhealthy on day one.

The email check found real failures too: four `FAILED` rows from a run against an invalid
Resend key, captured by M19's delivery log with the provider's own error message, and surfaced
as a warning with the ratio (`4 of 232 sends failed in the last 24h`).

## Maintenance

`POST /api/admin/maintenance` runs `expireQuotes` (wiring up M15's `expireStale`) and
`measureStorage` (M18's real provider walk). Admin-only, audited, and idempotent — the smoke
asserts a second run is a no-op.

## Verification

```bash
npm run lint                    # ✓ 0 errors, 0 warnings
npm run typecheck               # ✓ clean
npm run build                   # ✓ compiled
npx prisma migrate status       # ✓ up to date, 20 migrations
npm run smoke -- --http         # ✓ 20/20 passed in 41s
npm run preflight               # ✓ PREFLIGHT PASSED (0 failures)
npm run verify:backup           # ✓ BACKUP VERIFICATION PASSED
```
