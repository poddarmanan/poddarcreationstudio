-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "coverItemId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CollectionItem" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT DEFAULT 'm';

-- CreateIndex
CREATE INDEX "Collection_userId_updatedAt_idx" ON "Collection"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollectionItem_collectionId_position_idx" ON "CollectionItem"("collectionId", "position");
