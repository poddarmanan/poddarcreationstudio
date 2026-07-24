# M18 — Business analytics

**Phase 3 · milestone 7 of 9.** What the business actually looks like, on one page at
`/admin/analytics`.

## The panels

| Panel | Answers |
|---|---|
| Top viewed fabrics | What are people actually looking at? |
| Top downloaded fabrics | What do they take away with them? |
| Most searched shades | Which colours do they come here by name for? |
| Top searches | **Which popular queries return nothing** — the catalogue's gaps |
| Search volume | Daily trend over the window |
| Quote conversion | Win rate, reach rate, value won and open |
| Sample conversion | Fulfilment and approval rates |
| Customers | Total, approved, pending, new, active, returning, most engaged |
| Popular collections | Which shared catalogues get opened |
| Storage | Objects, bytes, reclaimable, driver |

## Schema

```
+ FabricView(fabricId, colourId, userId, visitorId)
                  @@index([fabricId, createdAt]) @@index([createdAt]) @@index([colourId])
```

Migration `20260724231500_m18_analytics`.

**Why a new table when `RecentlyViewed` exists:** `RecentlyViewed` is a per-customer
convenience capped at 30 rows, and it only ever held signed-in views. Browsing this studio needs
no account, so *most* views are anonymous — an analytics record that saw only signed-in users
would describe a different business than the one we run. `/api/portal/recent` now writes both:
the customer's strip when there's a session, and the analytics row always.

`visitorId` is a truncated salted hash of the client address — enough to count visitors, never
enough to identify one. The address itself is never written. Asserted in the smoke.

## Definitions that were chosen carefully

- **Quote conversion is two numbers, not one.** `winRate` = accepted ÷ decided;
  `reachRate` = ever-priced-and-sent ÷ submitted. A single "conversion %" hides *which half of
  the funnel is leaking* — losing deals you quoted is a very different problem from never
  quoting them.
- **"Returning" means active on more than one distinct day**, computed with
  `COUNT(DISTINCT date_trunc('day', createdAt)) > 1`. A raw login or event count would call a
  customer who clicked five times in one afternoon "loyal".
- **Sample fulfilment is measured against settled requests**, so a queue of pending requests
  doesn't quietly depress the rate.
- **Storage is read from the media rows**, not by listing the bucket, so the page costs one
  query instead of a provider round trip. The reading reports `measured: 'database'`;
  `measureObjects()` does the real provider walk for the M20 diagnostics.

## Performance

Every panel is a database aggregate — `groupBy` or one grouped raw query — and the whole
overview runs in a single `Promise.all`. **No N+1 anywhere**: fabric ids are resolved to names
in one `findMany`, not one lookup per row. The rendered page measured **74 ms** end to end
against the seeded database.

## Chart design

Deliberately restrained, and consistent with the frozen visual language:

- **Every panel is a single series**, so there is no legend to read and no categorical palette
  to get wrong. One hue (the brand gold) carries magnitude by bar length.
- **Rates are stat tiles, not charts.** A single number is not a bar chart.
- **No dual axes anywhere** — two measures never share a plot.
- Thin bars with rounded data-ends on a hairline recessive baseline; surface gaps rather than
  borders between marks.
- **Every row is directly labelled with its value**, so each panel reads as a table that
  happens to have bars — legible in greyscale, in print, and to a screen reader. Colour is
  never the only carrier of meaning.
- The trend gives zero-days a visible sliver, so a gap reads as "no activity" rather than
  "no data", and labels only the peak and the endpoints.

## A bug the smoke caught

`popularCollections` originally `LEFT JOIN`ed both `CollectionItem` and `CollectionShare`. That
fans the rows out — a board with 3 shades and one share of 2 views reported **6** opens. The
smoke asserted the exact number and failed, which is precisely what it was for. Both counts are
now correlated subqueries, so neither multiplies the other.

## Verification

```bash
npm run build                       # ✓ compiled
npm run lint                        # ✓ 0 errors, 0 warnings
npx tsc --noEmit                    # ✓ clean
npx prisma migrate deploy           # ✓ applied
npx tsx scripts/smoke-m18.ts        # ✓ M18 SMOKE PASSED
npx tsx scripts/smoke-http-rbac.ts  # ✓ now covers /admin/analytics and its API
```

The smoke covers signed-in **and** anonymous views, hashed visitor keys, download ranking,
shade-name search matching, zero-result gap surfacing, gap-filled ordered trends, both
conversion rates, the distinct-day returning definition, collection popularity, and both
storage readings. It clears its own rows on entry, so an interrupted run can't skew the next
one's counts.
