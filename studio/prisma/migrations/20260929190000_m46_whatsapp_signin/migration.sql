-- M46: signing in with WhatsApp. A buyer's number lives on their account (unique, as digits with
-- its country code), and one-time codes sent there are kept as hashes.
ALTER TABLE "User" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_whatsapp_key" ON "User"("whatsapp");

CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_phone_createdAt_idx" ON "OtpCode"("phone", "createdAt");
