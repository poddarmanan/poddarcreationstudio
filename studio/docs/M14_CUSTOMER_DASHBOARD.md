# M14 — Customer dashboard

**Phase 3 · milestone 3 of 9.** Everything a customer has done with us, on one page, in one
database round trip.

## Panels

| Panel | Source | Added in |
|---|---|---|
| Recent activity | `ActivityEvent` | **M14** |
| Recommended for you | `ColourRelationship` + family affinity | **M14** |
| Upcoming follow-ups | `FollowUp` (customer-visible, open only) | **M14** |
| Saved collections | `CollectionService` | M13 |
| Requested quotes | `Quote` | M7 |
| Sample requests | `SampleRequest` | M8 |
| Downloads | `Download` | M6 |
| Favourite fabrics | `Favourite` | M6 |
| Recently viewed | `RecentlyViewed` | M6 |
| Stat tiles | aggregate counts | M6 |

## Schema

```
+ ActivityEvent(userId, type, title, detail, entity, entityId, createdAt)
                                        @@index([userId, createdAt]) @@index([type, createdAt])
+ FollowUp(userId, assigneeId, createdById, subject, note, dueAt,
           status OPEN|DONE|CANCELLED, visibleToCustomer, completedAt)
                                        @@index([userId, status, dueAt]) @@index([assigneeId, status, dueAt])
```

Migration `20260724213229_m14_dashboard_activity`, additive.

`FollowUp` lands here rather than in M16 (as the Phase 3 plan first sketched) because the
customer-facing read is part of this dashboard. M16 builds the sales-side tooling on the same
table.

### `ActivityEvent` is not `AuditLog`

They answer different questions and are deliberately kept apart:

| | `AuditLog` (M1) | `ActivityEvent` (M14) |
|---|---|---|
| Audience | Staff, security review | The customer |
| Content | actor, action verb, entity, IP, user-agent | a readable sentence |
| Retention | complete, never pruned | newest 200 per customer |
| Written for | accountability | orientation |

Collapsing them would force one to compromise: the audit log would grow customer-facing prose
and lose its machine shape, or the dashboard would show customers their own IP addresses.

## Activity is recorded by the real business actions

`ActivityService` is injected into `DealerService`, `CollectionService`, `QuoteService` and
`SampleService` — so the feed is written by the flows themselves, not by the UI:

- favourite saved · collection started · collection sent to sales
- quotation requested · quotation status changed
- sample requested · sample approved / dispatched / delivered
- spec sheet or catalogue downloaded

Recording is **best-effort by construction**: `record()` swallows its own failures, because a
dashboard nicety must never fail the business action that triggered it. The feed self-trims to
the newest 200 entries per customer (sampled, not on every write).

## Recommendations — rules, not a model

Two rules, in priority order, with a fallback:

1. **"Close to \<shade you saved\>"** — nearest shades from the `ColourRelationship` table
   precomputed in Phase 2 M3 (CIELAB ΔE), excluding anything already saved.
2. **"More in \<family\>"** — other shades from the quality the customer engages with most.
3. **"A place to start"** — a spread across the catalogue, so a brand-new account never sees
   an empty panel.

Every group carries its own `reason`, which is what the UI renders as the caption — a
recommendation the customer can't understand isn't worth showing. Nothing already favourited
or already in one of their boards is ever recommended back to them.

**This is not AI.** No model, no embedding, no inference — the deferred-features line stays
uncrossed. `ActivityEvent`, `Colour.colourVector` and these rules are the seam a future
recommender would replace.

## Follow-ups: internal reminders stay internal

`FollowUp.visibleToCustomer` separates "we'll call you Thursday" from "check margin before
quoting". The dashboard query filters on `status: OPEN` **and** `visibleToCustomer: true`, so
an internal note can never surface on the customer's page. Covered by an explicit assertion in
`scripts/smoke-m14.ts`.

## Performance

`DashboardService.forUser` issues its nine reads through a single `Promise.all`, then derives
recommendations from data already in hand. The portal page and `/api/portal/dashboard` share
that one method, so there is exactly one shape to optimise.

Relative-time labels (`whenLabel`, `dueLabel`, `overdue`) are computed **on the server**
against one `now` per request (`server/dashboard/format.ts`). Reading the clock during a client
render is impure — it makes markup depend on when React happens to re-render, and it can
disagree with the server's HTML on hydration.

## Verification

```bash
npm run build                          # ✓ compiled
npm run lint                           # ✓ 0 errors, 0 warnings
npx tsc --noEmit                       # ✓ clean
npx prisma migrate deploy              # ✓ applied
npx tsx scripts/smoke-m14.ts           # ✓ M14 SMOKE PASSED
npx tsx scripts/smoke-m6.ts m7 m8 m13  # ✓ existing workflows unaffected
npx tsx scripts/smoke-http-journey.ts  # ✓ HTTP JOURNEY SMOKE PASSED
npx tsx scripts/smoke-http-rbac.ts     # ✓ HTTP RBAC SMOKE PASSED
```

`smoke-m14.ts` asserts the empty-account case as carefully as the populated one: every panel
renders, and recommendations fall back rather than returning nothing.
