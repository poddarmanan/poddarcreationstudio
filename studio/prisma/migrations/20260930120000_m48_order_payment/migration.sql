-- M48: an order paid online (Razorpay): its status, the payment's reference, and what was paid
-- in minor units (paise).
ALTER TABLE "Quote" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Quote" ADD COLUMN "paymentRef" TEXT;
ALTER TABLE "Quote" ADD COLUMN "paidAmount" INTEGER;
