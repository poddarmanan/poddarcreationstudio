# M12 — Customer accounts

**Phase 3 · milestone 1 of 9.** Completes the customer account and hardens the boundary
between customers and staff.

## What shipped

| Capability | Where |
|---|---|
| Registration, login, verification, password reset | Already shipped in Phase 2 (M5); unchanged |
| Shipping address book (many per customer, one default) | `ShippingAddress`, `/api/portal/addresses` |
| Contact people (many per customer, one primary) | `ContactPerson`, `/api/portal/contacts` |
| GST **and** VAT identifiers, website | `DealerProfile.vatNumber`, `.website` |
| Password change, verification resend | `/api/portal/account` |
| Sign-in engagement stamp | `User.lastLoginAt` |
| One role-policy authority | `server/core/rbac.ts` |

## Schema

```
+ ShippingAddress(userId, label, contactName, phone, line1, line2, city, state,
                  pincode, country, isDefault)      @@index([userId, isDefault])
+ ContactPerson(userId, name, designation, email, phone, whatsapp, isPrimary)
                                                    @@index([userId, isPrimary])
  DealerProfile += vatNumber, website
  User          += lastLoginAt
```

Two migrations:

1. `20260724210345_m12_customer_accounts` — additive tables and columns.
2. `20260724210500_m12_address_backfill` — data migration promoting the single address held
   on `DealerProfile` into the address book as each customer's default. Idempotent and
   non-destructive: `DealerProfile` keeps its columns, so anything still reading them works.

## Role policy

`server/core/rbac.ts` is now the only place role membership is decided:

```ts
STAFF_ROLES    = ADMIN | MANAGER | SALES     // run the business
ADMIN_ROLES    = ADMIN | MANAGER             // configuration + destructive actions
CUSTOMER_ROLES = BUYER | VIEWER              // browse, save, request
```

`requireStaff()`, `requireAdmin()`, `requireSelfOrStaff()`, `assertOwned()` replace the role
string literals that were previously copied across routes and pages (13 call sites migrated).
`assertOwned` answers **404, not 403**, when a customer reaches for another customer's row —
the API never confirms that an id it doesn't own exists.

**Customers can never access admin functionality**, verified live in
`scripts/smoke-http-rbac.ts`:

- 6 staff APIs answer `403` to a signed-in customer.
- 4 staff pages never emit a single workspace marker to a customer (and the same markers *do*
  appear for staff, so the check can't silently pass).
- SALES is refused the ADMIN-only activity feed — the tiers are distinct, not cosmetic.
- Anonymous requests get `401` on staff and portal APIs while the public catalogue stays public.

## Integration

- **DI:** `CustomerService` is constructed in `server/container.ts` and injected with the
  Prisma client, `EmailService`, `TokenService` and `Telemetry` — no `new` outside the root.
- **Audit:** every mutation records `customer.address.*`, `customer.contact.*`,
  `customer.profile.update`, `customer.password.change`, `customer.verification.resend`.
- **Telemetry:** `customer.address.added`, `customer.contact.added`, `customer.password.changed`.
- **HTTP boundary:** all new routes go through `run()` with zod schemas, CSRF origin checks
  and rate limits (`write` for CRUD, the tighter `auth` policy for security actions).
- **UI:** three new portal sections built from the page's existing card / label / input / chip
  tokens. No new colours, fonts, spacing scales, or motion. The sample-request flow now
  pre-fills from the default address and falls back to the legacy profile address.

## Behaviour worth knowing

- The **first** address or contact a customer saves automatically becomes their default /
  primary; there is never a state with zero defaults.
- Deleting the default address promotes the oldest survivor.
- Contact emails are lower-cased and trimmed on write.
- `resendVerification` is a silent no-op for an already-verified address (the route surfaces
  that as a 400 so the UI can say so).

## Verification

```bash
npm run build                       # ✓ compiled
npm run lint                        # ✓ 0 errors, 0 warnings
npx tsc --noEmit                    # ✓ clean
npx prisma migrate deploy           # ✓ 2 migrations applied
npx tsx scripts/smoke-m12.ts        # ✓ M12 SMOKE PASSED
npx tsx scripts/smoke-http-rbac.ts  # ✓ HTTP RBAC SMOKE PASSED (server running)
# Existing functionality: smoke-m2 / m5 / m6 / m7 / m8 / m9 / m10 / m11 all pass
```

## Bugs fixed on the way (pre-existing, no UI change)

- **Dev email transport dropped messages.** Two emails sent in the same millisecond wrote to
  the same `.eml` path, so the second overwrote the first. Filenames now carry a sequence.
- **Six React `set-state-in-effect` lint errors** across the auth pages, `Entrance` and
  `state.ts`. The auth pages now read their query parameter during render via
  `useSearchParams()` inside a Suspense boundary; `Entrance` keys API results by the query
  they answer (which also stops a stale response rendering against a newer query);
  `prefers-reduced-motion` moved to `useSyncExternalStore`. Rendering is byte-identical.
- **Smoke scripts pinned to one database.** `smoke-m2` hard-coded a colour cuid and
  `smoke-m9` assumed a non-empty audit log, so neither ran on a freshly seeded environment.
