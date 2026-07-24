# M17 — Digital catalog sharing

**Phase 3 · milestone 6 of 9.** A collection becomes a catalogue the customer can send to
*their* buyer — as a link, a QR code, a PDF, a printed sheet or an email.

## What a share is

A share is a **capability**: whoever holds the link can see the catalogue. That single sentence
drives every decision below.

- The link is generated from **32 random bytes**, and **only its SHA-256 hash is stored**. A
  database read — or an audit-log read, or a support engineer looking at the row — cannot
  reconstruct a working link. Same discipline as the Phase 2 email `Token` model.
- The raw token is returned **exactly once**, at creation. The UI says so, because the server
  genuinely cannot show it again.
- The owner can take it back three ways: **passphrase**, **expiry date**, **revocation**.

## The public payload

`/c/[token]` renders shades, notes and quantities. Nothing else — no owner name, no email, no
user ids, no pricing, no navigation into the app. `smoke-m17.ts` asserts this by serialising
the whole public payload and checking the owner's name and email appear nowhere in it, and
`smoke-http-share.ts` asserts it again against the rendered HTML.

The page is marked `robots: noindex, nofollow`: a private-by-link catalogue has no business in
a search index.

## The passphrase gate

Entering the passphrase mints a **short-lived HMAC ticket** in an httpOnly cookie, scoped to
one share id and signed with `AUTH_SECRET`. So the visitor is asked once, the passphrase is
never stored anywhere, and the ticket:

- opens **only** the share it was minted for,
- fails if tampered with by a single character,
- expires on its own after 12 hours.

`resolveWithTicket()` is a **separate method** from `resolve()` rather than a
`skipPassword: true` flag, so there is no "bypass the password" option on the public API that a
future caller could pass by accident.

Every failure — wrong passphrase, unknown link, expired, revoked — returns the same message
from the unlock endpoint. A wrong guess must not reveal whether the link exists. The endpoint
carries the `auth` rate-limit policy, since it is a password check on a public URL.

## The PDF: no new dependency

`server/pdf/pdf-writer.ts` is a **hand-rolled PDF 1.4 writer** (~200 lines): pages, filled
rectangles, base-14 text, and a correct cross-reference table.

The alternatives were a headless browser (hundreds of MB, a process to supervise, a whole new
failure mode in production) or a layout library we'd use 2% of. A catalogue page is swatch
rectangles and short lines of text — that's a few hundred bytes of PDF grammar, and it belongs
in the repo rather than in the deployment.

`server/pdf/catalogue-pdf.ts` lays out the brand: cream page, ink text, gold eyebrow, the
selvage rule under the title, a 3-column swatch grid, per-shade specs, notes and quantities, and
an honest `2 / 4` footer (pagination is computed **before** rendering so the count is right).

Text is transliterated to WinAnsi where a base-14 font has no glyph (curly quotes, `₹`, `—`) —
rather than emitting bytes that would make the file unopenable.

**Verified with an independent reader**, not just our own assertions: `pypdf` parses the output,
reports the correct page count and title, and extracts the expected text —

```
PODDAR / CREATION . STUDIO / COLLECTION / Wedding collection
Reds and golds for the October book / Prepared for The Ahmedabad Buyer
Kapaas / Gajji Silk / 20 kg · 56+ . #EFEDE2 / 120m . lehenga base
```

The smoke also checks the structure the way a reader does: `/Size` matches the object count,
the xref lists every object, and `startxref` points at the literal `xref` keyword.

## Print

"Print catalogue" uses a scoped `@media print` block on the public page: actions and QR hidden,
white background, fixed 3-column grid, `break-inside: avoid` on each card, `@page { size: A4 }`.
Print and PDF produce the same document by two routes.

## Email

The owner emails the catalogue to up to ten addresses. The endpoint requires the **raw token**
from the client that created the link — the server cannot recover it, which means an attacker
who compromises the session still cannot mail out a link they never saw.

## Schema

```
+ CollectionShare(collectionId, createdById, tokenHash UNIQUE, title, message,
                  passwordHash, expiresAt, allowDownload, revokedAt, viewCount, lastViewedAt)
+ ShareView(shareId, visitorId, referer)          @@index([shareId, createdAt])
```

Migration `20260724224500_m17_catalogue_sharing`.

`ShareView.visitorId` is a **truncated salted hash** of the visitor's address — enough to tell
repeat opens apart for the owner's "3 views, 2 visitors", not enough to identify anyone. The
address itself is never written. Verified in the smoke.

## Verification

```bash
npm run build                        # ✓ compiled
npm run lint                         # ✓ 0 errors, 0 warnings
npx tsc --noEmit                     # ✓ clean
npx prisma migrate deploy            # ✓ applied
npx tsx scripts/smoke-m17.ts         # ✓ M17 SMOKE PASSED
npx tsx scripts/smoke-http-share.ts  # ✓ HTTP SHARE SMOKE PASSED
```

`smoke-http-share.ts` walks the whole thing over live HTTP: an anonymous visitor opens the
link and sees the catalogue but not the owner; the PDF downloads with the right content type,
disposition and `no-store`; a protected link shows the gate and reveals nothing about the
collection; a wrong passphrase is refused without disclosing why; the ticket carries **that**
visitor through and no one else; `allowDownload: false` is enforced server-side (403) rather
than merely hidden; and revocation closes both the page and the PDF.
