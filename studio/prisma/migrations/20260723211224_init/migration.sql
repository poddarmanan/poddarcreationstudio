-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'VIEWER', 'BUYER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStage" AS ENUM ('QUEUED', 'COMPRESSING', 'NAMING', 'THUMBNAIL', 'QR', 'PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fabric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "width" TEXT NOT NULL,
    "comp" TEXT NOT NULL,
    "nc" INTEGER NOT NULL,
    "hand" TEXT NOT NULL,
    "sheen" DOUBLE PRECISION NOT NULL,
    "flow" DOUBLE PRECISION NOT NULL,
    "stretch" DOUBLE PRECISION NOT NULL,
    "seed" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "heroIndex" INTEGER NOT NULL,

    CONSTRAINT "Fabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colour" (
    "id" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "l" DOUBLE PRECISION NOT NULL,
    "c" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Colour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "colourId" TEXT,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "originalName" TEXT NOT NULL,
    "originalSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "webpPath" TEXT,
    "avifPath" TEXT,
    "thumbPath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "qrDataUrl" TEXT,
    "aiColourName" TEXT,
    "aiConfidence" INTEGER,
    "aiSource" TEXT,
    "stage" "MediaStage" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "colourId" TEXT NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwatchBookItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "colourId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwatchBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Colour_fabricId_idx" ON "Colour"("fabricId");

-- CreateIndex
CREATE UNIQUE INDEX "Colour_fabricId_order_key" ON "Colour"("fabricId", "order");

-- CreateIndex
CREATE INDEX "Media_fabricId_idx" ON "Media"("fabricId");

-- CreateIndex
CREATE UNIQUE INDEX "SwatchBookItem_userId_fabricId_colourId_key" ON "SwatchBookItem"("userId", "fabricId", "colourId");

-- AddForeignKey
ALTER TABLE "Colour" ADD CONSTRAINT "Colour_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwatchBookItem" ADD CONSTRAINT "SwatchBookItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwatchBookItem" ADD CONSTRAINT "SwatchBookItem_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwatchBookItem" ADD CONSTRAINT "SwatchBookItem_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
