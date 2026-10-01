-- The number written beside each swatch on the mill's shade card (M49). Nullable: added, never
-- required, so it is safe on a table with traffic.
ALTER TABLE "Colour" ADD COLUMN "code" TEXT;
