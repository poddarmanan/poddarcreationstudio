# M16 — Sales workspace

**Phase 3 · milestone 5 of 9.** The internal side of the journey: where the sales team works
the pipeline and knows the customer before they pick up the phone.

## Surfaces

| Route | What it is |
|---|---|
| `/admin/sales` | Pipeline board, overdue reminders, samples waiting, searchable customer list |
| `/admin/sales/[id]` | One customer: profile, communication history, collections, quotes, samples, downloads, notes, follow-ups |

Reached from the staff hub, alongside the existing quote, sample and catalogue desks.

## The pipeline

Four working columns — `SUBMITTED · UNDER_REVIEW · PRICED · SENT` — taken from the M15
lifecycle. Terminal states (`ACCEPTED / REJECTED / EXPIRED`) are **not** columns; they appear as
closed totals, because a board you can never clear isn't a board.

Each column carries its count and its **value in minor units**, summed from priced quotes only
(an unpriced quote contributes nothing rather than a misleading zero). `?mine=1` narrows the
board to one salesperson's own work.

Overdue follow-ups render **above** the pipeline. That ordering is deliberate: the day starts
with what was promised and missed, not with what's new.

## Customer profile

`SalesService.customer()` assembles the whole story in one parallel read: account, dealer
profile, addresses, contacts, collections, quotations, sample requests, downloads, the
customer's own activity feed, sales notes and follow-ups — plus a **merged communication
history**.

That history interleaves quote transitions, sample updates, sales notes and scheduled
follow-ups into one newest-first timeline, so "what have we actually said to them?" has one
answer instead of four tabs. M19's email log joins the same merge.

## Notes and follow-ups: the internal/shared boundary

Two mechanisms, one principle — **the team's private working never leaks to the customer**.

- **`CustomerNote` is internal by construction.** There is no customer-facing read path for
  the model anywhere in the app. `smoke-m16.ts` proves it the hard way: it writes a note, then
  serialises the customer's *entire* dashboard payload and asserts the note's text does not
  appear anywhere in it.
- **`FollowUp.visibleToCustomer` defaults to `false`.** A reminder is internal unless the
  salesperson deliberately ticks "show to customer". "Check margin" stays with us; "Call about
  the autumn book" appears on the customer's dashboard.

An unassigned follow-up falls to its creator rather than to nobody, so nothing is scheduled
into a void.

## Assignment

Quotes are assigned through `QuoteService.assign` (unchanged from M7). Samples are assigned
here, and `assignSample` **verifies the assignee is staff** — a sample request cannot be
assigned to a customer, even with a crafted request.

## Scope discipline

This is a *reading* surface over data the customer flows already produce. Every mutation it
offers — note, follow-up, assignment — is a sales annotation. It never edits a customer's own
records on their behalf, and it is not a CRM: no leads, no deals, no pipeline automation, no
contact syncing. Those remain the deferred extension point the plan reserved.

## Schema

```
+ CustomerNote(userId, authorId, body, pinned)   @@index([userId, pinned, createdAt])
```

Migration `20260724221500_m16_sales_workspace`. `FollowUp` already existed from M14.

## A leak found and closed

The RBAC smoke caught `/admin/sales` emitting the string `SALES WORKSPACE` to a signed-in
customer. No data leaked — it was the `loading.tsx` shell, which **streams before the page's
staff check resolves**. It's still a disclosure of what lives behind the door, so the sales
loading shells now use the same short, non-disclosing labels as the existing admin ones. Worth
remembering generally: a loading shell renders before authorisation, so it must not name
anything a customer shouldn't know about.

## Verification

```bash
npm run build                       # ✓ compiled
npm run lint                        # ✓ 0 errors, 0 warnings
npx tsc --noEmit                    # ✓ clean
npx prisma migrate deploy           # ✓ applied
npx tsx scripts/smoke-m16.ts        # ✓ M16 SMOKE PASSED
npx tsx scripts/smoke-http-rbac.ts  # ✓ now covers /admin/sales and its two APIs
npx tsx scripts/smoke-http-journey.ts
# Regression: m6, m7, m8, m9, m12, m13, m14, m15 all pass
```

`smoke-m16.ts` covers the pipeline (stages, value roll-up, per-salesperson filter, overdue
surfacing), customer search by company / email / name with staff excluded, the merged
communication history and its ordering, notes (add, pin, unpin, stay internal), follow-ups
(internal default, shared opt-in, queue, completion, double-close refused) and staff-only
assignment.
