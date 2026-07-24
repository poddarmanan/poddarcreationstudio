# M19 — Notification centre

**Phase 3 · milestone 8 of 9.** One place the platform tells someone something, and one record
of everything it has said.

## The principle

**The in-app notification is always written; email is a channel on top of it.**

A customer who turns off quotation emails still has a complete record when they open the
portal. Muting a channel never loses the message — which is what makes it safe to offer the
switch at all.

Email dispatch is best-effort and runs *after* the in-app row is committed, so a transport
hiccup can never undo the business transaction that triggered it. If we couldn't even record
the notification, we don't send mail about it either.

## Schema

```
+ Notification(userId, type, title, body, link, entity, entityId, readAt)
                              @@index([userId, readAt, createdAt]) @@index([userId, createdAt])
+ EmailLog(to, subject, userId, status, error)
                              @@index([userId, createdAt]) @@index([to, createdAt]) @@index([createdAt])
  DealerProfile += notifyQuotes, notifySamples, notifyShares
```

Migration `20260724234000_m19_notifications`.

## Every email is logged — without a call site knowing

`LoggingEmailTransport` **decorates** the transport in the composition root:

```ts
new EmailService(new LoggingEmailTransport(createEmailTransport(), prisma))
```

So *every* message is captured — the six Phase 2 flows, the M12 verification resends, the M17
catalogue shares, and anything added later — with zero changes at any call site. That is the
Phase 2 transport abstraction paying rent.

Failures are logged too, as `FAILED` rows carrying the error. During an incident, "we tried and
it bounced" is far more useful than an email that silently never arrived.

The log resolves recipients to accounts, so it doubles as the **email half of M16's
communication history** — the sales workspace now shows what we actually sent a customer
alongside quote transitions, sample updates and notes.

## What notifies whom

| Event | Customer | Staff |
|---|---|---|
| Quotation status change | in-app + email at `UNDER_REVIEW`, `SENT`, `ACCEPTED`, `EXPIRED` | — |
| New quotation request | confirmation email | in-app + email |
| Sample status change | in-app + email | — |
| New sample request | confirmation | in-app + email |
| Shared catalogue opened | in-app, **first open only** | — |

Internal states (`PRICED`) notify in-app but send no mail: pricing is our work, and the
customer hears at `SENT`.

**"Your catalogue was opened" fires once.** On every refresh it would be noise, and noisy
notifications get muted wholesale — which costs you the messages that mattered.

## The duplicate-email bug this milestone created, and fixed

Wiring notifications into `QuoteService` initially produced **two emails per status change** —
the Phase 2 `notifyStatus` path *and* the new notification email. `smoke-m7` caught it
immediately (`assignment status email (got 2)`).

The fix is the actual point of a "unified notification system": `notify()` gained an
`emailWith` callback, so a caller supplies its purpose-built template (the quote and sample
templates have better copy than a generic notice could) while the service owns the **single**
preference check, the **single** dispatch, and the **single** log entry. `QuoteService.notifyStatus`
was deleted. `smoke-m19` now asserts exactly one status email per notified transition, so the
duplicate cannot come back.

Guest sample requests — which have an email address but no account — still get the direct
email, because there is no account to notify.

## Preferences

`prefEmail` is the master switch; `notifyQuotes` / `notifySamples` / `notifyShares` are per
category. The master beats the categories. A customer with no profile yet defaults to "tell
me". All four are editable from the portal's notification panel, which says plainly that
turning an email off never loses the message.

## Surfaces

- **Customer**: a Notifications section at the top of the portal, with unread count,
  mark-all-read, dismiss, and the preference switches.
- **Staff**: the same rows on the staff hub — a notification is a notification, so it is the
  same component and the same tokens.
- **API**: `GET/POST /api/notifications`, `DELETE /api/notifications/[id]`, all owner-scoped.

## Verification

```bash
npm run build                    # ✓ compiled
npm run lint                     # ✓ 0 errors, 0 warnings
npx tsc --noEmit                 # ✓ clean
npx prisma migrate deploy        # ✓ applied
npx tsx scripts/smoke-m19.ts     # ✓ M19 SMOKE PASSED
# Regression: m5, m6, m7, m8, m9, m12–m18 all pass
# HTTP: journey, rbac and share smokes all pass
```

`smoke-m19` covers the transport decorator capturing an email it never asked to send, the quote
and sample lifecycles reaching customer and staff, the exactly-one-email assertion, first-open-only
catalogue notifications, all three preference layers (muted category still records in-app,
unmuted still mails, master switch beats both), read state, cross-account isolation, dashboard
integration and the failure view.
