-- M12 data migration: promote the single address held on DealerProfile into the new
-- address book as each customer's default. Idempotent (skips users who already have one)
-- and non-destructive — DealerProfile keeps its columns so nothing that reads them breaks.
INSERT INTO "ShippingAddress" ("id", "userId", "label", "phone", "line1", "city", "state", "pincode", "country", "isDefault", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  p."userId",
  'Primary address',
  p."contactPhone",
  p."shippingLine1",
  COALESCE(NULLIF(p."shippingCity", ''), '—'),
  p."shippingState",
  p."shippingPincode",
  COALESCE(NULLIF(p."shippingCountry", ''), 'India'),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "DealerProfile" p
WHERE p."shippingLine1" IS NOT NULL
  AND p."shippingLine1" <> ''
  AND NOT EXISTS (SELECT 1 FROM "ShippingAddress" a WHERE a."userId" = p."userId");
