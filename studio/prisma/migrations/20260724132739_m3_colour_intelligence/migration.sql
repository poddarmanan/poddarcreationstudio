-- CreateEnum
CREATE TYPE "ColourRelationKind" AS ENUM ('SIMILAR', 'COMPLEMENTARY', 'ANALOGOUS');

-- AlterTable
ALTER TABLE "Colour" ADD COLUMN     "brightness" DOUBLE PRECISION,
ADD COLUMN     "colourVector" JSONB,
ADD COLUMN     "contrastCream" DOUBLE PRECISION,
ADD COLUMN     "contrastInk" DOUBLE PRECISION,
ADD COLUMN     "hex" TEXT,
ADD COLUMN     "labA" DOUBLE PRECISION,
ADD COLUMN     "labB" DOUBLE PRECISION,
ADD COLUMN     "labL" DOUBLE PRECISION,
ADD COLUMN     "rgbB" INTEGER,
ADD COLUMN     "rgbG" INTEGER,
ADD COLUMN     "rgbR" INTEGER,
ADD COLUMN     "saturation" DOUBLE PRECISION,
ADD COLUMN     "temperature" TEXT;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "dominantPalette" JSONB;

-- CreateTable
CREATE TABLE "ColourRelationship" (
    "id" TEXT NOT NULL,
    "fromColourId" TEXT NOT NULL,
    "toColourId" TEXT NOT NULL,
    "kind" "ColourRelationKind" NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "ColourRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ColourRelationship_fromColourId_kind_rank_idx" ON "ColourRelationship"("fromColourId", "kind", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ColourRelationship_fromColourId_toColourId_kind_key" ON "ColourRelationship"("fromColourId", "toColourId", "kind");

-- CreateIndex
CREATE INDEX "Colour_temperature_idx" ON "Colour"("temperature");

-- AddForeignKey
ALTER TABLE "ColourRelationship" ADD CONSTRAINT "ColourRelationship_fromColourId_fkey" FOREIGN KEY ("fromColourId") REFERENCES "Colour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColourRelationship" ADD CONSTRAINT "ColourRelationship_toColourId_fkey" FOREIGN KEY ("toColourId") REFERENCES "Colour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
