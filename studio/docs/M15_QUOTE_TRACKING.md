# M15 — Quote tracking

**Phase 3 · milestone 4 of 9.** The quotation becomes a tracked business object with a real
lifecycle, real pricing, and a customer who can see where it stands and respond to it.

## The lifecycle

```
DRAFT ──► SUBMITTED ──► UNDER_REVIEW ──► PRICED ──► SENT ──► ACCEPTED
                                            │         │
                                            ▼         ▼
                                     (re-review)   REJECTED
   any open state ──► REJECTED / EXPIRED        EXPIRED ──► UNDER_REVIEW (requote)
```

| State | Meaning |
|---|---|
| `DRAFT` | Started by the customer, not yet sent to us |
| `SUBMITTED` | Received, awaiting triage |
| `UNDER_REVIEW` | A salesperson owns it and is working the numbers |
| `PRICED` | Pricing is filled in but **not yet released** to the customer |
| `SENT` | Pricing has been sent; the customer can now respond |
| `ACCEPTED` / `REJECTED` | Terminal |
| `EXPIRED` | Passed its validity date; can be revived for a requote |

`PRICED` and `SENT` are deliberately separate — pricing a quote is internal work, and the
customer hears about it only when the desk chooses to release it.

`QUOTE_TRANSITIONS` in `server/quote/quote.service.ts` is the single source of truth. An
out-of-order move is a **validation error**, not a silently accepted state, and the sales desk
renders its buttons from the same map so it can never offer a move the service would refuse.

## The migration

Phase 2 shipped `NEW / ASSIGNED / QUOTED / WON / LOST`. Migration
`20260724215500_m15_quote_lifecycle` replaces the enum type and maps every existing row:

| Phase 2 | Phase 3 |
|---|---|
| `NEW` | `SUBMITTED` |
| `ASSIGNED` | `UNDER_REVIEW` |
| `QUOTED` | `PRICED` |
| `WON` | `ACCEPTED` |
| `LOST` | `REJECTED` |

The rewrite covers `Quote.status` **and both `QuoteEvent` columns**, so historical timelines
read in the new vocabulary too — no row is dropped and no quote loses its place in the pipeline.

**No client broke.** `normalizeQuoteStatus()` still accepts the Phase 2 names at the API
boundary, so an older client, a bookmarked filter URL, or an integration posting `WON` keeps
working. Verified in `smoke-m15.ts`, which also asserts that zero rows were left on a legacy
status after the migration.

## Pricing

```
Quote     += currency, totalValue, priceNote, validUntil, submittedAt, sentAt, decidedAt
QuoteItem += quantity, unit, unitPrice, note
```

Money is stored in **minor units as integers** (paise/cents). Per-line prices roll up into an
exact total — `Σ round(unitPrice × quantity)` — so a 600-metre order never drifts by a paisa
the way a float would. An explicit total overrides the computed one when the desk negotiates a
round number.

A quotation **cannot be sent without pricing**; the service refuses it, so no customer ever
sees an empty price.

## What the customer sees

New page `/portal/quotes/[id]`:

- a progress rail through the six forward states, with the current one marked;
- the quoted total, validity date and terms;
- the shade lines with their quantities and per-unit prices;
- the history — status changes and pricing events;
- **Accept** / **Decline**, once the quotation has been sent.

`forCustomer()` filters `NOTE` events out server-side, so the sales desk's internal working
(`"margin is thin on the Rani"`) can never reach the component that renders the page. The
customer decision path is a separate service method from the staff one (`decide()` vs
`updateStatus()`) that re-checks ownership and permits only `ACCEPTED`/`REJECTED` from `SENT` —
a staff-only transition is unreachable from the portal even with a crafted request.

## Expiry

`expireStale()` moves `SENT`/`PRICED` quotations past their `validUntil` to `EXPIRED`, writing a
timeline event and notifying the customer. It is **explicit rather than computed on read**, so
the history records when it happened. M20 wires it to the maintenance endpoint. An expired
quotation can be revived to `UNDER_REVIEW` for a requote.

## Audit history

Every transition writes a `QuoteEvent` (`CREATED` / `ASSIGN` / `STATUS` / `PRICE` / `NOTE`) **and**
an `AuditLog` row (`quote.assign`, `quote.status`, `quote.price`, `quote.note`,
`quote.customer.accept`, `quote.customer.reject`). The customer's own feed gets a readable
`ActivityEvent`. Three logs, three audiences, no duplication of intent.

## Verification

```bash
npm run build                          # ✓ compiled
npm run lint                           # ✓ 0 errors, 0 warnings
npx tsc --noEmit                       # ✓ clean
npx prisma migrate deploy              # ✓ enum swap applied, data mapped
npx tsx scripts/smoke-m15.ts           # ✓ M15 SMOKE PASSED
npx tsx scripts/smoke-m7.ts m8 m13 m14 # ✓ existing workflows still pass
npx tsx scripts/smoke-http-journey.ts  # ✓ HTTP JOURNEY SMOKE PASSED
```

The journey smoke now walks the **whole** customer journey over live HTTP:

```
browse → save → build collection → annotate → reorder → request quotation
       → sales assigns → prices → sends → customer tracks progress → accepts
```

including the negative cases: an unpriced quotation cannot be sent (400), and another account
cannot decide someone else's quotation (404).

Post-migration state verified directly in Postgres — 5 quotes mapped `NEW → SUBMITTED`, 2
mapped `QUOTED → PRICED`, and the enum now carries exactly the eight new values.
