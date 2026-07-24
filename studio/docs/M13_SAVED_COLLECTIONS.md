# M13 — Saved collections

**Phase 3 · milestone 2 of 9.** Turns the Phase 2 collection (a name and a bag of shades)
into a working board: ordered, annotated, quantified, duplicable, and one action away from a
quotation request.

## The journey step this closes

```
save fabrics → build collection → … → request quotation
```

A customer pins shades in the studio, groups them into "Wedding collection", writes what each
shade is for, sets indicative quantities, arranges them into a story, and sends the whole
board to sales. The board stays theirs — sharing it publicly is M17.

## Schema

```
Collection     += description, coverItemId, updatedAt   @@index([userId, updatedAt])
CollectionItem += quantity, unit (default "m"), position @@index([collectionId, position])
```

Migration `20260724212104_m13_collections`. Purely additive: existing collections keep their
name and items, gain `position = 0` (ties break on `createdAt`, so their order is unchanged)
and a `updatedAt` defaulted to now.

## Architecture

Collections outgrew `DealerService`, so they moved to a feature slice of their own,
`server/collection/collection.service.ts`, constructed in the DI container with the Prisma
client, `QuoteService` and `Telemetry`. `DealerService` keeps profile, favourites,
recently-viewed, downloads and quotes; only the dashboard's collection **count** remains there.

The service depends on `QuoteService` rather than reaching into Prisma to write quotes, so
"send to sales" reuses the whole Phase 2 quote workflow — timeline event, buyer confirmation
email, staff notification — with no duplicated logic.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/portal/collections` | List boards with items |
| `POST` | `/api/portal/collections` | Create, snapshot the swatch book, or duplicate |
| `GET` | `/api/portal/collections/[id]` | One board |
| `PATCH` | `/api/portal/collections/[id]` | Rename, describe, set cover, persist a reorder |
| `POST` | `/api/portal/collections/[id]` | Add a shade |
| `DELETE` | `/api/portal/collections/[id]` | Delete the board (or one item via `?itemId=`) |
| `PATCH` | `/api/portal/collections/[id]/items/[itemId]` | Note, quantity, unit, position |
| `DELETE` | `/api/portal/collections/[id]/items/[itemId]` | Remove a shade |
| `POST` | `/api/portal/collections/[id]/quote` | Send the board to sales |

All behind `run()` with zod, CSRF origin checks and the `write` (or `quote`) rate limit.

## Behaviour worth knowing

- **Adding a shade twice is a no-op** — it returns the existing item rather than erroring, so
  a double-click can't corrupt a board.
- **Reorder is all-or-nothing.** The request must list every item in the collection exactly
  once; a partial list or a foreign id is refused, so a stale client can't scramble positions.
- **Deleting the cover item clears the cover**, never leaving a dangling reference.
- **`updatedAt` tracks item edits**, not just renames, so "recently worked on" ordering is
  truthful.
- **Duplication is deep**: notes, quantities and order come with the copy, and the copy is
  fully independent.
- **Send to sales carries intent**: each line becomes `Shade (Fabric) — 240m · note`, the
  total becomes the quote's quantity, and the collection's description leads the message.
  An empty board is refused.

## UI

New page `/portal/collections/[id]`, built from the portal's existing tokens (`card`, `label`,
`input`, `chipBtn`, `inkBtn`, the `pc-pink` pinked swatch edge, the display serif, the gold
eyebrow). Nothing new was invented: no new colours, fonts, spacing scale, or motion.

Reordering uses explicit ← / → buttons with `aria-label`s naming the shade rather than
drag-and-drop, so it works with a keyboard and a screen reader. The portal dashboard's
collection cards now link through to the board and show the indicative total.

## Integration

- **Audit:** `collection.create`, `collection.update` (with a `reordered` flag),
  `collection.delete`, `collection.quote.request`.
- **Telemetry:** `collection.created`, `collection.duplicated`, `collection.item.added`,
  `collection.quote.requested`.
- **RBAC:** every method is owner-scoped; a foreign board answers 404, never 403.

## Verification

```bash
npm run build                          # ✓ compiled
npm run lint                           # ✓ 0 errors, 0 warnings
npx tsc --noEmit                       # ✓ clean
npx prisma migrate deploy              # ✓ applied
npx tsx scripts/smoke-m13.ts           # ✓ M13 SMOKE PASSED
npx tsx scripts/smoke-m6.ts            # ✓ dealer portal contract still holds
npx tsx scripts/smoke-http-journey.ts  # ✓ HTTP JOURNEY SMOKE PASSED
npx tsx scripts/smoke-http-rbac.ts     # ✓ HTTP RBAC SMOKE PASSED
```

`scripts/smoke-http-journey.ts` is new and walks the real journey over live HTTP —
browse → save → build → annotate → reorder → board renders → isolation → request quotation.
It shares `scripts/http-client.ts` with the RBAC smoke, which signs in through the genuine
NextAuth credentials flow (no test-only back doors).

## Bug fixed on the way

**Every service-thrown 4xx became a 500 in production.** `isAppError` used `instanceof`, and
a production bundle can hold more than one copy of `server/core/errors.ts` (route bundles vs
shared chunks) — across copies `instanceof` is false, so `toErrorResponse` fell through to
the generic 500 branch. A customer asking for a collection that isn't theirs got
`500 Something went wrong` instead of `404 Collection not found`, and every such request was
logged to the error sink as an exception.

`AppError` now carries a `Symbol.for('poddar.AppError')` brand and `isAppError` checks that
brand, which is shared across duplicate module copies. This restores correct status codes for
**every** service-thrown error across the app, not just collections — including M12's
ownership 404s. Verified in a production build (`next start`), not just in dev.
