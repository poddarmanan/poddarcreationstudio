-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'REJECTED');

-- AlterTable
ALTER TABLE "Quote" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SampleRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "shippingLine1" TEXT NOT NULL,
    "shippingCity" TEXT NOT NULL,
    "shippingState" TEXT,
    "shippingPincode" TEXT,
    "shippingCountry" TEXT NOT NULL DEFAULT 'India',
    "message" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'REQUESTED',
    "courier" TEXT,
    "trackingNumber" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleItem" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "colourId" TEXT NOT NULL,

    CONSTRAINT "SampleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleEvent" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "SampleStatus",
    "toStatus" "SampleStatus",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SampleRequest_status_idx" ON "SampleRequest"("status");

-- CreateIndex
CREATE INDEX "SampleRequest_userId_idx" ON "SampleRequest"("userId");

-- CreateIndex
CREATE INDEX "SampleEvent_sampleId_createdAt_idx" ON "SampleEvent"("sampleId", "createdAt");

-- AddForeignKey
ALTER TABLE "SampleRequest" ADD CONSTRAINT "SampleRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleRequest" ADD CONSTRAINT "SampleRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleItem" ADD CONSTRAINT "SampleItem_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "SampleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleItem" ADD CONSTRAINT "SampleItem_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleItem" ADD CONSTRAINT "SampleItem_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleEvent" ADD CONSTRAINT "SampleEvent_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "SampleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
