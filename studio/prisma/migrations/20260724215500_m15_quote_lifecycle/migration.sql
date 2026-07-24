-- M15: the quotation lifecycle becomes the eight states the business actually works in.
--
-- Phase 2 shipped NEW / ASSIGNED / QUOTED / WON / LOST. This migration replaces the type and
-- maps every existing row onto its successor, so no quote loses its place in the pipeline:
--
--   NEW      -> SUBMITTED      (received, awaiting triage)
--   ASSIGNED -> UNDER_REVIEW   (a salesperson owns it)
--   QUOTED   -> PRICED         (pricing exists; SENT is now a separate, later step)
--   WON      -> ACCEPTED
--   LOST     -> REJECTED
--
-- The rewrite covers Quote.status and both QuoteEvent columns, so the historical timeline
-- reads in the new vocabulary too. The API keeps accepting the legacy names as aliases.

CREATE TYPE "QuoteStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PRICED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- The default references the old type; drop it before the column changes type.
ALTER TABLE "Quote" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Quote"
  ALTER COLUMN "status" TYPE "QuoteStatus_new"
  USING (
    CASE "status"::text
      WHEN 'NEW'      THEN 'SUBMITTED'
      WHEN 'ASSIGNED' THEN 'UNDER_REVIEW'
      WHEN 'QUOTED'   THEN 'PRICED'
      WHEN 'WON'      THEN 'ACCEPTED'
      WHEN 'LOST'     THEN 'REJECTED'
      ELSE 'SUBMITTED'
    END
  )::"QuoteStatus_new";

ALTER TABLE "QuoteEvent"
  ALTER COLUMN "fromStatus" TYPE "QuoteStatus_new"
  USING (
    CASE "fromStatus"::text
      WHEN 'NEW'      THEN 'SUBMITTED'
      WHEN 'ASSIGNED' THEN 'UNDER_REVIEW'
      WHEN 'QUOTED'   THEN 'PRICED'
      WHEN 'WON'      THEN 'ACCEPTED'
      WHEN 'LOST'     THEN 'REJECTED'
      ELSE NULL
    END
  )::"QuoteStatus_new";

ALTER TABLE "QuoteEvent"
  ALTER COLUMN "toStatus" TYPE "QuoteStatus_new"
  USING (
    CASE "toStatus"::text
      WHEN 'NEW'      THEN 'SUBMITTED'
      WHEN 'ASSIGNED' THEN 'UNDER_REVIEW'
      WHEN 'QUOTED'   THEN 'PRICED'
      WHEN 'WON'      THEN 'ACCEPTED'
      WHEN 'LOST'     THEN 'REJECTED'
      ELSE NULL
    END
  )::"QuoteStatus_new";

DROP TYPE "QuoteStatus";
ALTER TYPE "QuoteStatus_new" RENAME TO "QuoteStatus";
ALTER TABLE "Quote" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- Pricing on the quote. Money is stored in minor units (paise/cents) as integers, so totals
-- never drift the way a float would.
ALTER TABLE "Quote"
  ADD COLUMN "currency"    TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "totalValue"  INTEGER,
  ADD COLUMN "priceNote"   TEXT,
  ADD COLUMN "validUntil"  TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt"      TIMESTAMP(3),
  ADD COLUMN "decidedAt"   TIMESTAMP(3);

-- Every existing quote was, by definition, already submitted.
UPDATE "Quote" SET "submittedAt" = "createdAt" WHERE "submittedAt" IS NULL;
-- Rows that had already reached a decision keep an honest decision timestamp.
UPDATE "Quote" SET "decidedAt" = "updatedAt" WHERE "decidedAt" IS NULL AND "status" IN ('ACCEPTED', 'REJECTED');

-- Per-shade pricing.
ALTER TABLE "QuoteItem"
  ADD COLUMN "quantity"  DOUBLE PRECISION,
  ADD COLUMN "unit"      TEXT DEFAULT 'm',
  ADD COLUMN "unitPrice" INTEGER,
  ADD COLUMN "note"      TEXT;
