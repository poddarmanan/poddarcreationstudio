-- M47: a fabric order's delivery address (as written at the time of ordering) and the payment
-- method the buyer chose.
ALTER TABLE "Quote" ADD COLUMN "shipTo" TEXT;
ALTER TABLE "Quote" ADD COLUMN "paymentMethod" TEXT;
